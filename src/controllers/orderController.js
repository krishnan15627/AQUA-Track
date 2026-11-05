const { supabase, isDbReady } = require('../config/supabase');
const { memState } = require('../utils/dataStore');
const {
  isUuid,
  mapRow,
  mapRows,
  sanitizeSearch,
  throwIfError
} = require('../utils/supabaseHelpers');
const {
  findLinkedCustomer,
  getCustomerPk,
  getCustomerCode
} = require('../utils/customerLink');
const { findStaffMember } = require('../utils/staff');

const todayLabel = () =>
  new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

const findCustomerRow = async (id) => {
  let query = supabase.from('customers').select('*');
  query = isUuid(id)
    ? query.or(`id.eq.${id},customer_id.eq.${id}`)
    : query.eq('customer_id', id);

  const { data, error } = await query.maybeSingle();
  throwIfError(error);
  return data;
};

const findOrderRow = async (id) => {
  let query = supabase.from('orders').select('*');
  query = isUuid(id)
    ? query.or(`id.eq.${id},order_id.eq.${id}`)
    : query.eq('order_id', id);

  const { data, error } = await query.maybeSingle();
  throwIfError(error);
  return data;
};

const nextOrderCode = async () => {
  const { data, error } = await supabase.from('orders').select('order_id');
  throwIfError(error);
  const max = (data || []).reduce((acc, row) => {
    const n = parseInt(String(row.order_id).replace(/\D/g, ''), 10);
    return Number.isNaN(n) ? acc : Math.max(acc, n);
  }, 0);
  return String(max + 1).padStart(4, '0');
};

const nextDeliveryCode = async () => {
  const { data, error } = await supabase.from('deliveries').select('delivery_id');
  throwIfError(error);
  const max = (data || []).reduce((acc, row) => {
    const n = parseInt(String(row.delivery_id).replace(/\D/g, ''), 10);
    return Number.isNaN(n) ? acc : Math.max(acc, n);
  }, 0);
  return `D${String(max + 1).padStart(3, '0')}`;
};

