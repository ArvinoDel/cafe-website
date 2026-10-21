/**
 * scripts/test-order-flows.mjs
 *
 * Automated verification of Manual QA Checklist (Section 3.2):
 * 1. Solo ordering with active claim vs expired/missing claim
 * 2. Group cart ordering with host claim vs missing claim
 * 3. Table transfer via /api/orders/update-table
 * 4. Table QR scan for reserved table by reservation owner with code bypass
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

// ─── Styling ──────────────────────────────────────────────────────────────────

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const gray = (s) => `\x1b[90m${s}\x1b[0m`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

  // Delete test sessions
  await admin.from('table_sessions').delete().in('table_id', tableIds);

  // Delete test reservations
  await admin.from('reservations').delete().in('table_id', tableIds);
}

// ─── Main QA Suite ────────────────────────────────────────────────────────────

async function main() {
  console.log(bold('\n══════════════════════════════════════════════════════════════════'));
  console.log(bold('  📋 Phase 3.2: Order & Table QA Verification Suite'));
  console.log(bold('══════════════════════════════════════════════════════════════════'));
  console.log(`Target server: ${cyan(BASE_URL)}`);
  console.log(`Supabase:      ${cyan(SUPABASE_URL)}\n`);

  // 1. Get branch and an active menu item
  const { data: branches } = await admin
    .from('branches')
    .select('id, name')
    .limit(1);
  const branch = branches[0];
  console.log(`Branch: ${bold(branch.name)} (${branch.id})`);

  const { data: menuItems } = await admin
    .from('menu_items')
    .select('id, name, price')
    .eq('is_available', true)
    .limit(1);

  if (!menuItems || menuItems.length === 0) {
    throw new Error('No available menu items found to run order tests.');
  }
  const testItem = menuItems[0];
  console.log(`Menu item for test: ${bold(testItem.name)} (ID: ${testItem.id})\n`);

  // Ensure test tables exist: 'QA-A1' and 'QA-A2'
  const qaCodes = ['QA-A1', 'QA-A2'];
  for (const code of qaCodes) {
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
        label: `Meja QA ${code}`,
        seats: 4,
        is_active: true,
      });
      console.log(`  Created QA table ${bold(code)}`);
    }
  }

  await cleanupTestData(branch.id, qaCodes);

  let passed = 0;
  const total = 4;

  // ────────────────────────────────────────────────────────────────────────────
  // QA 1: Solo Order with Active Claim vs Missing Claim
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('[QA 1/4] ☕ Solo Ordering Enforcement'));
  {
    // Part A: Attempt order without active session cookie
    console.log('  Part A: Submitting solo order without session cookie...');
    const resNoSession = await fetch(`${BASE_URL}/api/orders/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: 'Pemesan Tanpa Meja',
        branch_id: branch.id,
        payment_method: 'cash',
        items: [{ id: testItem.id, quantity: 1 }],
      }),
    });

    const bodyNoSession = await resNoSession.json();
    assert(
      resNoSession.status === 409 && bodyNoSession.code === 'SESSION_EXPIRED',
      `Expected 409 SESSION_EXPIRED, got ${resNoSession.status}: ${JSON.stringify(bodyNoSession)}`
    );
    console.log(`  Rejected as expected: ${yellow(bodyNoSession.code)} (${bodyNoSession.error})`);

    // Part B: Claim table QA-A1, then submit solo order
    console.log('  Part B: Claiming table QA-A1...');
    const soloToken = `qa_solo_${Date.now()}`;
    const resClaim = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `table_session_token=${soloToken}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'QA-A1' }),
    });
    const bodyClaim = await resClaim.json();
    assert(resClaim.status === 200 && bodyClaim.ok === true, 'Failed to claim table QA-A1');

    console.log('  Submitting solo order with active session cookie...');
    const resOrder = await fetch(`${BASE_URL}/api/orders/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `table_session_token=${soloToken}`,
      },
      body: JSON.stringify({
        customer_name: 'Budi QA Solo',
        payment_method: 'cash',
        items: [{ id: testItem.id, quantity: 1 }],
      }),
    });

    const bodyOrder = await resOrder.json();
    assert(
      resOrder.status === 201 && bodyOrder.order?.order_code,
      `Failed to create order: ${resOrder.status} ${JSON.stringify(bodyOrder)}`
    );

    const createdOrder = bodyOrder.order;
    assert(
      createdOrder.table_number === 'QA-A1',
      `Order table_number is '${createdOrder.table_number}', expected 'QA-A1'`
    );
    console.log(`  Order created successfully: ${green(createdOrder.order_code)} on table ${bold(createdOrder.table_number)}`);

    // Clean up created order
    await admin.from('orders').delete().eq('order_code', createdOrder.order_code);

    console.log(green('  ✅ QA 1 Passed: Unclaimed orders blocked (409); claimed orders use authoritative server table.'));
    passed++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // QA 2: Group Cart Ordering with Host Claim vs Missing Claim
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[QA 2/4] 👥 Group Cart (Pesan Bareng) Host Claim Enforcement'));
  {
    await cleanupTestData(branch.id, qaCodes);

    // Part A: Attempt group cart without session cookie
    console.log('  Part A: Host attempts to create group cart without active session...');
    const resNoCart = await fetch(`${BASE_URL}/api/group-carts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Host Tanpa Meja',
        branch_id: branch.id,
        table_number: 'QA-A1',
      }),
    });

    const bodyNoCart = await resNoCart.json();
    assert(
      resNoCart.status === 409 && bodyNoCart.code === 'SESSION_EXPIRED',
      `Expected 409 SESSION_EXPIRED, got ${resNoCart.status}: ${JSON.stringify(bodyNoCart)}`
    );
    console.log(`  Rejected as expected: ${yellow(bodyNoCart.code)} (${bodyNoCart.error})`);

    // Part B: Host claims QA-A1, then creates group cart
    console.log('  Part B: Host claims table QA-A1...');
    const hostToken = `qa_host_${Date.now()}`;
    const resClaimHost = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `table_session_token=${hostToken}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'QA-A1' }),
    });
    const bodyClaimHost = await resClaimHost.json();
    assert(resClaimHost.status === 200 && bodyClaimHost.ok === true, `Host claim failed: ${JSON.stringify(bodyClaimHost)}`);

    console.log('  Host creates group cart with active session cookie...');
    const resCart = await fetch(`${BASE_URL}/api/group-carts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `table_session_token=${hostToken}`,
      },
      body: JSON.stringify({
        name: 'Budi Host',
        table_number: 'QA-A1',
      }),
    });

    const bodyCart = await resCart.json();
    assert(
      resCart.status === 201 && bodyCart.code,
      `Failed to create group cart: ${resCart.status} ${JSON.stringify(bodyCart)}`
    );

    const { data: cartRow } = await admin
      .from('group_carts')
      .select('code, table_number')
      .eq('code', bodyCart.code)
      .single();

    assert(
      cartRow?.table_number === 'QA-A1',
      `Group cart bound to '${cartRow?.table_number}', expected 'QA-A1'`
    );
    console.log(`  Group cart created: ${green(bodyCart.code)} on table ${bold(cartRow.table_number)}`);

    // Clean up group cart
    await admin.from('group_carts').delete().eq('code', bodyCart.code);

    console.log(green('  ✅ QA 2 Passed: Group cart creation requires host table claim and binds to verified table.'));
    passed++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // QA 3: Table Transfer via /api/orders/update-table
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[QA 3/4] 🔄 Table Transfer via /api/orders/update-table'));
  {
    await cleanupTestData(branch.id, qaCodes);

    // Setup: Customer claims QA-A1 and places an order
    const transferToken = `qa_transfer_${Date.now()}`;
    await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `table_session_token=${transferToken}`,
      },
      body: JSON.stringify({ branch_id: branch.id, code: 'QA-A1' }),
    });

    const resOrder = await fetch(`${BASE_URL}/api/orders/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `table_session_token=${transferToken}`,
      },
      body: JSON.stringify({
        customer_name: 'Pindah Meja QA',
        payment_method: 'cash',
        items: [{ id: testItem.id, quantity: 1 }],
      }),
    });
    const orderData = (await resOrder.json()).order;
    assert(orderData?.order_code, 'Order creation for table transfer failed');
    console.log(`  Initial order: ${orderData.order_code} on table ${bold(orderData.table_number)}`);

    // Customer requests move to QA-A2
    console.log('  Customer requests transfer to QA-A2...');
    const resMove = await fetch(`${BASE_URL}/api/orders/update-table`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `table_session_token=${transferToken}`,
      },
      body: JSON.stringify({
        order_code: orderData.order_code,
        new_table: 'QA-A2',
      }),
    });

    const bodyMove = await resMove.json();
    assert(
      resMove.status === 200 && (bodyMove.new_table === 'QA-A2' || bodyMove.order?.table_number === 'QA-A2'),
      `Move table failed: ${resMove.status} ${JSON.stringify(bodyMove)}`
    );

    // Verify order record in DB
    const { data: updatedOrder } = await admin
      .from('orders')
      .select('table_number')
      .eq('order_code', orderData.order_code)
      .single();

    assert(
      updatedOrder.table_number === 'QA-A2',
      `DB record table_number is '${updatedOrder.table_number}', expected 'QA-A2'`
    );

    // Verify DB session states: QA-A1 is 'released' (reason: 'moved'), QA-A2 is 'active'
    const { data: tablesQA } = await admin
      .from('tables')
      .select('id, code')
      .in('code', ['QA-A1', 'QA-A2']);
    const tA1 = tablesQA.find((t) => t.code === 'QA-A1');
    const tA2 = tablesQA.find((t) => t.code === 'QA-A2');

    const { data: sA1 } = await admin
      .from('table_sessions')
      .select('status, released_reason')
      .eq('table_id', tA1.id)
      .eq('session_token', transferToken)
      .single();

    const { data: sA2 } = await admin
      .from('table_sessions')
      .select('status')
      .eq('table_id', tA2.id)
      .eq('session_token', transferToken)
      .single();

    assert(
      sA1.status === 'released' && sA1.released_reason === 'moved',
      `A1 session status=${sA1?.status}, reason=${sA1?.released_reason}`
    );
    assert(sA2.status === 'active', `A2 session status=${sA2?.status}`);

    console.log(`  Order updated to table ${green(updatedOrder.table_number)}; old session marked ${bold('released (moved)')}.`);

    // Clean up
    await admin.from('orders').delete().eq('order_code', orderData.order_code);

    console.log(green('  ✅ QA 3 Passed: Order and table session moved atomically to new table.'));
    passed++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // QA 4: Table QR Scan for Reserved Table with Owner Code
  // ────────────────────────────────────────────────────────────────────────────
  console.log(bold('\n[QA 4/4] 🎟️ Table QR Scan for Reserved Table'));
  {
    await cleanupTestData(branch.id, qaCodes);

    const { data: tA1 } = await admin
      .from('tables')
      .select('id')
      .eq('code', 'QA-A1')
      .single();

    // Create a confirmed reservation starting in 20 min
    const resCode = 'QA' + Math.floor(1000 + Math.random() * 9000);
    const startsAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.now() + 140 * 60 * 1000).toISOString();

    await admin.from('reservations').insert({
      code: resCode,
      branch_id: branch.id,
      table_id: tA1.id,
      customer_name: 'Siti QA Reservasi',
      customer_phone: '081299998888',
      party_size: 4,
      starts_at: startsAt,
      ends_at: endsAt,
      status: 'confirmed',
    });

    console.log(`  Confirmed reservation created with code ${bold(resCode)} starting in 20 minutes.`);

    // Walk-in scan (no code)
    console.log('  Customer scans QR without reservation code...');
    const scanNoCode = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: branch.id, code: 'QA-A1' }),
    });
    const bodyNoCode = await scanNoCode.json();
    assert(
      scanNoCode.status === 409 &&
        (bodyNoCode.code === 'TABLE_RESERVED_SOON' || bodyNoCode.code === 'TABLE_RESERVED'),
      `Expected TABLE_RESERVED_SOON, got: ${scanNoCode.status} ${JSON.stringify(bodyNoCode)}`
    );
    console.log(`  Walk-in blocked with status ${yellow(bodyNoCode.code)}.`);

    // Reservation owner enters code
    console.log(`  Customer enters reservation code ${bold(resCode)}...`);
    const ownerToken = `qa_owner_${Date.now()}`;
    const scanWithCode = await fetch(`${BASE_URL}/api/tables/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `table_session_token=${ownerToken}`,
      },
      body: JSON.stringify({
        branch_id: branch.id,
        code: 'QA-A1',
        reservation_code: resCode,
      }),
    });

    const bodyWithCode = await scanWithCode.json();
    assert(
      scanWithCode.status === 200 && bodyWithCode.ok === true,
      `Reservation code claim failed: ${scanWithCode.status} ${JSON.stringify(bodyWithCode)}`
    );
    console.log(`  Table claimed successfully! Session tableCode: ${green(bodyWithCode.session.tableCode)}`);

    console.log(green('  ✅ QA 4 Passed: Reserved table blocked for walk-ins, successfully claimed with reservation code.'));
    passed++;
  }

  // Cleanup QA tables
  await cleanupTestData(branch.id, qaCodes);

  console.log(bold('\n══════════════════════════════════════════════════════════════════'));
  console.log(bold(`  🎉 ALL ${passed}/${total} MANUAL QA CHECKS PASSED SUCCESSFULLY!`));
  console.log(bold('══════════════════════════════════════════════════════════════════\n'));
}

main().catch((err) => {
  console.error(red(`\n💥 QA Suite Failed: ${err.message}`));
  if (err.stack) console.error(gray(err.stack));
  process.exit(1);
});
