const cursorMaxLength = 512;

export function encodeCursor(parts: readonly (number | string)[]) {
  return Buffer.from(JSON.stringify(parts)).toString("base64url");
}

export function decodeCursor(cursor: string, expectedParts: number): readonly unknown[] {
  if (cursor.length === 0 || cursor.length > cursorMaxLength) {
    throw new TypeError("Pagination cursor is invalid.");
  }

  try {
    const parts: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));

    if (!Array.isArray(parts) || parts.length !== expectedParts) {
      throw new TypeError("Pagination cursor is invalid.");
    }

    return parts;
  } catch (error) {
    if (error instanceof TypeError && error.message === "Pagination cursor is invalid.") {
      throw error;
    }

    throw new TypeError("Pagination cursor is invalid.", { cause: error });
  }
}
