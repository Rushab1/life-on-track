/**
 * Fire-and-forget outbound calendar sync after a client-side mutation. The
 * server route runs the full push and the browser holds the request open, so
 * it completes reliably. Silently ignored when the user isn't connected.
 */
export function triggerCalendarSync(): void {
  void fetch("/api/google/sync", { method: "POST" }).catch(() => {});
}
