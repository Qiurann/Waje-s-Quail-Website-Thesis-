import {
    collection,
    query,
    orderBy,
    limit,
    onSnapshot,
    addDoc,
    serverTimestamp,
} from "firebase/firestore";
import { ref, onValue } from "firebase/database";

import { db, rtdb } from "../firebase";

/* ===========================
   Subscribe to Activity Feed
   (real-time listener, mirrors
   the pattern used in Home.jsx)
=========================== */

export const subscribeToActivity = (callback, logLimit = 100) => {

    const activityRef = collection(db, "activity_logs");

    const activityQuery = query(
        activityRef,
        orderBy("timestamp", "desc"),
        limit(logLimit)
    );

    const unsubscribe = onSnapshot(
        activityQuery,
        (snapshot) => {
            const logs = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));

            callback(logs);
        },
        (error) => {
            console.error("Error subscribing to activity logs:", error);
            callback([]);
        }
    );

    return unsubscribe;

};

/* ===========================
   Log Activity
   (called from login, logout,
   and user management actions)

   In addition to the actor (userName/userEmail/role), an entry can
   optionally describe:
     - targetUserName / targetUserEmail: the account that was modified
       (only relevant for account-management actions, e.g. an admin
       editing a staff member's profile or password)
     - details: a short human-readable summary of what changed
     - ipAddress / device: where the action came from, see
       getClientInfo() below
=========================== */

export const logActivity = async ({
    type,
    message,
    userName,
    userEmail,
    role,
    targetUserName,
    targetUserEmail,
    details,
    ipAddress,
    device,
}) => {

    try {

        await addDoc(collection(db, "activity_logs"), {
            type,
            message,
            userName: userName || "",
            userEmail: userEmail || "",
            role: role || "",
            targetUserName: targetUserName || "",
            targetUserEmail: targetUserEmail || "",
            details: details || "",
            ipAddress: ipAddress || "",
            device: device || "",
            timestamp: serverTimestamp(),
        });

    } catch (error) {
        // Activity logging should never block the action that triggered it.
        console.error("Failed to log activity:", error);
    }

};

/* ===========================
   Get Client Info
   (best-effort device + IP capture
   for the "who/where" side of an
   audit log entry)

   - device: parsed from navigator.userAgent, always available
   - ipAddress: fetched from a public IP-lookup service since a
     client-only web app has no other way to learn its own public
     IP. This is best-effort: if the request fails or times out
     (offline, ad-blocker, network policy, etc.) we simply log an
     empty IP rather than blocking the calling action. For fully
     reliable IP capture, this should eventually move server-side
     (e.g. a Cloud Function that reads the request IP), but there is
     no backend in this project yet.
=========================== */

function getDeviceInfo() {

    if (typeof navigator === "undefined" || !navigator.userAgent) return "";

    const ua = navigator.userAgent;

    let browser = "Unknown browser";
    if (ua.includes("Edg/")) browser = "Edge";
    else if (ua.includes("OPR/") || ua.includes("Opera")) browser = "Opera";
    else if (ua.includes("Chrome/") && !ua.includes("Chromium")) browser = "Chrome";
    else if (ua.includes("Firefox/")) browser = "Firefox";
    else if (ua.includes("Safari/") && !ua.includes("Chrome")) browser = "Safari";

    let os = "Unknown OS";
    if (ua.includes("Windows")) os = "Windows";
    else if (ua.includes("Mac OS")) os = "macOS";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad") || ua.includes("iPod")) os = "iOS";
    else if (ua.includes("Linux")) os = "Linux";

    return `${browser} on ${os}`;

}

