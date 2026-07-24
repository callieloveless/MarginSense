/**
 * Code Finder's public surface (add-code-finder): the tool, its schemas, and the suggestion helpers
 * (exported so the compose edge's mapper and the tests read the same rules the tool applies).
 */

export * from "./schema";
export * from "./suggestions";
export { codeFinderTool } from "./code-finder";
