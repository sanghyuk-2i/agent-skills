import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import importX, { createNodeResolver } from "eslint-plugin-import-x";
import {
  actionRules,
  calculationRules,
  dataRules,
  plugins,
  severity,
} from "./base.js";

/** `${src}/features` 아래의 최상위 디렉터리 이름만 골라 기능(feature) 목록으로 삼는다. */
function listFeatures(src) {
  const dir = path.join(src, "features");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/**
 * 기능(feature) 기반 경계 — Feature-Sliced Design 계열의 요즘 프론트엔드 구조에
 * "쏙쏙 들어오는 함수형 코딩"의 액션/계산/데이터 계층을 얹은 것.
 *
 *   src/
 *   ├─ app/            앱 진입점 · 라우팅 · 전역 프로바이더. 아무도 이걸 import 하지 않는다
 *   ├─ shared/          기능을 몰라도 되는 재사용 코드
 *   │  ├─ data/         공통 타입 · 상수
 *   │  ├─ domain/       공통 계산
 *   │  ├─ shell/        공통 액션 (범용 http 클라이언트 등)
 *   │  └─ ui/           공통 컴포넌트
 *   └─ features/
 *      └─ <feature>/    화면 하나가 필요로 하는 모든 것
 *         ├─ data/      타입 · 상수. 아무것도 import 하지 않는 가장 안쪽
 *         ├─ domain/    계산만. data/만 참조
 *         ├─ usecase/   계산 조합 + 얇은 액션. domain/을 오케스트레이션
 *         ├─ shell/     액션 전용. fetch · storage · Date · 라우터
 *         ├─ ui/        React 컴포넌트. usecase/를 통해서만 세상과 만난다
 *         └─ index.ts   이 기능이 다른 기능에 공개하는 것 (공개 API)
 *
 * 규칙은 두 방향으로 import를 막는다.
 *
 * 1. **계층 경계** — 기능 안에서도, `shared/` 안에서도 import는 안쪽(data)으로만 흐른다.
 *    `ui/`가 `shell/`을 직접 부르지 못하게 막는 것이 책에서 말하는 **추상화 벽**이다.
 * 2. **기능 격리** — 한 기능은 다른 기능의 내부(`data/`·`domain/`·...)를 직접 볼 수 없고,
 *    그 기능의 `index.ts`가 공개한 것만 쓸 수 있다. 기능끼리 내부를 직접 참조하기
 *    시작하면 기능 폴더는 이름만 남고 사실상 하나의 거대한 계층이 된다.
 *
 * 기능 목록은 파일 목록을 정적으로 나열하지 않고 `${src}/features`를 스캔해서 얻는다 —
 * 기능이 늘어나도 설정을 고칠 필요가 없다. `${src}/features`가 아직 없는 초기 프로젝트에서는
 * 기능 격리 규칙 없이 `shared/`·`app/` 경계만 적용된다.
 *
 * @param {object} [options]
 * @param {string} [options.src="src"] 소스 루트
 * @param {boolean} [options.strict=true] false면 모든 error를 warn으로
 * @param {string[]} [options.allow=[]] 계산 영역에서 예외로 허용할 액션 (예: ["console.warn"])
 * @param {boolean} [options.typeAware=false] 타입 정보가 필요한 규칙까지 켤지
 * @returns {import('eslint').Linter.Config[]}
 */
export function layered(options = {}) {
  const {
    src = "src",
    strict = true,
    allow = [],
    typeAware = false,
  } = options;

  const code = "**/*.{js,jsx,ts,tsx,mjs,cjs}";
  const zone = (...segments) => `${src}/${segments.join("/")}/${code}`;
  const level = severity(strict);
  const features = listFeatures(src);

  // ── 기능 안쪽 계층 경계 + 기능 간 격리 ────────────────────────────────
  const featureZones = features.flatMap((feature) => {
    const base = `./${src}/features/${feature}`;
    const others = features
      .filter((other) => other !== feature)
      .map((other) => `./${src}/features/${other}`);

    return [
      {
        target: `${base}/data`,
        from: [`${base}/domain`, `${base}/usecase`, `${base}/shell`, `${base}/ui`],
        message:
          "data/는 사실의 기록일 뿐이라 아무것도 참조하지 않습니다. 가장 안쪽 계층을 유지하세요.",
      },
      {
        target: `${base}/domain`,
        from: [`${base}/usecase`, `${base}/shell`, `${base}/ui`],
        message:
          "domain/은 계산만 있는 순수 계층입니다. 필요한 값은 import가 아니라 함수 인자로 받으세요.",
      },
      {
        target: `${base}/usecase`,
        from: [`${base}/ui`],
        message:
          "usecase/는 화면을 몰라야 재사용됩니다. UI 쪽 값이 필요하면 인자로 받으세요.",
      },
      {
        target: `${base}/ui`,
        from: [`${base}/shell`],
        message:
          "추상화 벽: 컴포넌트가 fetch·storage 구현을 직접 알면 구현을 바꿀 때마다 화면 코드가 함께 바뀝니다. usecase/를 통해 호출하세요.",
      },
      // 기능 격리: 다른 기능은 이 기능의 index.ts가 공개한 것만 볼 수 있다
      ...(others.length > 0
        ? [
            {
              target: others,
              from: [
                `${base}/data`,
                `${base}/domain`,
                `${base}/usecase`,
                `${base}/shell`,
                `${base}/ui`,
              ],
              message: `기능(feature)은 다른 기능의 내부를 직접 참조할 수 없습니다. features/${feature}/index.ts가 공개한 것만 사용하세요.`,
            },
          ]
        : []),
    ];
  });

  return [
    // ── 계층 경계: import는 안쪽으로만 흐른다 ──────────────────────────
    {
      name: "functional-frontend/layered/boundaries",
      files: [`${src}/**/*.{js,jsx,ts,tsx,mjs,cjs}`],
      plugins: { "import-x": importX },
      // 계층 규칙은 import 경로를 실제 파일로 해석할 수 있어야 동작한다.
      // 해석에 실패하면 경고 없이 조용히 넘어가므로 — 규칙이 켜져 있는데 아무것도
      // 안 잡히는 최악의 상태가 된다 — TS 확장자를 기본으로 깔아둔다.
      // tsconfig paths 별칭을 쓴다면 이 설정 뒤에 자신의 resolver를 얹어 덮어쓰면 된다.
      settings: {
        "import-x/resolver-next": [
          createNodeResolver({
            extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
          }),
        ],
      },
      rules: {
        "import-x/no-restricted-paths": [
          level,
          {
            zones: [
              ...featureZones,

              // shared/ 내부도 같은 어니언을 따른다
              {
                target: `./${src}/shared/data`,
                from: [`./${src}/shared/domain`, `./${src}/shared/shell`, `./${src}/shared/ui`],
                message:
                  "shared/data/는 사실의 기록일 뿐이라 아무것도 참조하지 않습니다.",
              },
              {
                target: `./${src}/shared/domain`,
                from: [`./${src}/shared/shell`, `./${src}/shared/ui`],
                message:
                  "shared/domain/은 계산만 있는 순수 계층입니다. 필요한 값은 인자로 받으세요.",
              },
              {
                target: `./${src}/shared/ui`,
                from: [`./${src}/shared/shell`],
                message:
                  "추상화 벽: shared/ui/는 shared/shell/을 직접 알 수 없습니다.",
              },

              // app/은 진입점이다 — 어디에서도 참조되지 않는다
              {
                target: [`./${src}/features`, `./${src}/shared`],
                from: [`./${src}/app`],
                message:
                  "app/은 앱의 진입점입니다. features/나 shared/에서 참조하지 마세요.",
              },
            ],
          },
        ],
      },
    },

    // ── 기능별 계층 규칙 ──────────────────────────────────────────────
    ...features.flatMap((feature) => [
      {
        name: `functional-frontend/layered/features/${feature}/data`,
        files: [zone("features", feature, "data")],
        plugins,
        rules: dataRules({ strict }),
      },
      {
        name: `functional-frontend/layered/features/${feature}/domain`,
        files: [zone("features", feature, "domain")],
        plugins,
        rules: calculationRules({
          strict,
          allow,
          typeAware,
          actionLayer: `${src}/features/${feature}/shell/`,
        }),
      },
      {
        name: `functional-frontend/layered/features/${feature}/usecase`,
        files: [zone("features", feature, "usecase")],
        plugins,
        rules: {
          ...actionRules({ strict }),
          // usecase는 액션을 다루지만 그 자신이 시간·난수·I/O의 **원천**이어서는 안 된다.
          // 그런 것은 shell/에서 주입받아야 usecase를 테스트할 수 있다.
          "functional-frontend/no-impure-in-calculation": [
            level,
            { allow, actionLayer: `${src}/features/${feature}/shell/` },
          ],
        },
      },
      {
        name: `functional-frontend/layered/features/${feature}/shell`,
        files: [zone("features", feature, "shell")],
        plugins,
        rules: actionRules({ strict }),
      },
      {
        name: `functional-frontend/layered/features/${feature}/ui`,
        files: [zone("features", feature, "ui")],
        plugins,
        rules: {
          ...actionRules({ strict }),
          // 컴포넌트는 이벤트 핸들러 안에서 액션을 부르는 곳이라 섞임이 잦다.
          // 임계치를 조금 높여 정말 계산이 쌓인 경우만 알린다.
          "functional-frontend/no-action-calculation-mix": ["warn", { threshold: 5 }],
        },
      },
    ]),

    // ── shared/ 규칙 ──────────────────────────────────────────────────
    {
      name: "functional-frontend/layered/shared/data",
      files: [zone("shared", "data")],
      plugins,
      rules: dataRules({ strict }),
    },
    {
      name: "functional-frontend/layered/shared/domain",
      files: [zone("shared", "domain")],
      plugins,
      rules: calculationRules({
        strict,
        allow,
        typeAware,
        actionLayer: `${src}/shared/shell/`,
      }),
    },
    {
      name: "functional-frontend/layered/shared/shell",
      files: [zone("shared", "shell")],
      plugins,
      rules: actionRules({ strict }),
    },
    {
      name: "functional-frontend/layered/shared/ui",
      files: [zone("shared", "ui")],
      plugins,
      rules: {
        ...actionRules({ strict }),
        "functional-frontend/no-action-calculation-mix": ["warn", { threshold: 5 }],
      },
    },
  ];
}

export default layered;
