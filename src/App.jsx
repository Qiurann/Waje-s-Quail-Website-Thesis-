import { useEffect, useState } from "react";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import FeedInventory from "./pages/FeedInventory";
import UserManagement from "./pages/UserManagement";
import ActivityLogs from "./pages/ActivityLogs";
import AppSettings from "./pages/AppSettings";

import LoadingScreen from "./components/LoadingScreen";
import { ensureAnonymousAuth } from "./firebase";
import { reconcileSessionOnLoad } from "./services/sessionGuard";

// Same "is there a live session" check used by Dashboard/session guard:
// a valid session is a `user` object in localStorage with a uid.
function hasActiveSession() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    return !!user?.uid;
  } catch {
    return false;
  }
}

// Guards "/": if a session is already active, skip the login form and go
// straight to the dashboard instead of making the user sign in again.
function RequireGuest({ children }) {
  return hasActiveSession() ? <Navigate to="/dashboard" replace /> : children;
}

// Guards "/dashboard/*": if there's no active session, bounce to login
// instead of rendering a dashboard with no user behind it.
function RequireAuth({ children }) {
  return hasActiveSession() ? children : <Navigate to="/" replace />;
}

function App() {
  const [authReady, setAuthReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      // Detects a session that was never cleanly logged out (browser/tab
      // closed without pressing Logout) and records the Logout activity —
      // see services/sessionGuard.js for how this stays duplicate-free.
      reconcileSessionOnLoad().catch((err) => {
        console.error("Session reconcile failed:", err);
        return { implicitLogout: false };
      }),
      ensureAnonymousAuth().catch((err) => console.error("Anonymous auth failed:", err)),
    ]).then(([{ implicitLogout }]) => {
      setAuthReady(true);
      if (implicitLogout) {
        navigate("/", { replace: true });
      }
    });
  }, [navigate]);

  if (!authReady) {
    return <LoadingScreen message="Connecting to farm records..." />;
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <RequireGuest>
            <Login />
          </RequireGuest>
        }
      />

      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="feed-inventory" element={<FeedInventory />} />
        <Route path="user-management" element={<UserManagement />} />
        <Route path="user-activity" element={<ActivityLogs />} />
        <Route path="activity-logs" element={<ActivityLogs />} />
        <Route path="app-settings" element={<AppSettings />} />
      </Route>
    </Routes>
  );
}

export default App;