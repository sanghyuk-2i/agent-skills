import plugin from "./plugin.js";
import { layered } from "./presets/layered.js";

export { layered, plugin };

/**
 * "쏙쏙 들어오는 함수형 코딩" 원칙을 강제하는 ESLint 프리셋.
 *
 * ```js
 * // eslint.config.js
 * import fp from 'eslint-config-functional-frontend';
 * export default [...fp.layered({ src: 'src' })];
 * ```
 *
 * `src/features/<feature>/{data,domain,usecase,shell,ui}` 형태의 기능(feature) 단위
 * 폴더를 프로젝트에서 스캔해 계층 경계와 기능 간 격리 규칙을 함께 적용한다.
 */
export default { layered, plugin };
