/**
 * GET /api/tables/session
 *
 * Returns the current active table claim for the requesting customer, or null.
 * Reads the httpOnly `table_session_token` cookie; never exposes the token value.
 *
 * Success 200:
 *   { session: { tableCode, tableLabel, tableSeats, branchId, expiresAt, startedAt, remainingSeconds } | null }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  TABLE_SESSION_COOKIE,
  getActiveSession,
} from '@/lib/table-session-server';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(TABLE_SESSION_COOKIE)?.value ?? null;

  if (!token) {
    return NextResponse.json({ session: null });
  }

  const session = await getActiveSession(token);

  if (!session) {
    return NextResponse.json({ session: null });
  }

  return NextResponse.json({
    session: {
      tableCode:        session.tableCode,
      tableLabel:       session.tableLabel,
      tableSeats:       session.tableSeats,
      branchId:         session.branchId,
      expiresAt:        session.expiresAt,
      startedAt:        session.startedAt,
      remainingSeconds: session.remainingSeconds,
      upgraded:         session.upgraded,
    },
  });
}
