/* ===========================================================================
   Session Security
   (idle timeout + absolute session lifetime + login rate limiting)

   This app has no backend of its own — the website authenticates against
   Firestore directly (see Login.jsx/firebase.js) and, once signed in, the
   `user` object in localStorage is trusted indefinitely with no expiring
   token. That means a forgotten, unlocked browser tab (e.g. a shared farm
   office computer) stays signed in to the owner account forever. None of
   what's here is a substitute for real server-side session expiry — it's
   a client-side control that meaningfully shrinks that exposure window in
   the meantime.
=========================================================================== */

// Sign the user out after this long with no mouse/keyboard/touch activity.
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Sign the user out this long after login, no matter how active they are.
// Caps how long a single login is trusted for.
export const MAX_SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours

const LOGIN_AT_KEY = "qf_login_at";

// Call right after a successful login, alongside writing `user` to
// localStorage, so the absolute-expiry check below has a start time.
export function markSessionStart() {
    localStorage.setItem(LOGIN_AT_KEY, String(Date.now()));
}

// Call on every logout path (manual logout, idle logout, implicit logout
// via sessionGuard) so a later login starts a fresh clock.
export function clearSessionStart() {
    localStorage.removeItem(LOGIN_AT_KEY);
}

// True once MAX_SESSION_MS has elapsed since login, regardless of activity.
// A session with no recorded start time (e.g. one created before this file
// existed) is treated as not-yet-expired rather than force-logged-out.
export function isSessionExpired() {
    const loginAt = Number(localStorage.getItem(LOGIN_AT_KEY) || 0);
    if (!loginAt) return false;
    return Date.now() - loginAt > MAX_SESSION_MS;
}

/* ===========================================================================
   Login attempt throttling

   Purely client-side (keyed by localStorage, scoped to one browser), so it
   only slows down casual/scripted brute forcing from the same browser
   profile — it's trivially bypassed by clearing storage or using a private
   window. It's still worth having as a deterrent and an audit signal
   (Login.jsx logs a `login_failed`/`login_locked` activity entry alongside
   this), but it is NOT a substitute for real server-side rate limiting.
   That would need either Firebase App Check, a Cloud Function fronting
   login, or migrating off the current plaintext-password Firestore query
   to Firebase's own Email/Password Auth (which rate-limits natively).
=========================================================================== */

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

function attemptsKey(email) {
    return `qf_login_attempts_${(email || "").trim().toLowerCase()}`;
}

function readAttemptState(email) {
    try {
        const parsed = JSON.parse(localStorage.getItem(attemptsKey(email)) || "null");
        if (parsed && typeof parsed.count === "number") return parsed;
    } catch {
        // fall through to default
    }
    return { count: 0, lockedUntil: 0 };
}

// Returns { locked: boolean, remainingMs: number } — call before attempting
// a login so a locked-out email never even reaches the Firestore query.
export function getLoginLockState(email) {
    const state = readAttemptState(email);
    const remainingMs = state.lockedUntil - Date.now();
    if (state.lockedUntil && remainingMs > 0) {
        return { locked: true, remainingMs };
    }
    return { locked: false, remainingMs: 0 };
}

// Call after a failed login (wrong credentials, or a valid non-owner
// account — see Login.jsx). Returns the updated state so the caller can
// decide whether to surface a lockout message.
export function recordFailedLogin(email) {
    const state = readAttemptState(email);
    const count = state.count + 1;
    const lockedUntil = count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0;
    const next = { count, lockedUntil };
    localStorage.setItem(attemptsKey(email), JSON.stringify(next));
    return next;
}

// Call after a successful login so past failures don't linger.
export function clearLoginAttempts(email) {
    localStorage.removeItem(attemptsKey(email));
}