export const getClientInfo = async () => {

    const device = getDeviceInfo();
    let ipAddress = "";

    try {

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const res = await fetch("https://api.ipify.org?format=json", {
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            ipAddress = data.ip || "";
        }

    } catch {
        // No network / blocked / timed out — leave ipAddress blank.
        ipAddress = "";
    }

    return { ipAddress, device };

};

/* ===========================
   Get Current Actor
   (reads the logged-in user from
   localStorage, per the app's
   custom Firestore-based session)
=========================== */

export const getCurrentActor = () => {

    try {

        const user = JSON.parse(localStorage.getItem("user") || "{}");

        return {
            userName: user.name || "",
            userEmail: user.email || "",
            role: user.role || "",
        };

    } catch {

        return { userName: "", userEmail: "", role: "" };

    }

};

/* ===========================
   Timestamp helper
=========================== */

function toMillis(ts) {
    if (!ts) return 0;
    if (typeof ts?.toDate === "function") return ts.toDate().getTime();
    const date = new Date(ts);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

/* ===========================
   Subscribe to Full Audit Trail
   Merges three sources into one feed:
   1. activity_logs (Firestore)   - login, logout, and user
                                     management actions written
                                     directly by this web app.
   2. egg_collections (Realtime DB) - automated egg-counting
                                     events recorded by the
                                     counting device/app.
   3. farm_data/shared/tasks       - task assignment and
      (Firestore)                   completion events recorded
                                     by the mobile app.

   NOTE: Field names on task documents (assignedTo, assignedBy,
   title, status, etc.) are assumed based on common naming.
   Adjust the field lookups below if your actual task documents
   use different field names.
=========================== */

export const subscribeToAuditTrail = (callback, entryLimit = 150) => {

    let manualLogs = [];
    let eggLogs = [];
    let taskLogs = [];

    const emit = () => {
        const merged = [...manualLogs, ...eggLogs, ...taskLogs]
            .sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp))
            .slice(0, entryLimit);
        callback(merged);
    };

    // 1. Manual + system-side events (login, logout, user management)
    const activityRef = collection(db, "activity_logs");
    const activityQuery = query(activityRef, orderBy("timestamp", "desc"), limit(entryLimit));
    const unsubActivity = onSnapshot(
        activityQuery,
        (snapshot) => {
            manualLogs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            emit();
        },
        (error) => {
            console.error("Error subscribing to activity_logs:", error);
            manualLogs = [];
            emit();
        }
    );

    // 2. Automated egg-counting events (Realtime Database)
    const eggRef = ref(rtdb, "egg_collections");
    const unsubEgg = onValue(
        eggRef,
        (snapshot) => {
            const data = snapshot.val();

            if (data && typeof data === "object") {
                eggLogs = Object.entries(data)
                    .filter(([, entry]) => entry && entry.date)
                    .map(([key, entry]) => ({
                        id: `egg-${key}`,
                        type: "egg_count",
                        message: `System recorded ${(entry.total || 0).toLocaleString()} eggs collected`,
                        userName: "System",
                        userEmail: "",
                        role: "automated",
                        timestamp: entry.date,
                    }));
            } else {
                eggLogs = [];
            }

            emit();
        },
        (error) => {
            console.error("Error subscribing to egg_collections:", error);
            eggLogs = [];
            emit();
        }
    );

    // 3. Task assignment / completion events (Firestore)
    const tasksRef = collection(db, "farm_data", "shared", "tasks");
    const unsubTasks = onSnapshot(
        tasksRef,
        (snapshot) => {
            taskLogs = snapshot.docs.flatMap((d) => {
                const t = d.data();
                const entries = [];

                const assignedTo = t.assignedTo || t.assignee || t.assignedToName || "Unassigned";
                const assignedBy = t.assignedBy || t.createdBy || t.assignedByName || "Unknown";
                const title = t.title || t.name || t.taskName || "Untitled task";
                const createdAt = t.createdAt || t.assignedAt || t.timestamp;
                const completedAt = t.completedAt || (t.status === "completed" ? t.updatedAt : null);

                if (createdAt) {
                    entries.push({
                        id: `task-assign-${d.id}`,
                        type: "task_assign",
                        message: `${assignedBy} assigned "${title}" to ${assignedTo}`,
                        userName: assignedBy,
                        userEmail: "",
                        role: "",
                        timestamp: createdAt,
                    });
                }

                if (completedAt) {
                    entries.push({
                        id: `task-complete-${d.id}`,
                        type: "task_complete",
                        message: `${assignedTo} completed "${title}"`,
                        userName: assignedTo,
                        userEmail: "",
                        role: "",
                        timestamp: completedAt,
                    });
                }

                return entries;
            });

            emit();
        },
        (error) => {
            console.error("Error subscribing to tasks:", error);
            taskLogs = [];
            emit();
        }
    );

    return () => {
        unsubActivity();
        unsubEgg();
        unsubTasks();
    };

};