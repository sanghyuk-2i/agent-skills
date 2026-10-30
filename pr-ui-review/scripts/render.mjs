#!/usr/bin/env node
// analyze.mjs의 결과로 어노테이션 이미지를 만든다. 규격은 references/frame-spec.md.
//
//   node render.mjs --analysis <outDir>/<name>.analysis.json
//
// 산출물: <name>.before.annotated.png, <name>.after.annotated.png, <name>.sidebyside.png
// 입력 analysis.json의 files/renderSkipped를 갱신하고, 같은 내용을 stdout으로 낸다.
//
// 박스도 없고 전면 개편도 아니면 어노테이션 이미지는 원본과 같다 → 렌더링을 건너뛴다.
// wholePageChanged는 박스 없이 before/after 원본을 나란히 붙이는 경로라 렌더가 필요하다.

import fs from 'node:fs';
import path from 'node:path';
import { launchChromium } from './lib/browser.mjs';
import { parseArgs } from './lib/config.mjs';

function toDataUri(file) {
  const buf = fs.readFileSync(file);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

// ── 오버레이 렌더용 HTML ─────────────────────────────────────────────────────
function stageHtml(panels) {
  const panel = (p) => `
    <div class="panel">
      ${p.label ? `<div class="label">${p.label}</div>` : ''}
      <div class="frame" style="width:${p.width}px">
        <img src="${p.uri}" width="${p.width}">
        ${p.boxes
          .map(
            (b) => `<div class="box" style="left:${b.x}px;top:${b.y}px;width:${b.width}px;height:${b.height}px">
                      <span class="badge">${b.n}</span>
                    </div>`
          )
          .join('')}
      </div>
    </div>`;
  return `<!doctype html><meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#fff;font:600 28px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  #stage{display:flex;gap:32px;align-items:flex-start;padding:0;background:#fff;width:max-content}
  .panel{display:flex;flex-direction:column;gap:12px}
  .label{color:#fff;background:#111;padding:10px 20px;border-radius:8px;align-self:flex-start;letter-spacing:.04em}
  .frame{position:relative;line-height:0;outline:1px solid #e5e5e5}
  .frame img{display:block}
  .box{position:absolute;border:4px solid #ff2d55;border-radius:4px;
       box-shadow:0 0 0 2px rgba(255,255,255,.9),0 0 0 6px rgba(255,45,85,.18)}
  .badge{position:absolute;top:-18px;left:-18px;min-width:40px;height:40px;padding:0 8px;
         display:flex;align-items:center;justify-content:center;
         background:#ff2d55;color:#fff;border-radius:20px;font-size:24px;line-height:1;
         box-shadow:0 2px 6px rgba(0,0,0,.3)}
</style>
<div id="stage">${panels.map(panel).join('')}</div>`;
}

async function shootStage(browser, panels, outFile) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  await page.setContent(stageHtml(panels), { waitUntil: 'load' });
  await page.evaluate(() =>
    Promise.all(Array.from(document.images).map((i) => (i.complete ? null : i.decode().catch(() => null))))
  );
  await page.locator('#stage').screenshot({ path: outFile });
  await page.close();
}

async function main() {
  const args = parseArgs();
  const analysisFile = args.analysis;
  if (!analysisFile || analysisFile === true) {
    console.error('사용법: render.mjs --analysis <outDir>/<name>.analysis.json');
    process.exit(2);
  }
  const result = JSON.parse(fs.readFileSync(analysisFile, 'utf8'));
  const outDir = path.dirname(path.resolve(analysisFile));
  const { name, boxes, inputs, sizes } = result;
  const files = { ...(result.files ?? {}) };

  result.renderSkipped = !boxes.length && !result.wholePageChanged;
  if (result.renderSkipped) {
    delete files.before;
    delete files.after;
    delete files.sideBySide;
  } else {
    files.before = path.join(outDir, `${name}.before.annotated.png`);
    files.after = path.join(outDir, `${name}.after.annotated.png`);
    files.sideBySide = path.join(outDir, `${name}.sidebyside.png`);
    const beforeUri = toDataUri(inputs.before);
    const afterUri = toDataUri(inputs.after);

    const { browser } = await launchChromium(args.repo || process.cwd());
    try {
      // 서로 독립이라 병렬로 찍는다 (가장 느린 sidebyside가 전체 시간을 정한다)
      await Promise.all([
        shootStage(browser, [{ uri: beforeUri, width: sizes.before[0], boxes, label: null }], files.before),
        shootStage(browser, [{ uri: afterUri, width: sizes.after[0], boxes, label: null }], files.after),
        shootStage(
          browser,
          [
            { uri: beforeUri, width: sizes.before[0], boxes, label: 'BEFORE' },
            { uri: afterUri, width: sizes.after[0], boxes, label: 'AFTER' },
          ],
          files.sideBySide
        ),
      ]);
    } finally {
      await browser.close();
    }
  }

  result.files = files;
  fs.writeFileSync(analysisFile, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
