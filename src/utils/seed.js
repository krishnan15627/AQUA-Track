require('dotenv').config();
const bcrypt = require('bcryptjs');
const { supabase, isSupabaseConfigured } = require('../config/supabase');
const { throwIfError } = require('./supabaseHelpers');

const BOOTSTRAP_OWNER = {
  name: 'Admin Owner',
  email: 'admin@aquatrack.com',
  phone: '9876543210',
  password: 'Password@123'
};

const seedOwner = async () => {
  const passwordHash = await bcrypt.hash(BOOTSTRAP_OWNER.password, 10);
  const { error } = await supabase.from('users').upsert(
    [
      {
        name: BOOTSTRAP_OWNER.name,
        email: BOOTSTRAP_OWNER.email,
        phone: BOOTSTRAP_OWNER.phone,
        password_hash: passwordHash,
        role: 'owner',
        is_active: true
      }
    ],
    { onConflict: 'email' }
  );
  throwIfError(error);

  console.log(`✓ Bootstrap owner ready: ${BOOTSTRAP_OWNER.email}`);
};

const ensureInventory = async () => {
  const { data, error } = await supabase
    .from('inventory')
    .select('id')
    .eq('id', 1)
    .maybeSingle();
  throwIfError(error);

  if (data) {
    console.log('✓ Inventory row already exists (left untouched)');
    return;
  }

  const { error: insertError } = await supabase.from('inventory').insert({
    id: 1,
    full_cans_ready: 0,
    empty_cans_refill: 0,
    with_delivery_staff: 0,
    damaged_unavailable: 0,
    total_cans: 0,
    low_stock_threshold: 25
  });
  throwIfError(insertError);
  console.log('✓ Created empty inventory row');
};

const seed = async () => {
  if (!isSupabaseConfigured) {
    console.error('[AquaTrack Seed Error] Supabase is not configured.');
    console.error('Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env, then run supabase/schema.sql.');
    process.exit(1);
  }

  try {
    console.log('[AquaTrack Seed] Bootstrapping owner account (no demo data)...');
    await seedOwner();
    await ensureInventory();
    console.log('[AquaTrack Seed] Done. Customers, orders, deliveries, and payments remain untouched.');
    process.exit(0);
  } catch (error) {
    console.error('[AquaTrack Seed Error]', error.message);
    if (error.details) console.error(error.details);
    process.exit(1);
  }
};

seed();
