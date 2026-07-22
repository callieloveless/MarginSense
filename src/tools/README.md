# `src/tools/` — AI-powered tools

The openable, focused, AI-powered workspaces that replace John's scattered chat tasks. See
[`constitution.md` §5](../../constitution.md) (the Tool system) and
[`techstack.md` §4](../../techstack.md) (the implementation contract).

**Every tool obeys the same three rules:**

1. **Tools suggest; they never silently write.** Anything that would change an estimate or
   a context fact is returned as a `Suggestion` (`pending`) and written to the suggestions
   queue. The estimate/context changes only when the user accepts.
2. **Tools share one context and one conversation.** A tool reads the whole project
   context on open and posts its results into the single project conversation, attributed
   to the tool.
3. **Auto-triggers still only suggest.** Code Finder auto-runs on photo upload, but its
   output is a suggestion, not a committed change.

**Uniform module shape** (per tool): `inputSchema` / `outputSchema` (Zod), `run(ctx)`,
returned `Suggestion[]`, a `tool_run` cost record, and — for Photo Advisor and Code
Finder — the licensed-professional / non-authoritative disclaimer.

v1 tools: [`material-finder/`](./material-finder), [`photo-advisor/`](./photo-advisor),
[`code-finder/`](./code-finder), [`client-estimate-doc/`](./client-estimate-doc).
