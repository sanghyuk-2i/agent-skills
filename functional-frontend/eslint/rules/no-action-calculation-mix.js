import { collectImpureNodes } from "./impure-sources.js";

/**
 * 액션 영역에서 액션과 계산이 한 함수에 뒤엉킨 지점을 찾는다.
 *
 * 책의 핵심 리팩터링은 "액션에서 계산 빼내기"다. 액션 자체는 없앨 수 없지만,
 * 액션 안에 섞인 계산은 밖으로 꺼낼 수 있고 그러면 그 부분은 테스트·재사용이 가능해진다.
 *
 * 정적 분석으로 "이건 계산이다"를 정확히 판별할 수는 없다. 그래서 이 규칙은
 * 판정이 아니라 **신호**를 목표로 한다 — 부수효과가 있는 함수에 계산 성격의 구문이
 * 임계치 이상 쌓이면 알린다. 오탐 비용이 낮아야 하므로 프리셋에서 항상 `warn`으로 켠다.
 */
export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "부수효과와 계산 로직이 한 함수에 섞여 있을 때 계산 추출을 제안합니다.",
    },
    schema: [
      {
        type: "object",
        properties: {
          threshold: {
            type: "integer",
            minimum: 1,
            description:
              "이만큼의 순수 구문이 부수효과와 함께 있으면 보고합니다. 기본 3.",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      mixed:
        "이 함수는 부수효과와 계산 로직 {{count}}줄이 섞여 있습니다. 계산 부분을 순수 함수로 추출하면 그 부분만 따로 테스트하고 재사용할 수 있습니다.",
    },
  },

  create(context) {
    const options = context.options[0] ?? {};
    const threshold = options.threshold ?? 3;
    const sourceCode = context.sourceCode;

    /** 해당 노드 아래에 액션 원천 접근이 있는지 */
    const containsImpure = (node, impureNodes) => {
      let hit = false;
      const visit = (current) => {
        if (hit || current === null || typeof current !== "object") return;
        if (Array.isArray(current)) {
          current.forEach(visit);
          return;
        }
        if (typeof current.type !== "string") return;
        if (impureNodes.has(current)) {
          hit = true;
          return;
        }
        if (current.type === "AwaitExpression") {
          hit = true;
          return;
        }
        for (const key of Object.keys(current)) {
          if (key === "parent") continue;
          visit(current[key]);
        }
      };
      visit(node);
      return hit;
    };

    /**
     * 중첩 함수 본문은 별도 함수로 따로 검사되므로 여기서는 건너뛴다.
     * 그래야 바깥 함수가 안쪽 함수의 구문까지 자기 것으로 세지 않는다.
     */
    const ownStatements = (body) =>
      body.type === "BlockStatement" ? body.body : [];

    // 파일 전체를 한 번만 훑는다. 함수마다 다시 수집하면 큰 파일에서 비용이 제곱으로 는다.
    let cachedImpureNodes = null;
    const getImpureNodes = () =>
      (cachedImpureNodes ??= collectImpureNodes(sourceCode));

    const check = (node) => {
      const impureNodes = getImpureNodes();
      const statements = ownStatements(node.body);
      if (statements.length === 0) return;

      let impureCount = 0;
      let pureCount = 0;

      for (const statement of statements) {
        if (containsImpure(statement, impureNodes)) {
          impureCount += 1;
          continue;
        }
        // 함수 선언문은 계산 추출이 이미 된 상태라 "섞임"의 근거가 아니다
        if (
          statement.type === "FunctionDeclaration" ||
          statement.type === "ReturnStatement"
        ) {
          continue;
        }
        pureCount += 1;
      }

      if (impureCount === 0 || pureCount < threshold) return;

      // 본문 전체가 아니라 시그니처 부분만 표시한다 — 긴 함수에서 화면이 통째로
      // 붉어지면 정작 어느 함수가 문제인지 눈에 안 들어온다.
      context.report({
        node,
        loc: { start: node.loc.start, end: node.body.loc.start },
        messageId: "mixed",
        data: { count: String(pureCount) },
      });
    };

    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    };
  },
};
