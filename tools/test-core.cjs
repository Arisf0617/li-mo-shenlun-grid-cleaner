const assert = require('node:assert/strict');
const { analyze, render } = require('../grid-core.js');

async function main() {
  const width = 120;
  const height = 120;
  const input = new Uint8ClampedArray(width * height * 4);
  const setPixel = (x, y, color) => input.set([...color, 255], (y * width + x) * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) setPixel(x, y, [240, 238, 233]);
  }
  for (let y = 10; y < 110; y++) {
    for (let x = 10; x < 110; x++) {
      if (x % 20 === 10 || y % 20 === 10) setPixel(x, y, [185, 115, 110]);
    }
  }
  for (let y = 20; y < 70; y++) {
    for (let x = 28; x < 32; x++) setPixel(x, y, [28, 30, 29]);
  }

  const model = await analyze(input, width, height);
  const output = render(model, { mode: 'original' });
  assert.equal(output.width, width);
  assert.equal(output.height, height);

  let removedGridPixels = 0;
  let protectedInkPixels = 0;
  for (let i = 0; i < width * height; i++) {
    if (input[i * 4] === 185 && output.data[i * 4] > 230) removedGridPixels++;
    if (model.protectedInk[i] && model.redConfidence[i] === 0) {
      protectedInkPixels++;
      for (let channel = 0; channel < 4; channel++) {
        assert.equal(output.data[i * 4 + channel], input[i * 4 + channel]);
      }
    }
  }
  assert(removedGridPixels > 500, 'synthetic red grid should be removed');
  assert(protectedInkPixels > 100, 'dark synthetic handwriting should be protected');

  const edits = new Uint8Array(width * height).fill(1);
  assert.deepEqual(render(model, { mode: 'original', edits }).data, input);
  console.log(`Core test passed: ${removedGridPixels} grid pixels removed; ${protectedInkPixels} ink pixels preserved.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
