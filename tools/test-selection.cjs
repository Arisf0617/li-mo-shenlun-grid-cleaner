const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.goto(pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href);
    await page.evaluate(async () => {
      const source = document.createElement('canvas');
      source.width = 120;
      source.height = 120;
      const ctx = source.getContext('2d');
      ctx.fillStyle = '#f0eee9';
      ctx.fillRect(0, 0, 120, 120);
      ctx.strokeStyle = '#b9736e';
      ctx.lineWidth = 2;
      for (let p = 10; p < 120; p += 20) {
        ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 120); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(120, p); ctx.stroke();
      }
      await openImage(source.toDataURL('image/png'), 'synthetic.png');
    });
    await page.waitForFunction(() => state.ready && !state.busy);

    await page.locator('#protect').click();
    const area = await page.evaluate(() => {
      const rect = document.querySelector('#canvas').getBoundingClientRect();
      const point = (x, y) => ({
        x: rect.left + rect.width / 2 + state.panX + (x - state.width / 2) * state.zoom,
        y: rect.top + rect.height / 2 + state.panY + (y - state.height / 2) * state.zoom,
      });
      return { rect, start: point(20, 22), end: point(70, 72), middle: point(45, 45) };
    });
    await page.mouse.move(area.start.x, area.start.y);
    await page.mouse.down();
    await page.mouse.move(area.end.x, area.end.y, { steps: 4 });
    const selection = await page.evaluate(({ x, y }) => {
      const canvas = document.querySelector('#canvas');
      const box = canvas.getBoundingClientRect();
      const px = Math.round((x - box.left) * canvas.width / box.width);
      const py = Math.round((y - box.top) * canvas.height / box.height);
      return { draft: state.selectionDraft, pixel: Array.from(canvas.getContext('2d').getImageData(px, py, 1, 1).data) };
    }, area.middle);
    assert(selection.draft.width > 40 && selection.draft.height > 40, 'drag should create a rectangular selection');
    assert(selection.pixel[2] > selection.pixel[0], 'selection should show a blue translucent overlay');
    await page.mouse.up();
    await page.waitForFunction(() => !state.busy);
    const protectedEdit = await page.evaluate(() => ({ inside: state.edits[45 * state.width + 45], outside: state.edits[10 * state.width + 10] }));
    assert.deepEqual(protectedEdit, { inside: 1, outside: 0 });

    await page.locator('#undo').click();
    assert.equal(await page.evaluate(() => state.edits.some(Boolean)), false, 'undo should restore the selected region');
    await page.locator('#erase').click();
    await page.mouse.move(area.start.x, area.start.y);
    await page.mouse.down();
    await page.mouse.move(area.end.x, area.end.y, { steps: 4 });
    await page.mouse.up();
    await page.waitForFunction(() => !state.busy);
    assert.equal(await page.evaluate(() => state.edits[45 * state.width + 45]), 2, 'clear should apply to the whole selection');
    console.log('Selection UI test passed: visible rectangle, protect, erase and undo.');
  } finally {
    await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]);
  }
}

main().then(() => process.exit(0), error => {
  console.error(error);
  process.exit(1);
});
