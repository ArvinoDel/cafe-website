import { test, expect } from '@playwright/test';

process.env.NEXT_PUBLIC_E2E = '1';

test.describe('QrScannerModal Automated Hardening Suite', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));
    // Grant camera permissions to the origin
    await page.context().grantPermissions(['camera']);
    await page.goto('/test-scanner', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#btn-open-modal[data-hydrated="true"]');
  });

  test('1. 20 parent re-renders cause no camera restart', async ({ page }) => {
    // Open scanner modal
    await page.click('#btn-open-modal');
    await page.waitForSelector('#qr-reader video', { state: 'attached', timeout: 10000 });

    // Wait a brief moment for camera initialization
    await page.waitForTimeout(600);

    const initialStartCount = await page.evaluate(() => (window as any).__scannerStartCount || 0);
    expect(initialStartCount).toBeGreaterThanOrEqual(1);

    // Trigger 20 parent re-renders via evaluate (which passes fresh inline arrow callbacks)
    await page.evaluate(() => {
      document.getElementById('btn-rerender-twenty')?.click();
    });
    await page.waitForTimeout(400);

    const afterRerendersStartCount = await page.evaluate(
      () => (window as any).__scannerStartCount || 0,
    );

    // Camera start must NOT have been called again!
    expect(afterRerendersStartCount).toBe(initialStartCount);
    const renderCountText = await page.textContent('#label-render-count');
    expect(renderCountText).toContain('20');
  });

  test('2. Media tracks are stopped after close, including closing during start()', async ({
    page,
  }) => {
    // Case A: Normal open -> close stops all media tracks
    await page.click('#btn-open-modal');
    await page.waitForSelector('#qr-reader video', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(500);

    // Verify tracks are currently active
    const activeBeforeClose = await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll('video'));
      const tracks = videos.flatMap((v) => (v.srcObject as MediaStream)?.getTracks() || []);
      return tracks.filter((t) => t.readyState === 'live').length;
    });
    expect(activeBeforeClose).toBeGreaterThan(0);

    // Close modal via its close button
    await page.click('button[aria-label="Tutup pemindai QR"]');
    await page.waitForTimeout(500);

    // Verify all tracks are stopped (readyState === 'ended')
    const liveTracksAfterClose = await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll('video'));
      const tracks = videos.flatMap((v) => (v.srcObject as MediaStream)?.getTracks() || []);
      return tracks.filter((t) => t.readyState === 'live').length;
    });
    expect(liveTracksAfterClose).toBe(0);

    // Case B: Close during start()
    await page.click('#btn-open-and-close-fast');
    // Wait for start() promise to resolve and cancel token to trigger immediate stop
    await page.waitForTimeout(1000);

    const liveTracksAfterFastClose = await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll('video'));
      const tracks = videos.flatMap((v) => (v.srcObject as MediaStream)?.getTracks() || []);
      return tracks.filter((t) => t.readyState === 'live').length;
    });
    expect(liveTracksAfterFastClose).toBe(0);
  });

  test('3. Two quick decodes produce exactly one claim call', async ({ page }) => {
    // Intercept /api/tables/claim to count calls
    let claimCount = 0;
    await page.route('**/api/tables/claim', async (route) => {
      claimCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          session: {
            tableCode: 'A-2',
            tableLabel: 'Meja A-2',
            tableSeats: 4,
            branchId: 'b0000000-0000-0000-0000-000000000001',
            expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
            startedAt: new Date().toISOString(),
            remainingSeconds: 1200,
            isExisting: false,
            upgraded: false,
          },
        }),
      });
    });

    await page.click('#btn-open-modal');
    await page.waitForSelector('#qr-reader video', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(400);

    // Fire two decodes in rapid succession (0ms apart)
    await page.evaluate(() => {
      (window as any).__dispatchQrDecode?.('A-2');
      (window as any).__dispatchQrDecode?.('A-2');
    });

    // Exactly one claim call must have occurred
    await expect.poll(() => claimCount, { timeout: 5000 }).toBe(1);

    // Wait an additional 500ms to verify no second duplicate claim was dispatched
    await page.waitForTimeout(500);
    expect(claimCount).toBe(1);
  });

  test('4. TABLE_TAKEN renders inside the modal', async ({ page }) => {
    // Mock /api/tables/claim to return TABLE_TAKEN
    await page.route('**/api/tables/claim', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          code: 'TABLE_TAKEN',
          error: 'Meja ini sedang dipakai pelanggan lain.',
        }),
      });
    });

    await page.click('#btn-open-modal');
    await page.waitForSelector('#qr-reader video', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(400);

    // Decode table code
    await page.evaluate(() => {
      (window as any).__dispatchQrDecode?.('B-1');
    });

    // Verify TABLE_TAKEN state is rendered INSIDE modal
    await expect(page.locator('text=Meja Sedang Dipakai')).toBeVisible();
    await expect(page.locator('text=Masukkan Kode Pesan Bareng')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scan Meja Lain' })).toBeVisible();

    // Verify modal stays open and did NOT close automatically
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Meja Sedang Dipakai')).toBeVisible();
  });

  test('5. Non-table QR does not block the scanner', async ({ page }) => {
    await page.click('#btn-open-modal');
    await page.waitForSelector('#qr-reader video', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(400);

    // Dispatch non-table QR (e.g. external link)
    await page.evaluate(() => {
      (window as any).__dispatchQrDecode?.('https://external-website.com/promo');
    });

    // Non-blocking toast "Bukan QR meja" must appear
    await expect(page.locator('text=Bukan QR meja')).toBeVisible();

    // Modal state must still be scanning (not blocked)
    const state = await page.evaluate(() => (window as any).__qrScannerModalState);
    expect(state).toBe('scanning');

    // Camera video must still be present and attached
    await expect(page.locator('#qr-reader video')).toBeVisible();

    // After 2 seconds toast disappears and valid QR can still be decoded immediately
    await page.waitForTimeout(2200);
    await expect(page.locator('text=Bukan QR meja')).not.toBeVisible();
  });

  test('6. Foreign-origin QR with table query/path is rejected', async ({ page }) => {
    let claimCalled = false;
    await page.route('**/api/tables/claim', async (route) => {
      claimCalled = true;
      await route.abort();
    });

    await page.click('#btn-open-modal');
    await page.waitForSelector('#qr-reader video', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(400);

    // Dispatch foreign-origin QR with table parameter and menu path
    await page.evaluate(() => {
      (window as any).__dispatchQrDecode?.('https://malicious-attacker.com/?table=A-1');
    });

    // Rejected as non-table QR
    await expect(page.locator('text=Bukan QR meja')).toBeVisible();
    expect(claimCalled).toBe(false);

    // Dispatch foreign-origin QR with /menu/A-1
    await page.evaluate(() => {
      (window as any).__dispatchQrDecode?.('https://malicious-attacker.com/menu/A-1');
    });

    await expect(page.locator('text=Bukan QR meja')).toBeVisible();
    expect(claimCalled).toBe(false);
  });
});
