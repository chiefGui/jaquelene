import { describe, expect, it } from "vite-plus/test";
import { serializeError, type SerializedError } from "./index";

function countErrors(error: SerializedError): number {
  return (
    1 +
    (error.cause ? countErrors(error.cause) : 0) +
    (error.errors?.reduce((count, child) => count + countErrors(child), 0) ?? 0)
  );
}

function createBranchingFailureTree(message: string) {
  const branches = Array.from(
    { length: 16 },
    (_, branch) =>
      new AggregateError(
        Array.from({ length: 16 }, (_, leaf) => new Error(`Failure ${branch}.${leaf}`)),
        `Branch ${branch}`,
      ),
  );

  return new AggregateError(branches, message);
}

describe("serializeError", () => {
  it("preserves error identity, code, stack, and cause", () => {
    const cause = Object.assign(new Error("Disk unavailable"), { code: "E_TEST_DISK" });
    const error = new TypeError("Could not save", { cause });
    cause.stack = "cause stack";
    error.stack = "outer stack";

    expect(serializeError(error)).toEqual({
      name: "TypeError",
      message: "Could not save",
      stack: "outer stack",
      cause: {
        name: "Error",
        message: "Disk unavailable",
        stack: "cause stack",
        code: "E_TEST_DISK",
      },
    });
  });

  it("preserves every kind of AggregateError child", () => {
    const cause = new Error("Root failure");
    const child = new RangeError("Invalid result");
    const error = new AggregateError([child, "Provider unavailable"], "Both operations failed", {
      cause,
    });
    cause.stack = "cause stack";
    child.stack = "child stack";
    error.stack = "aggregate stack";

    expect(serializeError(error)).toEqual({
      name: "AggregateError",
      message: "Both operations failed",
      stack: "aggregate stack",
      cause: {
        name: "Error",
        message: "Root failure",
        stack: "cause stack",
      },
      errors: [
        {
          name: "RangeError",
          message: "Invalid result",
          stack: "child stack",
        },
        {
          name: "NonErrorThrown",
          message: "Provider unavailable",
        },
      ],
    });
  });

  it("reads observable error properties once", () => {
    const cause = new Error("Root failure");
    const child = new Error("Child failure");
    const error = new AggregateError([], "Aggregate failure");
    const reads = { stack: 0, cause: 0, errors: 0 };
    cause.stack = "cause stack";
    child.stack = "child stack";

    function readOnce<Value>(property: keyof typeof reads, value: Value) {
      return () => {
        reads[property] += 1;

        if (reads[property] > 1) {
          throw new Error(`${property} read more than once`);
        }

        return value;
      };
    }

    Object.defineProperties(error, {
      stack: {
        configurable: true,
        get: readOnce("stack", "aggregate stack"),
      },
      cause: {
        configurable: true,
        get: readOnce("cause", cause),
      },
      errors: {
        configurable: true,
        get: readOnce("errors", [child]),
      },
    });

    expect(serializeError(error)).toEqual({
      name: "AggregateError",
      message: "Aggregate failure",
      stack: "aggregate stack",
      errors: [
        {
          name: "Error",
          message: "Child failure",
          stack: "child stack",
        },
      ],
      cause: {
        name: "Error",
        message: "Root failure",
        stack: "cause stack",
      },
    });
    expect(reads).toEqual({ stack: 1, cause: 1, errors: 1 });
  });

  it.each([
    [undefined, "undefined"],
    [null, "null"],
    [false, "false"],
    [42, "42"],
    ["Provider unavailable", "Provider unavailable"],
  ])("describes the non-Error value %s", (value, message) => {
    expect(serializeError(value)).toEqual({
      name: "NonErrorThrown",
      message,
    });
  });

  it("does not fail when error properties cannot be read", () => {
    const error = new Error("Hidden failure");

    Object.defineProperty(error, "message", {
      get() {
        throw new Error("Unreadable message");
      },
    });

    expect(() => serializeError(error)).not.toThrow();
    expect(serializeError(error)).toEqual({
      name: "Error",
      message: "Unable to serialize the thrown value.",
      truncated: true,
    });
  });

  it("marks cyclic causes as truncated without returning a cycle", () => {
    const error = new Error("Cyclic failure");
    error.stack = "cycle stack";
    error.cause = error;

    const serialized = serializeError(error);

    expect(serialized).toEqual({
      name: "Error",
      message: "Cyclic failure",
      stack: "cycle stack",
      truncated: true,
    });
    expect(() => JSON.stringify(serialized)).not.toThrow();
  });

  it("bounds text and the number of serialized errors", () => {
    const oversizedMessage = "x".repeat(100_000);
    const errors = Array.from({ length: 1_000 }, (_, index) => new Error(`Failure ${index}`));
    const aggregate = new AggregateError(errors, "Many failures");
    const oversized = new Error(oversizedMessage);
    aggregate.stack = "aggregate stack";
    oversized.stack = "oversized stack";

    const serializedAggregate = serializeError(aggregate);
    const serializedOversized = serializeError(oversized);

    expect(countErrors(serializedAggregate)).toBeLessThan(errors.length);
    expect(serializedAggregate.truncated).toBe(true);
    expect(serializedOversized.message.length).toBeLessThan(oversizedMessage.length);
    expect(serializedOversized.message.endsWith("…")).toBe(true);
    expect(serializedOversized.truncated).toBe(true);
  });

  it("bounds a branching failure tree independently of its shape", () => {
    const serialized = serializeError(createBranchingFailureTree("Root failure"));

    expect(countErrors(serialized)).toBeLessThan(100);
    expect(serialized.truncated).toBe(true);
    expect(() => JSON.stringify(serialized)).not.toThrow();
  });

  it("preserves aggregate failures before optional causal context", () => {
    const context = createBranchingFailureTree("Broad context");
    const error = new AggregateError([new Error("Primary failure")], "Operation failed", {
      cause: context,
    });

    const serialized = serializeError(error);

    expect(serialized.errors?.[0]?.message).toBe("Primary failure");
    expect(serialized.truncated).toBe(true);
  });
});
