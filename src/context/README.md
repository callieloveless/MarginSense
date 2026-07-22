# `src/context/` — shared project context ("one job, one memory")

Read/write access to a project's shared context and the suggestions queue. See
[`constitution.md` §4](../../constitution.md).

Every project has one shared context that all tools read from and write to:

1. **Context entries** — typed facts: `finding`, `material`, `code_ref`, `photo`, `fact`.
2. **Conversation** — a **single** thread all tools contribute to and read from.
3. **Suggestions** — the queue of proposed changes awaiting user confirmation.

Context flows one way into estimates by default: creating an estimate seeds cost/hour
data; tools only *suggest* line items or facts, and the estimate is mutated only when the
user accepts a suggestion.
