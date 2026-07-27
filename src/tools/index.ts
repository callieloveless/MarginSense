/**
 * The tool platform (constitution §5; techstack §4). Public surface for the uniform tool
 * contract, the registry, the runner (read-only snapshot in; de-duplicated pending
 * suggestions + a linked conversation post out), and the reference tool. Tools read a
 * read-only snapshot and emit only suggestions — the accept-to-commit guarantee is structural
 * here and holds across composed tools (§5 "Composing tools").
 */

export * from "./contract";
export * from "./runner";
export * from "./triggers";
export * from "./registry";
export * from "./disclaimer";
export { referenceTool } from "./reference";
export {
  photoAdvisorTool,
  IMPLAUSIBLE_LABOR_MINUTES,
  MAX_ADVISOR_IMAGES,
  type PhotoAdvisorInput,
  type PhotoAdvisorOutput,
  type VisionFinding,
  type VisionLabor,
  type VisionResult,
} from "./photo-advisor";
export {
  codeFinderTool,
  MAX_CODE_RESULTS,
  type CodeFinderInput,
  type CodeFinderOutput,
  type CodeResult,
  type CodeResultItem,
} from "./code-finder";
export {
  clientEstimateDocTool,
  type ClientEstimateDocInput,
  type ClientEstimateDocOutput,
} from "./client-estimate-doc";
export {
  materialFinderTool,
  manualMaterialSchema,
  manualMaterialSuggestions,
  type ManualMaterial,
  type MaterialFinderInput,
  type MaterialFinderMode,
  type MaterialFinderOutput,
} from "./material-finder";
