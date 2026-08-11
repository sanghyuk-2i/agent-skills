#!/usr/bin/env node
// base/head 두 서버에서 같은 라우트를 같은 조건으로 캡처한다.
//
//   node capture.mjs --repo <root> --base-url http://localhost:3001 \
//     --head-url http://localhost:3000 --out-dir <dir> [--routes checkout,cart]
//
// 산출물: <out-dir>/<name>.before.png, <out-dir>/<name>.after.png
// stdout: 캡처 결과 JSON
//
// 두 캡처의 차이가 "코드 변경 때문"이 되려면 나머지 조건이 전부 같아야 한다.
// 애니메이션·폰트 로딩·lazy 이미지·커서 깜빡임이 다 노이즈원이라 여기서 못을 박는다.

import fs from 'node:fs';
import path from 'node:path';
import { launchChromium } from './lib/browser.mjs';
import { loadConfig, parseArgs } from './lib/config.mjs';

const KILL_ANIMATION_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    scroll-behavior: auto !important;
  }
  html { caret-color: transparent !important; }
  /* 커서 깜빡임과 스크롤바가 diff로 잡히는 걸 막는다 */
  ::-webkit-scrollbar { display: none !important; }
`;

async function settle(page, route, stabilize) {
  if (stabilize.disableAnimations) await page.addStyleTag({ content: KILL_ANIMATION_CSS });
  if (route.waitFor) await page.waitForSelector(route.waitFor, { timeout: 15000 });
  // lazy 이미지·무한스크롤을 강제로 깨운 뒤 맨 위로 돌아온다
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 120));
  });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Promise.all(Array.from(document.images).filter((i) => !i.complete).map((i) => i.decode().catch(() => null)))
  );
  if (route.waitMs) await page.waitForTimeout(Number(route.waitMs));
}

async function captureOne(context, baseUrl, route, file, stabilize) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const url = new URL(route.path, baseUrl).href;
  const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await settle(page, route, stabilize);
  const masks = (stabilize.mask ?? []).map((sel) => page.locator(sel));
  await page.screenshot({
    path: file,
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    mask: masks,
    maskColor: '#ff00ff',
  });
  await page.close();
  return { url, status: res?.status() ?? null, errors };
}

async function main() {
  const args = parseArgs();
  const repoRoot = args.repo || process.cwd();
  const baseUrl = args['base-url'];
  const headUrl = args['head-url'];
  const outDir = args['out-dir'];
  if (!baseUrl || !headUrl || !outDir) {
    console.error('사용법: capture.mjs --base-url <url> --head-url <url> --out-dir <dir> [--routes a,b]');
    process.exit(2);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const { config } = loadConfig(repoRoot);
  let routes = config.routes;
  if (args.routes && args.routes !== true) {
    const wanted = new Set(String(args.routes).split(',').map((s) => s.trim()));
    routes = routes.filter((r) => wanted.has(r.name));
  }
  if (!routes.length) {
    console.error('캡처할 라우트가 없습니다. .claude/ui-review.json 의 routes 를 확인하세요.');
    process.exit(2);
  }

  const { browser, source } = await launchChromium(repoRoot);
  const storageState =
    config.auth?.storageStatePath && fs.existsSync(path.resolve(repoRoot, config.auth.storageStatePath))
      ? path.resolve(repoRoot, config.auth.storageStatePath)
      : undefined;

  const contextOpts = {
    viewport: { width: config.viewport.width, height: config.viewport.height },
    deviceScaleFactor: config.viewport.deviceScaleFactor,
    reducedMotion: 'reduce',
    storageState,
  };

  const results = [];
  try {
    const context = await browser.newContext(contextOpts);
    for (const route of routes) {
      const before = path.join(outDir, `${route.name}.before.png`);
      const after = path.join(outDir, `${route.name}.after.png`);
      // 순차 캡처: 두 dev 서버를 동시에 때리면 빌드 경합으로 렌더 타이밍이 흔들린다
      const b = await captureOne(context, baseUrl, route, before, config.stabilize);
      const a = await captureOne(context, headUrl, route, after, config.stabilize);
      results.push({ name: route.name, path: route.path, before, after, baseStatus: b.status, headStatus: a.status, errors: [...b.errors, ...a.errors] });
      console.error(`[capture] ${route.name} (${route.path}) 완료`);
    }
    await context.close();
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({ playwrightFrom: source, authUsed: Boolean(storageState), routes: results }, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
