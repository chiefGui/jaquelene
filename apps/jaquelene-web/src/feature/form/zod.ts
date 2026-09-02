import { useFormValidate, type FormStore } from "@ariakit/react/form";

export type FormValidationIssue = {
  readonly code: string;
  readonly message: string;
  readonly path: readonly PropertyKey[];
};

type SafeParseResult =
  | { success: true }
  | { success: false; error: { issues: readonly FormValidationIssue[] } };

type SafeParser = {
  safeParse(value: unknown): SafeParseResult;
};

function createErrorMap() {
  return Object.create(null) as Record<string, unknown>;
}

function setMessageAtPath(
  target: Record<string, unknown>,
  path: readonly PropertyKey[],
  message: string,
) {
  let current = target;

  for (const [index, segment] of path.entries()) {
    const key = String(segment);

    if (index === path.length - 1) {
      current[key] = message;
      return;
    }

    const child = current[key];

    if (typeof child === "object" && child !== null && !Array.isArray(child)) {
      current = child as Record<string, unknown>;
    } else {
      const next = createErrorMap();
      current[key] = next;
      current = next;
    }
  }
}

export function useZodFormValidation<T extends Record<string, unknown>>(
  form: FormStore<T>,
  schema: SafeParser,
  formatIssue: (issue: FormValidationIssue) => string = (issue) => issue.message,
) {
  useFormValidate(form, (state) => {
    const result = schema.safeParse(state.values);

    if (result.success) {
      form.setErrors({});
      return;
    }

    const fields = new Set<string>();
    const errors = createErrorMap();

    for (const issue of result.error.issues) {
      const name = issue.path.join(".");

      if (!name || fields.has(name)) {
        continue;
      }

      fields.add(name);
      setMessageAtPath(errors, issue.path, formatIssue(issue));
    }

    form.setErrors(errors as Parameters<typeof form.setErrors>[0]);
  });
}
