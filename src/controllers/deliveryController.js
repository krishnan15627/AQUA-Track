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

const userPk = (user) => user.id || user._id;

const staffOwnsDelivery = (user, delivery) => {
  if (user.role === 'owner') return true;
  if (user.role !== 'staff') return false;
  const pk = userPk(user);
  return (
    delivery.delivery_person_id === pk ||
    delivery.deliveryPersonId === pk ||
    delivery.delivery_person === user.name ||
    delivery.deliveryPerson === user.name
  );
};

const findDeliveryRow = async (id) => {
  let query = supabase.from('deliveries').select('*');
  query = isUuid(id)
    ? query.or(`id.eq.${id},delivery_id.eq.${id}`)
    : query.eq('delivery_id', id);

  const { data, error } = await query.maybeSingle();
  throwIfError(error);
  return data;
};

const updateOrderByCode = async (orderCode, fields) => {
  if (!orderCode) return;
  const { error } = await supabase
    .from('orders')
    .update(fields)
    .eq('order_id', orderCode);
  throwIfError(error);
};

const getInventoryRow = async () => {
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  throwIfError(error);

  if (data) return data;

  const { data: created, error: createError } = await supabase
    .from('inventory')
    .insert({
      id: 1,
      full_cans_ready: 0,
      empty_cans_refill: 0,
      with_delivery_staff: 0,
      damaged_unavailable: 0,
      total_cans: 0
    })
    .select()
    .single();
  throwIfError(createError);
  return created;
};

// @desc    Get deliveries list
// @route   GET /api/deliveries
// @access  Private
exports.getDeliveries = async (req, res, next) => {
  try {
    const { status, staff, search, date } = req.query;

    const isCustomer = req.user.role === 'customer';
    const isStaff = req.user.role === 'staff';

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
      let query = supabase.from('deliveries').select('*');

      if (isCustomer) {
        query = query.eq('customer_ref', getCustomerPk(linked));
      }
      if (isStaff) {
        const safeName = sanitizeSearch(req.user.name);
        query = query.or(
          `delivery_person_id.eq.${userPk(req.user)},delivery_person.eq.${safeName}`
        );
      }

      if (status && status !== 'All') {
        query = query.eq('status', status);
      }
      if (staff && staff !== 'All' && !isCustomer && !isStaff) {
        query = query.eq('delivery_person', staff);
      }
      if (date) {
        query = query.eq('delivery_date', date);
      }
      if (search) {
        const q = sanitizeSearch(search);
        if (q) {
          query = query.or(
            `delivery_id.ilike.%${q}%,customer_name.ilike.%${q}%,area.ilike.%${q}%`
          );
        }
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      throwIfError(error);

      const deliveries = mapRows(data);
      return res.status(200).json({
        success: true,
        count: deliveries.length,
        data: deliveries
      });
    }

    // Memory fallback
    let results = [...memState.deliveries];
    if (isCustomer) {
      results = results.filter(
        (d) =>
          d.customer === getCustomerCode(linked) ||
          d.customerName === linked.name
      );
    }
    if (isStaff) {
      const pk = userPk(req.user);
      results = results.filter(
        (d) => d.deliveryPersonId === pk || d.deliveryPerson === req.user.name
      );
    }
    if (status && status !== 'All') {
      results = results.filter((d) => d.status.toLowerCase() === status.toLowerCase());
    }
    if (staff && staff !== 'All') {
      results = results.filter((d) => d.deliveryPerson.toLowerCase() === staff.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (d) =>
          d.deliveryId.toLowerCase().includes(q) ||
          d.customerName.toLowerCase().includes(q) ||
          d.area.toLowerCase().includes(q)
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

// @desc    Assign delivery person to delivery
// @route   PATCH /api/deliveries/:id/assign
// @access  Private
exports.assignDelivery = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { deliveryPerson, staffId } = req.body;

    if (!deliveryPerson && !staffId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide delivery staff name'
      });
    }

    const staffUser = await findStaffMember({ staffId, staffName: deliveryPerson });
    if (staffId && !staffUser) {
      return res.status(400).json({
        success: false,
        message: 'The selected delivery person could not be found.'
      });
    }

    const resolvedName = staffUser ? staffUser.name : String(deliveryPerson).trim();

    if (isDbReady()) {
      const delivery = await findDeliveryRow(id);
      if (!delivery) {
        return res.status(404).json({ success: false, message: 'Delivery not found' });
      }

      const { data, error } = await supabase
        .from('deliveries')
        .update({
          delivery_person: resolvedName,
          delivery_person_id: staffUser ? staffUser.id : delivery.delivery_person_id,
          status: delivery.status === 'Pending' ? 'Out for Delivery' : delivery.status
        })
        .eq('id', delivery.id)
        .select()
        .single();
      throwIfError(error);

      const orderFields = {
        staff_name: resolvedName,
        status: 'Out for Delivery'
      };
      if (staffUser) orderFields.assigned_staff_id = staffUser.id;
      await updateOrderByCode(delivery.order_id, orderFields);

      return res.status(200).json({ success: true, data: mapRow(data) });
    }

    const delivery = memState.deliveries.find(
      (d) => d.deliveryId === id || d._id === id
    );

    if (!delivery) {
      return res.status(404).json({ success: false, message: 'Delivery not found' });
    }

    delivery.deliveryPerson = resolvedName;
    if (staffUser) delivery.deliveryPersonId = userPk(staffUser);
    if (delivery.status === 'Pending') {
      delivery.status = 'Out for Delivery';
    }

    // Update in-memory order
    if (delivery.orderId) {
      const order = memState.orders.find((o) => o.orderId === delivery.orderId);
      if (order) {
        order.staffName = resolvedName;
        if (staffUser) order.assignedStaffId = userPk(staffUser);
        order.status = 'Out for Delivery';
      }
    }

    res.status(200).json({ success: true, data: delivery });
  } catch (error) {
    next(error);
  }
};

