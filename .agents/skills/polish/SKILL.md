---
name: polish
description: Use only when explicitly requested to polish this task's code changes.
---

# Polish

Your goal is to make the code materially better if possible. Be aggressive about quality, conservative about needless change.

## Scope

The radius of this polish is limited to the code directly affected by the recent changes and their surroundings. Expand beyond them only when necessary to fix the design properly.

## Principles

Look for material improvements. Change the code only when they exist.

- No leakage. Keep boundaries clean and implementation details contained.
- No bullshit comments. Keep only comments that explain non-obvious intent, constraints, or tradeoffs.
- No bloat. Remove unnecessary code, ceremony, indirection, duplication, and accidental complexity.
- Aesthetics matter. Awkward structure, noisy flow, or ugly code are design signals.
- Weird, clunky, or overly verbose names usually indicate a design problem. Fix the design before naming around it.
- Keep each fact, rule, and piece of state owned in one authoritative place. Eliminate competing sources of truth and synchronization logic.
- Reduce unnecessary state, mutation, and hidden ordering dependencies.
- Make invariants, contracts, and ownership obvious.
- Prefer simple, clear, idiomatic code with strong local reasoning.
- Use abstractions when they reduce complexity, protect boundaries, or make future changes cheaper. Avoid both premature abstraction and repeated feature-specific hacks.
- Structure change so new behavior can usually be added without repeatedly modifying unrelated existing code. If every feature cuts across the same areas, improve the design.
- Preserve behavior unless fixing a defect or materially improving the design requires otherwise.
- Strengthen tests when needed to make meaningful changes safe.
- Optimize for code that stays easy to change as the system grows.
- If nothing can be materially improved, leave it alone.

## Output

After polishing, give a concise, high-level bullet list of the material value delivered. Describe outcomes, not mechanical edits.

If nothing materially improved, say so plainly.
