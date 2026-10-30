#!/usr/bin/env node
// before/after PNG 두 장을 비교해 "실제로 달라진 영역"을 찾는다. 이미지는 그리지 않는다.
//
//   node analyze.mjs --before b.png --after a.png --out-dir out --name checkout \
//     [--threshold 0.1] [--min-area 400] [--max-boxes 8] [--merge-gap 24] [--no-crops]
//
// 산출물: <name>.box-N.png(박스별 크롭), <name>.analysis.json
// stdout: 분석 결과 JSON (에이전트가 그대로 읽는다)
//
// 분석과 렌더를 나눈 이유: 노이즈가 심하면 마스크를 고쳐 다시 캡처·분석하게 되는데,
// 그때마다 큰 페이지 렌더(수 초)를 치르지 않기 위해서다. 크롭을 보고 박스가 맞다고 판단한 뒤에
// render.mjs로 어노테이션 이미지를 만든다.
//
// 픽셀 디코딩·비교를 전부 Chromium 안에서 처리한다. canvas가 PNG를 디코딩하고
// getImageData가 픽셀을 주므로 sharp/pngjs/pixelmatch 같은 네이티브 의존성이 필요 없다.
// (data URI로 넘기는 이유: file:// 이미지는 canvas를 taint시켜 getImageData가 막힌다.)

import fs from 'node:fs';
import path from 'node:path';
import { launchChromium } from './lib/browser.mjs';
import { parseArgs, num } from './lib/config.mjs';

const MAX_ANALYSIS_WIDTH = 1600; // 분석용 다운스케일 상한 (속도 + 안티에일리어싱 노이즈 억제)
const DILATE_RADIUS = 8; // 이미지 px. 글자 획 하나하나가 개별 박스가 되는 걸 막는다
const WHOLE_PAGE_RATIO = 0.6; // 이 비율 넘게 바뀌면 개별 박스가 무의미
const MAX_SHIFT = 400; // 세로 이동 보정 탐색 범위 (이미지 px)
const MAX_SHIFT_X = 12; // 가로 미세 이동 보정 탐색 범위 (이미지 px). 글줄이 몇 px 옆으로 밀린 경우용

