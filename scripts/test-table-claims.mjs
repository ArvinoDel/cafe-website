/**
 * scripts/test-table-claims.mjs
 *
 * Automated Concurrency & Invariant Test Suite for Phase 3:
 * 1. Concurrency Race (20 parallel requests for same table -> exactly 1 succeeds, 19 get 409 TABLE_TAKEN)
 * 2. Move Rule (token claims A-1, then claims A-2 -> A-1 released with reason 'moved', A-2 active)
 * 3. Re-scan Invariance (re-scanning same table preserves existing session and expires_at unchanged)
 * 4. Reservation Overlap (walk-in blocked/warned on upcoming reservation; reservation owner can claim with code)
 * 5. Double-Booking Exclusion (concurrent overlapping reservations blocked by PostgreSQL EXCLUDE constraint)
 * 6. Hold Expiry (expired session is auto-flipped to 'expired' and table is claimable)
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
  // Find table IDs
  const { data: tables } = await admin
    .from('tables')
    .select('id, code')
    .eq('branch_id', branchId)
    .in('code', tableCodes);

  if (!tables || tables.length === 0) return;
  const tableIds = tables.map((t) => t.id);

  // Remove test sessions
  await admin.from('table_sessions').delete().in('table_id', tableIds);

  // Remove test reservations
  await admin.from('reservations').delete().in('table_id', tableIds);
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

async function main() {
  console.log(bold('\n══════════════════════════════════════════════════════════════════'));
  console.log(bold('  🧪 Phase 3: Table Claim & Reservation Invariant Test Suite'));
  console.log(bold('══════════════════════════════════════════════════════════════════'));
  console.log(`Target server: ${cyan(BASE_URL)}`);
  console.log(`Supabase:      ${cyan(SUPABASE_URL)}\n`);

  // 1. Locate test branch and tables
  const { data: branches } = await admin
    .from('branches')
    .select('id, name')
    .limit(1);

  if (!branches || branches.length === 0) {
    throw new Error('No branches found in database.');
  }

  const branch = branches[0];
  console.log(`Using branch: ${bold(branch.name)} (${branch.id})`);

  // Ensure test tables exist: 'TEST-A1' and 'TEST-A2'
  const testCodes = ['TEST-A1', 'TEST-A2'];
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
      console.log(`  Created test table ${bold(code)}`);
    }
  }

  const { data: testTables } = await admin
    .from('tables')
    .select('id, code')
    .eq('branch_id', branch.id)
    .in('code', testCodes);

  const tableA1 = testTables.find((t) => t.code === 'TEST-A1');
  const tableA2 = testTables.find((t) => t.code === 'TEST-A2');

  // Initial clean-up for pristine test state
  await cleanupTestData(branch.id, testCodes);

  let passedTests = 0;
  let totalTests = 6;

  // ────────────────────────────────────────────────────────────────────────────
  // Test 1: Concurrency Race (20 simultaneous claims for TEST-A1)
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 1/6] 🏁 20-Thread Concurrency Race on TEST-A1'));
  {
    const THREAD_COUNT = 20;
    console.log(`  Firing ${THREAD_COUNT} simultaneous claim requests with distinct tokens...`);

    const promises = Array.from({ length: THREAD_COUNT }, async (_, i) => {
      const token = `test_token_race_${i}_${Date.now()}`;
      const res = await fetch(`${BASE_URL}/api/tables/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
      `Expected ${THREAD_COUNT - 1} claims to be rejected with TABLE_TAKEN, but got ${conflicts.length}.`
    );

    // Verify DB invariant: exactly 1 active session in table_sessions
    const { data: activeSessions } = await admin
      .from('table_sessions')
      .select('id, status, session_token')
      .eq('table_id', tableA1.id)
      .eq('status', 'active');

    assert(
      activeSessions.length === 1,
      `DB Invariant violated: Expected 1 active session in database, found ${activeSessions.length}`
    );
    assert(
      activeSessions[0].session_token === successes[0].token,
      `DB Invariant violated: Winner session_token does not match DB record.`
    );

    console.log(green('  ✅ Test 1 Passed: Exactly 1 winner, 19 blocked by Postgres row lock & partial index.'));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 2: Move Rule (Client moves from TEST-A1 to TEST-A2)
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 2/6] 🔄 Move Rule (TEST-A1 -> TEST-A2 with same session token)'));
  {
    // Clean-up before Move test
    await cleanupTestData(branch.id, testCodes);

    const clientToken = `test_token_move_${Date.now()}`;

    // Step A: Claim TEST-A1
    console.log('  Step A: Client claims TEST-A1...');
    const res1 = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `table_session_token=${clientToken}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'TEST-A1' }),
    });
    const body1 = await res1.json();
    assert(res1.status === 200 && body1.ok === true, 'Failed to claim TEST-A1 in Step A');

    // Step B: Claim TEST-A2 with the same token
    console.log('  Step B: Same client claims TEST-A2...');
    const res2 = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `table_session_token=${clientToken}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'TEST-A2' }),
    });
    const body2 = await res2.json();
    assert(res2.status === 200 && body2.ok === true, 'Failed to claim TEST-A2 in Step B');
    assert(body2.session.tableCode === 'TEST-A2', 'Returned session does not match TEST-A2');

    // Step C: Verify DB state
    const { data: a1Sessions } = await admin
      .from('table_sessions')
      .select('id, status, released_reason')
      .eq('table_id', tableA1.id)
      .eq('session_token', clientToken);

    const { data: a2Sessions } = await admin
      .from('table_sessions')
      .select('id, status, released_reason')
      .eq('table_id', tableA2.id)
      .eq('session_token', clientToken);

    assert(a1Sessions.length === 1, 'Missing session record for A1');
    assert(
      a1Sessions[0].status === 'released' && a1Sessions[0].released_reason === 'moved',
      `Expected A1 to be released with reason 'moved', but got status=${a1Sessions[0].status}, reason=${a1Sessions[0].released_reason}`
    );

    assert(a2Sessions.length === 1, 'Missing session record for A2');
    assert(a2Sessions[0].status === 'active', `Expected A2 to be active, got ${a2Sessions[0].status}`);

    console.log(green("  ✅ Test 2 Passed: Previous table TEST-A1 released ('moved'), new table TEST-A2 active."));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 3: Re-scan Invariance (Re-scanning same table preserves expires_at)
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 3/6] 🔁 Re-scan Invariance (No expiry extension)'));
  {
    const clientToken = `test_token_rescan_${Date.now()}`;

    // Claim TEST-A1
    const res1 = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `table_session_token=${clientToken}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'TEST-A1' }),
    });
    const body1 = await res1.json();
    assert(res1.status === 200 && body1.ok === true, 'Initial claim failed');
    const firstExpiresAt = body1.session.expiresAt;
    const firstStartedAt = body1.session.startedAt;
    assert(body1.isExisting === false, 'Initial claim should have isExisting: false');

    // Small delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Re-scan TEST-A1 with same token
    const res2 = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `table_session_token=${clientToken}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'TEST-A1' }),
    });
    const body2 = await res2.json();
    assert(res2.status === 200 && body2.ok === true, 'Re-scan claim failed');
    assert(body2.isExisting === true, 'Re-scan must return isExisting: true');
    assert(
      body2.session.expiresAt === firstExpiresAt,
      `Expiry extended on re-scan! First: ${firstExpiresAt}, Second: ${body2.session.expiresAt}`
    );
    assert(
      body2.session.startedAt === firstStartedAt,
      `StartedAt changed on re-scan! First: ${firstStartedAt}, Second: ${body2.session.startedAt}`
    );

    console.log(green('  ✅ Test 3 Passed: Re-scan recognized existing session; expires_at strictly preserved.'));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 4: Reservation Overlap Guard
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 4/6] 🛡️ Reservation Overlap & Code Bypass'));
  {
    await cleanupTestData(branch.id, testCodes);

    // Create an upcoming confirmed reservation on TEST-A1 starting in 25 minutes
    const resCode = 'RSVN' + Math.floor(1000 + Math.random() * 9000);
    const startsAt = new Date(Date.now() + 25 * 60 * 1000); // 25 min from now
    const endsAt = new Date(startsAt.getTime() + 120 * 60 * 1000);

    const { data: rsvn, error: rsvnErr } = await admin
      .from('reservations')
      .insert({
        code: resCode,
        branch_id: branch.id,
        table_id: tableA1.id,
        customer_name: 'Budi Test',
        customer_phone: '081234567890',
        party_size: 2,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: 'confirmed',
      })
      .select('id, code')
      .single();

    assert(!rsvnErr && rsvn, `Failed to setup test reservation: ${rsvnErr?.message}`);

    // Walk-in attempt (without reservation code)
    console.log('  Sub-test A: Walk-in scans table with upcoming reservation in 25 min...');
    const walkinToken = `test_walkin_${Date.now()}`;
    const resWalkin = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `table_session_token=${walkinToken}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'TEST-A1' }),
    });

    const bodyWalkin = await resWalkin.json();
    assert(
      resWalkin.status === 409 &&
        (bodyWalkin.code === 'TABLE_RESERVED_SOON' || bodyWalkin.code === 'TABLE_RESERVED'),
      `Expected 409 TABLE_RESERVED_SOON / TABLE_RESERVED, got ${resWalkin.status} ${JSON.stringify(bodyWalkin)}`
    );
    console.log(`  Walk-in properly rejected with: ${yellow(bodyWalkin.code)}`);

    // Reservation owner attempt (with reservation code)
    console.log('  Sub-test B: Reservation owner scans with valid reservation code...');
    const ownerToken = `test_owner_${Date.now()}`;
    const resOwner = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `table_session_token=${ownerToken}`,
      },
      body: JSON.stringify({
        branch_id: branch.id,
        code: 'TEST-A1',
        reservation_code: resCode,
      }),
    });

    const bodyOwner = await resOwner.json();
    assert(
      resOwner.status === 200 && bodyOwner.ok === true,
      `Reservation owner failed to claim with valid code: ${JSON.stringify(bodyOwner)}`
    );
    console.log(`  Reservation owner claim succeeded with table session: ${green(bodyOwner.session.tableCode)}`);

    console.log(green('  ✅ Test 4 Passed: Walk-in blocked by buffer; reservation owner permitted via code.'));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 5: Double-Booking Exclusion (PostgreSQL EXCLUDE constraint)
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 5/6] 🔒 Double-Booking Exclusion Constraint (Postgres Level)'));
  {
    await cleanupTestData(branch.id, testCodes);

    // Two reservations for the exact same table and time window
    const baseTime = new Date(Date.now() + 48 * 3600 * 1000); // 2 days in future
    const resStartsAt = baseTime.toISOString();
    const resEndsAt = new Date(baseTime.getTime() + 120 * 60 * 1000).toISOString();

    console.log('  Inserting first reservation for TEST-A1...');
    const code1 = 'EXCL' + Math.floor(1000 + Math.random() * 9000);
    const { error: err1 } = await admin.from('reservations').insert({
      code: code1,
      branch_id: branch.id,
      table_id: tableA1.id,
      customer_name: 'Customer 1',
      customer_phone: '08111111111',
      party_size: 2,
      starts_at: resStartsAt,
      ends_at: resEndsAt,
      status: 'confirmed',
    });
    assert(!err1, `First reservation failed: ${err1?.message}`);

    console.log('  Attempting second overlapping reservation on same table & time window...');
    const code2 = 'EXCL' + Math.floor(1000 + Math.random() * 9000);
    const { error: err2 } = await admin.from('reservations').insert({
      code: code2,
      branch_id: branch.id,
      table_id: tableA1.id,
      customer_name: 'Customer 2',
      customer_phone: '08222222222',
      party_size: 2,
      starts_at: resStartsAt,
      ends_at: resEndsAt,
      status: 'pending_payment',
    });

    assert(err2 !== null, 'Exclusion constraint did NOT trigger on overlapping reservation!');
    assert(
      err2.code === '23P01',
      `Expected PostgreSQL error 23P01 (exclusion_violation), got: ${err2.code} - ${err2.message}`
    );

    console.log(`  Postgres raised exclusion violation: ${yellow(err2.code)} (${err2.message})`);
    console.log(green('  ✅ Test 5 Passed: PostgreSQL EXCLUDE USING gist reliably prevented double-booking.'));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 6: Hold / Session Auto-Expiry
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 6/6] ⏱️ Stale Session Expiry on Next Claim'));
  {
    await cleanupTestData(branch.id, testCodes);

    // Insert an already expired session directly
    const staleToken = `stale_token_${Date.now()}`;
    const pastTime = new Date(Date.now() - 60 * 1000).toISOString(); // 1 minute ago

    await admin.from('table_sessions').insert({
      table_id: tableA1.id,
      branch_id: branch.id,
      session_token: staleToken,
      status: 'active',
      started_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      expires_at: pastTime,
    });

    console.log('  Inserted expired session on TEST-A1 (expires_at in past)...');

    // New customer attempts to claim TEST-A1
    console.log('  New customer claims TEST-A1...');
    const newCustomerToken = `new_customer_${Date.now()}`;
    const res = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `table_session_token=${newCustomerToken}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'TEST-A1' }),
    });

    const body = await res.json();
    assert(
      res.status === 200 && body.ok === true,
      `New customer claim failed against expired session: ${JSON.stringify(body)}`
    );

    // Verify DB states: old session is 'expired', new session is 'active'
    const { data: oldSess } = await admin
      .from('table_sessions')
      .select('status, released_reason')
      .eq('session_token', staleToken)
      .single();

    assert(
      oldSess.status === 'expired' && oldSess.released_reason === 'expired',
      `Old session status=${oldSess.status}, reason=${oldSess.released_reason}`
    );

    const { data: newSess } = await admin
      .from('table_sessions')
      .select('status')
      .eq('session_token', newCustomerToken)
      .single();

    assert(newSess.status === 'active', `New session not active: ${newSess.status}`);

    console.log(green("  ✅ Test 6 Passed: Stale session flipped to 'expired' and table claimed by new customer."));
    passedTests++;
  }

  // Final cleanup of test tables data
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
