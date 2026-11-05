const { supabase, isDbReady } = require('../config/supabase');
const { memState } = require('./dataStore');
const { throwIfError } = require('./supabaseHelpers');

const nextFromCodes = (codes) =>
  `C${String(
    codes.reduce((acc, code) => {
      const n = parseInt(String(code).replace(/\D/g, ''), 10);
      return Number.isNaN(n) ? acc : Math.max(acc, n);
    }, 0) + 1
  ).padStart(3, '0')}`;

const nextCustomerCode = async () => {
  if (!isDbReady()) {
    return nextFromCodes(memState.customers.map((c) => c.customerId));
  }

  const { data, error } = await supabase.from('customers').select('customer_id');
  throwIfError(error);
  return nextFromCodes((data || []).map((row) => row.customer_id));
};

module.exports = { nextCustomerCode };
