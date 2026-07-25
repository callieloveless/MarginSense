# Critique lenses — MarginSense

derived: 2026-07-25 · from: CLAUDE.md, constitution.md, techstack.md, PROGRESS.md, relevant_notes.md, UI prototype
updated: 2026-07-25 · round-3 proposal critique added the derived-values rule below

## What this is
A phone-first business OS for trade contractors (GCs first). Load-bearing promise: for every
job, an honest, traceable answer to "is this estimate worth the crew hours it eats?" —
profit-per-hour vs a derived target, shown red/yellow/green. The user is on a ladder with
dirty hands and one bar of signal; trust in the numbers is the entire product.

## Project lenses (meta-questions)
- **Money math**: does any number bypass `src/engine/`? Is anything stored derived, floated, or hardcoded (e.g. a target that must be derived from goals)? Do worked examples reconcile to the cent?
- **Signal honesty**: could this color mislead? Is a signal ever degenerate/uninformative (uniform by construction), unexplainable, or shown without text + drill-down to inputs?
- **Tenant isolation**: does new data carry `business_id` + RLS in the same migration + an isolation test? Any path that trusts a client-supplied business id? Objects (Storage) covered, not just rows?
- **Tools suggest, users confirm**: does any AI output mutate an estimate/context without an explicit accept? Does a tool smuggle a price it shouldn't set?
- **Client boundary**: can any internal figure (cost, margin, hours, EPH, signal) reach a client-facing artifact? Is the schema structurally incapable of it, or just polite?
- **Job-site reality**: does the flow work one-handed at phone width with chips/defaults over typing? What happens on one bar of signal? Is heavy setup front-loaded instead of just-in-time?
- **Trust voice**: is a red verdict paired with a constructive next step? Is language plain (never "EPH") and encouraging, never shaming?
- **AI honesty & liability**: sourced or dropped (no unsourced price/code)? Licensed-professional disclaimer where physical-work/code advice appears? Cost observability per run?
- **Module boundaries**: engine pure (no framework/DB/AI imports); estimate/profit/tools separate, meeting only through engine types; UI as server-first with minimal client islands?
- **Process**: is the change specced (OpenSpec) before built, and does it conflict with the constitution anywhere without an explicit amendment?

## Hard rules (violations are findings, always)
- Store inputs only — never persist a derived/solved value (recompute via the engine every render); watch for "seed"/"snapshot" wording that quietly persists a computation.
- Money = integer cents; time = integer minutes; percentages = basis points. No floats for money.
- All financial math in pure `src/engine/`; UI/DB never re-derive.
- Every business-owned row: non-null `business_id`, RLS on, forward-only migrations.
- Tools have no write path to estimates/context; accept is the only commit.
- Every displayed number traceable; colors always paired with text.
- Client documents are prices-only; internal figures unrepresentable.
