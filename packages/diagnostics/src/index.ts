const MAX_ERROR_DEPTH = 8;
const MAX_ERROR_NODES = 32;
const MAX_ERROR_TEXT_LENGTH = 16_384;
const MAX_SERIALIZED_ERROR_TEXT_LENGTH = 16_384;
const MAX_AGGREGATE_ERRORS = 16;
const MAX_REPORT_ID_LENGTH = 128;
const MAX_OPERATION_LENGTH = 128;
const operationPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const serializedErrorProperties = new Set([
  "name",
  "message",
  "stack",
  "code",
  "cause",
  "errors",
  "truncated",
]);
const errorReportProperties = new Set([
  "id",
  "occurredAt",
  "source",
  "severity",
  "operation",
  "error",
]);

export const MAX_ERROR_REPORT_PAYLOAD_LENGTH = 131_072;
export const diagnosticsStorageAreaId = "diagnostics";

export const ErrorSeverity = {
  Warning: "warning",
  Error: "error",
  Fatal: "fatal",
} as const;

export type ErrorSeverity = (typeof ErrorSeverity)[keyof typeof ErrorSeverity];

export const ErrorSource = {
  Main: "main",
  Renderer: "renderer",
} as const;

export type ErrorSource = (typeof ErrorSource)[keyof typeof ErrorSource];

export type SerializedError = {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  cause?: SerializedError;
  errors?: SerializedError[];
  truncated?: true;
};

export type ErrorReport = {
  id: string;
  occurredAt: number;
  source: ErrorSource;
  severity: ErrorSeverity;
  operation: string;
  error: SerializedError;
};

export type ErrorReportInput = Readonly<{
  source: ErrorSource;
  severity: ErrorSeverity;
  operation: string;
  error: unknown;
}>;

export type ErrorReporter = Readonly<{
  report: (input: Omit<ErrorReportInput, "source">) => void;
}>;

type BoundedText = {
  value: string;
  truncated: boolean;
};

type SerializationState = {
  ancestors: Set<Error>;
  remainingNodes: number;
  remainingTextLength: number;
};

function boundText(value: unknown, fallback: string): BoundedText {
  let text: string;

  try {
    text = typeof value === "string" ? value : String(value);
  } catch {
    return { value: fallback, truncated: true };
  }

  if (text.length <= MAX_ERROR_TEXT_LENGTH) {
    return { value: text, truncated: false };
  }

  return {
    value: `${text.slice(0, MAX_ERROR_TEXT_LENGTH - 1)}…`,
    truncated: true,
  };
}

function serializeText(value: unknown, fallback: string, state: SerializationState): BoundedText {
  const bounded = boundText(value, fallback);
  const availableLength = Math.min(bounded.value.length, state.remainingTextLength);
  const truncated = bounded.truncated || availableLength < bounded.value.length;
  let text = bounded.value.slice(0, availableLength);

  if (truncated && availableLength > 0) {
    text = availableLength === 1 ? "…" : `${text.slice(0, -1)}…`;
  }

  state.remainingTextLength -= text.length;
  return { value: text, truncated };
}

function isError(value: unknown): value is Error {
  try {
    return value instanceof Error;
  } catch {
    return false;
  }
}

function isAggregateError(value: Error): value is AggregateError {
  try {
    return value instanceof AggregateError;
  } catch {
    return false;
  }
}

function serializeThrownValue(value: unknown, state: SerializationState): SerializedError {
  const name = serializeText("NonErrorThrown", "", state);
  const message = serializeText(value, "Unable to describe the thrown value.", state);

  return {
    name: name.value,
    message: message.value,
    ...(name.truncated || message.truncated ? { truncated: true } : {}),
  };
}

function serializationFailure(state: SerializationState): SerializedError {
  const name = serializeText("Error", "", state);
  const message = serializeText("Unable to serialize the thrown value.", "", state);

  return {
    name: name.value,
    message: message.value,
    truncated: true,
  };
}

