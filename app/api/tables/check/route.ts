import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import {
  computeTokenHash,
  RESERVATION_OWNER_COOKIE,
  TABLE_SESSION_COOKIE,
  resolveAdminEnv,
} from '@/lib/table-session-server';

function maskName(name: string): string {
  if (!name) return 'Pelanggan';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    const n = parts[0];
    if (n.length <= 2) return n;
    return n.slice(0, 2) + '*'.repeat(Math.min(4, n.length - 2));
  }
  return `${parts[0]} ${parts[1].charAt(0)}.`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code')?.trim().toUpperCase();
  const clientBranchId = searchParams.get('branch_id')?.trim();

  if (!code) {
    return NextResponse.json({ ok: false, error: 'Parameter code wajib diisi.' }, { status: 400 });
  }

  const env = resolveAdminEnv();
  const admin = createAdminClient({ env });

  // 1. Resolve branch if not provided
  let branchId = clientBranchId;
  if (!branchId) {
    const { data: branchRows } = await admin.from('branches').select('id').limit(2);
    if (branchRows && branchRows.length === 1) {
      branchId = branchRows[0].id;
    }
  }

  // 2. Query table
  let tableQuery = admin
    .from('tables')
    .select('id, branch_id, code, label, seats, is_active')
    .ilike('code', code);

  if (branchId) {
    tableQuery = tableQuery.eq('branch_id', branchId);
  }

  const { data: tableRows, error: tableErr } = await tableQuery.limit(1);
  if (tableErr || !tableRows || tableRows.length === 0) {
    return NextResponse.json({ ok: false, code: 'TABLE_NOT_FOUND', error: 'Meja tidak ditemukan.' }, { status: 404 });
  }

  const table = tableRows[0];
  branchId = table.branch_id;

  // 3. Check owner token cookie
  const ownerCookie = request.cookies.get(RESERVATION_OWNER_COOKIE)?.value;
  const ownerHash = ownerCookie ? computeTokenHash(ownerCookie) : null;
  const sessionToken = request.cookies.get(TABLE_SESSION_COOKIE)?.value ?? null;

  // 4. Query active or confirmed reservation for today / current time
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const { data: resRows } = await admin
    .from('reservations')
    .select('id, code, customer_name, customer_phone, starts_at, ends_at, status, party_size, owner_token_hash')
    .eq('table_id', table.id)
    .in('status', ['confirmed', 'seated'])
    .gte('ends_at', now.toISOString())
    .lte('starts_at', endOfDay.toISOString())
    .order('starts_at', { ascending: true })
    .limit(1);

  const matchedRes = resRows && resRows.length > 0 ? resRows[0] : null;

  // 5. Query active table session
  const { data: sessionRows } = await admin
    .from('table_sessions')
    .select('id, table_id, status, expires_at, session_token')
    .eq('table_id', table.id)
    .eq('status', 'active')
    .limit(1);

  const activeSession = sessionRows && sessionRows.length > 0 ? sessionRows[0] : null;

  if (!matchedRes) {
    return NextResponse.json({
      ok: true,
      table: {
        id: table.id,
        code: table.code,
        label: table.label,
        seats: table.seats,
        branchId: table.branch_id,
      },
      hasReservation: false,
      reservation: null,
      session: activeSession
        ? {
            isMine: sessionToken === activeSession.session_token,
            expiresAt: activeSession.expires_at,
          }
        : null,
    });
  }

  const isOwner = Boolean(ownerHash && matchedRes.owner_token_hash === ownerHash);

  return NextResponse.json({
    ok: true,
    table: {
      id: table.id,
      code: table.code,
      label: table.label,
      seats: table.seats,
      branchId: table.branch_id,
    },
    hasReservation: true,
    reservation: {
      id:           matchedRes.id,
      code:         isOwner ? matchedRes.code : undefined,
      codeMasked:   matchedRes.code ? `${matchedRes.code.slice(0, 2)}****${matchedRes.code.slice(-2)}` : '****',
      customerName: maskName(matchedRes.customer_name),
      startsAt:     matchedRes.starts_at,
      endsAt:       matchedRes.ends_at,
      status:       matchedRes.status,
      partySize:    matchedRes.party_size,
      isOwner,
    },
    session: activeSession
      ? {
          isMine: sessionToken === activeSession.session_token,
          expiresAt: activeSession.expires_at,
        }
      : null,
  });
}
