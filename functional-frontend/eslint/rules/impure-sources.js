/**
 * 액션(부수효과)의 원천을 식별하는 공유 로직.
 *
 * "쏙쏙 들어오는 함수형 코딩"에서 액션은 "호출 시점·횟수에 따라 결과가 달라지는 것"이다.
 * 정적 분석으로 그걸 완벽히 판별할 수는 없지만, 프론트엔드에서 액션이 코드로
 * 드러나는 지점은 사실상 정해져 있다 — 브라우저 전역 객체, 시간, 난수, I/O.
 * 이 목록이 그 지점들이다.
 */

/**
 * 식별자 자체가 곧 액션인 전역들. `document`처럼 읽기만 해도
 * 그 함수는 실행 환경에 의존하게 되므로 계산이 아니다.
 */
export const IMPURE_GLOBALS = new Map([
  ["fetch", "네트워크 I/O"],
  ["XMLHttpRequest", "네트워크 I/O"],
  ["WebSocket", "네트워크 I/O"],
  ["EventSource", "네트워크 I/O"],
  ["localStorage", "영속 저장소 읽기/쓰기"],
  ["sessionStorage", "영속 저장소 읽기/쓰기"],
  ["indexedDB", "영속 저장소 읽기/쓰기"],
  ["document", "DOM 접근"],
  ["window", "전역 환경 접근"],
  ["navigator", "전역 환경 접근"],
  ["location", "전역 환경 접근"],
  ["history", "전역 환경 접근"],
  ["screen", "전역 환경 접근"],
  ["console", "출력 부수효과"],
  ["alert", "출력 부수효과"],
  ["confirm", "사용자 입력"],
  ["prompt", "사용자 입력"],
  ["setTimeout", "시간에 의존하는 스케줄링"],
  ["setInterval", "시간에 의존하는 스케줄링"],
  ["requestAnimationFrame", "시간에 의존하는 스케줄링"],
  ["queueMicrotask", "시간에 의존하는 스케줄링"],
  ["structuredClone", "환경 API"], // 사실상 순수하나 계층 밖 의존이라 명시적으로 허용받게 함
]);

/**
 * 객체 자체는 순수하지만 특정 프로퍼티만 액션인 것들.
 * `Math.floor`는 계산이고 `Math.random`은 액션이다 — 이 구분이 중요해서
 * 전역 단위가 아니라 멤버 단위로 관리한다.
 */
export const IMPURE_MEMBERS = new Map([
  ["Date.now", "현재 시각 — 호출 시점마다 값이 달라짐"],
  ["Math.random", "난수 — 호출마다 값이 달라짐"],
  ["crypto.randomUUID", "난수"],
  ["crypto.getRandomValues", "난수"],
  ["performance.now", "현재 시각"],
  ["process.env", "환경 변수 — 실행 환경에 의존"],
  ["process.argv", "실행 환경에 의존"],
  ["import.meta.env", "환경 변수 — 실행 환경에 의존"],
]);

/** `IMPURE_MEMBERS`의 객체 쪽 이름들. 이 이름의 전역만 멤버 검사를 하면 된다. */
const MEMBER_ROOTS = new Set(
  [...IMPURE_MEMBERS.keys()].map((key) => key.split(".")[0]),
);

/**
 * 참조가 실제로 전역 바인딩을 가리키는지 확인한다.
 * 지역 변수로 가려진(shadowed) 이름은 액션이 아니다 —
 * `const fetch = (url) => cache[url]` 같은 코드를 오탐하지 않기 위함.
 */
function isGlobalReference(reference) {
  // 해석되지 않은 참조 = 어디에도 선언되지 않음 = 전역
  if (reference.resolved === null) return true;
  // languageOptions.globals로 선언된 전역은 global scope에 변수로 존재하되 defs가 비어 있다
  return (
    reference.resolved.scope.type === "global" &&
    reference.resolved.defs.length === 0
  );
}

/**
 * 소스 전체에서 액션 원천에 대한 접근을 찾아 반환한다.
 *
 * @param {import('eslint').SourceCode} sourceCode
 * @param {Set<string>} allow 허용 목록 (`"console"`, `"console.warn"` 형태 모두 지원)
 * @returns {Array<{node: import('estree').Node, name: string, reason: string}>}
 */
export function findImpureAccesses(sourceCode, allow = new Set()) {
  const found = [];
  const globalScope = sourceCode.scopeManager.globalScope;
  if (!globalScope) return found;

  const references = [
    ...globalScope.through,
    ...globalScope.variables.flatMap((variable) => variable.references),
  ];

  for (const reference of references) {
    if (!isGlobalReference(reference)) continue;

    const node = reference.identifier;
    const name = node.name;

    if (MEMBER_ROOTS.has(name)) {
      const memberName = resolveMemberName(node, name);
      if (memberName === null) continue;
      const reason = IMPURE_MEMBERS.get(memberName);
      if (reason === undefined) continue;
      if (allow.has(memberName) || allow.has(name)) continue;
      found.push({ node: node.parent, name: memberName, reason });
      continue;
    }

    const reason = IMPURE_GLOBALS.get(name);
    if (reason === undefined) continue;
    if (allow.has(name)) continue;
    // `console.warn`처럼 멤버 단위로 허용된 경우를 존중한다
    const qualified = resolveMemberName(node, name);
    if (qualified !== null && allow.has(qualified)) continue;
    found.push({ node, name, reason });
  }

  // `import.meta.env`는 MetaProperty 노드라 스코프 참조로 잡히지 않는다.
  for (const node of findNodes(sourceCode.ast, "MetaProperty")) {
    const parent = node.parent;
    if (parent?.type !== "MemberExpression" || parent.computed) continue;
    if (parent.property.type !== "Identifier") continue;
    const memberName = `import.meta.${parent.property.name}`;
    const reason = IMPURE_MEMBERS.get(memberName);
    if (reason === undefined) continue;
    if (allow.has(memberName) || allow.has("import.meta")) continue;
    found.push({ node: parent, name: memberName, reason });
  }

  // 인자 없는 `new Date()`는 "지금"을 읽는 액션이다. `new Date(iso)`는 계산.
  for (const node of findNodes(sourceCode.ast, "NewExpression")) {
    if (node.callee.type !== "Identifier" || node.callee.name !== "Date") continue;
    if (node.arguments.length > 0) continue;
    if (allow.has("Date") || allow.has("new Date")) continue;
    found.push({
      node,
      name: "new Date()",
      reason: "현재 시각 — 호출 시점마다 값이 달라짐",
    });
  }

  return found;
}

/** `Math` 식별자 노드에서 `"Math.random"` 같은 정규화된 이름을 만든다. */
function resolveMemberName(node, rootName) {
  const parent = node.parent;
  if (parent?.type !== "MemberExpression" || parent.object !== node) return null;
  if (parent.computed) return null;
  if (parent.property.type !== "Identifier") return null;
  return `${rootName}.${parent.property.name}`;
}

/** AST를 순회하며 특정 타입의 노드를 모은다. `import.meta`처럼 참조로 안 잡히는 것 처리용. */
function findNodes(ast, type) {
  const result = [];
  const visit = (node) => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node.type !== "string") return;
    if (node.type === type) result.push(node);
    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      visit(node[key]);
    }
  };
  visit(ast);
  return result;
}

/** 주어진 노드가 액션 원천 접근인지 빠르게 판단한다 (no-action-calculation-mix용). */
export function collectImpureNodes(sourceCode, allow = new Set()) {
  return new Set(findImpureAccesses(sourceCode, allow).map((item) => item.node));
}
