/**
 * lib/orders-server.ts
 *
 * Server-only order creation engine.
 * Extracted so that both regular orders (/api/orders/create) and arrival check-ins
 * (/api/reservations/[code]/check-in) create kitchen orders through the exact
 * same authoritative pricing, validation, and insertion logic.
 *
 * NEVER import from client-side code.
 */

import crypto from 'crypto';
import { priceOrderLines, type ItemsUnavailableError, type PricingError } from '@/lib/order-pricing';
import { getItemLineKey, type SelectedOption } from '@/lib/item-options';

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH   = 8;

function generateOrderCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return code;
}

export type OrderLineInput = {
  id: string;
  quantity: number;
  note?: string | null;
  selected_options?: SelectedOption[] | null;
};

export type CreateOrderInternalInput = {
  customerName: string;
  tableNumber: string;
  branchId: string;
  items: OrderLineInput[];
  paymentMethod: 'cash' | 'qris';
  notes?: string | null;
  idempotencyKey?: string | null;
  sessionToken?: string | null;
};

export type CreateOrderInternalResult =
  | { ok: true; order: any; isExisting: boolean }
  | { ok: false; error: string; code?: string; status: number; items?: any[] };

/**
 * Creates an authoritative kitchen order in the database.
 * Completely idempotent if idempotencyKey is supplied.
 */
export async function createOrderInternal(
  supabaseAdmin: any,
  input: CreateOrderInternalInput,
): Promise<CreateOrderInternalResult> {
  const {
    customerName,
    tableNumber,
    branchId,
    items,
    paymentMethod,
    notes,
    idempotencyKey,
    sessionToken,
  } = input;

  // 1. Idempotency check: if key already exists, return the previously created order
  if (idempotencyKey) {
    const { data: existing, error: existErr } = await supabaseAdmin
      .from('orders')
      .select('id, order_code, customer_name, table_number, branch_id, items, subtotal, total, payment_method, notes, status, created_at')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (!existErr && existing) {
      return { ok: true, order: existing, isExisting: true };
    }
  }

  // 2. Consolidate requested items by (id + note + options)
  type ConsolidatedLine = {
    id: string;
    quantity: number;
    note: string | null;
    selected_options?: SelectedOption[] | null;
  };

  const consolidatedMap = new Map<string, ConsolidatedLine>();
  for (const item of items) {
    const cleanNote = item.note?.trim() || null;
    const lineKey = getItemLineKey(item.id, cleanNote, item.selected_options);

    const existing = consolidatedMap.get(lineKey);
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + item.quantity);
    } else {
      consolidatedMap.set(lineKey, {
        id: item.id,
        quantity: item.quantity,
        note: cleanNote,
        selected_options: item.selected_options || null,
      });
    }
  }

  const consolidatedLines = Array.from(consolidatedMap.values());
  if (consolidatedLines.length === 0) {
    return { ok: false, error: 'Pesanan tidak boleh kosong.', status: 400 };
  }

  // 3. Price items on the server with authoritative database pricing
  const pricingResult = await priceOrderLines(supabaseAdmin, branchId, consolidatedLines);

  if ('error' in pricingResult) {
    if ((pricingResult.error as any).code === 'ITEMS_UNAVAILABLE') {
      const unavail = pricingResult as ItemsUnavailableError;
      return {
        ok: false,
        error: unavail.error.message,
        code: 'ITEMS_UNAVAILABLE',
        status: 409,
        items: unavail.error.items,
      };
    }
    const perr = pricingResult as PricingError;
    return {
      ok: false,
      error: perr.error.message,
      code: (perr.error as any).code,
      status: perr.error.status || 500,
    };
  }

  const { snapshot, subtotal, total } = pricingResult;

  // 4. Generate order code and insert with retry on collision
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const orderCode = generateOrderCode();

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('orders')
      .insert({
        order_code:      orderCode,
        customer_name:   customerName.trim(),
        table_number:    tableNumber.trim().toUpperCase(),
        branch_id:       branchId,
        items:           snapshot,
        subtotal,
        total,
        payment_method:  paymentMethod,
        payment_status:  notes?.includes('[LUNAS') ? 'paid' : 'unpaid',
        notes:           notes?.trim() || null,
        status:          'pending',
        idempotency_key: idempotencyKey ?? null,
      })
      .select('id, order_code, customer_name, table_number, branch_id, items, subtotal, total, payment_method, payment_status, notes, status, created_at')
      .single();

    if (insertErr) {
      const pgCode = (insertErr as unknown as { code?: string }).code;
      if (pgCode === '23505' && attempt < MAX_RETRIES) {
        // If collision was on idempotency_key rather than order_code, re-fetch
        if (idempotencyKey) {
          const { data: dupe } = await supabaseAdmin
            .from('orders')
            .select('id, order_code, customer_name, table_number, branch_id, items, subtotal, total, payment_method, notes, status, created_at')
            .eq('idempotency_key', idempotencyKey)
            .maybeSingle();
          if (dupe) {
            return { ok: true, order: dupe, isExisting: true };
          }
        }
        continue;
      }
      console.error('[createOrderInternal] insert error:', insertErr.message);
      return { ok: false, error: 'Gagal menyimpan pesanan.', status: 500 };
    }

    // 5. Upgrade table session if sessionToken is supplied
    if (sessionToken) {
      try {
        await supabaseAdmin.rpc('upgrade_table_session', { p_token: sessionToken });
      } catch (upgradeErr) {
        console.error('[createOrderInternal] upgrade_table_session warning:', upgradeErr);
      }
    }

    return { ok: true, order: inserted, isExisting: false };
  }

  return { ok: false, error: 'Gagal membuat kode pesanan.', status: 500 };
}
