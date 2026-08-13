import { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";

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
      <Route path="/" element={<Login />} />

      <Route path="/dashboard" element={<Dashboard />}>
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