// @desc    Complete a delivery and track empty/full can balances
// @route   POST /api/deliveries/:id/complete
// @access  Private
exports.completeDelivery = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { actualCansDelivered, emptyCansCollected } = req.body;

    const deliveredCount = parseInt(actualCansDelivered, 10);
    const returnedCount = parseInt(emptyCansCollected, 10);

    if (isNaN(deliveredCount) || deliveredCount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid delivered can count is required'
      });
    }

    if (isNaN(returnedCount) || returnedCount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid returned empty can count is required'
      });
    }

    if (isDbReady()) {
      const delivery = await findDeliveryRow(id);
      if (!delivery) {
        return res.status(404).json({ success: false, message: 'Delivery not found' });
      }

      if (!staffOwnsDelivery(req.user, delivery)) {
        return res.status(403).json({
          success: false,
          message: 'This delivery is not assigned to you.'
        });
      }

      if (delivery.status === 'Delivered') {
        return res.status(400).json({
          success: false,
          message: 'This delivery has already been marked completed.'
        });
      }

      const { data: updated, error: deliveryError } = await supabase
        .from('deliveries')
        .update({
          actual_cans_delivered: deliveredCount,
          empty_cans_collected: returnedCount,
          status: 'Delivered',
          completed_at: new Date().toISOString()
        })
        .eq('id', delivery.id)
        .select()
        .single();
      throwIfError(deliveryError);

      // 1. Update Customer Can Balance
      // Formula: New unreturned-can balance = Previous balance + Full cans delivered - Empty cans returned
      let { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', delivery.customer_ref)
        .maybeSingle();
      throwIfError(customerError);

      if (!customer) {
        const fallback = await supabase
          .from('customers')
          .select('*')
          .eq('name', delivery.customer_name)
          .maybeSingle();
        throwIfError(fallback.error);
        customer = fallback.data;
      }

      if (customer) {
        const previousUnreturned = customer.unreturned_cans || 0;
        const newUnreturned = Math.max(
          0,
          previousUnreturned + deliveredCount - returnedCount
        );
        const charge = deliveredCount * (customer.price_per_can || 30);

        const { error: customerUpdateError } = await supabase
          .from('customers')
          .update({
            full_cans_delivered: (customer.full_cans_delivered || 0) + deliveredCount,
            empty_cans_returned: (customer.empty_cans_returned || 0) + returnedCount,
            unreturned_cans: newUnreturned,
            total_charges: (customer.total_charges || 0) + charge,
            outstanding_balance: (customer.outstanding_balance || 0) + charge
          })
          .eq('id', customer.id);
        throwIfError(customerUpdateError);
      }

      // 2. Update Order status
      await updateOrderByCode(delivery.order_id, { status: 'Delivered' });

      // 3. Update Inventory
      const inv = await getInventoryRow();
      const fullCansReady = Math.max(0, inv.full_cans_ready - deliveredCount);
      const emptyCansRefill = inv.empty_cans_refill + returnedCount;
      const withDeliveryStaff = Math.max(0, inv.with_delivery_staff - deliveredCount);
      const totalCans = fullCansReady + emptyCansRefill + withDeliveryStaff + inv.damaged_unavailable;

      const { error: inventoryError } = await supabase
        .from('inventory')
        .update({
          full_cans_ready: fullCansReady,
          empty_cans_refill: emptyCansRefill,
          with_delivery_staff: withDeliveryStaff,
          total_cans: totalCans
        })
        .eq('id', 1);
      throwIfError(inventoryError);

      // 4. Record stock movement
      const { error: movementError } = await supabase.from('stock_movements').insert({
        movement_id: `MOV-${Date.now()}`,
        category: 'full',
        action: 'dispatched',
        quantity: deliveredCount,
        notes: `Delivery ${delivery.delivery_id} to ${delivery.customer_name}`
      });
      throwIfError(movementError);

      return res.status(200).json({
        success: true,
        message: 'Delivery completed and can balances updated successfully',
        data: mapRow(updated)
      });
    }

    // Memory fallback
    const delivery = memState.deliveries.find(
      (d) => d.deliveryId === id || d._id === id
    );

    if (!delivery) {
      return res.status(404).json({ success: false, message: 'Delivery not found' });
    }

    if (!staffOwnsDelivery(req.user, delivery)) {
      return res.status(403).json({
        success: false,
        message: 'This delivery is not assigned to you.'
      });
    }

    if (delivery.status === 'Delivered') {
      return res.status(400).json({
        success: false,
        message: 'This delivery has already been marked completed.'
      });
    }

    delivery.actualCansDelivered = deliveredCount;
    delivery.emptyCansCollected = returnedCount;
    delivery.status = 'Delivered';
    delivery.completedAt = new Date().toISOString();

    // 1. Update customer can balance
    const customer = memState.customers.find((c) => c.name === delivery.customerName);
    if (customer) {
      const prev = customer.unreturnedCans || 0;
      customer.unreturnedCans = Math.max(0, prev + deliveredCount - returnedCount);
      customer.fullCansDelivered = (customer.fullCansDelivered || 0) + deliveredCount;
      customer.emptyCansReturned = (customer.emptyCansReturned || 0) + returnedCount;
      const charge = deliveredCount * (customer.pricePerCan || 30);
      customer.totalCharges = (customer.totalCharges || 0) + charge;
      customer.outstandingBalance = (customer.outstandingBalance || 0) + charge;
    }

    // 2. Update order
    if (delivery.orderId) {
      const order = memState.orders.find((o) => o.orderId === delivery.orderId);
      if (order) order.status = 'Delivered';
    }

    // 3. Update inventory
    memState.inventory.fullCansReady = Math.max(0, memState.inventory.fullCansReady - deliveredCount);
    memState.inventory.emptyCansRefill += returnedCount;
    memState.inventory.withDeliveryStaff = Math.max(0, memState.inventory.withDeliveryStaff - deliveredCount);
    memState.inventory.totalCans =
      memState.inventory.fullCansReady +
      memState.inventory.emptyCansRefill +
      memState.inventory.withDeliveryStaff +
      memState.inventory.damagedUnavailable;

    memState.movements.unshift({
      movementId: `MOV-${Date.now()}`,
      category: 'full',
      action: 'dispatched',
      quantity: deliveredCount,
      notes: `Delivery ${delivery.deliveryId} to ${delivery.customerName}`,
      performedBy: req.user ? req.user.name : 'Admin Owner',
      createdAt: new Date().toISOString()
    });

    res.status(200).json({
      success: true,
      message: 'Delivery completed and can balances updated successfully',
      data: delivery
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark delivery as failed with reason
// @route   POST /api/deliveries/:id/fail
// @access  Private
exports.failDelivery = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { failureReason } = req.body;

    if (!failureReason) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a reason for delivery failure'
      });
    }

    if (isDbReady()) {
      const delivery = await findDeliveryRow(id);
      if (!delivery) {
        return res.status(404).json({ success: false, message: 'Delivery not found' });
      }

      if (!staffOwnsDelivery(req.user, delivery)) {
        return res.status(403).json({
          success: false,
          message: 'This delivery is not assigned to you.'
        });
      }

      const { data, error } = await supabase
        .from('deliveries')
        .update({ status: 'Failed', failure_reason: failureReason })
        .eq('id', delivery.id)
        .select()
        .single();
      throwIfError(error);

      await updateOrderByCode(delivery.order_id, {
        status: 'Missed',
        notes: `Failed: ${failureReason}`
      });

      return res.status(200).json({ success: true, data: mapRow(data) });
    }

    const delivery = memState.deliveries.find(
      (d) => d.deliveryId === id || d._id === id
    );

    if (!delivery) {
      return res.status(404).json({ success: false, message: 'Delivery not found' });
    }

    if (!staffOwnsDelivery(req.user, delivery)) {
      return res.status(403).json({
        success: false,
        message: 'This delivery is not assigned to you.'
      });
    }

    delivery.status = 'Failed';
    delivery.failureReason = failureReason;

    if (delivery.orderId) {
      const order = memState.orders.find((o) => o.orderId === delivery.orderId);
      if (order) {
        order.status = 'Missed';
        order.notes = `Failed: ${failureReason}`;
      }
    }

    res.status(200).json({ success: true, data: delivery });
  } catch (error) {
    next(error);
  }
};
