const { supabase, isDbReady } = require('../config/supabase');
const { getMemoryUsers, initMemoryUsers } = require('../controllers/authController');
const { throwIfError } = require('./supabaseHelpers');

// Resolve a delivery staff account by id (preferred) or exact name.
// Returns null when nothing valid is found so callers can decide whether that
// means "unassigned" (no input) or "invalid selection" (bad id).
const findStaffMember = async ({ staffId, staffName } = {}) => {
  const name = String(staffName || '').trim();

  if (isDbReady()) {
    if (staffId) {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, role, is_active')
        .eq('id', staffId)
        .maybeSingle();
      throwIfError(error);
      if (!data || data.role !== 'staff' || !data.is_active) return null;
      return data;
    }

    if (name) {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, role, is_active')
        .eq('role', 'staff')
        .eq('is_active', true)
        .ilike('name', name)
        .limit(1)
        .maybeSingle();
      throwIfError(error);
      return data || null;
    }

    return null;
  }

  await initMemoryUsers();
  const users = getMemoryUsers();

  if (staffId) {
    const found = users.find((u) => (u.id || u._id) === staffId);
    return found && found.role === 'staff' && found.isActive ? found : null;
  }

  if (name) {
    const found = users.find(
      (u) => u.role === 'staff' && u.isActive && u.name.toLowerCase() === name.toLowerCase()
    );
    return found || null;
  }

  return null;
};

module.exports = { findStaffMember };
