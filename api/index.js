const app = require('../src/app');
const { checkConnection, isSupabaseConfigured } = require('../src/config/supabase');

let initPromise = null;

module.exports = async (req, res) => {
  if (isSupabaseConfigured && !initPromise) {
    initPromise = checkConnection();
  }
  if (initPromise) {
    try {
      await initPromise;
    } catch {
      // checkConnection already handles its own failures
    }
  }
  return app(req, res);
};
