/**
 * 프리셋 통합 검증.
 *
 * 단위 테스트는 규칙 하나가 제대로 동작하는지만 본다. 실제로 중요한 건
 * 프리셋이 그 규칙을 **올바른 파일에** 붙였는지다 — domain/에는 켜고 shell/에는 끄는 식의.
 * 그건 진짜 ESLint를 진짜 파일 위에서 돌려봐야만 확인된다.
 *
 * 검증 방식: fixture 파일에 `// @expect <ruleId>` 주석을 달면 **바로 다음 줄**에
 * 그 규칙 위반이 있어야 한다. 표시 없는 줄에 뜬 위반은 오탐으로 간주해 실패시킨다.
 * 오탐을 실패로 다루는 게 핵심이다 — 오탐이 있으면 스킬이 멀쩡한 코드를 고치려 든다.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const eslintBin = path.join(
  here,
  "..",
  "node_modules",
  "eslint",
  "bin",
  "eslint.js",
);

/** `// @expect ruleId` 주석을 찾아 `"line:ruleId"` 집합으로 만든다. */
function readExpectations(filePath) {
  const lines = readFileSync(filePath, "utf8").split("\n");
  const expected = new Set();
  lines.forEach((line, index) => {
    const match = line.match(/@expect\s+(\S+)/u);
    if (match === null) return;
    expected.add(`${index + 2}:${match[1]}`); // 주석 다음 줄
  });
  return expected;
}

/**
 * CLI를 실제로 호출한다. Node API의 `cwd` 옵션은 `process.cwd()`와 어긋날 수 있는데,
 * `import-x/no-restricted-paths`의 상대 경로 zone은 거기에 의존한다.
 * 사용자는 프로젝트 루트에서 `npx eslint`를 치므로 검증도 같은 방식이어야 한다.
 */
function lint(cwd) {
  try {
    const stdout = execFileSync(
      process.execPath,
      [eslintBin, "--format", "json", "--no-error-on-unmatched-pattern", "src"],
      { cwd, encoding: "utf8" },
    );
    return JSON.parse(stdout);
  } catch (error) {
    // 위반이 있으면 eslint는 exit code 1로 끝난다 — 그때도 stdout에 결과가 담긴다
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

function verify(fixtureName) {
  const cwd = path.join(here, "fixtures", fixtureName);
  const results = lint(cwd);
  const problems = [];

  for (const result of results) {
    const relative = path.relative(cwd, result.filePath);
    const expected = readExpectations(result.filePath);
    const actual = new Set(
      result.messages
        .filter((message) => message.ruleId !== null)
        .map((message) => `${message.line}:${message.ruleId}`),
    );

    for (const key of expected) {
      if (!actual.has(key)) {
        problems.push(`  누락  ${relative}:${key} — 위반이 보고되지 않음`);
      }
    }
    for (const key of actual) {
      if (!expected.has(key)) {
        const message = result.messages.find(
          (m) => `${m.line}:${m.ruleId}` === key,
        );
        problems.push(`  오탐  ${relative}:${key} — ${message?.message ?? ""}`);
      }
    }
  }

  const total = results.reduce((sum, r) => sum + r.messages.length, 0);
  if (problems.length === 0) {
    console.log(`✅ ${fixtureName}: 위반 ${total}건, 전부 예상과 일치`);
    return true;
  }
  console.log(`❌ ${fixtureName}: 불일치 ${problems.length}건`);
  problems.forEach((line) => console.log(line));
  return false;
}

const passed = ["layered"].map(verify);
if (passed.includes(false)) process.exitCode = 1;
