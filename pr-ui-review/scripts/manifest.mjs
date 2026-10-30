#!/usr/bin/env node
// analyze/render 결과를 모아 <outDir>/manifest.json 을 만든다. 스키마는 references/manifest.md.
//
//   node manifest.mjs --out-dir <out> [--meta <meta.json>] [--pr 42] [--base-ref main] \
//     [--repo <git root>] [--config-dir <dir>] [--routes home,contact] [--strict]
//
// --meta (에이전트가 6단계에서 쓰는 파일):
//   { "descriptions": { "home": { "1": "한 줄 설명" } },
//     "notes":        { "home": ["캡처에 포함되지 않은 변경: ..."] },
//     "skipped":      [ { "name": "cart", "reason": "캡처 실패: ..." } ] }
//
// 이 스크립트는 판단하지 않는다 — 있는 파일을 모아 계약된 모양으로 적을 뿐이다.
// 다만 두 가지는 조용히 넘기지 않는다:
//   - config의 라우트인데 분석 결과도 skipped 기록도 없으면 skipped에 "분석 결과 없음"으로 넣는다.
//   - 박스에 description이 없거나 렌더가 안 된 라우트가 있으면 경고하고, --strict면 exit 1.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig, parseArgs } from './lib/config.mjs';

const VERSION = 1;

