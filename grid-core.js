/* Pixel processing only. No OCR, network, glyph models, or font rendering. */
(function (root) {
  'use strict';
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

  // Monotonic deque: O(width * height), independent of filter radius.
  function extrema(src, width, height, radius, vertical, maximum) {
    if (!radius) return new Float32Array(src);
    const dst = new Float32Array(src.length);
    const length = vertical ? height : width;
    const lines = vertical ? width : height;
    const deque = new Int32Array(length);
    const stride = vertical ? width : 1;
    for (let line = 0; line < lines; line++) {
      let head = 0, tail = 0, next = 0;
      const offset = vertical ? line : line * width;
      for (let i = 0; i < length; i++) {
        const right = Math.min(length - 1, i + radius);
        for (; next <= right; next++) {
          const value = src[next * stride + offset];
          while (tail > head && (maximum ? src[deque[tail - 1] * stride + offset] <= value : src[deque[tail - 1] * stride + offset] >= value)) tail--;
          deque[tail++] = next;
        }
        while (head < tail && deque[head] < i - radius) head++;
        dst[i * stride + offset] = src[deque[head] * stride + offset];
      }
    }
    return dst;
  }
  function box(src, width, height, radius, vertical) {
    const dst = new Float32Array(src.length);
    const length = vertical ? height : width, lines = vertical ? width : height;
    const stride = vertical ? width : 1;
    for (let line = 0; line < lines; line++) {
      const offset = vertical ? line : line * width;
      let sum = 0, count = 0, left = 0, right = -1;
      for (let i = 0; i < length; i++) {
        const end = Math.min(length - 1, i + radius);
        while (right < end) { right++; sum += src[right * stride + offset]; count++; }
        const start = Math.max(0, i - radius);
        while (left < start) { sum -= src[left * stride + offset]; left++; count--; }
        dst[i * stride + offset] = sum / count;
      }
    }
    return dst;
  }
  function max2(src, w, h, r) { return extrema(extrema(src, w, h, r, false, true), w, h, r, true, true); }
  function smooth(src, w, h, r) { return box(box(src, w, h, r, false), w, h, r, true); }
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));

  async function analyze(input, width, height, progress = () => {}) {
    if (input.length !== width * height * 4 || width < 1 || height < 1) throw new Error('图像尺寸无效');
    const n = width * height, scale = Math.max(.3, Math.min(width, height) / 1080);
    const channels = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) channels[c][i] = input[i * 4 + c];
    const bg = [];
    for (let c = 0; c < 3; c++) {
      progress(10 + c * 15, '估计局部纸张颜色'); await pause();
      bg.push(smooth(max2(channels[c], width, height, Math.max(2, Math.round(9 * scale))), width, height, Math.max(3, Math.round(19 * scale))));
    }
    progress(48, '估计纸张真实色差'); await pause();
    // Independent channel maxima can be contaminated by saturated red grid
    // pixels. Estimate paper chroma from locally bright, neutral pixels.
    const weight = new Float32Array(n), chromaG = new Float32Array(n), chromaB = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = channels[0][i], g = channels[1][i], b = channels[2][i];
      if (r > bg[0][i] * .78 && g > bg[1][i] * .78 && r - g < 20) {
        weight[i] = 1; chromaG[i] = r - g; chromaB[i] = r - b;
      }
    }
    const cr = Math.max(3, Math.round(19 * scale));
    const paperWeight = smooth(weight, width, height, cr);
    const paperG = smooth(chromaG, width, height, cr);
    const paperB = smooth(chromaB, width, height, cr);
    progress(58, '定位淡红格线'); await pause();
    const darkness = new Float32Array(n), redConfidence = new Float32Array(n), seed = new Float32Array(n), strong = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = channels[0][i], g = channels[1][i], b = channels[2][i];
      const eg = (r - g) - (paperWeight[i] > .05 ? paperG[i] / paperWeight[i] : bg[0][i] - bg[1][i]);
      const eb = (r - b) - (paperWeight[i] > .05 ? paperB[i] / paperWeight[i] : bg[0][i] - bg[2][i]);
      darkness[i] = clamp(1 - r / Math.max(bg[0][i], 1));
      // Relative chroma distinguishes deeply printed red from neutral ink.
      // Scale by local paper contrast so shadows and dark handwriting are not
      // mistaken for red merely because of the camera's white balance.
      redConfidence[i] = clamp((Math.max(eg, eb * .55) / Math.max(bg[0][i] - r, 1) - .10) / .18);
      seed[i] = Math.max(eg, eb * .55) > 2.5 && r > g + 3 ? 1 : 0;
      // A dark red line is not black handwriting. Compare the red excess to
      // its darkness so that dark printed grid pixels remain removable.
      strong[i] = darkness[i] > .61 && Math.max(eg, eb * .55) < 7 ? 1 : 0;
    }
    const support = max2(seed, width, height, Math.max(3, Math.round(15 * scale)));
    const protectedInk = max2(strong, width, height, Math.max(1, Math.round(scale)));
    // Dilate enough to bridge small perspective slants during line detection.
    const expanded = max2(darkness, width, height, Math.max(1, Math.round(3 * scale)));
    progress(72, '沿格线连续方向分离纸纹与笔画'); await pause();
    const hr = Math.max(6, Math.round(25 * scale)), vr = Math.max(5, Math.round(16 * scale));
    const horizontal = extrema(extrema(expanded, width, height, hr, false, false), width, height, hr, false, true);
    const vertical = extrema(extrema(expanded, width, height, vr, true, false), width, height, vr, true, true);
    const grid = new Float32Array(n);
    for (let i = 0; i < n; i++) grid[i] = support[i] ? Math.min(darkness[i], Math.max(horizontal[i], vertical[i])) : 0;
    progress(92, '保护深色笔迹'); await pause();
    return { width, height, input, bg, darkness, redConfidence, grid, protectedInk };
  }

  function render(model, options = {}) {
    const { width, height, input, bg, darkness, redConfidence, grid, protectedInk } = model;
    const n = width * height, output = new Uint8ClampedArray(input);
    const strength = clamp(Number(options.strength ?? 100) / 100, .5, 1.4);
    const protection = clamp(Number(options.protection ?? 65) / 100);
    const white = options.mode === 'white';
    const lift = clamp(Number(options.whiten ?? 10) / 100, 0, .2);
    const edits = options.edits;
    const maskView = !!options.maskView;
    let modified = 0, protectedCount = 0;
    for (let i = 0; i < n; i++) {
      const p = i * 4, d = darkness[i], g = grid[i];
      let mask = g > .075 && bg[0][i] > 95;
      const residual = d - g;
      let ink = clamp((residual - .04) / (.18 - protection * .0615));
      ink = Math.max(ink, clamp((d - (.54 - protection * .0923)) / .14), protectedInk[i]);
      // Only unambiguously red pixels override the dark-ink guard. Neutral
      // pixels, including black handwriting overlapping a line, keep it.
      ink *= 1 - redConfidence[i];
      if (edits && edits[i] === 1) { ink = 1; mask = false; }
      let rgb = [input[p], input[p + 1], input[p + 2]];
      if (mask && ink < 1) {
        const remain = Math.max(0, (residual - .055) / Math.max(1 - g, .2));
        const mix = clamp(strength * (1 - ink));
        for (let c = 0; c < 3; c++) rgb[c] += (bg[c][i] * (1 - remain) - rgb[c]) * mix;
      }
      if (edits && edits[i] === 2) { rgb = [bg[0][i], bg[1][i], bg[2][i]]; mask = true; }
      if (white) {
        // Paper only: leave the photographed desk/background at its original pixels.
        const paper = clamp((Math.min(bg[0][i], bg[1][i], bg[2][i]) - 90) / 45);
        const level = Math.min(1, Math.max(rgb[0] / Math.max(bg[0][i], 1), rgb[1] / Math.max(bg[1][i], 1), rgb[2] / Math.max(bg[2][i], 1)) / (1 - lift)) * 255;
        for (let c = 0; c < 3; c++) rgb[c] += (level - rgb[c]) * paper;
      }
      if (maskView) {
        if (edits && edits[i] === 1) rgb = [50, 160, 245];
        else if (mask && ink < 1) rgb = [Math.round(input[p]*.4+130), Math.round(input[p+1]*.4+75), Math.round(input[p+2]*.4+25)];
        else rgb = [input[p],input[p+1],input[p+2]];
      }
      for (let c = 0; c < 3; c++) output[p + c] = rgb[c];
      if (output[p] !== input[p] || output[p+1] !== input[p+1] || output[p+2] !== input[p+2]) modified++;
      if (protectedInk[i]) protectedCount++;
    }
    return { data: output, width, height, modified, protectedCount };
  }
  const api = { analyze, render, extrema, box };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GridCleaner = api;
})(typeof self !== 'undefined' ? self : globalThis);
