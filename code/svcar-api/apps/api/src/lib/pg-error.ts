/**
 * Postgres driver errors arrive wrapped by Drizzle, so the useful bits (the
 * SQLSTATE code, the constraint name) sit a couple of `cause` links down. These
 * helpers dig them out so routes can turn a driver error into a real HTTP status
 * with a message an admin can act on, instead of letting it escape as a 500.
 */

/** Walk the `cause` chain and flatten every message into one searchable string. */
export function postgresErrorText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = cur.cause;
    } else if (typeof cur === "string") {
      parts.push(cur);
      break;
    } else {
      break;
    }
  }
  return parts.join(" ");
}

/** The SQLSTATE code (e.g. "23503" foreign_key_violation), if the driver set one. */
export function postgresErrorCode(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string") return code;
    cur = cur instanceof Error ? cur.cause : undefined;
  }
  return undefined;
}

/** True when the write failed because another table still points at these rows. */
export function isForeignKeyViolation(err: unknown): boolean {
  return (
    postgresErrorCode(err) === "23503" ||
    /violates foreign key constraint/i.test(postgresErrorText(err))
  );
}

/** The `constraint` field Postgres attaches to a violation, if present. */
export function postgresConstraintName(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    const name = (cur as { constraint_name?: unknown; constraint?: unknown });
    if (typeof name.constraint_name === "string") return name.constraint_name;
    if (typeof name.constraint === "string") return name.constraint;
    cur = cur instanceof Error ? cur.cause : undefined;
  }
  return undefined;
}
