const { supabase, isDbReady } = require('../config/supabase');
const { memState } = require('../utils/dataStore');
const {
  isUuid,
  mapRow,
  mapRows,
  sanitizeSearch,
  toSnakeFields,
  throwIfError
} = require('../utils/supabaseHelpers');
const { nextCustomerCode } = require('../utils/customerCodes');
const {
  findLinkedCustomer,
  getCustomerPk,
  getCustomerCode,
  normalizeEmail,
  normalizePhone
} = require('../utils/customerLink');

const findCustomerRow = async (id) => {
  let query = supabase.from('customers').select('*');
  query = isUuid(id)
    ? query.or(`id.eq.${id},customer_id.eq.${id}`)
    : query.eq('customer_id', id);

  const { data, error } = await query.maybeSingle();
  throwIfError(error);
  return data;
};

const findCustomerByEmailOrPhone = async (email, phone, excludeId) => {
  if (email) {
    let query = supabase.from('customers').select('id').eq('email', email).limit(1);
    if (excludeId) query = query.neq('id', excludeId);
    const { data, error } = await query.maybeSingle();
    throwIfError(error);
    if (data) return data;
  }
  if (phone) {
    let query = supabase.from('customers').select('id').eq('phone', phone).limit(1);
    if (excludeId) query = query.neq('id', excludeId);
    const { data, error } = await query.maybeSingle();
    throwIfError(error);
    if (data) return data;
  }
  return null;
};

const duplicateMessage =
  'Another customer already uses that email or phone number';

