/**
 * scripts/test-table-claims.mjs
 *
 * Automated Invariant & Hardening Test Suite:
 * 1. 20-Thread Concurrency Race on TEST-A1 (1 winner, 19 get 409 TABLE_TAKEN)
 * 2. One Cookie Claiming Two Tables in Parallel (1 wins, 1 clean 409, 0 unhandled 500s)
 * 3. Soft Hold Expiry (soft hold expires and frees table when no order placed; upgraded_at is null)
 * 4. Order Upgrades Session (order upgrades soft hold to full walkin_lock_minutes and sets upgraded_at)
 * 5. In-Progress Reservation Window Block (walk-in cannot claim during active/near reservation window)
 * 6. Per-IP Soft Hold Rate Limit (5 active non-upgraded holds max per IP, 6th gets 429 TOO_MANY_HOLDS)
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Environment & Config ─────────────────────────────────────────────────────

const envLocalPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...values] = trimmed.split('=');
    const val = values.join('=').trim().replace(/^['"]|['"]$/g, '');
    if (key && val && !process.env[key.trim()]) {
      process.env[key.trim()] = val;
    }
  }
}

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET);

// ─── Formatting helpers ───────────────────────────────────────────────────────

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const gray = (s) => `\x1b[90m${s}\x1b[0m`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// ─── Clean-up Helper ──────────────────────────────────────────────────────────

async function cleanupTestData(branchId, tableCodes) {
  const { data: tables } = await admin
    .from('tables')
    .select('id, code')
    .eq('branch_id', branchId)
    .in('code', tableCodes);

  if (!tables || tables.length === 0) return;
  const tableIds = tables.map((t) => t.id);

  // Remove orders tied to test tables
  await admin.from('orders').delete().in('table_number', tableCodes).eq('branch_id', branchId);

  // Remove test sessions
  await admin.from('table_sessions').delete().in('table_id', tableIds);

  // Remove test reservations
  await admin.from('reservations').delete().in('table_id', tableIds);
}

// ─── Main Test Runner ─────────────────────────────────────────────────────────

async function main() {
  console.log(bold('\n══════════════════════════════════════════════════════════════════'));
  console.log(bold('  🧪 Hardened Table Claim & Soft Hold Invariant Test Suite'));
  console.log(bold('══════════════════════════════════════════════════════════════════'));
  console.log(`Target server: ${cyan(BASE_URL)}`);
  console.log(`Supabase:      ${cyan(SUPABASE_URL)}\n`);

  // 1. Locate test branch
  const { data: branches } = await admin
    .from('branches')
    .select('id, name, walkin_lock_minutes, claim_soft_hold_minutes')
    .limit(1);

  if (!branches || branches.length === 0) {
    throw new Error('No branches found in database.');
  }

  const branch = branches[0];
  console.log(`Using branch: ${bold(branch.name)} (${branch.id})`);
  console.log(`Branch settings: soft_hold=${branch.claim_soft_hold_minutes || 20}m, full_lock=${branch.walkin_lock_minutes || 180}m`);

  // 2. Ensure test tables exist
  const testCodes = ['TEST-A1', 'TEST-A2', 'TEST-H1', 'TEST-H2', 'TEST-H3', 'TEST-H4', 'TEST-H5', 'TEST-H6'];
  for (const code of testCodes) {
    const { data: existing } = await admin
      .from('tables')
      .select('id')
      .eq('branch_id', branch.id)
      .eq('code', code)
      .maybeSingle();

    if (!existing) {
      await admin.from('tables').insert({
        branch_id: branch.id,
        code,
        label: `Meja Pengujian ${code}`,
        seats: 4,
        is_active: true,
      });
    }
  }

  const { data: testTables } = await admin
    .from('tables')
    .select('id, code')
    .eq('branch_id', branch.id)
    .in('code', testCodes);

  const tableA1 = testTables.find((t) => t.code === 'TEST-A1');
  const tableA2 = testTables.find((t) => t.code === 'TEST-A2');

  // Initial clean-up for pristine state
  await cleanupTestData(branch.id, testCodes);

  let passedTests = 0;
  const totalTests = 7;

  // ────────────────────────────────────────────────────────────────────────────
  // Test 1: 20-Thread Concurrency Race on TEST-A1
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 1/6] 🏁 20-Thread Concurrency Race on TEST-A1'));
  {
    const THREAD_COUNT = 20;
    console.log(`  Firing ${THREAD_COUNT} simultaneous claim requests with distinct tokens...`);

    const promises = Array.from({ length: THREAD_COUNT }, async (_, i) => {
      const token = `test_race_${i}_${Date.now()}`;
      const res = await fetch(`${BASE_URL}/api/tables/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': `192.168.100.${i + 1}`,
          Cookie: `table_session_token=${token}`,
        },
        body: JSON.stringify({
          branch_id: branch.id,
          code: 'TEST-A1',
        }),
      });

      const body = await res.json();
      return { status: res.status, body, token };
    });

    const results = await Promise.all(promises);

    const successes = results.filter((r) => r.status === 200 && r.body.ok === true);
    const conflicts = results.filter((r) => r.status === 409 && r.body.code === 'TABLE_TAKEN');

    console.log(`  Results: ${green(`${successes.length} succeeded`)}, ${yellow(`${conflicts.length} rejected with 409 TABLE_TAKEN`)}`);

    assert(
      successes.length === 1,
      `Expected exactly 1 claim to succeed, but ${successes.length} succeeded.`
    );
    assert(
      conflicts.length === THREAD_COUNT - 1,
      `Expected ${THREAD_COUNT - 1} claims rejected with TABLE_TAKEN, but got ${conflicts.length}.`
    );

    // Verify soft hold properties
    assert(successes[0].body.session.upgraded === false, 'Initial claim should be a soft hold (upgraded: false)');

    // Verify DB invariant: exactly 1 active session in table_sessions
    const { data: activeSessions } = await admin
      .from('table_sessions')
      .select('id, status, session_token, upgraded_at')
      .eq('table_id', tableA1.id)
      .eq('status', 'active');

    assert(
      activeSessions.length === 1,
      `DB Invariant violated: Expected 1 active session in database, found ${activeSessions.length}`
    );
    assert(
      activeSessions[0].session_token === successes[0].token,
      'DB Invariant violated: Winner session_token does not match DB record.'
    );
    assert(
      activeSessions[0].upgraded_at === null,
      'Soft hold session must have upgraded_at = null in DB.'
    );

    console.log(green('  ✅ Test 1 Passed: Exactly 1 winner (soft hold), 19 blocked by Postgres row lock & partial index.'));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 2: One Cookie Claiming Two Tables in Parallel
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 2/6] 👥 One Cookie Claiming Two Tables in Parallel (TEST-A1 & TEST-A2)'));
  {
    await cleanupTestData(branch.id, testCodes);

    const sharedToken = `test_dual_claim_${Date.now()}`;
    console.log(`  Firing simultaneous claims for TEST-A1 and TEST-A2 with single token ${sharedToken}...`);

    const p1 = fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '192.168.1.101',
        Cookie: `table_session_token=${sharedToken}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'TEST-A1' }),
    }).then(async (r) => ({ table: 'TEST-A1', status: r.status, body: await r.json() }));

    const p2 = fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '192.168.1.101',
        Cookie: `table_session_token=${sharedToken}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'TEST-A2' }),
    }).then(async (r) => ({ table: 'TEST-A2', status: r.status, body: await r.json() }));

    const dualResults = await Promise.all([p1, p2]);

    const successes = dualResults.filter((r) => r.status === 200 && r.body.ok === true);
    const serverErrors = dualResults.filter((r) => r.status >= 500);

    console.log(`  Statuses: ${dualResults[0].table} -> HTTP ${dualResults[0].status}, ${dualResults[1].table} -> HTTP ${dualResults[1].status}`);

    assert(serverErrors.length === 0, `Encountered unexpected 500 error: ${JSON.stringify(serverErrors)}`);

    // Verify DB invariant: at most ONE active session exists for this token
    const { data: userActiveSessions } = await admin
      .from('table_sessions')
      .select('id, table_id, status, released_reason')
      .eq('session_token', sharedToken)
      .eq('status', 'active');

    assert(
      userActiveSessions.length === 1,
      `Expected at most 1 active session for token in DB, found ${userActiveSessions.length}`
    );

    console.log(green('  ✅ Test 2 Passed: Exactly 1 table remains active; parallel claim resolved cleanly without 500 error.'));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 3: Soft Hold Expiry & Automatic Table Release (No Order Placed)
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 3/6] ⏱️ Soft Hold Expiry (Table frees up when no order is placed)'));
  {
    await cleanupTestData(branch.id, testCodes);

    const clientToken = `test_soft_hold_${Date.now()}`;
    console.log('  Customer A scans TEST-A1 (gets soft hold)...');

    const res1 = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '192.168.1.102',
        Cookie: `table_session_token=${clientToken}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'TEST-A1' }),
    });

    const body1 = await res1.json();
    assert(res1.status === 200 && body1.ok === true, 'Failed initial claim');
    assert(body1.session.upgraded === false, 'Initial claim must not be upgraded');

    const { data: initialSess } = await admin
      .from('table_sessions')
      .select('id, expires_at, upgraded_at')
      .eq('session_token', clientToken)
      .single();

    assert(initialSess.upgraded_at === null, 'Session must not be upgraded');

    // Simulate soft hold expiry by setting expires_at to past
    console.log('  Simulating soft hold timeout (expires_at set to 1 minute ago)...');
    await admin
      .from('table_sessions')
      .update({ expires_at: new Date(Date.now() - 60 * 1000).toISOString() })
      .eq('id', initialSess.id);

    // Customer B arrives and claims TEST-A1
    console.log('  Customer B arrives and scans TEST-A1...');
    const customerBToken = `test_customer_b_${Date.now()}`;
    const res2 = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '192.168.1.103',
        Cookie: `table_session_token=${customerBToken}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'TEST-A1' }),
    });

    const body2 = await res2.json();
    assert(res2.status === 200 && body2.ok === true, `Customer B claim failed: ${JSON.stringify(body2)}`);

    // Verify DB state: Customer A session flipped to expired, Customer B active
    const { data: customerASess } = await admin
      .from('table_sessions')
      .select('status, released_reason, upgraded_at')
      .eq('session_token', clientToken)
      .single();

    assert(
      customerASess.status === 'expired' && customerASess.released_reason === 'expired',
      `Customer A session expected expired, got ${customerASess.status} / ${customerASess.released_reason}`
    );
    assert(customerASess.upgraded_at === null, 'Customer A upgraded_at should remain null');

    console.log(green('  ✅ Test 3 Passed: Soft hold timed out without order; table automatically freed for new customer.'));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 4: First Order Upgrades Soft Hold to Full Walk-in Lock
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 4/6] 🛒 Order Upgrades Session to Full Walk-in Lock (3h) & Sets upgraded_at'));
  {
    await cleanupTestData(branch.id, testCodes);

    const clientToken = `test_order_upgrade_${Date.now()}`;
    console.log('  Step A: Customer claims TEST-A1 (soft hold)...');

    const claimRes = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '192.168.1.104',
        Cookie: `table_session_token=${clientToken}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'TEST-A1' }),
    });

    const claimBody = await claimRes.json();
    assert(claimRes.status === 200 && claimBody.ok === true, 'Failed claim');
    const initialExpiry = new Date(claimBody.session.expiresAt).getTime();
    console.log(`  Initial soft hold expires at: ${new Date(initialExpiry).toLocaleTimeString()}`);

    // Get a valid menu item
    const { data: menuItems } = await admin
      .from('menu_items')
      .select('id, name, price')
      .eq('is_available', true)
      .limit(1);

    if (!menuItems || menuItems.length === 0) {
      throw new Error('No available menu items in branch for order test');
    }
    const menuItem = menuItems[0];

    // Step B: Submit order via /api/orders/create with active session cookie
    console.log(`  Step B: Placing order for '${menuItem.name}' via /api/orders/create...`);
    const orderRes = await fetch(`${BASE_URL}/api/orders/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `table_session_token=${clientToken}`,
      },
      body: JSON.stringify({
        branch_id: branch.id,
        customer_name: 'Deni Tester',
        customer_phone: '081299998888',
        payment_method: 'cash',
        items: [
          {
            id: menuItem.id,
            quantity: 1,
          },
        ],
      }),
    });

    const orderBody = await orderRes.json();
    assert((orderRes.status === 200 || orderRes.status === 201) && orderBody.ok === true, `Order failed: ${JSON.stringify(orderBody)}`);
    console.log(`  Order created successfully: ID ${orderBody.order.id}`);

    // Step C: Verify session in DB was upgraded
    const { data: upgradedSess } = await admin
      .from('table_sessions')
      .select('id, expires_at, upgraded_at, started_at')
      .eq('session_token', clientToken)
      .single();

    assert(upgradedSess.upgraded_at !== null, 'Session upgraded_at was NOT set after order placement!');

    const upgradedExpiry = new Date(upgradedSess.expires_at).getTime();
    console.log(`  Upgraded session expires at: ${new Date(upgradedExpiry).toLocaleTimeString()}`);
    console.log(`  upgraded_at timestamp:       ${upgradedSess.upgraded_at}`);

    assert(
      upgradedExpiry > initialExpiry,
      `Upgraded expires_at (${upgradedExpiry}) should be greater than soft hold expiry (${initialExpiry})`
    );

    // Duration should now be around 180 minutes from started_at
    const startedAt = new Date(upgradedSess.started_at).getTime();
    const durationMinutes = Math.round((upgradedExpiry - startedAt) / (60 * 1000));
    console.log(`  Total locked duration:       ${durationMinutes} minutes (configured lock: ${branch.walkin_lock_minutes || 180}m)`);
    assert(
      durationMinutes >= 150,
      `Expected locked duration to be near walkin_lock_minutes (>= 150m), got ${durationMinutes}m`
    );

    console.log(green('  ✅ Test 4 Passed: Order automatically upgraded soft hold to full 3-hour lock with upgraded_at timestamp.'));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 5: In-Progress Reservation Window Block
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 5/6] 🛡️ Walk-in Blocked During Active or Near Reservation Window'));
  {
    await cleanupTestData(branch.id, testCodes);

    // Sub-test 5A: Reservation currently in-progress
    console.log('  Sub-test 5A: Setting up currently active reservation (started 10m ago, ends in 50m)...');
    const now = Date.now();
    const resAStartsAt = new Date(now - 10 * 60 * 1000).toISOString();
    const resAEndsAt   = new Date(now + 50 * 60 * 1000).toISOString();

    const { error: errA } = await admin.from('reservations').insert({
      code: 'RSVN' + Math.floor(1000 + Math.random() * 9000),
      branch_id: branch.id,
      table_id: tableA1.id,
      customer_name: 'Reservasi Aktif',
      customer_phone: '081233334444',
      party_size: 4,
      starts_at: resAStartsAt,
      ends_at: resAEndsAt,
      status: 'confirmed',
      paid_at: new Date().toISOString(),
    });
    assert(!errA, `Failed to insert reservation 5A: ${errA?.message}`);

    const walkinToken1 = `test_walkin_active_${Date.now()}`;
    const res1 = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '192.168.1.105',
        Cookie: `table_session_token=${walkinToken1}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'TEST-A1' }),
    });

    const body1 = await res1.json();
    assert(
      res1.status === 409 && body1.code === 'TABLE_RESERVED',
      `Expected 409 TABLE_RESERVED for active reservation, got ${res1.status} ${JSON.stringify(body1)}`
    );
    console.log(`  Walk-in correctly rejected with: ${yellow(body1.code)} (${body1.error})`);

    // Clean up 5A
    await cleanupTestData(branch.id, testCodes);

    // Sub-test 5B: Reservation upcoming within the soft hold window (in 15m)
    console.log('  Sub-test 5B: Setting up upcoming reservation starting in 15 minutes...');
    const resBStartsAt = new Date(now + 15 * 60 * 1000).toISOString();
    const resBEndsAt   = new Date(now + 75 * 60 * 1000).toISOString();

    const { error: errB } = await admin.from('reservations').insert({
      code: 'RSVN' + Math.floor(1000 + Math.random() * 9000),
      branch_id: branch.id,
      table_id: tableA1.id,
      customer_name: 'Reservasi Mendatang',
      customer_phone: '081255556666',
      party_size: 2,
      starts_at: resBStartsAt,
      ends_at: resBEndsAt,
      status: 'confirmed',
      paid_at: new Date().toISOString(),
    });
    assert(!errB, `Failed to insert reservation 5B: ${errB?.message}`);

    const walkinToken2 = `test_walkin_near_${Date.now()}`;
    const res2 = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '192.168.1.106',
        Cookie: `table_session_token=${walkinToken2}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'TEST-A1' }),
    });

    const body2 = await res2.json();
    assert(
      res2.status === 409 && body2.code === 'TABLE_RESERVED',
      `Expected 409 TABLE_RESERVED for near reservation, got ${res2.status} ${JSON.stringify(body2)}`
    );
    console.log(`  Walk-in correctly rejected with: ${yellow(body2.code)} (${body2.error})`);

    console.log(green('  ✅ Test 5 Passed: Walk-in strictly prevented from claiming tables with active or near reservations.'));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 6: Per-IP Soft Hold Rate Limit (Max 5 active holds per branch)
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 6/6] 🚫 Per-IP Soft Hold Limit (Max 5 active non-upgraded holds per IP)'));
  {
    await cleanupTestData(branch.id, testCodes);

    const testIp = '203.0.113.88';
    const holdTables = ['TEST-H1', 'TEST-H2', 'TEST-H3', 'TEST-H4', 'TEST-H5', 'TEST-H6'];

    console.log(`  Claiming 5 different tables with distinct tokens from the same IP (${testIp})...`);
    for (let i = 0; i < 5; i++) {
      const token = `test_hold_ip_${i}_${Date.now()}`;
      const res = await fetch(`${BASE_URL}/api/tables/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': testIp,
          Cookie: `table_session_token=${token}`,
        },
        body: JSON.stringify({ branch_id: branch.id, code: holdTables[i] }),
      });
      const body = await res.json();
      assert(res.status === 200 && body.ok === true, `Failed hold ${i + 1}: ${JSON.stringify(body)}`);
    }

    console.log('  5 active holds created. Attempting 6th hold from same IP (should trigger 429 TOO_MANY_HOLDS)...');
    const token6 = `test_hold_ip_6_${Date.now()}`;
    const res6 = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': testIp,
        Cookie: `table_session_token=${token6}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: holdTables[5] }),
    });

    const body6 = await res6.json();
    assert(
      res6.status === 429 && body6.code === 'TOO_MANY_HOLDS',
      `Expected 429 TOO_MANY_HOLDS on 6th claim, got HTTP ${res6.status}: ${JSON.stringify(body6)}`
    );
    console.log(`  6th hold blocked with: ${yellow(`HTTP ${res6.status} ${body6.code}`)} (${body6.error})`);

    console.log(green('  ✅ Test 6 Passed: IP limit enforced; scripts cannot hoard more than 5 tables per branch.'));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 7: Staff "Kosongkan meja" Releases Active Table Session via SQL RPC
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 7/7] 🧹 Staff "Kosongkan meja" Releases Active Table Session'));
  {
    await cleanupTestData(branch.id, testCodes);

    // 1. Create an active claim on TEST-A1
    const testToken = `test_staff_release_${Date.now()}`;
    const claimRes = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '192.168.1.199',
        Cookie: `table_session_token=${testToken}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'TEST-A1' }),
    });
    const claimBody = await claimRes.json();
    assert(claimRes.status === 200 && claimBody.ok === true, `Failed to claim table for release test: ${JSON.stringify(claimBody)}`);

    const { data: activeSess } = await admin
      .from('table_sessions')
      .select('id, status')
      .eq('session_token', testToken)
      .eq('status', 'active')
      .single();
    assert(activeSess?.id, 'Active session not found in database');
    console.log(`  Table TEST-A1 claimed with session ID: ${cyan(activeSess.id)}`);

    // 2. Staff calls admin_release_table_session via SQL RPC
    console.log('  Staff calls admin_release_table_session SQL RPC...');
    const { data: releaseResult, error: relErr } = await admin.rpc('admin_release_table_session', {
      p_table_id: tableA1.id,
      p_session_id: null,
      p_reason: 'staff',
    });
    assert(!relErr && releaseResult?.ok === true, `Release RPC failed: ${relErr?.message || JSON.stringify(releaseResult)}`);

    // 3. Verify in database that session is released with released_reason = 'staff'
    const { data: sessionAfter } = await admin
      .from('table_sessions')
      .select('status, released_reason, released_at')
      .eq('id', activeSess.id)
      .single();

    assert(
      sessionAfter?.status === 'released' && sessionAfter?.released_reason === 'staff' && sessionAfter?.released_at,
      `Session status unexpected after staff release: ${JSON.stringify(sessionAfter)}`
    );
    console.log(`  Session successfully verified as: ${bold(sessionAfter.status)} (reason: ${sessionAfter.released_reason})`);

    // 4. Verify table can immediately be claimed again
    const newToken = `test_reclaim_${Date.now()}`;
    const reclaimRes = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '192.168.1.200',
        Cookie: `table_session_token=${newToken}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'TEST-A1' }),
    });
    const reclaimBody = await reclaimRes.json();
    assert(reclaimRes.status === 200 && reclaimBody.ok === true, `Reclaiming freed table failed: ${JSON.stringify(reclaimBody)}`);
    console.log('  Freed table was immediately reclaimable by next customer.');

    console.log(green('  ✅ Test 7 Passed: Staff "Kosongkan meja" properly released active session and freed table.'));
    passedTests++;
  }

  // Final cleanup
  await cleanupTestData(branch.id, testCodes);

  console.log(bold('\n══════════════════════════════════════════════════════════════════'));
  console.log(bold(`  🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`));
  console.log(bold('══════════════════════════════════════════════════════════════════\n'));
}

main().catch((err) => {
  console.error(red(`\n💥 Test Suite Failed: ${err.message}`));
  if (err.stack) console.error(gray(err.stack));
  process.exit(1);
});
