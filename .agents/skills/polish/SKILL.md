---
name: polish
description: Improve existing code through deletion, simplification, and extensibility.
---

# Polish

- Preserve intended behavior.
- Stay within the requested scope.
- Delete before adding.
- Reduce complexity.
- Apply OCP by default.

## Cleanup

- Remove dead code and unused dependencies.
- Remove redundant state and duplicated logic.
- Remove pass-through wrappers and unnecessary indirection.
- Remove obsolete compatibility paths.
- Fix root causes and remove their workarounds.
- Remove checks duplicated by enforced contracts.
- Remove commented-out code and stale comments.
- Remove comments that restate the code.

## Design

- Hide implementation complexity behind small interfaces.
- Keep related logic and knowledge together.
- Keep dependencies explicit.
- Eliminate abstractions whose removal reduces complexity.
- Retain abstractions that prevent complexity from spreading into callers.
- Minimize the knowledge and coordination required from callers.
- Optimize for understandable code and localized changes.

## Extensibility

- Prefer composition.
- Keep core logic independent of concrete integrations.
- Accept replaceable dependencies.
- Centralize implementation wiring.
- Support new implementations through existing contracts without modifying consumers.
- Remove unnecessary coupling that blocks extension.
- Require every interface, factory, and layer to provide a concrete capability.

## Tests

- Keep tests that catch real bugs.
- Delete tests that check the same thing.
- Test what the code does, not how it does it.
- Fix flaky tests.
- Add a test only when it catches a meaningful bug existing tests would miss.
- Investigate failures; never delete tests just to make checks pass.

## Verification

- Verify the behavior affected by the changes.
- Use the smallest set of existing checks that covers that behavior.

## Completion report

- Describe in plain language, focusing on value.
- Keep it brief.
- Use two sections:
  - Better: benefits of the changes.
  - Worse: drawbacks of the changes. State "None identified" when applicable.
- Omit file inventories, implementation walkthroughs, and design-pattern names.
- Support claimed benefits with evidence.