// @desc    Get all customers with search and filtering
// @route   GET /api/customers
// @access  Private
exports.getCustomers = async (req, res, next) => {
  try {
    const { search, status, area } = req.query;

    // Customers can only read their own profile.
    if (req.user.role === 'customer') {
      const linked = await findLinkedCustomer(req.user);
      if (!linked) {
        return res.status(403).json({
          success: false,
          message: 'No customer profile is linked to this account.'
        });
      }

      if (isDbReady()) {
        const { data, error } = await supabase
          .from('customers')
          .select('*')
          .eq('id', getCustomerPk(linked))
          .maybeSingle();
        throwIfError(error);
        const customers = data ? [mapRow(data)] : [];
        return res.status(200).json({ success: true, count: customers.length, data: customers });
      }

      return res.status(200).json({ success: true, count: 1, data: [linked] });
    }

    if (req.user.role !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view customers.'
      });
    }

    if (isDbReady()) {
      let query = supabase.from('customers').select('*');

      if (status && status !== 'All') {
        query = query.eq('status', status);
      }
      if (area && area !== 'All') {
        query = query.eq('area', area);
      }
      if (search) {
        const q = sanitizeSearch(search);
        if (q) {
          query = query.or(
            `name.ilike.%${q}%,phone.ilike.%${q}%,area.ilike.%${q}%,customer_id.ilike.%${q}%`
          );
        }
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      throwIfError(error);

      const customers = mapRows(data);
      return res.status(200).json({
        success: true,
        count: customers.length,
        data: customers
      });
    }

    // Memory fallback
    let results = [...memState.customers];
    if (status && status !== 'All') {
      results = results.filter((c) => c.status.toLowerCase() === status.toLowerCase());
    }
    if (area && area !== 'All') {
      results = results.filter((c) => c.area.toLowerCase() === area.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.area.toLowerCase().includes(q) ||
          c.customerId.toLowerCase().includes(q)
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

// @desc    Get single customer
// @route   GET /api/customers/:id
// @access  Private
exports.getCustomerById = async (req, res, next) => {
  try {
    const id = req.params.id;

    if (req.user.role === 'customer') {
      const linked = await findLinkedCustomer(req.user);
      if (
        !linked ||
        (id !== getCustomerPk(linked) && id !== getCustomerCode(linked))
      ) {
        return res.status(404).json({ success: false, message: 'Customer not found' });
      }

      if (isDbReady()) {
        const { data, error } = await supabase
          .from('customers')
          .select('*')
          .eq('id', getCustomerPk(linked))
          .maybeSingle();
        throwIfError(error);
        return res.status(200).json({ success: true, data: mapRow(data) });
      }

      return res.status(200).json({ success: true, data: linked });
    }

    if (req.user.role !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view customers.'
      });
    }

    if (isDbReady()) {
      const row = await findCustomerRow(id);
      if (!row) {
        return res.status(404).json({ success: false, message: 'Customer not found' });
      }
      return res.status(200).json({ success: true, data: mapRow(row) });
    }

    const customer = memState.customers.find(
      (c) => c.customerId === id || c._id === id
    );

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    res.status(200).json({ success: true, data: customer });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new customer
// @route   POST /api/customers
// @access  Private
exports.createCustomer = async (req, res, next) => {
  try {
    const {
      name,
      phone,
      email,
      address,
      area,
      deliveryInstructions,
      regularQuantity,
      frequency
    } = req.body;

    if (!name || !phone || !address || !area) {
      return res.status(400).json({
        success: false,
        message: 'Please provide customer name, phone, delivery address, and area'
      });
    }

    const cleanEmail = normalizeEmail(email);
    const cleanPhone = normalizePhone(phone);

    if (isDbReady()) {
      const duplicate = await findCustomerByEmailOrPhone(cleanEmail, cleanPhone);
      if (duplicate) {
        return res.status(400).json({ success: false, message: duplicateMessage });
      }

      const customerId = await nextCustomerCode();

      const { data, error } = await supabase
        .from('customers')
        .insert({
          customer_id: customerId,
          name: name.trim(),
          phone: cleanPhone,
          email: cleanEmail,
          address: address.trim(),
          area: area.trim(),
          delivery_instructions: deliveryInstructions || '',
          regular_quantity: Number(regularQuantity) || 2,
          frequency: frequency || 'daily',
          status: 'Active'
        })
        .select()
        .single();
      throwIfError(error);

      return res.status(201).json({ success: true, data: mapRow(data) });
    }

    // Memory fallback
    const duplicateCustomer = memState.customers.find(
      (c) =>
        (cleanEmail && normalizeEmail(c.email) === cleanEmail) ||
        normalizePhone(c.phone) === cleanPhone
    );
    if (duplicateCustomer) {
      return res.status(400).json({
        success: false,
        message: 'Another customer already uses that email or phone number'
      });
    }

    const customerId = await nextCustomerCode();

    const newCustomer = {
      _id: `mem_c_${Date.now()}`,
      customerId,
      name: name.trim(),
      phone: cleanPhone,
      email: cleanEmail,
      address: address.trim(),
      area: area.trim(),
      deliveryInstructions: deliveryInstructions || '',
      regularQuantity: Number(regularQuantity) || 2,
      frequency: frequency || 'daily',
      status: 'Active',
      fullCansDelivered: 0,
      emptyCansReturned: 0,
      unreturnedCans: 0,
      totalCharges: 0,
      totalPaid: 0,
      outstandingBalance: 0,
      pricePerCan: 30,
      createdAt: new Date().toISOString()
    };

    memState.customers.unshift(newCustomer);
    res.status(201).json({ success: true, data: newCustomer });
  } catch (error) {
    next(error);
  }
};

// @desc    Update customer
// @route   PUT /api/customers/:id
// @access  Private
exports.updateCustomer = async (req, res, next) => {
  try {
    const id = req.params.id;
    const updates = { ...req.body };
    if (updates.email !== undefined) updates.email = normalizeEmail(updates.email);
    if (updates.phone !== undefined) updates.phone = normalizePhone(updates.phone);

    if (isDbReady()) {
      const existing = await findCustomerRow(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Customer not found' });
      }

      const duplicate = await findCustomerByEmailOrPhone(
        updates.email || '',
        updates.phone || '',
        existing.id
      );
      if (duplicate) {
        return res.status(400).json({ success: false, message: duplicateMessage });
      }

      const fields = toSnakeFields(updates);
      if (Object.keys(fields).length === 0) {
        return res.status(200).json({ success: true, data: mapRow(existing) });
      }

      const { data, error } = await supabase
        .from('customers')
        .update(fields)
        .eq('id', existing.id)
        .select()
        .single();
      throwIfError(error);

      // Keep denormalized customer snapshots in related records in sync
      const orderFields = {};
      if (fields.name !== undefined) orderFields.customer_name = fields.name;
      if (fields.phone !== undefined) orderFields.customer_phone = fields.phone;
      if (fields.area !== undefined) orderFields.area = fields.area;
      if (fields.address !== undefined) orderFields.delivery_address = fields.address;
      if (Object.keys(orderFields).length > 0) {
        const { error: ordersError } = await supabase
          .from('orders')
          .update(orderFields)
          .eq('customer_ref', existing.id);
        throwIfError(ordersError);
      }

      const deliveryFields = {};
      if (fields.name !== undefined) deliveryFields.customer_name = fields.name;
      if (fields.area !== undefined) deliveryFields.area = fields.area;
      if (fields.address !== undefined) deliveryFields.delivery_address = fields.address;
      if (Object.keys(deliveryFields).length > 0) {
        const { error: deliveriesError } = await supabase
          .from('deliveries')
          .update(deliveryFields)
          .eq('customer_ref', existing.id);
        throwIfError(deliveriesError);
      }

      if (fields.name !== undefined) {
        const { error: paymentsError } = await supabase
          .from('payments')
          .update({ customer_name: fields.name })
          .eq('customer_ref', existing.id);
        throwIfError(paymentsError);
      }

      return res.status(200).json({ success: true, data: mapRow(data) });
    }

    const index = memState.customers.findIndex(
      (c) => c.customerId === id || c._id === id
    );

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const previousName = memState.customers[index].name;

    const duplicateCustomer = memState.customers.find(
      (c, i) =>
        i !== index &&
        ((updates.email && normalizeEmail(c.email) === updates.email) ||
          (updates.phone && normalizePhone(c.phone) === updates.phone))
    );
    if (duplicateCustomer) {
      return res.status(400).json({
        success: false,
        message: 'Another customer already uses that email or phone number'
      });
    }

    memState.customers[index] = {
      ...memState.customers[index],
      ...updates
    };
    const updated = memState.customers[index];

    memState.orders.forEach((o) => {
      if (o.customerName !== previousName) return;
      o.customerName = updated.name;
      if (updates.phone) o.customerPhone = updates.phone;
      if (updates.area) o.area = updates.area;
      if (updates.address) o.deliveryAddress = updates.address;
    });
    memState.deliveries.forEach((d) => {
      if (d.customerName !== previousName) return;
      d.customerName = updated.name;
      if (updates.area) d.area = updates.area;
      if (updates.address) d.deliveryAddress = updates.address;
    });
    memState.payments.forEach((p) => {
      if (p.customerName === previousName) p.customerName = updated.name;
    });

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle Customer Status (Active / Inactive)
// @route   PATCH /api/customers/:id/toggle-status
// @access  Private
exports.toggleCustomerStatus = async (req, res, next) => {
  try {
    const id = req.params.id;

    if (isDbReady()) {
      const existing = await findCustomerRow(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Customer not found' });
      }

      const nextStatus = existing.status === 'Active' ? 'Inactive' : 'Active';
      const { data, error } = await supabase
        .from('customers')
        .update({ status: nextStatus })
        .eq('id', existing.id)
        .select()
        .single();
      throwIfError(error);

      return res.status(200).json({
        success: true,
        message: `Customer status updated to ${nextStatus}`,
        data: mapRow(data)
      });
    }

    const customer = memState.customers.find(
      (c) => c.customerId === id || c._id === id
    );

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    customer.status = customer.status === 'Active' ? 'Inactive' : 'Active';

    res.status(200).json({
      success: true,
      message: `Customer status updated to ${customer.status}`,
      data: customer
    });
  } catch (error) {
    next(error);
  }
};
