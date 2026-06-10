import { createHmac, timingSafeEqual } from "crypto";

// Server-only secret; any stable secret works since the value never needs to
// be verified by a third party.
const SECRET =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.CRON_SECRET ?? "";

function mac(userId: string): string {
  return createHmac("sha256", SECRET).update(userId).digest("hex").slice(0, 32);
}

/**
 * OAuth `state` carrying the app user id with an HMAC so the callback can
 * trust it. Without this, anyone could hit the callback with a code from
 * their own account and an arbitrary user id, attaching their external
 * account to someone else's app user.
 */
export function signState(userId: string): string {
  return `${userId}.${mac(userId)}`;
}

/** Returns the user id if the state is authentic, else null. */
export function verifyState(state: string | null): string | null {
  if (!state) return null;
  const i = state.lastIndexOf(".");
  if (i <= 0) return null;
  const userId = state.slice(0, i);
  const sig = state.slice(i + 1);
  const expected = mac(userId);
  if (sig.length !== expected.length) return null;
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
      ? userId
      : null;
  } catch {
    return null;
  }
}
