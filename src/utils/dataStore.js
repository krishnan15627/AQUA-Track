const { isDbReady } = require('../config/supabase');

// In-memory fallback used only when Supabase is not configured. It starts
// empty on purpose: the application no longer ships with demo customers,
// orders, deliveries, or payments.
const emptyInventory = {
  fullCansReady: 0,
  emptyCansRefill: 0,
  withDeliveryStaff: 0,
  damagedUnavailable: 0,
  totalCans: 0,
  lowStockThreshold: 25
};

const memState = {
  customers: [],
  orders: [],
  deliveries: [],
  inventory: { ...emptyInventory },
  payments: [],
  movements: []
};

module.exports = {
  isDbReady,
  memState,
  emptyInventory
};
