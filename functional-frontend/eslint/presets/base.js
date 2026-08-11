import functional from "eslint-plugin-functional";
import plugin from "../plugin.js";

/**
 * `layered` 프리셋의 각 계층(zone)이 공유하는 규칙.
 *
 * 경계를 어디에 **긋는지**(디렉터리 glob)는 계층마다 다르고, 경계 안에서 무엇을
 * **금지**하는지는 같다. 그 공통 부분을 여기 모아두면 규칙을 한 곳에서만 고치면 된다.
 */

/** `strict: false`면 모든 error를 warn으로 낮춘다 — 기존 코드베이스에 즉시 얹기 위함. */
export const severity = (strict) => (strict ? "error" : "warn");

/**
 * 계산 영역(순수해야 하는 파일)에 적용할 규칙.
 *
 * @param {object} params
 * @param {boolean} params.strict
 * @param {string} params.actionLayer 위반 메시지에서 "여기로 옮기세요"라고 안내할 대상
 * @param {string[]} params.allow 액션이지만 허용할 것
 * @param {boolean} params.typeAware 타입 정보가 필요한 규칙까지 켤지
 */
export function calculationRules({
  strict,
  actionLayer,
  allow = [],
  typeAware = false,
}) {
  const level = severity(strict);

  return {
    // ── 액션/계산 분리 ────────────────────────────────────────────────
    "functional-frontend/no-impure-in-calculation": [
      level,
      { allow, actionLayer },
    ],
    "functional-frontend/no-implicit-input": level,

    // ── 카피-온-라이트 ────────────────────────────────────────────────
    // 원본을 바꾸지 말고 복사본을 바꾼다. 이걸 어기면 계산이 조용히 액션이 된다.
    //
    // `functional/immutable-data`가 아니라 자체 규칙을 기본값으로 쓰는 이유:
    // 그 규칙은 `a.push(x)`를 볼 때 `a`가 배열인지 알아야 해서 타입 정보를 요구하고,
    // 없으면 보고를 거르는 게 아니라 **린트 실행 자체를 크래시시킨다**.
    // 타입 인식 린팅을 전제로 깔면 이 프리셋을 켜는 비용이 너무 커진다.
    "functional-frontend/prefer-copy-on-write": level,
    "no-param-reassign": [level, { props: true }],

    // ── 암묵적 입력을 만들 여지 차단 ──────────────────────────────────
    "prefer-const": level,
    "no-var": level,

    // ── 데이터 지향 ───────────────────────────────────────────────────
    // 계산 영역의 데이터는 클래스가 아니라 평범한 객체/배열이어야 한다.
    // 메서드가 데이터에 붙는 순간 "이 데이터를 다루는 방법"이 한 군데로 고정되고,
    // 함수형 도구로 자유롭게 변환할 수 없게 된다.
    "functional/no-classes": level,
    "functional/no-this-expressions": level,

    // ── 함수형 도구 ───────────────────────────────────────────────────
    // for/while은 순회 방식(인덱스)과 목적(변환·거르기·모으기)을 뒤섞는다.
    // map/filter/reduce는 목적이 이름에 드러나므로 읽는 사람이 본문을 안 읽어도 된다.
    // 다만 성능상 루프가 나은 경우가 실제로 있어 항상 warn으로 둔다.
    "functional/no-loop-statements": "warn",

    // 타입 정보를 요구하는 규칙들. tsconfig 연결(`projectService`)이 필요하고
    // 몇 배 느려지지만, 그만큼 깊은 불변성까지 잡아준다. opt-in.
    ...(typeAware
      ? {
          "functional/immutable-data": [
            level,
            { ignoreClasses: false, ignoreImmediateMutation: true },
          ],
          "functional/prefer-immutable-types": [
            level,
            { enforcement: "ReadonlyShallow", ignoreInferredTypes: true },
          ],
        }
      : {}),
  };
}

/** 액션 영역(부수효과가 허용되는 파일)에 적용할 규칙. */
export function actionRules({ strict, threshold = 3 }) {
  const level = severity(strict);

  return {
    // 액션 안에 계산이 섞여 있으면 추출하라고 알린다.
    // 판정이 아니라 신호가 목적이므로 strict 여부와 무관하게 항상 warn.
    "functional-frontend/no-action-calculation-mix": ["warn", { threshold }],

    // 액션이라고 해서 데이터를 마음대로 바꿔도 되는 건 아니다.
    // 인자로 받은 객체를 고치면 호출자가 모르는 사이에 상태가 바뀐다.
    "no-param-reassign": [level, { props: true }],
    "prefer-const": level,
    "no-var": level,
  };
}

/** 데이터 영역(타입·상수만 있어야 하는 파일)에 적용할 규칙. */
export function dataRules({ strict }) {
  const level = severity(strict);

  return {
    "functional-frontend/no-impure-in-calculation": [
      level,
      { actionLayer: "액션 계층" },
    ],
    "functional-frontend/no-implicit-input": level,
    "functional-frontend/prefer-copy-on-write": level,
    "functional/no-classes": level,
    "no-var": level,
    "prefer-const": level,
  };
}

/** 모든 프리셋이 등록해야 하는 플러그인들. */
export const plugins = {
  "functional-frontend": plugin,
  functional,
};
