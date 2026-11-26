// Client-side resend cooldown. Supabase also throttles these endpoints, but
// relying on the server throttle means users see a raw provider error after the
// second click; a local countdown keeps the button honest and the request count
// down.

/**
 * @param {object} [options]
 * @param {number} [options.seconds] cooldown length
 * @param {() => number} [options.now] injectable clock (tests)
 */
export function createCooldown({ seconds = 60, now = () => Date.now() } = {}) {
  let startedAt = 0;

  return {
    /** Begin a cooldown window (call only after a request was actually made). */
    start(at = now()) {
      startedAt = at;
      return this.remaining(at);
    },
    /** Seconds left, 0 when the user may try again. */
    remaining(at = now()) {
      if (!startedAt) return 0;
      const left = startedAt + seconds * 1000 - at;
      if (left <= 0) return 0;
      return Math.ceil(left / 1000);
    },
    active(at = now()) {
      return this.remaining(at) > 0;
    },
    reset() {
      startedAt = 0;
    },
    get seconds() {
      return seconds;
    },
  };
}
