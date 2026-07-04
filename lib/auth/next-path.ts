/**
 * Validates a `next` redirect parameter received after login.
 *
 * Accepts only local internal paths:
 *   - must be a non-empty string ≤ 512 characters
 *   - must start with "/" (not "//" which is protocol-relative)
 *   - must not point back to /login (loop prevention)
 *   - must not contain an embedded scheme or external host
 *
 * Returns `fallback` for any input that does not satisfy the above rules.
 */
export function safeNextPath(raw: string | null | undefined, fallback: string): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) {
    return fallback;
  }
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.toLowerCase().startsWith("/login")) return fallback;
  try {
    const parsed = new URL(raw, "https://flow.internal");
    if (parsed.origin !== "https://flow.internal") return fallback;
    return raw;
  } catch {
    return fallback;
  }
}
