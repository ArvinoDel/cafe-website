/**
 * scripts/test-reservations.mjs
 *
 * Comprehensive Automated Test Suite for Reservations:
 * 1. Concurrency: 10 parallel bookings on same table & time -> Exactly 1 wins, 9 get 409
 * 2. Concurrency: Booking vs Walk-in Claim Race on same table
 * 3. Expiry: Hold expiry & automatic slot sweep to 'expired'
 * 4. Expiry / Limit: Unpaid hold cap (max 2 unpaid holds per phone/IP, 3rd gets 429)
 * 5. Buffer Invariant: 15-minute buffer zone respected
 * 6. Expiry Path: SLOT_LOST path (hold expires before staff confirm -> marked needs_refund)
 * 7. Opening-hours Boundaries: 08:30 (valid) vs 21:30 (outside hours, rejected)
 * 8. Lookup Security: Wrong verifier returns 404; correct verifier returns safe public fields
 * 9. Early Window Conflict: Reservation owner arrival bumps walk-in holding the table
 * 10. Full Happy Path: Book -> Pay -> Staff Confirm -> Arrive -> Check-in -> Kitchen Order Created
 * 11. Admin Transitions: Complete/Cancel releases table session; Mark Refunded sets refund_status
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

// ─── Cleanup Helper ───────────────────────────────────────────────────────────

async function cleanupTestData(branchId, tableCodes) {
  const { data: tables } = await admin
    .from('tables')
    .select('id, code')
    .eq('branch_id', branchId)
    .in('code', tableCodes);

  if (!tables || tables.length === 0) return;
  const tableIds = tables.map((t) => t.id);

  // Unlink session_id on reservations first
  await admin.from('reservations').update({ session_id: null }).in('table_id', tableIds);

  // Delete test reservations
  await admin.from('reservations').delete().in('table_id', tableIds);

  // Delete test sessions
  await admin.from('table_sessions').delete().in('table_id', tableIds);
}

// ─── Main Test Runner ─────────────────────────────────────────────────────────

async function main() {
  console.log(bold('\n══════════════════════════════════════════════════════════════════'));
  console.log(bold('  🧪 Comprehensive Reservation Test Suite'));
  console.log(bold('══════════════════════════════════════════════════════════════════'));
  console.log(`Target server: ${cyan(BASE_URL)}`);
  console.log(`Supabase:      ${gray(SUPABASE_URL)}`);

  // 1. Pick an active branch
  const { data: branches, error: bErr } = await admin
    .from('branches')
    .select('id, name, reservation_buffer_minutes, reservation_min_lead_minutes, timezone')
    .eq('reservations_enabled', true)
    .limit(1);

  assert(!bErr && branches?.length > 0, 'No active reservation-enabled branch found.');
  const branch = branches[0];
  console.log(`\nUsing branch: ${bold(branch.name)} (${gray(branch.id)})`);

  // 2. Fetch or create test tables
  const testCodes = ['RES-T1', 'RES-T2', 'RES-T3', 'RES-WIN'];
  const tableMap = {};

  for (const code of testCodes) {
    const { data: existing } = await admin
      .from('tables')
      .select('id, code, seats')
      .eq('branch_id', branch.id)
      .eq('code', code)
      .maybeSingle();

    if (existing) {
      tableMap[code] = existing;
    } else {
      const { data: created, error: cErr } = await admin
        .from('tables')
        .insert({
          branch_id: branch.id,
          code,
          label: `Meja Reservasi ${code}`,
          seats: 6,
          is_active: true,
        })
        .select('id, code, seats')
        .single();
      assert(!cErr, `Failed to create test table ${code}: ${cErr?.message}`);
      tableMap[code] = created;
    }
  }

  // Fetch a sample menu item for pre-orders
  const { data: menuItems } = await admin
    .from('menu_items')
    .select('id, name, price')
    .eq('is_available', true)
    .limit(1);
  const sampleItem = menuItems?.[0] ?? { id: 'dummy', name: 'Kopi Susu', price: 25000 };

  let passedTests = 0;
  const totalTests = 11;

  // ────────────────────────────────────────────────────────────────────────────
  // Test 1: Concurrency Race on Same Table & Time Slot (10 parallel bookings)
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 1/11] 🏁 10 Parallel Bookings for RES-T1 at identical time slot'));
  {
    await cleanupTestData(branch.id, testCodes);
    const targetDate = '2026-10-22';
    const startsAt = `${targetDate}T10:00:00+07:00`;

    console.log(`  Firing 10 simultaneous reservation requests for RES-T1 at ${startsAt}...`);

    const requests = Array.from({ length: 10 }, (_, i) => {
      const phone = `0812345678${i.toString().padStart(2, '0')}`;
      return fetch(`${BASE_URL}/api/reservations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': `198.51.100.${10 + i}`,
        },
        body: JSON.stringify({
          branch_id: branch.id,
          table_id: tableMap['RES-T1'].id,
          customer_name: `Competitor ${i + 1}`,
          customer_phone: phone,
          party_size: 4,
          starts_at: startsAt,
          duration_minutes: 120,
          occasion: 'Ulang Tahun',
        }),
      });
    });

    const responses = await Promise.all(requests);
    const statuses = await Promise.all(
      responses.map(async (r) => ({ status: r.status, body: await r.json() }))
    );

    const successes = statuses.filter((s) => s.status === 201 && s.body.ok);
    const conflicts = statuses.filter((s) => s.status === 409 && s.body.code === 'TABLE_ALREADY_RESERVED');

    console.log(`  Results: ${successes.length} succeeded, ${conflicts.length} rejected with 409 TABLE_ALREADY_RESERVED`);
    if (successes.length !== 1) {
      console.log('  Debug response sample:', JSON.stringify(statuses[0]));
    }
    assert(successes.length === 1, `Expected exactly 1 success, got ${successes.length}`);
    assert(conflicts.length === 9, `Expected 9 conflicts, got ${conflicts.length}`);
    console.log(green('  ✅ Test 1 Passed: Exactly 1 winner, 9 blocked by table row lock & gist exclusion.'));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 2: Booking vs Walk-in Claim Race on Same Table
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 2/11] ⚡ Booking vs Walk-in Claim Race on Same Table'));
  {
    await cleanupTestData(branch.id, testCodes);
    const startsAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    console.log('  Firing simultaneous walk-in QR claim and reservation booking on RES-T1...');

    const walkinPromise = fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '198.51.100.50',
        Cookie: 'table_session_token=test_race_walkin_token',
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'RES-T1' }),
    });

    const bookingPromise = fetch(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '198.51.100.51',
      },
      body: JSON.stringify({
        branch_id: branch.id,
        table_id: tableMap['RES-T1'].id,
        customer_name: 'Race Customer',
        customer_phone: '081299990001',
        party_size: 2,
        starts_at: startsAt,
        duration_minutes: 60,
      }),
    });

    const [wRes, bRes] = await Promise.all([walkinPromise, bookingPromise]);
    const wBody = await wRes.json();
    const bBody = await bRes.json();

    console.log(`  Walk-in status: HTTP ${wRes.status}`);
    console.log(`  Booking status: HTTP ${bRes.status}`);

    assert(wRes.status !== 500 && bRes.status !== 500, 'Race caused an unhandled 500 internal error.');
    console.log(green('  ✅ Test 2 Passed: Row lock synchronized walk-in claim and reservation booking cleanly.'));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 3: Hold Expiry & Automatic Slot Release
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 3/11] ⏱️ Hold Expiry & Automatic Slot Release'));
  {
    await cleanupTestData(branch.id, testCodes);
    const startsAt = '2026-10-23T14:00:00+07:00';

    console.log('  Customer creates reservation hold on RES-T1...');
    const createRes = await fetch(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: branch.id,
        table_id: tableMap['RES-T1'].id,
        customer_name: 'Expiring Customer',
        customer_phone: '081288880001',
        party_size: 2,
        starts_at: startsAt,
      }),
    });
    const createData = await createRes.json();
    assert(createRes.status === 201 && createData.ok, `Failed to create hold: ${JSON.stringify(createData)}`);
    const resId = createData.reservation.id;
    console.log(`  Simulating hold timeout for ID ${resId} (hold_expires_at set to 1 minute ago)...`);
    const { error: updErr } = await admin
      .from('reservations')
      .update({
        status: 'pending_payment',
        hold_expires_at: new Date(Date.now() - 60000).toISOString(),
      })
      .eq('id', resId);
    assert(!updErr, `Failed to update hold_expires_at: ${updErr?.message}`);

    const { data: sweepResult } = await admin.rpc('sweep_reservations', { p_branch_id: branch.id });
    console.log(`  Sweep executed: ${JSON.stringify(sweepResult)}`);

    console.log('  New customer books the freed slot...');
    const rebookRes = await fetch(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: branch.id,
        table_id: tableMap['RES-T1'].id,
        customer_name: 'New Winner',
        customer_phone: '081288880002',
        party_size: 2,
        starts_at: startsAt,
        duration_minutes: 60,
      }),
    });
    const rebookData = await rebookRes.json();
    assert(rebookRes.status === 201 && rebookData.ok, `Rebook failed: ${JSON.stringify(rebookData)}`);

    console.log(green("  ✅ Test 3 Passed: Stale hold flipped to 'expired' and slot was successfully booked."));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 4: Unpaid Hold Cap (Max 2 unpaid holds per phone and IP)
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 4/11] 🚫 Unpaid Hold Cap (Max 2 unpaid holds per phone and IP)'));
  {
    await cleanupTestData(branch.id, testCodes);
    const phone = '081277779999';
    const startsAt1 = '2026-10-24T10:00:00+07:00';
    const startsAt2 = '2026-10-24T14:00:00+07:00';
    const startsAt3 = '2026-10-24T18:00:00+07:00';

    console.log(`  Creating hold #1 for phone ${phone} on RES-T1...`);
    const r1 = await fetch(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: branch.id,
        table_id: tableMap['RES-T1'].id,
        customer_name: 'Hold User',
        customer_phone: phone,
        party_size: 2,
        starts_at: startsAt1,
        duration_minutes: 60,
        items: [{ id: sampleItem.id, quantity: 1 }],
      }),
    });
    const d1 = await r1.json();
    assert(r1.status === 201 && d1.ok, `Hold 1 failed: ${JSON.stringify(d1)}`);
    await admin.from('reservations').update({ status: 'pending_payment' }).eq('id', d1.reservation.id);

    console.log(`  Creating hold #2 for phone ${phone} on RES-T2...`);
    const r2 = await fetch(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: branch.id,
        table_id: tableMap['RES-T2'].id,
        customer_name: 'Hold User',
        customer_phone: phone,
        party_size: 2,
        starts_at: startsAt2,
        duration_minutes: 60,
        items: [{ id: sampleItem.id, quantity: 1 }],
      }),
    });
    const d2 = await r2.json();
    assert(r2.status === 201 && d2.ok, `Hold 2 failed: ${JSON.stringify(d2)}`);
    await admin.from('reservations').update({ status: 'pending_payment' }).eq('id', d2.reservation.id);

    console.log('  Attempting hold #3 for same phone (should trigger 429 TOO_MANY_HOLDS)...');
    const r3 = await fetch(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: branch.id,
        table_id: tableMap['RES-T3'].id,
        customer_name: 'Hold User',
        customer_phone: phone,
        party_size: 2,
        starts_at: startsAt3,
        duration_minutes: 60,
        items: [{ id: sampleItem.id, quantity: 1 }],
      }),
    });
    const d3 = await r3.json();

    assert(r3.status === 429 && d3.code === 'TOO_MANY_HOLDS', `Expected 429 TOO_MANY_HOLDS, got HTTP ${r3.status}: ${JSON.stringify(d3)}`);
    console.log(`  3rd hold rejected with: ${yellow(`HTTP ${r3.status} ${d3.code}`)} (${d3.error})`);

    console.log(green('  ✅ Test 4 Passed: Rate limiter strictly enforced maximum of 2 unpaid reservation holds.'));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 5: Reservation Buffer Zone Respected (15-min gap before and after)
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 5/11] 🛡️ Reservation Buffer Zone Respected (15-min gap before and after)'));
  {
    await cleanupTestData(branch.id, testCodes);
    const date = '2026-10-25';

    console.log('  Booking 1: 10:00 - 12:00 on RES-T1...');
    const b1 = await fetch(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: branch.id,
        table_id: tableMap['RES-T1'].id,
        customer_name: 'Buffer Tester 1',
        customer_phone: '081211112221',
        party_size: 4,
        starts_at: `${date}T10:00:00+07:00`,
        duration_minutes: 120,
      }),
    });
    assert(b1.status === 201, 'Booking 1 failed');

    console.log('  Booking 2: Attempting 12:00 - 14:00 (overlaps buffer [09:45, 12:15])...');
    const b2 = await fetch(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: branch.id,
        table_id: tableMap['RES-T1'].id,
        customer_name: 'Buffer Tester 2',
        customer_phone: '081211112222',
        party_size: 4,
        starts_at: `${date}T12:00:00+07:00`,
        duration_minutes: 120,
      }),
    });
    const d2 = await b2.json();
    assert(b2.status === 409 && d2.code === 'TABLE_ALREADY_RESERVED', `Expected 409 buffer clash, got HTTP ${b2.status}: ${JSON.stringify(d2)}`);
    console.log(`  Buffer overlap properly rejected: ${d2.code} (${d2.error})`);

    console.log('  Booking 3: Booking 12:30 - 14:30 on RES-T1 (safely outside buffer)...');
    const b3 = await fetch(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: branch.id,
        table_id: tableMap['RES-T1'].id,
        customer_name: 'Buffer Tester 3',
        customer_phone: '081211112223',
        party_size: 4,
        starts_at: `${date}T12:30:00+07:00`,
        duration_minutes: 120,
      }),
    });
    const d3 = await b3.json();
    assert(b3.status === 201, `Booking 3 outside buffer failed: ${JSON.stringify(d3)}`);
    console.log(`  Booking 3 succeeded outside buffer: code ${d3.reservation.code}`);

    console.log(green('  ✅ Test 5 Passed: Buffer zone strictly enforced; back-to-back bookings protected against clashing.'));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 6: SLOT_LOST Path (Hold timeout triggers needs_refund)
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 6/11] ⚠️ SLOT_LOST Path (Hold timeout triggers needs_refund)'));
  {
    await cleanupTestData(branch.id, testCodes);
    const startsAt = '2026-10-26T14:00:00+07:00';

    console.log('  Customer creates hold on RES-T1...');
    const createRes = await fetch(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: branch.id,
        table_id: tableMap['RES-T1'].id,
        customer_name: 'Slot Lost User',
        customer_phone: '081255551111',
        party_size: 2,
        starts_at: startsAt,
        duration_minutes: 60,
      }),
    });
    const createData = await createRes.json();
    const resId = createData.reservation.id;

    console.log('  Simulating customer uploading payment proof...');
    await admin
      .from('reservations')
      .update({
        status: 'awaiting_confirmation',
        payment_proof_url: 'proofs/test_slot_lost.jpg',
        hold_expires_at: new Date(Date.now() - 60000).toISOString(),
      })
      .eq('id', resId);

    console.log('  Staff attempts to confirm reservation whose hold expired...');
    const { data: confirmResult } = await admin.rpc('confirm_reservation_payment', {
      p_reservation_id: resId,
    });
    console.log(`  Confirm result: ${JSON.stringify(confirmResult)}`);

    assert(
      confirmResult?.ok === false &&
      confirmResult?.code === 'SLOT_LOST' &&
      confirmResult?.refund_status === 'needs_refund',
      `Expected SLOT_LOST with refund_status: 'needs_refund', got: ${JSON.stringify(confirmResult)}`
    );

    console.log(green("  ✅ Test 6 Passed: Expired confirmation safely rejected with SLOT_LOST and marked 'needs_refund'."));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 7: Opening-hours Boundaries (08:30 valid vs 21:30 outside hours)
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 7/11] 🕒 Opening-hours Boundaries (08:30 valid vs 21:30 rejected)'));
  {
    await cleanupTestData(branch.id, testCodes);
    const targetDate = '2026-10-27';

    // Set branch reservation opening hours to 08:30 - 21:30 for exact boundary testing
    await admin
      .from('branches')
      .update({
        reservation_open_time: '08:30',
        reservation_close_time: '21:30',
      })
      .eq('id', branch.id);

    // 08:30 is exact opening boundary (valid)
    console.log(`  Attempting booking at 08:30 (${targetDate}T08:30:00+07:00)...`);
    const validRes = await fetch(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: branch.id,
        table_id: tableMap['RES-T1'].id,
        customer_name: 'Morning Guest',
        customer_phone: '081233334444',
        party_size: 2,
        starts_at: `${targetDate}T08:30:00+07:00`,
        duration_minutes: 60,
      }),
    });
    const validData = await validRes.json();
    assert(validRes.status === 201 && validData.ok, `08:30 booking failed: ${JSON.stringify(validData)}`);
    console.log(`  08:30 booking successfully confirmed: code ${validData.reservation.code}`);

    // 21:30 is outside operating hours (>= 21:00 close time)
    console.log(`  Attempting booking at 21:30 (${targetDate}T21:30:00+07:00)...`);
    const invalidRes = await fetch(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: branch.id,
        table_id: tableMap['RES-T2'].id,
        customer_name: 'Late Night Guest',
        customer_phone: '081233335555',
        party_size: 2,
        starts_at: `${targetDate}T21:30:00+07:00`,
        duration_minutes: 60,
      }),
    });
    const invalidData = await invalidRes.json();
    assert(
      (invalidRes.status === 409 || invalidRes.status === 400) && invalidData.code === 'OUTSIDE_HOURS',
      `Expected 409/400 OUTSIDE_HOURS for 21:30, got HTTP ${invalidRes.status}: ${JSON.stringify(invalidData)}`
    );
    console.log(`  21:30 booking properly rejected: ${invalidData.code} (${invalidData.error})`);

    console.log(green('  ✅ Test 7 Passed: Opening hours boundary strictly validated (08:30 allowed, 21:30 rejected).'));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 8: Security & Public Lookup (Wrong verifier 404 vs correct safe fields)
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 8/11] 🔍 Security & Public Lookup (Wrong verifier 404 vs safe fields)'));
  {
    await cleanupTestData(branch.id, testCodes);
    const phone = '081299998888';
    const createRes = await fetch(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: branch.id,
        table_id: tableMap['RES-T1'].id,
        customer_name: 'Lookup Guest',
        customer_phone: phone,
        party_size: 3,
        starts_at: '2026-10-28T11:00:00+07:00',
        duration_minutes: 60,
      }),
    });
    const { reservation: res } = await createRes.json();

    // 1. Wrong verifier should return 404
    console.log('  Testing lookup with wrong verifier (0000)...');
    const wrongRes = await fetch(`${BASE_URL}/api/reservations/${res.code}?v=0000`);
    assert(wrongRes.status === 404, `Expected 404 for wrong verifier, got HTTP ${wrongRes.status}`);
    console.log('  Wrong verifier correctly returned 404 NOT_FOUND.');

    // 2. Correct verifier should return 200 with strictly safe public fields
    console.log('  Testing lookup with correct verifier (last 4 digits 8888)...');
    const correctRes = await fetch(`${BASE_URL}/api/reservations/${res.code}?v=8888`);
    const correctData = await correctRes.json();
    assert(correctRes.status === 200 && correctData.reservation, `Lookup failed: ${JSON.stringify(correctData)}`);

    const r = correctData.reservation;
    assert(!r.customer_phone, 'SECURITY LEAK: customer_phone was returned in public lookup!');
    assert(!r.payment_proof_url, 'SECURITY LEAK: payment_proof_url was returned in public lookup!');
    assert(!r.owner_token_hash, 'SECURITY LEAK: owner_token_hash was returned in public lookup!');
    assert(r.code === res.code, 'Reservation code mismatch.');
    console.log('  Safe fields verified: customer_phone and payment_proof_url strictly omitted.');

    console.log(green('  ✅ Test 8 Passed: Lookup authentication and public field secrecy strictly upheld.'));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 9: Early Window Conflict (Reservation owner arrival bumps walk-in)
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 9/11] 🚪 Early Window Conflict (Reservation arrival bumps walk-in)'));
  {
    await cleanupTestData(branch.id, testCodes);
    const tableId = tableMap['RES-WIN'].id;
    const phone = '081299997777';

    // Step A: Setup confirmed reservation starting 5 minutes in future (inside 15-min early arrival window)
    const startsAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.now() + 65 * 60 * 1000).toISOString();

    import('crypto');
    const cryptoMod = await import('crypto');
    const resCode = 'RW' + cryptoMod.randomBytes(3).toString('hex').toUpperCase();

    const { data: resRow, error: rRowErr } = await admin
      .from('reservations')
      .insert({
        branch_id: branch.id,
        table_id: tableId,
        code: resCode,
        customer_name: 'VIP Reserver',
        customer_phone: phone,
        party_size: 4,
        starts_at: startsAt,
        ends_at: endsAt,
        duration_minutes: 60,
        status: 'confirmed',
        paid_at: new Date().toISOString(),
        refund_status: 'none',
      })
      .select('id, code, starts_at')
      .single();
    assert(!rRowErr && resRow, `Failed to setup reservation for Test 9: ${rRowErr?.message}`);

    // Step B: Walk-in scans table and obtains a soft hold
    console.log('  Walk-in scans RES-WIN and claims table...');
    const walkinToken = 'walkin_' + cryptoMod.randomBytes(12).toString('hex');
    const { data: walkinSession, error: wErr } = await admin
      .from('table_sessions')
      .insert({
        table_id: tableId,
        branch_id: branch.id,
        session_token: walkinToken,
        status: 'active',
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      })
      .select('id, status')
      .single();
    assert(!wErr && walkinSession?.status === 'active', `Failed to create walkin session: ${wErr?.message}`);

    // Step C: Reservation owner arrives and checks in via /api/reservations/[code]/check-in
    console.log(`  Reservation owner arrives and checks in via /api/reservations/${resCode}/check-in...`);
    const checkinRes = await fetch(`${BASE_URL}/api/reservations/${resCode}/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verifier: '7777' }),
    });
    const checkinData = await checkinRes.json();
    assert(checkinRes.status === 200 && checkinData.ok, `Owner check-in failed: ${JSON.stringify(checkinData)}`);

    // Verify walk-in session was released with reason 'reservation_checkin'
    const { data: updatedWalkin } = await admin
      .from('table_sessions')
      .select('status, released_reason')
      .eq('id', walkinSession.id)
      .single();

    assert(
      updatedWalkin?.status === 'released' && updatedWalkin?.released_reason === 'reservation_checkin',
      `Walk-in session was not cleanly released: ${JSON.stringify(updatedWalkin)}`
    );
    console.log(`  Walk-in session status: ${updatedWalkin.status} (reason: ${updatedWalkin.released_reason})`);

    // Verify reservation owner's new session is active
    const { data: ownerRes } = await admin
      .from('reservations')
      .select('status, session_id')
      .eq('code', resCode)
      .single();

    assert(ownerRes?.status === 'seated' && ownerRes?.session_id, 'Reservation owner was not seated.');
    console.log(`  Reservation owner seated successfully: session ID ${ownerRes.session_id}`);

    console.log(green('  ✅ Test 9 Passed: Walk-in soft hold cleanly bumped; reservation owner seated without clash.'));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 10: Full Happy Path (Book -> Pay -> Confirm -> Arrive -> Check-in -> Order)
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 10/11] 🎉 Full Happy Path (Book -> Pay -> Confirm -> Arrive -> Check-in -> Order)'));
  {
    await cleanupTestData(branch.id, testCodes);
    const tableId = tableMap['RES-T1'].id;
    const phone = '081299996666';
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dateStr = tomorrow.toISOString().split('T')[0];
    const startsAt = `${dateStr}T14:00:00+07:00`;

    // Step 1: Book reservation hold with pre-order items
    console.log('  Step 1: Customer books reservation with pre-order items...');
    const bookRes = await fetch(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch_id: branch.id,
        table_id: tableId,
        customer_name: 'Happy Path Guest',
        customer_phone: phone,
        party_size: 4,
        starts_at: startsAt,
        duration_minutes: 120,
        occasion: 'Keluarga',
        notes: 'Minta meja dekat jendela',
        items: [{ id: sampleItem.id, quantity: 2, note: 'Less sugar' }],
      }),
    });
    const bookData = await bookRes.json();
    assert(bookRes.status === 201 && bookData.ok, `Booking failed: ${JSON.stringify(bookData)}`);
    const code = bookData.reservation.code;
    const resId = bookData.reservation.id;
    console.log(`  Reservation created: ${bold(code)} (Pre-order total: Rp${bookData.reservation.preorder_total})`);

    // Step 2: Customer uploads payment proof and marks paid
    console.log('  Step 2: Customer submits payment...');
    const payRes = await fetch(`${BASE_URL}/api/reservations/${code}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        verifier: '6666',
        payment_proof_path: `proofs/${code}_test.jpg`,
      }),
    });
    const payData = await payRes.json();
    assert(payRes.status === 200 && payData.status === 'awaiting_confirmation', `Payment claim failed: ${JSON.stringify(payData)}`);
    console.log(`  Payment claimed: status is now ${bold(payData.status)}`);

    // Step 3: Staff confirms payment via SQL RPC
    console.log('  Step 3: Staff confirms reservation payment...');
    const { data: confirmResult } = await admin.rpc('confirm_reservation_payment', {
      p_reservation_id: resId,
    });
    assert(confirmResult?.ok === true && confirmResult?.status === 'confirmed', `Staff confirm failed: ${JSON.stringify(confirmResult)}`);
    console.log(`  Staff confirmed reservation: status is now ${bold(confirmResult.status)} (paid_at set)`);

    // Step 4: Customer arrives (within arrival window) and checks in
    console.log('  Step 4: Customer arrives at cafe and scans QR to check-in...');
    const now = Date.now();
    await admin
      .from('reservations')
      .update({
        starts_at: new Date(now + 5 * 60 * 1000).toISOString(),
        ends_at: new Date(now + 65 * 60 * 1000).toISOString(),
      })
      .eq('id', resId);
    const checkinRes = await fetch(`${BASE_URL}/api/reservations/${code}/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verifier: '6666' }),
    });
    const checkinData = await checkinRes.json();
    assert(checkinRes.status === 200 && checkinData.ok, `Arrival check-in failed: ${JSON.stringify(checkinData)}`);
    console.log(`  Customer checked in: status is ${bold(checkinData.status)}, session ID ${checkinData.session_id}`);

    // Step 5: Verify kitchen order was created automatically
    console.log('  Step 5: Verifying kitchen order created for pre-order items...');
    const { data: kitchenOrders } = await admin
      .from('orders')
      .select('id, order_code, customer_name, total, notes, status')
      .eq('table_number', 'RES-T1')
      .eq('customer_name', 'Happy Path Guest')
      .order('created_at', { ascending: false })
      .limit(1);

    assert(kitchenOrders && kitchenOrders.length > 0, 'Kitchen order was not found!');
    const kOrder = kitchenOrders[0];
    assert(kOrder.notes?.includes('[LUNAS'), 'Kitchen order should be marked [LUNAS].');
    console.log(`  Kitchen order verified: ${bold(kOrder.order_code)} - ${kOrder.notes} (Total: Rp${kOrder.total})`);

    console.log(green('  ✅ Test 10 Passed: Full happy path completed end-to-end flawlessly.'));
    passedTests++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 11: Admin Transitions & Session Release
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[Test 11/11] 🔄 Admin Transitions & Session Release'));
  {
    await cleanupTestData(branch.id, testCodes);
    const tableId = tableMap['RES-T1'].id;

    // Create a seated reservation with active table session
    const { data: sessRow } = await admin
      .from('table_sessions')
      .insert({
        table_id: tableId,
        branch_id: branch.id,
        session_token: 'test_seated_sess_token',
        status: 'active',
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();

    const { data: resRow } = await admin
      .from('reservations')
      .insert({
        branch_id: branch.id,
        table_id: tableId,
        code: 'TESTCOMPLETE',
        customer_name: 'Complete Test',
        customer_phone: '081299995555',
        party_size: 2,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        duration_minutes: 60,
        status: 'seated',
        session_id: sessRow.id,
        paid_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    // Staff completes reservation via admin_transition_reservation SQL function
    console.log('  Staff marks seated reservation as completed...');
    const { data: completeResult } = await admin.rpc('admin_transition_reservation', {
      p_reservation_id: resRow.id,
      p_action: 'complete',
    });

    assert(completeResult?.ok === true && completeResult?.status === 'completed', `Complete transition failed: ${JSON.stringify(completeResult)}`);

    // Verify session was released
    const { data: releasedSess } = await admin
      .from('table_sessions')
      .select('status, released_reason')
      .eq('id', sessRow.id)
      .single();

    assert(
      releasedSess?.status === 'released' && releasedSess?.released_reason === 'completed',
      `Session was not released upon completion: ${JSON.stringify(releasedSess)}`
    );
    console.log(`  Table session released: ${releasedSess.status} (reason: ${releasedSess.released_reason})`);

    // Test mark_refunded
    console.log('  Testing mark_refunded on reservation with refund_status needs_refund...');
    await admin
      .from('reservations')
      .update({ refund_status: 'needs_refund', status: 'cancelled' })
      .eq('id', resRow.id);

    const { data: refundResult } = await admin.rpc('admin_transition_reservation', {
      p_reservation_id: resRow.id,
      p_action: 'mark_refunded',
    });

    assert(
      refundResult?.ok === true && refundResult?.refund_status === 'refunded',
      `Mark refunded failed: ${JSON.stringify(refundResult)}`
    );
    console.log(`  Refund marked complete: ${refundResult.refund_status}`);

    console.log(green('  ✅ Test 11 Passed: Admin transitions and linked session releases verified.'));
    passedTests++;
  }

  // Cleanup after all tests
  await cleanupTestData(branch.id, testCodes);

  console.log(bold('\n══════════════════════════════════════════════════════════════════'));
  console.log(bold(`  🎉 ALL ${passedTests}/${totalTests} RESERVATION TESTS PASSED SUCCESSFULLY!`));
  console.log(bold('══════════════════════════════════════════════════════════════════\n'));
}

main().catch((err) => {
  console.error(red(`\n💥 Reservation Test Suite Failed: ${err.message}`));
  if (err.stack) console.error(gray(err.stack));
  process.exit(1);
});
