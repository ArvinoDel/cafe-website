/**
 * scripts/run-all-tests.mjs
 *
 * Unified test suite runner for cafe-website:
 * 1. Hardened Table Claims & Soft Holds (scripts/test-table-claims.mjs)
 * 2. Hardened Reservations & Concurrency (scripts/test-reservations.mjs)
 * 3. Order Flows, Group Carts & Table Transfers (scripts/test-order-flows.mjs)
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

const testSuites = [
  { name: 'Table Claims & Soft Hold Invariants', file: 'test-table-claims.mjs' },
  { name: 'Reservations, Concurrency & State Transitions', file: 'test-reservations.mjs' },
  { name: 'Order Flows & Group Carts', file: 'test-order-flows.mjs' },
];

function runSuite(file) {
  return new Promise((resolve, reject) => {
    const fullPath = path.join(__dirname, file);
    const child = spawn(process.execPath, [fullPath], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Test script ${file} exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  console.log(bold('\n=================================================================='));
  console.log(bold('  🚀 Antigravity Cafe System — Comprehensive Test Runner'));
  console.log(bold('==================================================================\n'));

  const startTime = Date.now();
  let passedCount = 0;

  for (const suite of testSuites) {
    console.log(cyan(`\n▶ Starting Suite: ${suite.name} (${suite.file})`));
    try {
      await runSuite(suite.file);
      passedCount++;
      console.log(green(`✔ Suite Completed Successfully: ${suite.name}\n`));
    } catch (err) {
      console.error(red(`\n✖ Suite Failed: ${suite.name} (${suite.file})`));
      console.error(red(err.message));
      process.exit(1);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(bold('\n=================================================================='));
  console.log(bold(green(`  🎉 ALL ${passedCount}/${testSuites.length} TEST SUITES PASSED FLAWLESSLY (${durationSec}s)`)));
  console.log(bold('==================================================================\n'));
}

main().catch((err) => {
  console.error(red(`Test runner aborted: ${err.message}`));
  process.exit(1);
});