// @desc    Get all orders with filtering
// @route   GET /api/orders
// @access  Private
exports.getOrders = async (req, res, next) => {
  try {
    const { status, search, date } = req.query;

    if (req.user.role === 'staff') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view orders.'
      });
    }

    const isCustomer = req.user.role === 'customer';
    let linked = null;
    if (isCustomer) {
      linked = await findLinkedCustomer(req.user);
      if (!linked) {
        return res.status(403).json({
          success: false,
          message: 'No customer profile is linked to this account.'
        });
      }
    }

    if (isDbReady()) {
      let query = supabase.from('orders').select('*');

      if (isCustomer) {
        query = query.eq('customer_ref', getCustomerPk(linked));
      }

      if (status && status !== 'All') {
        query = query.eq('status', status);
      }
      if (date) {
        query = query.eq('delivery_date', date);
      }
      if (search) {
        const q = sanitizeSearch(search);
        if (q) {
          query = query.or(
            `order_id.ilike.%${q}%,customer_name.ilike.%${q}%,area.ilike.%${q}%`
          );
        }
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      throwIfError(error);

      const orders = mapRows(data);
      return res.status(200).json({
        success: true,
        count: orders.length,
        data: orders
      });
    }

    // Memory fallback
    let results = [...memState.orders];
    if (isCustomer) {
      results = results.filter(
        (o) =>
          o.customer === getCustomerCode(linked) ||
          o.customerName === linked.name
      );
    }
    if (status && status !== 'All') {
      results = results.filter((o) => o.status.toLowerCase() === status.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (o) =>
          o.orderId.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.area.toLowerCase().includes(q)
      );
    }

    res.status(200).json({
      success: true,
      count: results.length,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new order
// @route   POST /api/orders
// @access  Private
exports.createOrder = async (req, res, next) => {
  try {
    const {
      customerId,
      deliveryDate,
      deliveryTimeSlot,
      cansOrdered,
      expectedEmptyReturns,
      staffName,
      staffId,
      notes
    } = req.body;

    if (req.user.role === 'staff') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create orders.'
      });
    }

    const isCustomer = req.user.role === 'customer';
    let linked = null;
    if (isCustomer) {
      linked = await findLinkedCustomer(req.user);
      if (!linked) {
        return res.status(403).json({
          success: false,
          message: 'No customer profile is linked to this account.'
        });
      }
    } else if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Please select a customer and specify number of cans'
      });
    }

    if (!cansOrdered) {
      return res.status(400).json({
        success: false,
        message: 'Please select a customer and specify number of cans'
      });
    }

    const cans = parseInt(cansOrdered, 10);
    if (isNaN(cans) || cans < 1) {
      return res.status(400).json({
        success: false,
        message: 'Cans ordered must be at least 1'
      });
    }

    const expectedEmpty = parseInt(expectedEmptyReturns, 10) || 0;
    const formattedDate = deliveryDate || todayLabel();
    const timeSlot = deliveryTimeSlot || '9:00 AM';

    let staffUser = null;
    if (!isCustomer && (staffId || (staffName && staffName !== 'Unassigned'))) {
      staffUser = await findStaffMember({ staffId, staffName });
      if (!staffUser && staffId) {
        return res.status(400).json({
          success: false,
          message: 'The selected delivery person could not be found.'
        });
      }
    }

    const resolvedStaffName = isCustomer
      ? 'Unassigned'
      : staffUser
        ? staffUser.name
        : staffName || 'Unassigned';
    const assigned = !isCustomer && (Boolean(staffUser) || resolvedStaffName !== 'Unassigned');

    if (isDbReady()) {
      const customerObj = isCustomer ? linked : await findCustomerRow(customerId);
      if (!customerObj) {
        return res.status(404).json({ success: false, message: 'Customer not found' });
      }

      const orderId = await nextOrderCode();
      const price = customerObj.price_per_can || 30;
      const totalAmount = cans * price;

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_id: orderId,
          customer_ref: customerObj.id,
          customer_name: customerObj.name,
          customer_phone: customerObj.phone,
          area: customerObj.area,
          delivery_address: customerObj.address,
          delivery_date: formattedDate,
          delivery_time_slot: timeSlot,
          cans_ordered: cans,
          expected_empty_returns: expectedEmpty,
          price_per_can: price,
          total_amount: totalAmount,
          status: assigned ? 'Out for Delivery' : 'Scheduled',
          assigned_staff_id: staffUser ? staffUser.id : null,
          staff_name: resolvedStaffName,
          notes: notes || ''
        })
        .select()
        .single();
      throwIfError(orderError);

      // Auto create Delivery record
      const deliveryId = await nextDeliveryCode();
      const { error: deliveryError } = await supabase.from('deliveries').insert({
        delivery_id: deliveryId,
        order_ref: order.id,
        order_id: order.order_id,
        customer_ref: customerObj.id,
        customer_name: customerObj.name,
        customer_phone: customerObj.phone,
        delivery_address: customerObj.address,
        area: customerObj.area,
        cans_to_deliver: cans,
        status: assigned ? 'Out for Delivery' : 'Pending',
        delivery_person: staffUser ? staffUser.name : '-',
        delivery_person_id: staffUser ? staffUser.id : null,
        delivery_date: formattedDate
      });
      throwIfError(deliveryError);

      return res.status(201).json({ success: true, data: mapRow(order) });
    }

    // Memory fallback
    const customerObj = isCustomer
      ? linked
      : memState.customers.find(
          (c) => c.customerId === customerId || c._id === customerId
        );

    if (!customerObj) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const nextOrderNum = memState.orders.length + 1;
    const orderId = String(nextOrderNum).padStart(4, '0');
    const price = customerObj.pricePerCan || 30;
    const totalAmount = cans * price;

    const newOrder = {
      _id: `mem_ord_${Date.now()}`,
      orderId,
      customer: customerObj.customerId,
      customerName: customerObj.name,
      customerPhone: customerObj.phone,
      area: customerObj.area,
      deliveryAddress: customerObj.address,
      deliveryDate: formattedDate,
      deliveryTimeSlot: timeSlot,
      cansOrdered: cans,
      expectedEmptyReturns: expectedEmpty,
      pricePerCan: price,
      totalAmount,
      status: assigned ? 'Out for Delivery' : 'Scheduled',
      staffName: resolvedStaffName,
      assignedStaffId: staffUser ? staffUser._id || staffUser.id : null,
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    memState.orders.unshift(newOrder);

    // Auto create Delivery record in memory
    const nextDelNum = memState.deliveries.length + 1;
    const deliveryId = `D${String(nextDelNum).padStart(3, '0')}`;

    const newDelivery = {
      _id: `mem_del_${Date.now()}`,
      deliveryId,
      orderId: newOrder.orderId,
      customer: customerObj.customerId,
      customerName: customerObj.name,
      customerPhone: customerObj.phone,
      deliveryAddress: customerObj.address,
      area: customerObj.area,
      cansToDeliver: cans,
      actualCansDelivered: 0,
      emptyCansCollected: 0,
      status: assigned ? 'Out for Delivery' : 'Pending',
      deliveryPerson: staffUser ? staffUser.name : '-',
      deliveryPersonId: staffUser ? staffUser._id || staffUser.id : null,
      deliveryDate: formattedDate,
      createdAt: new Date().toISOString()
    };

    memState.deliveries.unshift(newDelivery);

    res.status(201).json({ success: true, data: newOrder });
  } catch (error) {
    next(error);
  }
};

