# Diagnostics

Diagnostics describe unexpected failures after they reach an application boundary.

- Expected negative outcomes belong in an operation's return contract when callers need distinct handling.
- Invalid caller input rejects the violated contract with a standard error such as `TypeError` or `RangeError`.
- Broken invariants throw immediately and are not converted into plausible application states.
- Unexpected runtime failures preserve their identity and cause until one owning boundary reports them.

Custom exceptions are useful only when same-process code must distinguish a failure before translating or reporting it. Diagnostic code does not decide recovery, retry, persistence, or user-facing copy.

Serialization preserves error text; it does not guess which substrings are secrets. Adapters must keep credentials, authorization headers, prompts, message content, and raw provider responses out of errors and report metadata.
