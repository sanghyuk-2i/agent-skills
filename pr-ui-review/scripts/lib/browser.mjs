// Playwright 리졸버.
//
// 순서: (1) 대상 레포의 node_modules, (2) 스킬 자체 node_modules.
// 대상 레포에 이미 playwright가 있으면 그걸 쓴다 — 브라우저 바이너리 버전이
// 프로젝트와 일치해서 렌더링 차이가 생기지 않는다.
// 둘 다 없으면 스킬 디렉토리에만 설치하라고 안내한다. 대상 레포는 절대 건드리지 않는다.

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const SKILL_SCRIPTS = path.resolve(new URL('..', import.meta.url).pathname);

function tryResolve(fromDir) {
  try {
    const require = createRequire(path.join(fromDir, 'noop.js'));
    return require.resolve('playwright');
  } catch {
    return null;
  }
}

export async function loadPlaywright(repoRoot = process.cwd()) {
  const candidates = [repoRoot, SKILL_SCRIPTS];
  for (const dir of candidates) {
    const resolved = tryResolve(dir);
    if (resolved) {
      const mod = await import(pathToFileURL(resolved).href);
      // playwright는 CJS라 ESM에서 named export가 안 잡힐 수 있다 → default로 폴백
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (!chromium) throw new Error(`playwright를 불러왔지만 chromium이 없습니다: ${resolved}`);
      return { chromium, source: dir === repoRoot ? 'repo' : 'skill' };
    }
  }
  throw new Error(
    `playwright를 찾을 수 없습니다.\n` +
      `스킬 디렉토리에 한 번만 설치하세요 (대상 레포는 건드리지 않습니다):\n` +
      `  npm install --prefix ${SKILL_SCRIPTS}\n` +
      (fs.existsSync(path.join(process.env.HOME || '', 'Library/Caches/ms-playwright'))
        ? `  (브라우저 바이너리는 이미 캐시에 있어 재다운로드되지 않습니다)`
        : `  npx playwright install chromium`)
  );
}

// chromium.launch()를 감싸 브라우저 바이너리 누락을 실행 가능한 안내로 바꾼다.
// (playwright 패키지 버전과 캐시된 브라우저 리비전이 어긋나면 이 에러가 난다)
export async function launchChromium(repoRoot = process.cwd(), options = {}) {
  const { chromium, source } = await loadPlaywright(repoRoot);
  try {
    const browser = await chromium.launch(options);
    return { browser, source };
  } catch (e) {
    if (/Executable doesn't exist|please run|browserType.launch/i.test(e.message)) {
      throw new Error(
        `Chromium 바이너리가 없습니다 (playwright 위치: ${source === 'repo' ? repoRoot : SKILL_SCRIPTS}).\n` +
          `한 번만 실행하세요:\n` +
          `  npx --prefix ${SKILL_SCRIPTS} playwright install chromium\n\n` +
          `원본 에러: ${e.message.split('\n')[0]}`
      );
    }
    throw e;
  }
}

export { SKILL_SCRIPTS };
