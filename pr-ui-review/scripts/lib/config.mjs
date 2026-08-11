// .claude/ui-review.json 로드 + 기본값 병합 + 간단한 인자 파서.

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULTS = {
  install: null,
  dev: { command: null, port: 3000, portEnv: 'PORT', readyPath: '/', timeoutMs: 120000 },
  viewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
  auth: { storageStatePath: null },
  stabilize: { disableAnimations: true, mask: [] },
  diff: { threshold: 0.1, minArea: 400, maxBoxes: 8, mergeGap: 24 },
  routes: [],
};

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, override) {
  const out = { ...base };
  for (const [k, v] of Object.entries(override ?? {})) {
    out[k] = isPlainObject(v) && isPlainObject(base?.[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

export function configPath(repoRoot) {
  return path.join(repoRoot, '.claude', 'ui-review.json');
}

export function loadConfig(repoRoot) {
  const p = configPath(repoRoot);
  if (!fs.existsSync(p)) return { config: deepMerge(DEFAULTS, {}), exists: false, path: p };
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`${p} 파싱 실패: ${e.message}`);
  }
  return { config: deepMerge(DEFAULTS, raw), exists: true, path: p };
}

// --key value / --flag 형태만 지원. 값이 없는 키는 true.
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

export function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
