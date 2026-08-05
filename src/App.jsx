import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import FeedInventory from "./pages/FeedInventory";
import UserManagement from "./pages/UserManagement";
import ActivityLogs from "./pages/ActivityLogs";

import LoadingScreen from "./components/LoadingScreen";
import { ensureAnonymousAuth } from "./firebase";

function App() {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    ensureAnonymousAuth()
      .catch((err) => console.error("Anonymous auth failed:", err))
      .finally(() => setAuthReady(true));
  }, []);

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
        
      </Route>
    </Routes>
  );
}

export default App;