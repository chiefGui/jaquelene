---
name: implement
description: Guide code implementation with scoped changes, simple design, and justified extensibility. Use only when explicitly invoked, before and during implementation.
---

# Implement

- Implement the requested behavior.
- Preserve existing behavior outside the requested changes.
- Prefer the simplest design that satisfies known requirements.
- Resolve competing principles in favor of correctness and understandability.

## Before coding

- Read the affected code, its callers, and relevant tests.
- Identify existing contracts, conventions, and reusable capabilities.
- Determine what must change and what must remain true.
- Identify the source of truth for each piece of state.
- Resolve ambiguity that materially affects behavior or public contracts.
- Choose the smallest coherent change and how to verify it.
- Keep planning proportional to the task; proceed when the approach is clear.

## Design

- Keep related logic and knowledge together.
- Keep dependencies explicit.
- Prefer simple interfaces that hide substantial implementation complexity. (Deep Modules)
- Encapsulate decisions so callers do not need to understand or repeat them.
- Avoid splitting modules when doing so exposes details or increases coordination.
- Prefer existing capabilities over parallel implementations.
- Introduce abstractions when they simplify the current implementation
  or isolate a concrete source of variation.
- Allow similar code to remain separate when it represents different
  rules or reasons to change.
- Optimize for understandable code and localized changes.

## Extensibility

- Prefer composition.
- When adding a variant of an existing capability, prefer extending through its contract over adding concrete-type branches to consumers.
- Introduce or adjust the contract when it represents a coherent capability; do not preserve an abstraction that no longer fits.
- Keep core rules independent of integration details where those details would otherwise spread.
- Centralize wiring when multiple implementations need selection.
- Require every interface, factory, and layer to provide a concrete capability needed by the task.

## Implementation

- Represent each fact once; derive values instead of duplicating state.
- Make invalid states difficult to represent.
- Validate at boundaries; rely on enforced contracts internally.
- Handle failures explicitly; do not disguise them as successful results.
- Add dependencies only when their benefit justifies their cost.
- Explain non-obvious constraints and decisions in comments.
- Avoid compatibility paths unless compatibility is required.

## Tests

- Test observable behavior and meaningful failure cases.
- Use existing tests when they already cover the behavior.
- Add tests for new behavior and meaningful coverage gaps.
- Avoid tests coupled to internal structure or incidental call order.
- Investigate failures; change existing expectations only when the requested behavior or evidence shows they are incorrect.

## Verification

- Run the smallest set of checks that covers the affected behavior.
- Review the diff for unnecessary complexity and unintended changes.
- Distinguish verified outcomes from assumptions.

## Completion report

- Briefly describe the behavior delivered and how it was verified.
- State material limitations or tradeoffs.
- Omit file inventories, implementation walkthroughs, and design-pattern names.
