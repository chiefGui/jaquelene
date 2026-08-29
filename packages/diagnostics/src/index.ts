const MAX_ERROR_DEPTH = 8;
const MAX_ERROR_NODES = 32;
const MAX_ERROR_TEXT_LENGTH = 16_384;
const MAX_AGGREGATE_ERRORS = 16;

export type ErrorSeverity = "warning" | "error" | "fatal";

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
  severity: ErrorSeverity;
  operation: string;
  error: SerializedError;
};

type BoundedText = {
  value: string;
  truncated: boolean;
};

type SerializationState = {
  ancestors: Set<Error>;
  remainingNodes: number;
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

function serializeThrownValue(value: unknown): SerializedError {
  const message = boundText(value, "Unable to describe the thrown value.");

  return {
    name: "NonErrorThrown",
    message: message.value,
    ...(message.truncated ? { truncated: true } : {}),
  };
}

function serializationFailure(): SerializedError {
  return {
    name: "Error",
    message: "Unable to serialize the thrown value.",
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
    return serializeThrownValue(value);
  }

  if (state.ancestors.has(value)) {
    return undefined;
  }

  state.remainingNodes -= 1;
  state.ancestors.add(value);

  try {
    const name = boundText(value.name, "Error");
    const message = boundText(value.message, "Unable to read the error message.");
    const serialized: SerializedError = {
      name: name.value,
      message: message.value,
    };
    let truncated = name.truncated || message.truncated;

    const stackValue = value.stack;

    if (typeof stackValue === "string") {
      const stack = boundText(stackValue, "");
      serialized.stack = stack.value;
      truncated ||= stack.truncated;
    } else if (stackValue !== undefined) {
      truncated = true;
    }

    const codeValue = (value as Error & { code?: unknown }).code;

    if (typeof codeValue === "string" || typeof codeValue === "number") {
      const code = boundText(codeValue, "");
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
    return serializationFailure();
  } finally {
    state.ancestors.delete(value);
  }
}

export function serializeError(error: unknown): SerializedError {
  try {
    return (
      serializeErrorValue(error, 0, {
        ancestors: new Set(),
        remainingNodes: MAX_ERROR_NODES,
      }) ?? serializationFailure()
    );
  } catch {
    return serializationFailure();
  }
}
