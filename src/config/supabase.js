const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

let dbReady = false;

const checkConnection = async () => {
  if (!isSupabaseConfigured) {
    console.log('[AquaTrack] Supabase not configured — using in-memory data store');
    dbReady = false;
    return false;
  }

  try {
    const { error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true });

    if (error) throw error;

    dbReady = true;
    console.log(`[AquaTrack] Supabase connected: ${supabaseUrl}`);
    return true;
  } catch (err) {
    dbReady = false;
    console.error(`[AquaTrack] Supabase connection notice: ${err.message}`);
    console.error('[AquaTrack] Run supabase/schema.sql in the Supabase SQL Editor, then npm run seed');
    return false;
  }
};

const isDbReady = () => dbReady;

module.exports = { supabase, isSupabaseConfigured, isDbReady, checkConnection };
