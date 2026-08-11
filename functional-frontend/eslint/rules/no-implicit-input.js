/**
 * 암묵적 입력을 금지한다 — 책의 "암묵적 인자를 드러내기" 리팩터링을 코드 레벨에서 유도.
 *
 * 계산의 정의는 "입력과 출력으로만 이루어진 것"이다. 함수가 자기 바깥의 가변 상태를
 * 읽으면, 그 상태는 시그니처에 드러나지 않는 **숨은 인자**가 된다. 같은 인자로 불러도
 * 다른 값이 나올 수 있으니 더 이상 계산이 아니다.
 *
 * 두 가지 형태를 잡는다.
 *  1. 모듈 스코프의 `let`/`var` — 파일 전체가 공유하는 숨은 상태
 *  2. 클로저로 가둔 가변 변수 읽기 — `const counter = () => ++n` 같은 형태
 *
 * `const`로 묶인 값은 보고하지 않는다. 진짜 상수는 재할당될 수 없으니
 * 언제 읽어도 같은 값이고, 따라서 암묵적 "입력"이 아니라 그냥 상수다.
 */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "계산 영역에서 모듈 스코프 가변 변수나 클로저 가변 상태를 읽는 것을 금지합니다.",
    },
    schema: [
      {
        type: "object",
        properties: {
          ignorePattern: {
            type: "string",
            description:
              "이 정규식에 맞는 변수명은 검사하지 않습니다. 예: `\"^_\"`",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      moduleScopeMutable:
        "모듈 스코프의 가변 변수 `{{name}}`은(는) 이 파일 모든 함수의 암묵적 입력입니다. `const`로 고정하거나, 이 상태를 필요로 하는 함수의 인자로 드러내세요.",
      closureMutable:
        "`{{name}}`은(는) 이 함수 바깥에서 선언된 가변 변수라 암묵적 입력입니다. 함수 인자로 명시적으로 받으면 같은 입력에 같은 출력이 보장됩니다.",
    },
  },

  create(context) {
    const options = context.options[0] ?? {};
    const ignore =
      options.ignorePattern === undefined
        ? null
        : new RegExp(options.ignorePattern, "u");

    /** 선언/참조를 감싸는 가장 가까운 함수(또는 모듈) 스코프를 찾는다. */
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

    const isMutableDeclaration = (variable) =>
      variable.defs.some(
        (def) =>
          def.type === "Variable" &&
          (def.parent.kind === "let" || def.parent.kind === "var"),
      );

    const visitScope = (scope) => {
      for (const variable of scope.variables) {
        if (ignore?.test(variable.name)) continue;
        if (!isMutableDeclaration(variable)) continue;

        const declaringFunction = enclosingFunction(scope);

        // 1. 모듈/전역 스코프의 가변 변수 — 선언 지점에서 한 번만 보고한다.
        //    참조마다 보고하면 같은 문제로 화면이 뒤덮여 정작 고칠 지점이 묻힌다.
        if (
          declaringFunction !== null &&
          (declaringFunction.type === "module" || declaringFunction.type === "global")
        ) {
          for (const def of variable.defs) {
            context.report({
              node: def.name,
              messageId: "moduleScopeMutable",
              data: { name: variable.name },
            });
          }
          continue;
        }

        // 2. 함수 안의 가변 변수는 그 함수 안에서만 쓰이면 문제없다.
        //    중첩 함수가 읽는 순간 클로저 상태 = 암묵적 입력이 된다.
        for (const reference of variable.references) {
          if (enclosingFunction(reference.from) === declaringFunction) continue;
          context.report({
            node: reference.identifier,
            messageId: "closureMutable",
            data: { name: variable.name },
          });
        }
      }

      scope.childScopes.forEach(visitScope);
    };

    return {
      "Program:exit"(node) {
        visitScope(context.sourceCode.getScope(node));
      },
    };
  },
};
