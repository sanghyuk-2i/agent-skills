import { findImpureAccesses } from "./impure-sources.js";

/**
 * 계산(순수) 영역에서 액션 원천에 접근하는 것을 금지한다.
 *
 * 이 규칙이 `no-restricted-globals`로 대체되지 않는 이유는 두 가지다.
 * 첫째, `Math.floor`는 되고 `Math.random`은 안 되는 식의 멤버 단위 구분이 필요하다.
 * 둘째, 그리고 더 중요하게, 위반 메시지가 "무엇이 금지됐다"가 아니라
 * "이건 액션이니 계층을 옮기거나 인자로 주입하라"는 **다음 행동**을 말해줘야 한다.
 * 이 규칙은 사람과 코딩 에이전트 양쪽에게 책의 원칙을 가르치는 주된 통로다.
 */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "계산 영역에서 시간·난수·I/O·전역 환경 등 액션 원천에 접근하는 것을 금지합니다.",
    },
    schema: [
      {
        type: "object",
        properties: {
          allow: {
            type: "array",
            items: { type: "string" },
            description:
              '허용할 이름. `"console"`처럼 전역 단위, `"console.warn"`처럼 멤버 단위 모두 지원합니다.',
          },
          actionLayer: {
            type: "string",
            description:
              '위반 메시지에 안내할 액션 계층의 이름. 예: `"shell/"` 또는 `"features/cart/shell/"`',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      impure:
        "`{{name}}`은(는) 액션입니다 ({{reason}}). 이 파일은 계산 영역이라 순수해야 합니다. 이 값을 함수 인자로 주입받거나, 이 로직을 {{actionLayer}}(으)로 옮기세요.",
    },
  },

  create(context) {
    const options = context.options[0] ?? {};
    const allow = new Set(options.allow ?? []);
    const actionLayer = options.actionLayer ?? "액션 계층";

    return {
      "Program:exit"() {
        const sourceCode = context.sourceCode;
        for (const { node, name, reason } of findImpureAccesses(sourceCode, allow)) {
          context.report({
            node,
            messageId: "impure",
            data: { name, reason, actionLayer },
          });
        }
      },
    };
  },
};
