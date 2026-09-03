# Jaquelene

- This is greenfield. Prefer clean current designs over compatibility layers. Change contracts and persisted formats directly; call out required data resets.
- If a rule conflicts with the task, stop, state the conflict, and get explicit user approval before breaking it.

## Code

- Treat performance, correctness, and maintainability as hard constraints. Avoid unnecessary or unbounded work. Measure non-obvious trade-offs.
- Fix root causes. Do not ship workarounds, silent fallbacks, or competing sources of truth.
- Every state needs a way in, a way out, and a way to inspect it. Close requires reopen. Irreversibility requires an explicit product decision.
- Keep complexity at adapter boundaries. Domain logic and orchestration stay transport- and framework-agnostic; UI renders state and emits intent.
- Do not use ternary expressions. Prefer explicit control flow or state-specific functions.

## Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect APIs and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.

## Effect

- This repository uses Effect 4. Before writing or reviewing Effect code, read `node_modules/effect/AGENTS.md` completely and follow the relevant links. Search `node_modules/effect/src` when the guide does not cover an API or concept; do not rely on Effect 3 examples or compatibility patterns.
- Use Effect for backend application and infrastructure concerns that benefit from explicit dependencies, typed operational failures, asynchronous composition, concurrency, cancellation, or managed lifetimes. Prefer focused `Context.Service` and `Layer` definitions, `Effect.fn` for effectful functions, and `Schema.TaggedError` for expected operational failures.
- Keep deterministic transformations as plain TypeScript. Keep synchronous SQLite transactions on their direct path unless an Effect abstraction adds real composition or lifecycle value.
- Keep framework boundaries plain: IPC and UI contracts use serializable values, and adapters consume the backend through its TypeScript facade. Run Effects through the shared application runtime at those boundaries; do not scatter `Effect.run*` calls or create catch-all Effect helper modules.
- `@jaquelene/domain` remains the source of truth for its existing Zod-backed public schemas. Do not duplicate those schemas in Effect Schema as part of unrelated work; changing the domain schema system requires a deliberate repository-wide decision.

## Frontend

- Do not add `title` attributes to elements.
- `cursor-pointer` is forbidden.

## UI

- Keep the interface calm and deliberate. Use clear hierarchy, typography, spacing, and alignment; keep color, borders, shadows, and motion restrained.
- Use the same components and behavior for similar actions.
- Make action priority obvious. Keep secondary actions visually subordinate and reveal advanced controls on demand.
- Make the interface feel instant. Give every action immediate feedback, and keep background work from blocking unrelated interaction.
- Keep layouts stable across loading, validation, hover, focus, and label changes. Preserve scroll position when async content appears.
- Keep interface text concise, short and useful. Use it to label actions, clarify consequences, report errors, or explain recovery.
- Do not narrate what the interface already communicates.
- Do not add a step, container, confirmation, modal, toast, or motion unless it clarifies hierarchy, collects required input, communicates otherwise hidden state, or prevents a meaningful mistake.

## Git

- Use plain-language Conventional Commit subjects and pull request titles.
- Keep each commit to one coherent change.
- In commit bodies, state the problem in one or two sentences, then explain the fix.
- Open every pull request description with a short, plain-language value pitch: in one or two sentences, explain what the change makes possible and why it matters. Keep implementation details out of the pitch.
- Pull requests are squash-merged. Once a pull request is open, do not amend commits, rewrite branch history, or force-push; add follow-up changes as ordinary commits.

## Verifying

- Run the narrowest checks that cover the change. Repo-wide checks require explicit user approval.
- Verify at the lowest stable layer that proves the behavior.
- Report what was verified and any gaps.
- Do not launch browsers or use computer-control tools for verification without explicit user approval.
- Do not add UI tests.