function serializeErrorValue(
  value: unknown,
  depth: number,
  state: SerializationState,
): SerializedError | undefined {
  if (depth >= MAX_ERROR_DEPTH || state.remainingNodes === 0) {
    return undefined;
  }

  if (!isError(value)) {
    state.remainingNodes -= 1;
    return serializeThrownValue(value, state);
  }

  if (state.ancestors.has(value)) {
    return undefined;
  }

  state.remainingNodes -= 1;
  state.ancestors.add(value);

  try {
    const name = serializeText(value.name, "Error", state);
    const message = serializeText(value.message, "Unable to read the error message.", state);
    const serialized: SerializedError = {
      name: name.value,
      message: message.value,
    };
    let truncated = name.truncated || message.truncated;

    const stackValue = value.stack;

    if (typeof stackValue === "string") {
      const stack = serializeText(stackValue, "", state);
      serialized.stack = stack.value;
      truncated ||= stack.truncated;
    } else if (stackValue !== undefined) {
      truncated = true;
    }

    const codeValue = (value as Error & { code?: unknown }).code;

    if (typeof codeValue === "string" || typeof codeValue === "number") {
      const code = serializeText(codeValue, "", state);
      serialized.code = code.value;
      truncated ||= code.truncated;
    } else if (codeValue !== undefined) {
      truncated = true;
    }

    if (isAggregateError(value)) {
      const aggregateErrors = value.errors;

      if (!Array.isArray(aggregateErrors)) {
        truncated = true;
      } else {
        serialized.errors = [];
        const childCount = Math.min(aggregateErrors.length, MAX_AGGREGATE_ERRORS);

        for (let index = 0; index < childCount; index += 1) {
          const child = serializeErrorValue(aggregateErrors[index], depth + 1, state);

          if (!child) {
            truncated = true;
            break;
          }

          serialized.errors.push(child);
          truncated ||= child.truncated === true;
        }

        truncated ||= aggregateErrors.length > serialized.errors.length;
      }
    }

    const causeValue = value.cause;

    if (causeValue !== undefined) {
      const cause = serializeErrorValue(causeValue, depth + 1, state);

      if (cause) {
        serialized.cause = cause;
        truncated ||= cause.truncated === true;
      } else {
        truncated = true;
      }
    }

    if (truncated) {
      serialized.truncated = true;
    }

    return serialized;
  } catch {
    return serializationFailure(state);
  } finally {
    state.ancestors.delete(value);
  }
}

export function serializeError(error: unknown): SerializedError {
  const state: SerializationState = {
    ancestors: new Set(),
    remainingNodes: MAX_ERROR_NODES,
    remainingTextLength: MAX_SERIALIZED_ERROR_TEXT_LENGTH,
  };

  try {
    return serializeErrorValue(error, 0, state) ?? serializationFailure(state);
  } catch {
    return serializationFailure(state);
  }
}

function requireReportId(value: string) {
  if (!value.trim() || value.length > MAX_REPORT_ID_LENGTH) {
    throw new TypeError(
      `A diagnostic report identity must contain 1-${MAX_REPORT_ID_LENGTH} characters.`,
    );
  }

  return value;
}

function requireOccurredAt(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("A diagnostic report timestamp must be a nonnegative safe integer.");
  }

  return value;
}

function requireSource(value: unknown): ErrorSource {
  if (value === ErrorSource.Main || value === ErrorSource.Renderer) {
    return value;
  }

  throw new TypeError("A diagnostic report source is invalid.");
}

function requireSeverity(value: unknown): ErrorSeverity {
  if (
    value === ErrorSeverity.Warning ||
    value === ErrorSeverity.Error ||
    value === ErrorSeverity.Fatal
  ) {
    return value;
  }

  throw new TypeError("A diagnostic report severity is invalid.");
}

function requireOperation(value: string) {
  if (!value || value.length > MAX_OPERATION_LENGTH || !operationPattern.test(value)) {
    throw new TypeError(
      `A diagnostic operation must be a 1-${MAX_OPERATION_LENGTH} character lowercase dot- or hyphen-separated identity.`,
    );
  }

  return value;
}