function toDataUri(file) {
  const buf = fs.readFileSync(file);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

// ── 브라우저 컨텍스트에서 실행되는 분석 ───────────────────────────────────────
function analyzeInPage(opts) {
  const { beforeUri, afterUri, threshold, minArea, maxBoxes, mergeGap, maxShift, maxShiftX, maxAnalysisWidth, dilateRadius } =
    opts;

  const load = (src) =>
    new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('이미지 로드 실패'));
      img.src = src;
    });

  return Promise.all([load(beforeUri), load(afterUri)]).then(([b, a]) => {
    const bw = b.naturalWidth, bh = b.naturalHeight;
    const aw = a.naturalWidth, ah = a.naturalHeight;

    // 겹치는 영역만 비교한다. 페이지 길이가 달라졌다면 그건 박스가 아니라
    // "높이 변화"라는 사실 자체로 보고한다 (안 그러면 화면 전체가 diff로 잡힌다).
    const ow = Math.min(bw, aw), oh = Math.min(bh, ah);
    const scale = Math.min(1, maxAnalysisWidth / ow);
    const W = Math.max(1, Math.round(ow * scale));
    const H = Math.max(1, Math.round(oh * scale));

    const pixels = (img) => {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, ow, oh, 0, 0, W, H);
      return ctx.getImageData(0, 0, W, H).data;
    };
    const B = pixels(b), A = pixels(a);

    // ── 1. 픽셀 차이 → 이진 마스크 (pixelmatch와 같은 YIQ 색차) ──
    const maxDelta = 35215 * threshold * threshold;
    const differs = (P, pi, Q, qi) => {
      const r1 = P[pi], g1 = P[pi + 1], b1 = P[pi + 2];
      const r2 = Q[qi], g2 = Q[qi + 1], b2 = Q[qi + 2];
      if (r1 === r2 && g1 === g2 && b1 === b2) return false;
      const y = (r1 - r2) * 0.29889531 + (g1 - g2) * 0.58662247 + (b1 - b2) * 0.11448223;
      const iq = (r1 - r2) * 0.59597799 - (g1 - g2) * 0.27417610 - (b1 - b2) * 0.32180189;
      const q = (r1 - r2) * 0.21147017 - (g1 - g2) * 0.52261711 + (b1 - b2) * 0.31114694;
      return 0.5053 * y * y + 0.299 * iq * iq + 0.1957 * q * q > maxDelta;
    };
    const mask = new Uint8Array(W * H);
    let changed = 0;
    for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
      if (differs(B, p, A, p)) {
        mask[i] = 1;
        changed++;
      }
    }

    const result = {
      sizes: { before: [bw, bh], after: [aw, ah], overlap: [ow, oh] },
      heightChanged: bh !== ah,
      widthChanged: bw !== aw,
      changedRatio: changed / (W * H),
      wholePageChanged: false,
      // 아래 네 필드는 어떤 경로로 반환되든 항상 존재한다 — 소비하는 쪽이 키 유무를 확인할 필요가 없도록
      boxes: [],
      shifted: [],
      droppedSmall: 0,
      truncated: 0,
    };
    if (changed === 0) return result;
    if (result.changedRatio > opts.wholePageRatio) {
      result.wholePageChanged = true;
      return result;
    }

    // ── 2. dilation (integral image로 O(1) 윈도 합) ──
    const r = Math.max(1, Math.round(dilateRadius * scale));
    const integ = new Int32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let rowSum = 0;
      for (let x = 0; x < W; x++) {
        rowSum += mask[y * W + x];
        integ[(y + 1) * (W + 1) + (x + 1)] = integ[y * (W + 1) + (x + 1)] + rowSum;
      }
    }
    const windowSum = (x0, y0, x1, y1) => {
      x0 = Math.max(0, x0); y0 = Math.max(0, y0);
      x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
      if (x1 < x0 || y1 < y0) return 0;
      const s = (W + 1);
      return integ[(y1 + 1) * s + (x1 + 1)] - integ[y0 * s + (x1 + 1)] - integ[(y1 + 1) * s + x0] + integ[y0 * s + x0];
    };
    const dil = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (windowSum(x - r, y - r, x + r, y + r) > 0) dil[y * W + x] = 1;

    // ── 3. connected component → 바운딩 박스 ──
    const seen = new Uint8Array(W * H);
    const stack = new Int32Array(W * H);
    let boxes = [];
    for (let start = 0; start < dil.length; start++) {
      if (!dil[start] || seen[start]) continue;
      let sp = 0;
      stack[sp++] = start;
      seen[start] = 1;
      let minX = W, minY = H, maxX = -1, maxY = -1, core = 0;
      while (sp > 0) {
        const idx = stack[--sp];
        const x = idx % W, y = (idx - x) / W;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (mask[idx]) core++;
        if (x > 0 && dil[idx - 1] && !seen[idx - 1]) { seen[idx - 1] = 1; stack[sp++] = idx - 1; }
        if (x < W - 1 && dil[idx + 1] && !seen[idx + 1]) { seen[idx + 1] = 1; stack[sp++] = idx + 1; }
        if (y > 0 && dil[idx - W] && !seen[idx - W]) { seen[idx - W] = 1; stack[sp++] = idx - W; }
        if (y < H - 1 && dil[idx + W] && !seen[idx + W]) { seen[idx + W] = 1; stack[sp++] = idx + W; }
      }
      // dilation이 부풀린 만큼 되돌린다
      boxes.push({ x0: minX + r, y0: minY + r, x1: maxX - r, y1: maxY - r, core });
    }
    boxes = boxes
      .map((bx) => ({ ...bx, x0: Math.min(bx.x0, bx.x1), y0: Math.min(bx.y0, bx.y1), x1: Math.max(bx.x0, bx.x1), y1: Math.max(bx.y0, bx.y1) }))
      .filter((bx) => bx.core > 0);

    // ── 4. 가까운 박스 병합 ──
    const gap = Math.max(1, Math.round(mergeGap * scale));
    let merged = true;
    while (merged && boxes.length > 1) {
      merged = false;
      outer: for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const p = boxes[i], q = boxes[j];
          const overlaps =
            p.x0 - gap <= q.x1 && q.x0 - gap <= p.x1 && p.y0 - gap <= q.y1 && q.y0 - gap <= p.y1;
          if (!overlaps) continue;
          boxes[i] = {
            x0: Math.min(p.x0, q.x0), y0: Math.min(p.y0, q.y0),
            x1: Math.max(p.x1, q.x1), y1: Math.max(p.y1, q.y1),
            core: p.core + q.core,
          };
          boxes.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }

    // ── 4.5 세로 이동 보정 ──
    // 위쪽 요소의 높이가 바뀌면 그 아래 모든 것이 밀려 내려가 전부 diff로 잡힌다.
    // 그 박스들은 리뷰어에게 노이즈다. 각 박스에 대해 "before의 같은 내용이
    // dy만큼 위/아래에 그대로 있는가"를 확인해서, 그렇다면 변경이 아니라 이동으로 분류한다.
    const maxShiftPx = Math.max(1, Math.round(maxShift * scale));
    const SHIFT_TOL = 0.02; // 2% 미만 불일치면 "같은 내용"
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const mismatchFraction = (bx, dy) => {
      let total = 0, bad = 0;
      for (let y = bx.y0; y <= bx.y1; y += 2) {
        const sy = y - dy;
        if (sy < 0 || sy >= H) return 1;
        const rowA = y * W, rowB = sy * W;
        for (let x = bx.x0; x <= bx.x1; x += 2) {
          total++;
          if (differs(A, (rowA + x) * 4, B, (rowB + x) * 4)) bad++;
        }
      }
      return total ? bad / total : 1;
    };
    const shifted = [];
    boxes = boxes.filter((bx) => {
      const c = {
        x0: clamp(bx.x0, 0, W - 1), x1: clamp(bx.x1, 0, W - 1),
        y0: clamp(bx.y0, 0, H - 1), y1: clamp(bx.y1, 0, H - 1),
      };
      if (c.x1 < c.x0 || c.y1 < c.y0) return false;
      // |dy|가 작은 것부터 찾아 가장 그럴듯한 이동량을 고른다
      for (let d = 1; d <= maxShiftPx; d++) {
        for (const dy of [d, -d]) {
          if (mismatchFraction(c, dy) < SHIFT_TOL) {
            shifted.push({ ...bx, dy: Math.round(dy / scale) });
            return false;
          }
        }
      }
      return true;
    });

    // ── 4.6 가로 미세 이동 보정 ──
    // 글줄이 옆으로 1~수 px 밀렸을 뿐 내용이 같으면, 글자 획이 전부 diff로 잡혀 박스가 생기지만
    // 리뷰어 눈에는 before/after가 똑같아 보인다. 작은 (dx, dy) 평행이동으로 겹치면 변경이 아니라 이동으로 분류한다.
    // 이동 없이도 거의 같다면(실제로 글자 하나가 바뀐 것 등) 이동이 아니라 작은 변경이므로 박스로 남긴다.
    //
    // 분석용 다운스케일 이미지에서는 몇 px 이동이 소수 px가 되어 정렬이 안 맞는다 → 후보 박스만 원본 해상도로 다시 본다.
    // 글자는 서브픽셀 위치가 달라지면 안티에일리어싱 농도가 바뀌므로 엄격한 색차(YIQ) 대신 채널 차이 상한을 쓴다.
    // 허용치는 실측으로 잡았다: 서브픽셀 렌더 차이만 남는 같은 글줄은 0~2.2%, 같은 길이 글줄에서 단어 하나가 바뀐 경우는 약 3%.
    // 그 사이(2.5%)에 둔다. 여유가 얇으니 바꾸기 전에 gen 케이스(이동/이동+수정/수정/색)로 다시 확인할 것.
    const FINE_TOL = 0.025; // 평행이동 후 불일치가 2.5% 미만이어야 "같은 내용"
    const FINE_GAIN = 0.25; // 그리고 이동 전 불일치의 1/4 이하여야 평행이동이 설명으로 충분
    const FINE_CHANNEL_DELTA = 48;
    const FINE_MAX_DY = 4; // 이미지 px. 가로 이동에 딸려오는 어긋남만 허용
    const FINE_MAX_AREA = 400000; // 이미지 px². 이보다 큰 박스(이미지·섹션)는 글줄 이동이 아니다
    const region = (img, x, y, w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      return ctx.getImageData(0, 0, w, h).data;
    };
    boxes = boxes.filter((bx) => {
      const ix0 = Math.max(0, Math.floor(bx.x0 / scale)), iy0 = Math.max(0, Math.floor(bx.y0 / scale));
      const ix1 = Math.min(ow - 1, Math.ceil((bx.x1 + 1) / scale)), iy1 = Math.min(oh - 1, Math.ceil((bx.y1 + 1) / scale));
      const bw_ = ix1 - ix0 + 1, bh_ = iy1 - iy0 + 1;
      if (bw_ < 1 || bh_ < 1 || bw_ * bh_ > FINE_MAX_AREA) return true;
      // 박스 + 탐색 여백을 한 번만 읽어 둔다
      const rx = Math.max(0, ix0 - maxShiftX), ry = Math.max(0, iy0 - FINE_MAX_DY);
      const rw = Math.min(ow, ix1 + 1 + maxShiftX) - rx, rh = Math.min(oh, iy1 + 1 + FINE_MAX_DY) - ry;
      const PB = region(b, rx, ry, rw, rh), QA = region(a, rx, ry, rw, rh);
      const mism = (dx, dy) => {
        let total = 0, bad = 0;
        for (let y = iy0; y <= iy1; y += 2) {
          const sy = y - dy - ry;
          if (sy < 0 || sy >= rh) return 1;
          for (let x = ix0; x <= ix1; x += 2) {
            const sx = x - dx - rx;
            if (sx < 0 || sx >= rw) return 1;
            const i = ((y - ry) * rw + (x - rx)) * 4, j = (sy * rw + sx) * 4;
            total++;
            if (
              Math.abs(QA[i] - PB[j]) > FINE_CHANNEL_DELTA ||
              Math.abs(QA[i + 1] - PB[j + 1]) > FINE_CHANNEL_DELTA ||
              Math.abs(QA[i + 2] - PB[j + 2]) > FINE_CHANNEL_DELTA
            ) bad++;
          }
        }
        return total ? bad / total : 1;
      };
      const still = mism(0, 0);
      if (still < FINE_TOL) return true;
      let best = { f: 1, dx: 0, dy: 0 };
      for (let dy = -FINE_MAX_DY; dy <= FINE_MAX_DY; dy++)
        for (let dx = -maxShiftX; dx <= maxShiftX; dx++) {
          if (dx === 0 && dy === 0) continue;
          const f = mism(dx, dy);
          if (f < best.f) best = { f, dx, dy };
        }
      if (best.f < FINE_TOL && best.f < still * FINE_GAIN) {
        shifted.push({ ...bx, dx: best.dx, dy: best.dy }); // 둘 다 이미지 px
        return false;
      }
      return true;
    });

    // ── 5. 이미지 좌표로 환산 → 면적 필터 → 상위 N개 → 읽는 순서로 번호 ──
    const inv = 1 / scale;
    let out = boxes.map((bx) => {
      const x = Math.max(0, Math.round(bx.x0 * inv) - 4);
      const y = Math.max(0, Math.round(bx.y0 * inv) - 4);
      const w = Math.min(ow - x, Math.round((bx.x1 - bx.x0 + 1) * inv) + 8);
      const h = Math.min(oh - y, Math.round((bx.y1 - bx.y0 + 1) * inv) + 8);
      return { x, y, width: w, height: h, area: w * h, changedPixels: Math.round(bx.core * inv * inv) };
    });
    const dropped = out.filter((bx) => bx.area < minArea).length;
    out = out.filter((bx) => bx.area >= minArea).sort((p, q) => q.area - p.area);
    const truncated = Math.max(0, out.length - maxBoxes);
    out = out.slice(0, maxBoxes);

    const rowTol = Math.round(oh * 0.02);
    out.sort((p, q) => (Math.abs(p.y - q.y) <= rowTol ? p.x - q.x : p.y - q.y));
    out.forEach((bx, i) => { bx.n = i + 1; });

    result.boxes = out;
    result.droppedSmall = dropped;
    result.truncated = truncated;
    // 내용은 그대로고 위치만 밀린 영역 — 박스로 그리지 않고 한 줄로 요약해 보고한다
    result.shifted = shifted
      .map((s) => ({
        y: Math.round(s.y0 * inv),
        height: Math.round((s.y1 - s.y0 + 1) * inv),
        dy: s.dy,
        ...(s.dx ? { dx: s.dx } : {}),
      }))
      .sort((p, q) => p.y - q.y);
    return result;
  });
}

