import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local if present
const envLocalPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...values] = trimmed.split('=');
    const val = values.join('=').trim().replace(/^["']|["']$/g, '');
    if (key && val) {
      process.env[key.trim()] = val;
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.error('❌ Error: Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const args = process.argv.slice(2);
const email = args[0] || process.env.ADMIN_EMAIL || 'admin@kopinako.id';
const password = args[1] || process.env.ADMIN_PASSWORD || 'AdminNako2026!';
const fullName = args[2] || 'Super Admin';
const role = args[3] || 'superadmin';
const branchId = args[4] || null;

async function main() {
  console.log('========================================');
  console.log('🚀 Kopi Nako - Create Admin Account');
  console.log('========================================');
  console.log(`Email    : ${email}`);
  console.log(`Name     : ${fullName}`);
  console.log(`Role     : ${role}`);
  console.log(`Branch   : ${branchId || '(None - Superadmin)'}`);
  console.log('----------------------------------------');

  // 1. Check if user already exists in auth.users
  let userId = null;
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error('❌ Error querying Supabase Auth:', listError.message);
    process.exit(1);
  }

  const existingUser = usersData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

  if (existingUser) {
    console.log(`ℹ️ User with email "${email}" already exists in Supabase Auth (ID: ${existingUser.id}).`);
    userId = existingUser.id;
  } else {
    console.log(`Creating new user in Supabase Auth...`);
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError) {
      console.error('❌ Failed to create auth user:', createError.message);
      process.exit(1);
    }

    userId = newUser.user.id;
    console.log(`✅ Auth user created successfully! (ID: ${userId})`);
  }

  // 2. Upsert profile in public.profiles table
  console.log(`Upserting profile into public.profiles...`);
  const profilePayload = {
    id: userId,
    role,
    branch_id: role === 'superadmin' ? null : branchId,
    full_name: fullName,
  };

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .upsert(profilePayload)
    .select()
    .single();

  if (profileError) {
    if (profileError.code === 'PGRST205' || profileError.message.includes('profiles')) {
      console.error('\n⚠️ WARNING: The table "public.profiles" does not exist yet.');
      console.error('Please run the migration SQL file first in the Supabase SQL Editor:');
      console.error('📁 supabase/migrations/20260917000000_create_branches_and_profiles.sql\n');
      console.error(`Once the SQL is run, re-run this script to link the profile:`);
      console.log(`> node scripts/create-admin.mjs ${email} [password] "${fullName}" ${role}`);
      process.exit(1);
    }
    console.error('❌ Failed to upsert profile:', profileError.message);
    process.exit(1);
  }

  console.log('✅ Profile successfully created / updated in public.profiles:');
  console.log(profile);
  console.log('----------------------------------------');
  console.log('🎉 Done! You can now log in at: /admin/login');
  console.log(`   Email: ${email}`);
  console.log(`   Password: ${password}`);
  console.log('========================================');
}

main().catch(err => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