export function createErrorReport(
  { source, severity, operation, error }: ErrorReportInput,
  { id, occurredAt }: Readonly<{ id: string; occurredAt: number }>,
): ErrorReport {
  return {
    id: requireReportId(id),
    occurredAt: requireOccurredAt(occurredAt),
    source: requireSource(source),
    severity: requireSeverity(severity),
    operation: requireOperation(operation),
    error: serializeError(error),
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function requireKnownProperties(
  value: Record<string, unknown>,
  properties: ReadonlySet<string>,
  label: string,
) {
  if (Object.keys(value).some((property) => !properties.has(property))) {
    throw new TypeError(`${label} contains an unknown property.`);
  }
}

function requireBoundedString(
  value: unknown,
  label: string,
  state: { remainingTextLength: number },
) {
  if (typeof value !== "string" || value.length > MAX_ERROR_TEXT_LENGTH) {
    throw new TypeError(`${label} must be bounded text.`);
  }

  state.remainingTextLength -= value.length;

  if (state.remainingTextLength < 0) {
    throw new TypeError("A serialized diagnostic error exceeds its text budget.");
  }

  return value;
}

function requireSerializedError(
  value: unknown,
  depth: number,
  state: { remainingNodes: number; remainingTextLength: number },
): SerializedError {
  if (depth >= MAX_ERROR_DEPTH || state.remainingNodes === 0) {
    throw new TypeError("A serialized diagnostic error exceeds its structural budget.");
  }

  state.remainingNodes -= 1;
  const error = requireRecord(value, "A serialized diagnostic error");
  requireKnownProperties(error, serializedErrorProperties, "A serialized diagnostic error");
  const serialized: SerializedError = {
    name: requireBoundedString(error.name, "A serialized error name", state),
    message: requireBoundedString(error.message, "A serialized error message", state),
  };

  if (error.stack !== undefined) {
    serialized.stack = requireBoundedString(error.stack, "A serialized error stack", state);
  }

  if (error.code !== undefined) {
    serialized.code = requireBoundedString(error.code, "A serialized error code", state);
  }

  if (error.cause !== undefined) {
    serialized.cause = requireSerializedError(error.cause, depth + 1, state);
  }

  if (error.errors !== undefined) {
    if (!Array.isArray(error.errors) || error.errors.length > MAX_AGGREGATE_ERRORS) {
      throw new TypeError("A serialized aggregate error exceeds its child budget.");
    }

    serialized.errors = error.errors.map((child) =>
      requireSerializedError(child, depth + 1, state),
    );
  }

  if (error.truncated !== undefined) {
    if (error.truncated !== true) {
      throw new TypeError("A serialized error truncation marker is invalid.");
    }

    serialized.truncated = true;
  }

  return serialized;
}

function requireErrorReport(value: unknown): ErrorReport {
  const report = requireRecord(value, "A diagnostic report");
  requireKnownProperties(report, errorReportProperties, "A diagnostic report");

  if (
    typeof report.id !== "string" ||
    typeof report.occurredAt !== "number" ||
    typeof report.operation !== "string"
  ) {
    throw new TypeError("A diagnostic report header is invalid.");
  }

  return {
    id: requireReportId(report.id),
    occurredAt: requireOccurredAt(report.occurredAt),
    source: requireSource(report.source),
    severity: requireSeverity(report.severity),
    operation: requireOperation(report.operation),
    error: requireSerializedError(report.error, 0, {
      remainingNodes: MAX_ERROR_NODES,
      remainingTextLength: MAX_SERIALIZED_ERROR_TEXT_LENGTH,
    }),
  };
}

export function serializeErrorReport(report: ErrorReport) {
  const payload = JSON.stringify(requireErrorReport(report));

  if (payload.length > MAX_ERROR_REPORT_PAYLOAD_LENGTH) {
    throw new RangeError("A diagnostic report exceeds its transport budget.");
  }

  return payload;
}

export function parseErrorReport(payload: string): ErrorReport {
  if (typeof payload !== "string" || !payload || payload.length > MAX_ERROR_REPORT_PAYLOAD_LENGTH) {
    throw new TypeError("A diagnostic report payload is invalid.");
  }

  try {
    return requireErrorReport(JSON.parse(payload));
  } catch (cause) {
    throw new TypeError("A diagnostic report payload is invalid.", { cause });
  }
}
