/**
 * Coerce DB rows to JSON-safe primitives for the client. pg returns
 * timestamptz columns as JS Date objects; this converts every Date (top-level
 * and nested, e.g. inside jsonb context bundles) to an ISO string so routes
 * always hand the client plain JSON.
 */
export function serialize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = serialize(v);
    }
    return out;
  }
  return value;
}

export const serializeRows = (rows: unknown[]): unknown[] => rows.map(serialize);
