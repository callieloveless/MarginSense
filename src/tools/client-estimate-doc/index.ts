/**
 * Client Estimate Doc's public surface (add-client-estimate-doc): the tool and its schemas. The
 * pure estimate → document projection lives in `src/estimate/` (the money math); this tool wraps it
 * with the optional AI scope narrative and returns the finished document as its output.
 */

export * from "./schema";
export { clientEstimateDocTool } from "./client-estimate-doc";
