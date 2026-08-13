import { clearSession } from "../firebase";
import { logActivity } from "./activityService";

/* ===========================================================================
   Session Guard
   (automatic Logout detection for the website)

   Problem: today a Logout activity is only ever recorded when the user
   presses the "Logout" button (Dashboard.handleLogout). If they just close
   the browser tab, close the whole browser, or navigate away from the site,
   `localStorage.user` is left behind and no Logout entry is ever written.

   This app has no backend (no Cloud Function watching for disconnects), so
   there's no way to react to a tab closing at the instant it happens. What
   we *can* rely on is a difference between `localStorage` and
   `sessionStorage`:
     - localStorage survives closing/reopening the browser entirely.
     - sessionStorage survives a page refresh or in-app navigation, but is
       wiped by the browser the moment the tab/window that created it is
       actually closed.

   So on every app load we compare the two:
     - If `localStorage.user` exists and this tab's sessionStorage marker
       matches it -> we're still inside the same tab that logged in
       (a refresh, or React Router navigating between pages). Nothing
       changed, so nothing is logged.
     - If `localStorage.user` exists but the marker is missing/different ->
       the tab that owned that login session is gone (closed tab, closed
       browser, browser crash, etc.) and this is either a brand new tab or
       the app being reopened. The previous session was never cleanly ended,
       so we record the Logout now, once, and clear the stale session.

   This guarantees a Logout is recorded exactly once per login session, and
   is never recorded twice, and is never recorded just because the user
   switched tabs, minimized the window, or was briefly idle (none of those
   touch sessionStorage).
=========================================================================== */

const TAB_SESSION_KEY = "qf_active_tab_uid";

// Guards against this running twice for the same page load (e.g. React 18
// StrictMode double-invoking effects in development).
let reconcilePromise = null;

async function doReconcile() {
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    user = null;
  }

  if (!user || !user.uid) {
    // No one logged in on this device right now — nothing to reconcile.
    return { implicitLogout: false };
  }

  const marker = sessionStorage.getItem(TAB_SESSION_KEY);

  if (marker === user.uid) {
    // Same tab, same session continuing (refresh or client-side navigation).
    return { implicitLogout: false };
  }

  // The tab that owned this login session is gone. Record the implicit
  // logout once, then clear the stale session so this only ever fires once.
  // (Logging must happen BEFORE clearSession — the activity_logs write
  // requires sessions/{uid} to still exist per the Firestore rules.)
  logActivity({
    type: "logout",
    message: `${user.name || user.email || "A user"} logged out`,
    userName: user.name,
    userEmail: user.email,
    role: user.role,
    details: "Session ended automatically (browser/tab was closed without pressing Logout).",
  });

  try {
    await clearSession(user.uid);
  } catch (err) {
    console.error("Failed to clear stale session:", err);
  }

  localStorage.removeItem("user");
  sessionStorage.removeItem(TAB_SESSION_KEY);

  return { implicitLogout: true };
}

// Reconciles the login session on app load. Call this once, early, before
// rendering any protected page (see App.jsx).
export function reconcileSessionOnLoad() {
  if (!reconcilePromise) {
    reconcilePromise = doReconcile();
  }
  return reconcilePromise;
}

// Call right after a successful manual login to mark this tab as the owner
// of the new session.
export function claimTabForSession(uid) {
  sessionStorage.setItem(TAB_SESSION_KEY, uid);
}

// Call right after a successful manual logout so a later reconcile doesn't
// try to log a second (duplicate) logout for the session that just ended
// cleanly.
export function releaseTabSession() {
  sessionStorage.removeItem(TAB_SESSION_KEY);
}