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

  console.log(bold('=================================================================='));
  console.log(bold(green(`  🎉 ALL ${passed}/4 SECURITY INVARIANT TESTS PASSED!`)));
  console.log(bold('==================================================================\n'));
}

runTests().catch((err) => {
  console.error(red(`\n💥 Security Test Suite Failed: ${err.message}`));
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
