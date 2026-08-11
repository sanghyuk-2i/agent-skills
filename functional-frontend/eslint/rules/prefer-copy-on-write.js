/**
 * 카피-온-라이트를 강제한다 — "원본은 두고, 복사해서 바꾼다".
 *
 * 왜 `functional/immutable-data`로 충분하지 않은가:
 * 그 규칙은 `a.push(x)` 같은 **메서드 호출**을 검사할 때 `a`가 배열인지 알아야 해서
 * 타입 정보를 요구하고, 없으면 크래시한다. 타입 인식 린팅은 tsconfig를 요구하고
 * 몇 배 느려서, 그걸 전제로 깔면 이 프리셋을 켜는 비용이 너무 커진다.
 * 그래서 메서드 이름만 보고 판단하는 이 규칙을 기본값으로 쓴다.
 * (`typeAware: true`를 주면 `functional/immutable-data`가 추가로 켜진다.)
 *
 * 이름만 보므로 `.push()` 메서드를 가진 커스텀 객체를 오탐할 수 있다. 다만 계산 영역은
 * `functional/no-classes`로 클래스가 이미 막혀 있어 실제로 마주칠 일이 드물다.
 *
 * 방금 만든 복사본을 바꾸는 것은 허용한다 — `[...items].sort()`는 원본을 건드리지
 * 않으므로 계산이다. 책에서 말하는 "얕은 복사 후 변경"이 바로 이 패턴이다.
 */

/** 원본을 제자리에서 바꾸는 배열 메서드들. */
const ARRAY_MUTATORS = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
]);

/** Map/Set의 변경 메서드. 이름 충돌(`headers.set` 등)이 잦아 기본값은 off. */
const COLLECTION_MUTATORS = new Set(["set", "add", "clear", "delete"]);

/** 호출하면 새 값을 돌려주는 메서드들 — 이 결과를 바꾸는 건 원본에 영향이 없다. */
const COPYING_METHODS = new Set([
  "slice",
  "map",
  "filter",
  "concat",
  "flat",
  "flatMap",
  "toSorted",
  "toReversed",
  "toSpliced",
  "with",
  "split",
  "assign",
  "from",
  "of",
  "entries",
  "keys",
  "values",
]);

const COPYING_CALLEES = new Set(["structuredClone", "Array", "Object"]);

export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "원본 데이터를 제자리에서 변경하는 것을 금지하고 복사 후 변경(카피-온-라이트)을 요구합니다.",
    },
    schema: [
      {
        type: "object",
        properties: {
          checkCollections: {
            type: "boolean",
            description:
              "Map/Set의 set·add·delete·clear까지 검사할지. 이름 충돌이 잦아 기본 false.",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      mutation:
        "`{{method}}`는 원본을 제자리에서 바꿉니다. 원본은 두고 복사본을 바꾸세요 — 예: `[...{{receiver}}].{{method}}(…)` 또는 `{{receiver}}.filter(…)` 같은 새 값을 돌려주는 함수.",
    },
  },

  create(context) {
    const options = context.options[0] ?? {};
    const mutators = options.checkCollections
      ? new Set([...ARRAY_MUTATORS, ...COLLECTION_MUTATORS])
      : ARRAY_MUTATORS;

    const sourceCode = context.sourceCode;

    /** 이 표현식이 "방금 만들어진 값"인가? 그렇다면 바꿔도 원본에 영향이 없다. */
    const isFreshValue = (node) => {
      if (node === null || node === undefined) return false;

      switch (node.type) {
        case "ArrayExpression":
        case "ObjectExpression":
        case "NewExpression":
          return true;
        case "CallExpression": {
          const callee = node.callee;
          if (callee.type === "Identifier") {
            return COPYING_CALLEES.has(callee.name);
          }
          if (callee.type === "MemberExpression" && !callee.computed) {
            return (
              callee.property.type === "Identifier" &&
              COPYING_METHODS.has(callee.property.name)
            );
          }
          return false;
        }
        // `x as Foo`, `x!` 같은 TS 래퍼는 벗겨내고 본다
        case "TSAsExpression":
        case "TSNonNullExpression":
        case "TSSatisfiesExpression":
          return isFreshValue(node.expression);
        default:
          return false;
      }
    };

    /** 선언/참조를 감싸는 가장 가까운 함수 스코프. */
    const enclosingFunction = (scope) => {
      let current = scope;
      while (
        current !== null &&
        current.type !== "function" &&
        current.type !== "module" &&
        current.type !== "global"
      ) {
        current = current.upper;
      }
      return current;
    };

    /**
     * 이 수신자를 이 함수가 "소유"하고 있는가?
     * 같은 함수 안에서 복사본으로 만들어 아직 아무에게도 넘기지 않은 값만 소유로 본다.
     * 인자로 받은 것은 호출자의 것이므로 절대 소유가 아니다.
     */
    const isLocallyOwned = (node, referenceScope) => {
      if (isFreshValue(node)) return true;
      if (node.type !== "Identifier") return false;

      const resolved = resolveVariable(referenceScope, node.name);
      if (resolved === null) return false;
      if (resolved.defs.length !== 1) return false;

      const def = resolved.defs[0];
      // 파라미터는 호출자의 데이터다
      if (def.type !== "Variable") return false;
      if (!isFreshValue(def.node.init)) return false;

      // 바깥 함수에서 만들어진 값이면 다른 곳에서도 볼 수 있으므로 소유가 아니다
      return (
        enclosingFunction(resolved.scope) === enclosingFunction(referenceScope)
      );
    };

    const resolveVariable = (scope, name) => {
      let current = scope;
      while (current !== null) {
        const found = current.variables.find((v) => v.name === name);
        if (found !== undefined) return found;
        current = current.upper;
      }
      return null;
    };

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || callee.computed) return;
        if (callee.property.type !== "Identifier") return;

        const method = callee.property.name;
        if (!mutators.has(method)) return;

        const scope = sourceCode.getScope(node);
        if (isLocallyOwned(callee.object, scope)) return;

        // 수신자 표현식이 길면 메시지가 읽히지 않는다
        const receiver = sourceCode.getText(callee.object);

        context.report({
          node,
          messageId: "mutation",
          data: {
            method,
            receiver: receiver.length > 30 ? "원본" : receiver,
          },
        });
      },
    };
  },
};