// @desc    Update order status
// @route   PATCH /api/orders/:id/status
// @access  Private
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const id = req.params.id;

    if (req.user.role === 'staff') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update orders.'
      });
    }

    const isCustomer = req.user.role === 'customer';
    if (isCustomer && status !== 'Cancelled') {
      return res.status(403).json({
        success: false,
        message: 'You can only cancel your own scheduled orders.'
      });
    }

    if (!['Scheduled', 'Out for Delivery', 'Delivered', 'Missed', 'Cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid order status' });
    }

    let linked = null;
    if (isCustomer) {
      linked = await findLinkedCustomer(req.user);
      if (!linked) {
        return res.status(403).json({
          success: false,
          message: 'No customer profile is linked to this account.'
        });
      }
    }

    if (isDbReady()) {
      const existing = await findOrderRow(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      if (isCustomer) {
        if (existing.customer_ref !== getCustomerPk(linked)) {
          return res.status(404).json({ success: false, message: 'Order not found' });
        }
        if (existing.status !== 'Scheduled') {
          return res.status(400).json({
            success: false,
            message: 'Only scheduled orders can be cancelled.'
          });
        }
      }

      const { data, error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', existing.id)
        .select()
        .single();
      throwIfError(error);

      if (isCustomer) {
        const { error: deliveryError } = await supabase
          .from('deliveries')
          .update({ status: 'Failed', failure_reason: 'Cancelled by customer' })
          .eq('order_ref', existing.id);
        throwIfError(deliveryError);
      }

      return res.status(200).json({ success: true, data: mapRow(data) });
    }

    const order = memState.orders.find((o) => o.orderId === id || o._id === id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (isCustomer) {
      if (
        order.customer !== getCustomerCode(linked) &&
        order.customerName !== linked.name
      ) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      if (order.status !== 'Scheduled') {
        return res.status(400).json({
          success: false,
          message: 'Only scheduled orders can be cancelled.'
        });
      }
      memState.deliveries.forEach((d) => {
        if (d.orderId === order.orderId) {
          d.status = 'Failed';
          d.failureReason = 'Cancelled by customer';
        }
      });
    }

    order.status = status;
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};
