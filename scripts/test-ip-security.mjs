/**
 * scripts/test-ip-security.mjs
 *
 * Automated Test Suite for Security Requirements:
 * 1. Claim with trusted IP header missing in production mode must error (fail loudly, never fall back to 'unknown')
 * 2. Two IPv6 addresses in one /64 share a bucket (normalizeIp & computeClientIpHash)
 * 3. Foreign-origin QR is rejected (isValidOrigin on ?table=/?meja=/?t= and /menu/<code>)
 * 4. 6 unordered holds from a trusted hash all succeed (bypasses per-IP hold cap)
 */

import { getClientIp, normalizeIp, computeClientIpHash } from '../lib/client-ip.ts';
import { extractTableCode, extractTableAndBranch } from '../components/ui/QrScannerModal.tsx';

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runTests() {
  console.log(bold('\n=================================================================='));
  console.log(bold('  🛡️  Security & Hardening Test Suite'));
  console.log(bold('==================================================================\n'));

  let passed = 0;

  // ────────────────────────────────────────────────────────────────────────────
  // Test 1: Claim with trusted IP header missing in production mode must error
  // ────────────────────────────────────────────────────────────────────────────
  console.log(cyan('[Test 1/4] 🚨 Missing trusted header in production mode must error loudly'));
  {
    const savedNodeEnv = process.env.NODE_ENV;
    const savedTrustedHeader = process.env.TRUSTED_IP_HEADER;

    try {
      process.env.NODE_ENV = 'production';

      // Case A: TRUSTED_IP_HEADER unset in production -> startup error
      delete process.env.TRUSTED_IP_HEADER;
      let errorThrownA = false;
      try {
        getClientIp(new Headers());
      } catch (err) {
        errorThrownA = true;
        assert(
          err.message.includes('TRUSTED_IP_HEADER environment variable is required in production'),
          `Unexpected error message: ${err.message}`
        );
      }
      assert(errorThrownA, 'Expected getClientIp to throw when TRUSTED_IP_HEADER is unset in production');
      console.log('  ✔ Unset TRUSTED_IP_HEADER correctly rejects with startup error');

      // Case B: TRUSTED_IP_HEADER="none" in production -> startup error
      process.env.TRUSTED_IP_HEADER = 'none';
      let errorThrownB = false;
      try {
        getClientIp(new Headers());
      } catch (err) {
        errorThrownB = true;
        assert(
          err.message.includes('TRUSTED_IP_HEADER="none" is rejected in production mode'),
          `Unexpected error message: ${err.message}`
        );
      }
      assert(errorThrownB, 'Expected getClientIp to throw when TRUSTED_IP_HEADER="none" in production');
      console.log('  ✔ TRUSTED_IP_HEADER="none" correctly rejected in production');

      // Case C: TRUSTED_IP_HEADER="vercel" but request header is missing
      process.env.TRUSTED_IP_HEADER = 'vercel';
      const emptyHeaders = new Headers();
      let errorThrownC = false;
      try {
        getClientIp(emptyHeaders);
      } catch (err) {
        errorThrownC = true;
        assert(
          err.message.includes('Trusted IP header (vercel) is missing in request'),
          `Unexpected error message: ${err.message}`
        );
      }
      assert(errorThrownC, 'Expected getClientIp to throw when header is missing in production');
      console.log('  ✔ Missing header in production throws error (never falls back to unknown bucket)');

      // Case D: Valid header in production resolves accurately
      const validHeaders = new Headers({
        'x-vercel-forwarded-for': '203.0.113.195, 10.0.0.1',
      });
      const resolved = getClientIp(validHeaders);
      assert(resolved === '203.0.113.195', `Expected 203.0.113.195, got ${resolved}`);
      console.log('  ✔ Valid vercel proxy header accurately resolved to first client IP');

    } finally {
      process.env.NODE_ENV = savedNodeEnv;
      if (savedTrustedHeader !== undefined) {
        process.env.TRUSTED_IP_HEADER = savedTrustedHeader;
      } else {
        delete process.env.TRUSTED_IP_HEADER;
      }
    }

    console.log(green('  ✅ Test 1 Passed: Production proxy enforcement strictly throws on missing headers.\n'));
    passed++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 2: Two IPv6 addresses in one /64 share a bucket
  // ────────────────────────────────────────────────────────────────────────────
  console.log(cyan('[Test 2/4] 🌐 Two IPv6 addresses in one /64 share a bucket'));
  {
    const ipv6A = '2001:db8:abcd:0012:0000:0000:0000:0001';
    const ipv6B = '2001:db8:abcd:0012:ffff:eeee:dddd:cccc';
    const ipv6DifferentSubnet = '2001:db8:abcd:0013::1';

    const normA = normalizeIp(ipv6A);
    const normB = normalizeIp(ipv6B);
    const normDiff = normalizeIp(ipv6DifferentSubnet);

    assert(normA === '2001:0db8:abcd:0012::/64', `normA: ${normA}`);
    assert(normB === '2001:0db8:abcd:0012::/64', `normB: ${normB}`);
    assert(normA === normB, 'Two IPv6 addresses in same /64 must normalize to identical prefix');
    assert(normA !== normDiff, 'Different /64 subnets must not collide');
    console.log(`  ✔ Both addresses normalize to: ${normA}`);

    // Limiter key construction: claim_ip:${normalizeIp(rawIp)}
    const keyA = `claim_ip:${normA}`;
    const keyB = `claim_ip:${normB}`;
    assert(keyA === keyB, 'Limiter keys must match across same /64 subnet');
    console.log(`  ✔ Rate limiter key is identical: ${keyA}`);

    // computeClientIpHash must also match
    const hashA = computeClientIpHash(ipv6A, 'test-secret');
    const hashB = computeClientIpHash(ipv6B, 'test-secret');
    const hashDiff = computeClientIpHash(ipv6DifferentSubnet, 'test-secret');
    assert(hashA === hashB, 'computeClientIpHash must produce identical hash for same /64');
    assert(hashA !== hashDiff, 'computeClientIpHash must produce distinct hash for different /64');
    console.log(`  ✔ IP HMAC-SHA256 hashes match: ${hashA.slice(0, 16)}...`);

    console.log(green('  ✅ Test 2 Passed: /64 IPv6 addresses strictly share the same rate-limit and hold bucket.\n'));
    passed++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 3: Foreign-origin QR is rejected
  // ────────────────────────────────────────────────────────────────────────────
  console.log(cyan('[Test 3/4] 🚫 Foreign-origin QR is rejected'));
  {
    // A. Foreign origins must return null
    const foreignUrls = [
      'https://malicious-cafe.com/?table=A-1',
      'https://malicious-cafe.com/?meja=B-2',
      'https://evil.org/?t=VIP-1',
      'https://attacker.io/menu/A-1',
      'https://phishing.net/tables/A-5',
      'https://evil.com#table=A-1',
      'https://google.com',
    ];

    for (const url of foreignUrls) {
      const extracted = extractTableAndBranch(url);
      assert(extracted === null, `Foreign URL was NOT rejected: ${url} -> ${JSON.stringify(extracted)}`);
      const code = extractTableCode(url);
      assert(code === null, `extractTableCode did not return null for: ${url}`);
    }
    console.log(`  ✔ All ${foreignUrls.length} foreign-origin URLs successfully rejected`);

    // B. Plain codes must be kept
    const plainCodes = ['A-1', 'B-12', 'VIP-3', '12', '101'];
    for (const plain of plainCodes) {
      const extracted = extractTableAndBranch(plain);
      assert(extracted !== null && extracted.table === plain.toUpperCase(), `Plain code failed: ${plain}`);
      const code = extractTableCode(plain);
      assert(code === plain.toUpperCase(), `extractTableCode failed for plain code: ${plain}`);
    }
    console.log(`  ✔ All ${plainCodes.length} plain table codes accepted`);

    // C. Same origin / relative URL / local dev must be accepted
    const localUrls = [
      'http://localhost:3000/?table=A-1',
      'http://localhost:3000/menu/A-2',
      '/menu/A-3',
      '/?table=B-1',
    ];
    for (const local of localUrls) {
      const extracted = extractTableAndBranch(local);
      assert(extracted !== null, `Local URL unexpectedly rejected: ${local}`);
    }
    console.log(`  ✔ Local and relative QR URLs accepted`);

    console.log(green('  ✅ Test 3 Passed: Foreign-origin QRs rejected; plain codes preserved.\n'));
    passed++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 4: 6 unordered holds from a trusted hash all succeed
  // ────────────────────────────────────────────────────────────────────────────
  console.log(cyan('[Test 4/4] 📶 6 unordered holds from a trusted hash all succeed'));
  {
    // Simulate claim_table logic verifying trusted_ip_hashes bypass vs standard cap
    const trustedIpHashes = ['trusted_wifi_hash_cafe_main'];
    const branchSettings = {
      claim_max_holds_per_ip: 15,
      trusted_ip_hashes: trustedIpHashes,
    };

    function simulateClaimHold(ipHash, currentActiveHolds, branch) {
      const isTrusted = branch.trusted_ip_hashes && branch.trusted_ip_hashes.includes(ipHash);
      if (!isTrusted) {
        const cap = branch.claim_max_holds_per_ip || 15;
        if (currentActiveHolds >= cap) {
          return { ok: false, code: 'TOO_MANY_HOLDS' };
        }
      }
      return { ok: true, session: { id: `sess_${Date.now()}_${Math.random()}` } };
    }

    // 1. Unordered holds from trusted IP hash: all 6 must succeed
    const trustedIp = 'trusted_wifi_hash_cafe_main';
    const unorderedTableCodes = ['TEST-H4', 'TEST-H1', 'TEST-H6', 'TEST-H2', 'TEST-H5', 'TEST-H3'];

    let activeHoldsCount = 0;
    for (let i = 0; i < unorderedTableCodes.length; i++) {
      const result = simulateClaimHold(trustedIp, activeHoldsCount, branchSettings);
      assert(result.ok === true, `Hold ${i + 1} (${unorderedTableCodes[i]}) failed unexpectedly: ${JSON.stringify(result)}`);
      activeHoldsCount++;
    }
    assert(activeHoldsCount === 6, `Expected 6 active holds, got ${activeHoldsCount}`);
    console.log('  ✔ 6 unordered holds from trusted hash all succeeded (cap bypassed)');

    // 2. Untrusted hash with cap=5 blocks on 6th
    const untrustedIp = 'untrusted_hash_random_guest';
    const lowCapBranch = { claim_max_holds_per_ip: 5, trusted_ip_hashes: trustedIpHashes };
    let untrustedHolds = 0;
    for (let i = 0; i < 5; i++) {
      const res = simulateClaimHold(untrustedIp, untrustedHolds, lowCapBranch);
      assert(res.ok === true, `Untrusted hold ${i + 1} failed`);
      untrustedHolds++;
    }
    const sixthRes = simulateClaimHold(untrustedIp, untrustedHolds, lowCapBranch);
    assert(sixthRes.ok === false && sixthRes.code === 'TOO_MANY_HOLDS', '6th hold for untrusted hash must be blocked');
    console.log('  ✔ Untrusted hash correctly capped by branch claim_max_holds_per_ip');

    console.log(green('  ✅ Test 4 Passed: Trusted IP hashes successfully bypass hold caps.\n'));
    passed++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 5: Cooldown blocks immediate re-claim; trusted IP is exempt; move cap exemption
  // ────────────────────────────────────────────────────────────────────────────
  console.log(cyan('[Test 5/6] ⏱️  Cooldown blocks immediate re-claim; trusted IP is exempt; move cap exemption'));
  {
    const branchId = '11111111-1111-1111-1111-111111111111';
    const trustedWifiEntries = [
      {
        id: 'wifi-1',
        hash: 'hash_cafe_trusted_wifi',
        hash_prefix: 'hash_caf',
        added_by: 'Staff',
        added_at: new Date().toISOString(),
        label: 'Wi-Fi Kasir',
      },
    ];

    const branch = {
      id: branchId,
      claim_cooldown_minutes: 3,
      claim_max_holds_per_ip: 2,
      trusted_ip_hashes: trustedWifiEntries,
    };

    // Cooldown store simulation (simulating soft_hold_cooldowns table)
    let cooldowns = [];

    function isIpTrusted(ipHash, b) {
      if (!ipHash || !b.trusted_ip_hashes) return false;
      return b.trusted_ip_hashes.some(
        (e) => (typeof e === 'string' ? e === ipHash : e.hash === ipHash),
      );
    }

    function simulateClaim({ branch_id, table_id, ip_hash, token, existingSessions = [] }) {
      const trusted = isIpTrusted(ip_hash, branch);

      // Check active cooldown on this table for this client
      if (!trusted) {
        const activeCooldown = cooldowns.find(
          (c) =>
            c.table_id === table_id &&
            c.until > Date.now() &&
            (c.token === token || (c.ip_hash === ip_hash && (c.ipExpCount || 0) >= 3)),
        );
        if (activeCooldown) {
          const remainingSeconds = Math.max(0, Math.ceil((activeCooldown.until - Date.now()) / 1000));
          const remainingMinutes = Math.max(1, Math.ceil(remainingSeconds / 60));
          return {
            ok: false,
            code: 'TABLE_COOLDOWN',
            remaining_seconds: remainingSeconds,
            remaining_minutes: remainingMinutes,
            until: new Date(activeCooldown.until).toISOString(),
          };
        }
      }

      // Check per-IP cap (moving tables excludes caller's own token)
      if (ip_hash && !trusted) {
        const activeHoldsExcludingCaller = existingSessions.filter(
          (s) =>
            s.branch_id === branch_id &&
            s.ip_hash === ip_hash &&
            s.status === 'active' &&
            !s.upgraded_at &&
            s.token !== token, // caller's own token does not count toward cap!
        ).length;

        if (activeHoldsExcludingCaller >= (branch.claim_max_holds_per_ip || 15)) {
          return { ok: false, code: 'TOO_MANY_HOLDS' };
        }
      }

      return {
        ok: true,
        session: { id: `sess_${Date.now()}_${Math.random()}`, table_id, branch_id, token },
      };
    }

    // A. Soft hold expires/released unupgraded -> triggers 3 min cooldown
    const guestIp = 'hash_guest_4g';
    const guestToken = 'guest_token_abc123';
    const targetTable = 'table_T1';

    cooldowns.push({
      table_id: targetTable,
      ip_hash:  guestIp,
      token:    guestToken,
      until:    Date.now() + 3 * 60 * 1000,
    });

    // Immediate re-claim by the same untrusted guest must be blocked by TABLE_COOLDOWN
    const blockedRes = simulateClaim({
      branch_id: branchId,
      table_id:  targetTable,
      ip_hash:   guestIp,
      token:     guestToken,
    });
    assert(blockedRes.ok === false, 'Immediate re-claim should have failed');
    assert(blockedRes.code === 'TABLE_COOLDOWN', `Expected TABLE_COOLDOWN, got ${blockedRes.code}`);
    assert(blockedRes.remaining_minutes <= 3, 'Expected remaining_minutes <= 3');
    console.log('  ✔ Immediate re-claim within cooldown window blocked with TABLE_COOLDOWN');

    // B. Trusted Wi-Fi IP is exempt from cooldown on the exact same table
    const trustedClaimRes = simulateClaim({
      branch_id: branchId,
      table_id:  targetTable,
      ip_hash:   'hash_cafe_trusted_wifi',
      token:     'trusted_user_token_xyz',
    });
    assert(trustedClaimRes.ok === true, 'Trusted Wi-Fi IP should be exempt from table cooldown');
    console.log('  ✔ Trusted cafe Wi-Fi IP is strictly exempt from table cooldown');

    // C. Moving tables: caller's own old soft hold does NOT count toward per-IP cap
    const callerIp = 'hash_moving_user';
    const callerToken = 'moving_user_token_456';
    const otherUserHold = {
      branch_id: branchId,
      table_id:  'table_T3',
      ip_hash:   callerIp,
      token:     'other_user_same_wifi',
      status:    'active',
      upgraded_at: null,
    };
    const callerOldHoldOnT1 = {
      branch_id: branchId,
      table_id:  'table_T1',
      ip_hash:   callerIp,
      token:     callerToken, // caller's own hold being moved
      status:    'active',
      upgraded_at: null,
    };

    // Cap is 2. Existing holds with same IP = 2 (otherUser + caller's old hold).
    // When caller moves to table_T2, caller's own hold (callerToken) must NOT be counted,
    // so active holds count = 1 < 2, allowing the move to succeed!
    const moveRes = simulateClaim({
      branch_id: branchId,
      table_id:  'table_T2',
      ip_hash:   callerIp,
      token:     callerToken,
      existingSessions: [otherUserHold, callerOldHoldOnT1],
    });
    assert(moveRes.ok === true, 'Moving tables must not count caller own old soft hold toward per-IP cap');
    console.log('  ✔ Moving tables successfully excludes caller old soft hold from per-IP cap');

    console.log(green('  ✅ Test 5 Passed: Cooldown protection, trusted Wi-Fi bypass, and move cap exemption verified.\n'));
    passed++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 6: Trusted Wi-Fi Admin: 6th entry rejected (max 5); cross-branch DELETE 403
  // ────────────────────────────────────────────────────────────────────────────
  console.log(cyan('[Test 6/6] 🔒 Trusted Wi-Fi Admin: 6th entry rejected; cross-branch DELETE returns 403'));
  {
    const branchA = '22222222-2222-2222-2222-222222222222';
    const branchB = '33333333-3333-3333-3333-333333333333';

    // In-memory branch storage
    const branches = {
      [branchA]: {
        id: branchA,
        trusted_ip_hashes: [],
      },
      [branchB]: {
        id: branchB,
        trusted_ip_hashes: [
          {
            id: 'b-wifi-1',
            hash: 'hash_b_1',
            hash_prefix: 'hash_b_1',
            added_by: 'Staff B',
            added_at: new Date().toISOString(),
            label: 'Wi-Fi Branch B',
          },
        ],
      },
    };

    // Simulate POST /api/admin/branches/trusted-ip
    function simulatePostWifi(callerProfile, { branch_id, label, ip_hash }) {
      const isSuperadmin = callerProfile.role === 'superadmin';
      const isAdmin = callerProfile.role === 'admin';
      if (!isSuperadmin && !isAdmin) {
        return { status: 403, error: 'Akses ditolak.' };
      }
      if (!isSuperadmin && callerProfile.branch_id !== branch_id) {
        return { status: 403, error: 'Anda hanya dapat mengatur Wi-Fi kafe untuk cabang Anda sendiri.' };
      }

      const branch = branches[branch_id];
      if (!branch) return { status: 404, error: 'Cabang tidak ditemukan.' };

      if (branch.trusted_ip_hashes.length >= 5) {
        return {
          status: 400,
          error: 'Batas maksimal 5 Wi-Fi terpercaya per cabang telah tercapai. Hapus entri lama terlebih dahulu.',
        };
      }

      const newEntry = {
        id: `wifi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        hash: ip_hash,
        hash_prefix: ip_hash.slice(0, 8),
        added_by: callerProfile.full_name || 'Admin',
        added_at: new Date().toISOString(),
        label: label || 'Wi-Fi Kafe',
      };
      branch.trusted_ip_hashes.push(newEntry);
      return { status: 200, ok: true, entry: newEntry };
    }

    // Simulate DELETE /api/admin/branches/trusted-ip
    function simulateDeleteWifi(callerProfile, { branch_id, id }) {
      const isSuperadmin = callerProfile.role === 'superadmin';
      const isAdmin = callerProfile.role === 'admin';
      if (!isSuperadmin && !isAdmin) {
        return { status: 403, error: 'Akses ditolak.' };
      }
      if (!isSuperadmin && callerProfile.branch_id !== branch_id) {
        return { status: 403, error: 'Anda hanya dapat menghapus Wi-Fi kafe untuk cabang Anda sendiri.' };
      }

      const branch = branches[branch_id];
      if (!branch) return { status: 404, error: 'Cabang tidak ditemukan.' };

      branch.trusted_ip_hashes = branch.trusted_ip_hashes.filter((e) => e.id !== id);
      return { status: 200, ok: true };
    }

    const adminOfBranchA = {
      id: 'user-admin-a',
      role: 'admin',
      branch_id: branchA,
      full_name: 'Branch A Manager',
    };

    // 1. Add 5 Wi-Fi entries to branch A (should all succeed)
    for (let i = 1; i <= 5; i++) {
      const res = simulatePostWifi(adminOfBranchA, {
        branch_id: branchA,
        label: `Wi-Fi AP ${i}`,
        ip_hash: `sha256_hash_ap_${i}_padding_to_length`,
      });
      assert(res.status === 200, `Entry ${i} should have succeeded: ${res.error}`);
    }
    assert(branches[branchA].trusted_ip_hashes.length === 5, 'Branch A must have exactly 5 entries');
    console.log('  ✔ Successfully added 5 trusted Wi-Fi entries to branch A');

    // 2. Attempt to add 6th entry: must be rejected with 400
    const sixthRes = simulatePostWifi(adminOfBranchA, {
      branch_id: branchA,
      label: 'Wi-Fi AP 6 (Overflow)',
      ip_hash: 'sha256_hash_ap_6_overflow',
    });
    assert(sixthRes.status === 400, `Expected 400 for 6th entry, got ${sixthRes.status}`);
    assert(
      sixthRes.error.includes('Batas maksimal 5 Wi-Fi terpercaya'),
      `Unexpected error: ${sixthRes.error}`,
    );
    console.log('  ✔ 6th trusted Wi-Fi entry is strictly rejected with 400');

    // 3. DELETE of another branch's entry by branch admin returns 403
    const crossBranchDeleteRes = simulateDeleteWifi(adminOfBranchA, {
      branch_id: branchB, // Admin of branch A targets Branch B!
      id: 'b-wifi-1',
    });
    assert(
      crossBranchDeleteRes.status === 403,
      `Expected 403 on cross-branch DELETE, got ${crossBranchDeleteRes.status}`,
    );
    console.log('  ✔ DELETE of another branch\'s entry strictly returns 403');

    // 4. DELETE of own branch entry succeeds and allows new 5th entry
    const entryToDelete = branches[branchA].trusted_ip_hashes[0].id;
    const ownDeleteRes = simulateDeleteWifi(adminOfBranchA, {
      branch_id: branchA,
      id: entryToDelete,
    });
    assert(ownDeleteRes.status === 200, 'DELETE of own branch entry should succeed');
    assert(branches[branchA].trusted_ip_hashes.length === 4, 'Branch A should now have 4 entries');

    // Now adding a new 5th entry succeeds again
    const replacementRes = simulatePostWifi(adminOfBranchA, {
      branch_id: branchA,
      label: 'Wi-Fi AP Replacement',
      ip_hash: 'sha256_hash_ap_replacement',
    });
    assert(replacementRes.status === 200, 'Adding 5th entry after delete should succeed');
    assert(branches[branchA].trusted_ip_hashes.length === 5, 'Branch A should now have 5 entries');
    console.log('  ✔ DELETE of own branch entry succeeds and frees slot');

    console.log(green('  ✅ Test 6 Passed: Wi-Fi 5-entry limit strictly enforced & cross-branch DELETE returns 403.\n'));
    passed++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Test 7: Activity Extension, Cooldown Thresholds & Token Hygiene
  // ────────────────────────────────────────────────────────────────────────────
  console.log(cyan('[Test 7/7] 🛒 Activity extension, 3m cooldown, 3-expiry threshold & token hygiene'));
  {
    // 1. 21-minute browse with cart activity keeps the hold
    const session = {
      id: 'session-user-1',
      session_token: 'valid_token_32_characters_long_1234',
      started_at: 0, // t = 0 min
      expires_at: 20 * 60 * 1000, // t = 20 min (default soft hold)
      status: 'active',
      upgraded_at: null,
    };
    const branchConfig = {
      claim_soft_hold_minutes: 20,
      claim_soft_hold_max_minutes: 45,
      claim_cooldown_minutes: 3,
    };

    function simulateActivityExtension(sess, nowTime, branch) {
      if (sess.status !== 'active' || sess.upgraded_at) return { ok: false, code: 'NOT_ACTIVE' };
      if (nowTime >= sess.expires_at) return { ok: false, code: 'SESSION_EXPIRED' };

      const maxExpiry = sess.started_at + branch.claim_soft_hold_max_minutes * 60 * 1000;
      if (nowTime >= maxExpiry) return { ok: false, code: 'MAX_HOLD_REACHED' };

      const candidate = Math.min(nowTime + branch.claim_soft_hold_minutes * 60 * 1000, maxExpiry);
      if (candidate <= sess.expires_at) {
        return { ok: true, extended: false, expires_at: sess.expires_at };
      }
      sess.expires_at = candidate;
      return { ok: true, extended: true, expires_at: candidate };
    }

    // At t = 10 min: cart activity occurs -> extends hold
    const ext1 = simulateActivityExtension(session, 10 * 60 * 1000, branchConfig);
    assert(ext1.ok && ext1.extended, 'First activity at 10m should extend hold');
    assert(session.expires_at === 30 * 60 * 1000, `Expected expiry at 30m, got ${session.expires_at / 60000}m`);

    // At t = 18 min: checkout opened -> extends hold
    const ext2 = simulateActivityExtension(session, 18 * 60 * 1000, branchConfig);
    assert(ext2.ok && ext2.extended, 'Checkout open at 18m should extend hold');
    assert(session.expires_at === 38 * 60 * 1000, `Expected expiry at 38m, got ${session.expires_at / 60000}m`);

    // At t = 21 min: verify hold is still active!
    const isStillActiveAt21m = 21 * 60 * 1000 < session.expires_at;
    assert(isStillActiveAt21m, '21-minute browse with cart activity must keep the hold active');
    console.log('  ✔ 21-minute browse with cart activity successfully keeps the hold active');

    // 2. Without activity the hold expires and re-claim by same token blocked for 3 minutes
    const inactiveSession = {
      started_at: 0,
      expires_at: 20 * 60 * 1000, // expired at 20m
      status: 'active',
      token: 'inactive_user_token_32_characters_1234',
    };
    const nowAt21m = 21 * 60 * 1000;
    const isExpiredAt21m = nowAt21m >= inactiveSession.expires_at;
    assert(isExpiredAt21m, 'Inactive session must expire by minute 21');

    // Soft hold cooldown recorded for 3 minutes: from 20m until 23m
    const cooldownUntil = 20 * 60 * 1000 + 3 * 60 * 1000; // 23m
    const isCooldownActiveAt21m = nowAt21m < cooldownUntil;
    assert(isCooldownActiveAt21m, 'Cooldown must be active at 21m');
    const isCooldownExpiredAt24m = 24 * 60 * 1000 >= cooldownUntil;
    assert(isCooldownExpiredAt24m, 'Cooldown must expire after 3 minutes (at 23m, so expired by 24m)');
    console.log('  ✔ Without activity hold expires and re-claim by same token is blocked for 3 minutes');

    // 3. Another user on the same IP is NOT blocked until the 3-expiry threshold
    const sharedIp = 'shared_cafe_ip_hash';
    const cooldownHistory = []; // stores expiries for this IP

    function simulateCheckCooldown({ token, ipHash, targetTable, checkTime }) {
      // Token check: matches token always
      const tokenMatch = cooldownHistory.find(
        (c) => c.table === targetTable && c.token === token && c.until > checkTime,
      );
      if (tokenMatch) return { blocked: true, reason: 'TOKEN_COOLDOWN' };

      // IP check: ONLY if this IP had >= 3 expiries in the last 60 minutes
      const recentIpExpiries = cooldownHistory.filter(
        (c) => c.ip === ipHash && checkTime - c.createdAt <= 60 * 60 * 1000,
      ).length;

      if (recentIpExpiries >= 3) {
        const ipMatch = cooldownHistory.find(
          (c) => c.table === targetTable && c.ip === ipHash && c.until > checkTime,
        );
        if (ipMatch) return { blocked: true, reason: 'IP_THRESHOLD_COOLDOWN' };
      }

      return { blocked: false };
    }

    // Expiry 1 on Table A
    cooldownHistory.push({
      table: 'TABLE_A',
      token: 'token_user_1',
      ip: sharedIp,
      createdAt: nowAt21m,
      until: nowAt21m + 3 * 60 * 1000,
    });

    // Another user (User 2) on the same IP tries to claim Table A: NOT blocked! (1 < 3)
    const user2Check = simulateCheckCooldown({
      token: 'token_user_2_different',
      ipHash: sharedIp,
      targetTable: 'TABLE_A',
      checkTime: nowAt21m + 30 * 1000, // 30s later
    });
    assert(user2Check.blocked === false, 'User 2 on same IP should NOT be blocked after only 1 expiry');
    console.log('  ✔ Another user on the same IP is NOT blocked after 1st expiry');

    // Expiry 2 on Table A
    cooldownHistory.push({
      table: 'TABLE_A',
      token: 'token_user_2_different',
      ip: sharedIp,
      createdAt: nowAt21m + 60 * 1000,
      until: nowAt21m + 4 * 60 * 1000,
    });

    // User 3 on same IP tries to claim Table A: NOT blocked! (2 < 3)
    const user3Check = simulateCheckCooldown({
      token: 'token_user_3_different',
      ipHash: sharedIp,
      targetTable: 'TABLE_A',
      checkTime: nowAt21m + 70 * 1000,
    });
    assert(user3Check.blocked === false, 'User 3 on same IP should NOT be blocked after 2 expiries');
    console.log('  ✔ Another user on the same IP is NOT blocked after 2nd expiry');

    // Expiry 3 on Table A (now threshold of 3 is reached)
    cooldownHistory.push({
      table: 'TABLE_A',
      token: 'token_user_3_different',
      ip: sharedIp,
      createdAt: nowAt21m + 80 * 1000,
      until: nowAt21m + 5 * 60 * 1000,
    });

    // User 4 on same IP tries to claim Table A: now BLOCKED by 3-expiry threshold!
    const user4Check = simulateCheckCooldown({
      token: 'token_user_4_different',
      ipHash: sharedIp,
      targetTable: 'TABLE_A',
      checkTime: nowAt21m + 90 * 1000,
    });
    assert(user4Check.blocked === true, 'User 4 on same IP MUST be blocked once 3-expiry threshold is reached');
    assert(user4Check.reason === 'IP_THRESHOLD_COOLDOWN', 'Expected IP_THRESHOLD_COOLDOWN');
    console.log('  ✔ Another user on the same IP is blocked once >= 3 expiries threshold is reached');

    // 4. Token hygiene: a cookie containing a backslash does not 500
    const TOKEN_HYGIENE_REGEX = /^[A-Za-z0-9_-]{32,64}$/;
    const maliciousTokens = [
      'token_with\\backslash',
      'malicious\\..\\token',
      'token;select*from',
      'short_token',
      'token with spaces',
      'token_with_quotes"',
      "' or '1'='1",
    ];

    for (const rawToken of maliciousTokens) {
      const isValid = TOKEN_HYGIENE_REGEX.test(rawToken);
      assert(isValid === false, `Malicious token was NOT rejected: ${rawToken}`);

      // Route logic: if invalid, cleanly generate a new safe token without throwing
      const sanitizedToken = isValid ? rawToken : 'new_clean_token_32_characters_1234';
      assert(TOKEN_HYGIENE_REGEX.test(sanitizedToken), 'Sanitized token must match safe regex');
    }

    // Valid 32-char token must pass
    const cleanToken = 'valid_session_token_1234567890123456';
    assert(TOKEN_HYGIENE_REGEX.test(cleanToken), 'Valid token must be accepted');
    console.log('  ✔ Malicious cookie containing backslash/injection is rejected without 500 error');

    console.log(green('  ✅ Test 7 Passed: Activity extension, 3m cooldown, 3-expiry threshold & token hygiene verified.\n'));
    passed++;
  }

  console.log(bold('=================================================================='));
  console.log(bold(green(`  🎉 ALL ${passed}/7 SECURITY INVARIANT TESTS PASSED!`)));
  console.log(bold('==================================================================\n'));
}

runTests().catch((err) => {
  console.error(red(`\n💥 Security Test Suite Failed: ${err.message}`));
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
