const { supabase, isDbReady } = require('../config/supabase');
const { memState } = require('./dataStore');
const { isUuid } = require('./supabaseHelpers');

const normalizeEmail = (value) => String(value || '').toLowerCase().trim();
const normalizePhone = (value) => String(value || '').trim();

const getCustomerPk = (customer) =>
  customer ? customer.id || customer._id || null : null;

const getCustomerCode = (customer) =>
  customer ? customer.customerId || customer.customer_id || null : null;

// Customer accounts are linked to their customer profile through the email
// (and, as a fallback, the phone) they signed up with. Both values are kept
// unique by the signup and customer-management code paths.
const findLinkedCustomer = async (user) => {
  if (!user || user.role !== 'customer') return null;

  if (user.customerRef) {
    if (isDbReady() && isUuid(user.customerRef)) {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('id', user.customerRef)
        .maybeSingle();
      if (data) return data;
    }
    if (!isDbReady()) {
      const found = memState.customers.find(
        (c) => c._id === user.customerRef || c.customerId === user.customerRef
      );
      if (found) return found;
    }
  }

  const email = normalizeEmail(user.email);
  const phone = normalizePhone(user.phone);

  if (isDbReady()) {
    if (email) {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('email', email)
        .limit(1)
        .maybeSingle();
      if (data) return data;
    }
    if (phone) {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', phone)
        .limit(1)
        .maybeSingle();
      if (data) return data;
    }
    return null;
  }

  if (email) {
    const found = memState.customers.find(
      (c) => normalizeEmail(c.email) === email
    );
    if (found) return found;
  }
  if (phone) {
    const found = memState.customers.find(
      (c) => normalizePhone(c.phone) === phone
    );
    if (found) return found;
  }
  return null;
};

module.exports = {
  findLinkedCustomer,
  getCustomerPk,
  getCustomerCode,
  normalizeEmail,
  normalizePhone
};