function git(repo, ...args) {
  try {
    return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// git@github.com-alias:owner/name.git, https://github.com/owner/name.git → owner/name
function repoSlug(repo) {
  const url = git(repo, 'remote', 'get-url', 'origin');
  const m = url && url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
  return m ? m[1] : null;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function relTo(outDir, file) {
  return file ? path.relative(outDir, file) : undefined;
}

// 세로 이동 요약. analyze가 낸 shifted는 "before에 같은 내용이 dy만큼 떨어져 있는" 조각들인데,
// 글줄처럼 비슷하게 생긴 조각끼리 우연히 맞으면 dy가 제각각인 파편이 수십 개 나온다 (노이즈).
// 진짜 레이아웃 밀림은 같은 dy를 갖는 조각이 페이지의 상당 부분을 차지한다 → 그런 묶음만 보고한다.
const SHIFT_MIN_PAGE_RATIO = 0.05; // 같은 dy 묶음의 높이 합이 페이지 높이의 5% 이상이어야 "밀림"
const SHIFT_MIN_CSS_PX = 2; // 이보다 작은 이동은 반올림 오차 수준이라 무시

function coherentShifts(shifted, dsf, pageH) {
  const byDy = new Map();
  for (const s of shifted) {
    if (s.dx) continue; // 가로 미세 이동(글줄이 옆으로 몇 px)은 요약 대상이 아니다. analysis.json에만 남는다
    const dy = Math.round(s.dy / dsf);
    const cur = byDy.get(dy) ?? { dy, count: 0, height: 0 };
    cur.count += 1;
    cur.height += s.height;
    byDy.set(dy, cur);
  }
  // 반올림 때문에 8px/9px로 갈라진 같은 이동을 합친다
  const groups = [];
  for (const g of [...byDy.values()].sort((p, q) => p.dy - q.dy)) {
    const last = groups[groups.length - 1];
    if (last && g.dy - last.dy <= 1) {
      last.count += g.count;
      last.height += g.height;
      last.dy = last.height >= g.height ? last.dy : g.dy;
    } else groups.push({ ...g });
  }
  return groups
    .filter((g) => Math.abs(g.dy) >= SHIFT_MIN_CSS_PX && g.height >= pageH * SHIFT_MIN_PAGE_RATIO)
    .sort((p, q) => q.height - p.height);
}

function summarizeShift(groups) {
  if (!groups.length) return null;
  const parts = groups.slice(0, 2).map((g) => `${Math.abs(g.dy)}px ${g.dy > 0 ? '아래로' : '위로'}`);
  return `내용은 그대로, 일부 영역이 ${parts.join(', ')} 이동`;
}

function routeStatus(a, shiftGroups) {
  if (a.wholePageChanged) return 'whole-page';
  if (a.boxes.length) return 'changed';
  if (shiftGroups.length) return 'layout-only';
  return 'unchanged';
}

function main() {
  const args = parseArgs();
  const outDir = args['out-dir'] && args['out-dir'] !== true ? path.resolve(args['out-dir']) : null;
  if (!outDir) {
    console.error('사용법: manifest.mjs --out-dir <dir> [--meta <file>] [--pr N] [--base-ref main]');
    process.exit(2);
  }

  const statePath = path.join(path.dirname(outDir), 'state.json');
  const state = fs.existsSync(statePath) ? readJson(statePath) : {};
  const repo = args.repo && args.repo !== true ? path.resolve(args.repo) : state.repoRoot;
  if (!repo) {
    console.error('git 레포 경로를 알 수 없습니다. state.json이 없으면 --repo 를 주세요.');
    process.exit(2);
  }
  const configDir = args['config-dir'] && args['config-dir'] !== true ? path.resolve(args['config-dir']) : repo;
  const { config } = loadConfig(configDir);
  const meta = args.meta && args.meta !== true ? readJson(args.meta) : {};

  let routeDefs = config.routes;
  if (args.routes && args.routes !== true) {
    const wanted = new Set(String(args.routes).split(',').map((s) => s.trim()));
    routeDefs = routeDefs.filter((r) => wanted.has(r.name));
  }
  if (!routeDefs.length) {
    console.error('라우트가 없습니다. 설정의 routes 또는 --routes 를 확인하세요.');
    process.exit(2);
  }

  const dsf = config.viewport.deviceScaleFactor;
  const skipped = [...(meta.skipped ?? [])];
  const skippedNames = new Set(skipped.map((s) => s.name));
  const warnings = [];
  const routes = [];

  for (const def of routeDefs) {
    const analysisPath = path.join(outDir, `${def.name}.analysis.json`);
    if (!fs.existsSync(analysisPath)) {
      if (!skippedNames.has(def.name)) skipped.push({ name: def.name, reason: '분석 결과 없음 (analyze.mjs가 실행되지 않았거나 캡처 실패)' });
      continue;
    }
    const a = readJson(analysisPath);
    const shiftGroups = coherentShifts(a.shifted, dsf, a.sizes.overlap[1]);
    const status = routeStatus(a, shiftGroups);
    const descs = meta.descriptions?.[def.name] ?? {};

    const boxes = a.boxes.map((b, i) => {
      const crop = a.files?.crops?.[i];
      const out = { n: b.n, x: b.x, y: b.y, width: b.width, height: b.height };
      if (crop) out.crop = relTo(outDir, crop);
      const d = descs[String(b.n)];
      if (d) out.description = d;
      else warnings.push(`${def.name} 박스 ${b.n}: description 없음`);
      return out;
    });

    const files = { raw: { before: relTo(outDir, a.inputs.before), after: relTo(outDir, a.inputs.after) } };
    if (status === 'changed' || status === 'whole-page') {
      for (const [key, src] of [['sideBySide', a.files?.sideBySide], ['before', a.files?.before], ['after', a.files?.after]]) {
        if (src && fs.existsSync(src)) files[key] = relTo(outDir, src);
        else warnings.push(`${def.name}: ${key} 이미지 없음 (render.mjs를 실행하세요)`);
      }
    }

    const route = {
      name: def.name,
      path: def.path,
      status,
      files,
      sizes: { before: a.sizes.before, after: a.sizes.after },
      heightChanged: a.heightChanged,
      wholePageChanged: a.wholePageChanged,
      truncated: a.truncated,
      shifted: summarizeShift(shiftGroups),
      minorShifts: a.shifted.filter((s) => s.dx).length, // 가로로 몇 px 밀렸을 뿐 변경 없음으로 판정한 영역 수
      boxes,
    };
    if (meta.notes?.[def.name]?.length) route.notes = meta.notes[def.name];
    routes.push(route);
  }

  const headDirty = git(repo, 'status', '--porcelain');
  const manifest = {
    version: VERSION,
    createdAt: new Date().toISOString(),
    repo: repoSlug(repo),
    mode: args.pr && args.pr !== true ? 'pr' : 'branch',
    ...(args.pr && args.pr !== true ? { pr: Number(args.pr) } : {}),
    base: {
      ref: args['base-ref'] && args['base-ref'] !== true ? args['base-ref'] : null,
      sha: state.baseSha ? state.baseSha.slice(0, 7) : null, // state.json이 없으면 알 수 없다 — HEAD로 추측하지 않는다
    },
    head: { sha: (git(repo, 'rev-parse', 'HEAD') ?? '').slice(0, 7) || null, dirty: Boolean(headDirty) },
    viewport: config.viewport,
    routes,
    skipped,
  };

  const file = path.join(outDir, 'manifest.json');
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  for (const w of warnings) console.error(`[manifest] 경고: ${w}`);
  console.error(`[manifest] ${file} (라우트 ${routes.length}개, skipped ${skipped.length}개, 경고 ${warnings.length}개)`);
  console.log(JSON.stringify(manifest, null, 2));
  if (args.strict && warnings.length) process.exit(1);
}

try {
  main();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
