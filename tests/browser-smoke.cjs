'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

async function run() {
  const extension = path.resolve(__dirname, '../extension');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  context.setDefaultTimeout(10_000);

  try {
    const errors = [];
    context.on('weberror', event => errors.push(event.error().message));
    const isExtensionWorker = worker => worker.url().startsWith('chrome-extension://');
    const worker = context.serviceWorkers().find(isExtensionWorker)
      || await context.waitForEvent('serviceworker', { predicate: isExtensionWorker, timeout: 20_000 });
    const popupURL = new URL('popup.html', worker.url()).href;
    assert.equal(await worker.evaluate(() => chrome.runtime.getManifest().action.default_popup), 'popup.html');
    assert.equal(await worker.evaluate(() => chrome.action.getPopup({})), popupURL);

    let page = await context.newPage();
    await page.goto(popupURL);
    await context.setOffline(true);
    const source = '核对了 12 张发票，更新了报销清单，还有 2 张待复核。';
    await page.locator('#source').fill(source);
    await page.locator('#generate').click();
    await page.locator('#copy:enabled').waitFor();
    const result = page.locator('#result-text');
    const firstStyle = await result.innerText();
    assert.match(firstStyle, /12/);

    await page.getByText('大厂黑话', { exact: true }).click();
    assert.ok(await page.locator('[name="style"][value="2"]').isChecked());
    const variants = [await result.innerText()];
    assert.notEqual(variants[0], firstStyle);
    for (let i = 0; i < 2; i++) {
      await page.locator('#alternate').click();
      variants.push(await result.innerText());
    }
    assert.equal(new Set(variants).size, 3);
    for (const text of variants) assert.match(text, /12/);

    await page.close();
    page = await context.newPage();
    await page.goto(popupURL);
    await page.locator('#copy:enabled').waitFor();
    assert.equal(await page.locator('#source').inputValue(), source);
    assert.ok(await page.locator('[name="style"][value="2"]').isChecked());
    assert.equal(await page.locator('#result-text').innerText(), variants[2]);

    await page.locator('#clear').click();
    assert.equal(await page.locator('#source').inputValue(), '');
    assert.ok(await page.locator('#generate').isDisabled());
    assert.ok(await page.locator('#copy').isDisabled());
    assert.deepEqual(errors, []);
    console.log('Chromium extension smoke test passed.');
  } finally {
    await context.close();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