async function main() {
  const args = parseArgs();
  const beforeFile = args.before, afterFile = args.after;
  if (!beforeFile || !afterFile) {
    console.error('사용법: analyze.mjs --before <png> --after <png> --out-dir <dir> --name <route>');
    process.exit(2);
  }
  const outDir = args['out-dir'] || path.dirname(afterFile);
  const name = args.name || path.basename(afterFile, '.png');
  fs.mkdirSync(outDir, { recursive: true });

  const beforeUri = toDataUri(beforeFile);
  const afterUri = toDataUri(afterFile);

  const { browser } = await launchChromium(args.repo || process.cwd());
  let result;
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('[page]', e.message));
    await page.setContent('<!doctype html><meta charset="utf-8"><body>');
    result = await page.evaluate(analyzeInPage, {
      beforeUri,
      afterUri,
      threshold: num(args.threshold, 0.1),
      minArea: num(args['min-area'], 400),
      maxBoxes: num(args['max-boxes'], 8),
      mergeGap: num(args['merge-gap'], 24),
      maxShift: num(args['max-shift'], MAX_SHIFT),
      maxShiftX: num(args['max-shift-x'], MAX_SHIFT_X),
      maxAnalysisWidth: MAX_ANALYSIS_WIDTH,
      dilateRadius: DILATE_RADIUS,
      wholePageRatio: WHOLE_PAGE_RATIO,
    });
    await page.close();

    const [ow, oh] = result.sizes.overlap;
    const files = {};
    const boxes = result.boxes;

    // 박스별 크롭 — 에이전트가 이 이미지를 직접 보고 변경 내용을 설명한다.
    if (!args['no-crops'] && boxes.length) {
      files.crops = [];
      const page2 = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
      await page2.setContent('<!doctype html><meta charset="utf-8"><body>');
      // 큰 이미지를 박스마다 다시 디코딩·전송하지 않도록 한 번만 올려둔다
      await page2.evaluate(
        ({ beforeUri, afterUri }) => {
          const load = (src) =>
            new Promise((res, rej) => {
              const i = new Image();
              i.onload = () => res(i);
              i.onerror = rej;
              i.src = src;
            });
          return Promise.all([load(beforeUri), load(afterUri)]).then(([bi, ai]) => {
            window.__imgs = { bi, ai };
          });
        },
        { beforeUri, afterUri }
      );
      for (const b of boxes) {
        const pad = 24;
        const clip = {
          x: Math.max(0, b.x - pad),
          y: Math.max(0, b.y - pad),
          w: Math.min(ow, b.x + b.width + pad) - Math.max(0, b.x - pad),
          h: Math.min(oh, b.y + b.height + pad) - Math.max(0, b.y - pad),
        };
        const uri = await page2.evaluate((clip) => {
          const { bi, ai } = window.__imgs;
          const gap = 16, labelH = 28;
          const c = document.createElement('canvas');
          c.width = clip.w * 2 + gap;
          c.height = clip.h + labelH;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.fillStyle = '#111';
          ctx.font = '600 18px sans-serif';
          ctx.fillText('BEFORE', 0, 20);
          ctx.fillText('AFTER', clip.w + gap, 20);
          ctx.drawImage(bi, clip.x, clip.y, clip.w, clip.h, 0, labelH, clip.w, clip.h);
          ctx.drawImage(ai, clip.x, clip.y, clip.w, clip.h, clip.w + gap, labelH, clip.w, clip.h);
          return c.toDataURL('image/png');
        }, clip);
        const file = path.join(outDir, `${name}.box-${b.n}.png`);
        fs.writeFileSync(file, Buffer.from(uri.split(',')[1], 'base64'));
        files.crops.push(file);
      }
      await page2.close();
    }

    result.name = name;
    result.inputs = { before: path.resolve(beforeFile), after: path.resolve(afterFile) };
    result.files = files;
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(outDir, `${name}.analysis.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
