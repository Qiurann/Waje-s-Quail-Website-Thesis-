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
            // Dropped connection (e.g. after a bfcache restore, see
            // firebase.js), not "no logs" — don't blank out the caller's
            // list. firebase.js's pageshow handler forces a reconnect, which
            // re-fires this listener with fresh data once it's back.
            console.error("Error subscribing to activity logs:", error);
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
    module,
    userName,
    userEmail,
    role,
    targetUserName,
    targetUserEmail,
    details,
    ipAddress,
    device,
    metadata,
}) => {

    try {

        await addDoc(collection(db, "activity_logs"), {
            type,
            message,
            ...(module ? { module } : {}),
            userName: userName || "",
            userEmail: userEmail || "",
            role: role || "",
            targetUserName: targetUserName || "",
            targetUserEmail: targetUserEmail || "",
            details: details || "",
            ipAddress: ipAddress || "",
            device: device || "",
            // Optional structured payload (e.g. { previousQuantity, newQuantity,
            // itemId, itemName }) for entries that need queryable before/after
            // values in addition to the human-readable message/details above.
            ...(metadata && typeof metadata === "object" ? { metadata } : {}),
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
   4. inventory_history (Firestore) - feed/supplement quantity
                                     changes recorded by the
                                     mobile app's stock-update
                                     screen (Android
                                     FeedInventoryActivity).
                                     Web-side quantity edits are
                                     logged separately, directly
                                     into activity_logs (source 1),
                                     so this source only ever
                                     contributes mobile-originated
                                     entries.

   NOTE: Field names on task documents (assignedTo, assignedBy,
   title, status, etc.) are assumed based on common naming.
   Adjust the field lookups below if your actual task documents
   use different field names.
=========================== */

export const subscribeToAuditTrail = (callback, entryLimit = 150) => {

    let manualLogs = [];
    let eggLogs = [];
    let taskLogs = [];
    let inventoryLogs = [];
    let rawTaskDocs = [];
    let rawManualDocs = [];
    let rawInventoryDocs = [];
    let userNameMap = {}; // email (lowercase) -> real name, from user_access
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const emit = () => {
        // NOTE: no blanket `.slice(0, entryLimit)` here on the merged array.
        // Each source below is capped independently instead (see
        // buildTaskLogs/the egg listener) — capping only after merging all
        // four types together let high-frequency types (logins, task
        // assign/complete) crowd low-frequency ones (egg counts, which might
        // only fire every few days) out of the window entirely, even though
        // they were still sitting in the database. A type-specific filter
        // tab (e.g. "Egg Count") has no way to recover an entry that got
        // squeezed out here, since it filters client-side from this same
        // already-merged list.
        const merged = [...manualLogs, ...eggLogs, ...taskLogs, ...inventoryLogs]
            .sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp));
        callback(merged);
    };

    // The mobile app only ever writes emails (its login "username" IS the
    // email — see MainActivity/NavigationHelper.putExtra("username", email)),
    // never a display name. Resolve through user_access, which is keyed by
    // email and has a "name" field (see userService.addUser), so logs show
    // "Juan Dela Cruz" instead of "juan@farm.com".
    const resolveName = (identifier) => {
        if (!identifier) return identifier;
        const key = String(identifier).trim().toLowerCase();
        return userNameMap[key] || identifier;
    };

    // 1. Manual + system-side events (login, logout, user management)
    //
    // Some of these entries are written directly by the Android app
    // (FarmRepository.logDeletion, ScheduleActivity.logTaskExtension, etc.)
    // with the actor's email baked straight into userName/message/details,
    // because the app's only notion of an actor is the login email. The
    // website's own writes (Login.jsx, sessionGuard.js, UserManagement.jsx)
    // already prefer a real name where one is known, so this rebuild is a
    // no-op for those and only swaps in a name for the Android-authored ones.
    const buildManualLogs = () => {
        manualLogs = rawManualDocs.map(({ id, m }) => {
            const raw = m.userName;
            if (typeof raw !== "string" || !EMAIL_RE.test(raw.trim())) {
                return { id, ...m };
            }
            const name = resolveName(raw);
            if (name === raw) return { id, ...m }; // no user_access match yet
            const swap = (text) => (typeof text === "string" ? text.split(raw).join(name) : text);
            return { id, ...m, userName: name, message: swap(m.message), details: swap(m.details) };
        });
    };

    const activityRef = collection(db, "activity_logs");
    const activityQuery = query(activityRef, orderBy("timestamp", "desc"), limit(entryLimit));
    const unsubActivity = onSnapshot(
        activityQuery,
        (snapshot) => {
            rawManualDocs = snapshot.docs.map((d) => ({ id: d.id, m: d.data() }));
            buildManualLogs();
            emit();
        },
        (error) => {
            // A listener error (e.g. the Firestore Listen stream dying after
            // a back/forward-cache restore, see firebase.js) means the
            // connection dropped, not that the underlying data is gone.
            // Keep showing the last known-good entries instead of blanking
            // the feed; firebase.js's pageshow handler forces a reconnect,
            // which will re-fire this listener with fresh data once it's
            // back.
            console.error("Error subscribing to activity_logs:", error);
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
                    .map(([key, entry]) => {
                        const gradeA = entry.gradeA || 0;
                        const gradeB = entry.gradeB || 0;
                        const gradeC = entry.gradeC || 0;
                        return {
                            id: `egg-${key}`,
                            type: "egg_count",
                            message: `Number of egg/s collected: ${(entry.total || 0).toLocaleString()} (Grade A - Normal: ${gradeA}, Grade B - Cracked: ${gradeB}, Grade C - Reject: ${gradeC})`,
                            userName: "System",
                            userEmail: "",
                            role: "automated",
                            timestamp: entry.date,
                        };
                    })
                    // Capped independently to entryLimit (same as
                    // manualLogs/inventoryLogs) since this RTDB read has no
                    // query-level limit of its own — without this, a large
                    // history here is harmless on its own, but see emit()
                    // for why an unbounded array here used to cause other
                    // problems when merged with the other three sources.
                    .sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp))
                    .slice(0, entryLimit);
            } else if (data === null || data === undefined) {
                // Path is genuinely empty — safe to clear.
                eggLogs = [];
            } else {
                // egg_collections is occasionally overwritten with a bare
                // number by a live-count writer (see Home.jsx, which already
                // special-cases `typeof data === "number"`). That isn't a
                // real "no history" state — the archived per-day records
                // still exist server-side, this listener just can't parse
                // this particular snapshot. Keep showing the last known-good
                // entries instead of wiping the feed, and flag it so it's
                // visible this shape mismatch is happening.
                console.warn(
                    "egg_collections held an unexpected shape (typeof:",
                    typeof data,
                    ") — keeping previously loaded egg log entries instead of clearing them."
                );
            }

            emit();
        },
        (error) => {
            // Same reasoning as the activity_logs error handler above: a
            // dropped RTDB socket isn't "no eggs collected" — keep the last
            // known-good entries on screen and let the pageshow-triggered
            // reconnect in firebase.js bring fresh data back in.
            console.error("Error subscribing to egg_collections:", error);
            emit();
        }
    );

    // 2b. Name directory (Firestore) — email -> real name, kept live so a
    //     name edited in User Management updates past log entries too.
    const usersRef = collection(db, "user_access");
    const unsubUsers = onSnapshot(
        usersRef,
        (snapshot) => {
            const map = {};
            snapshot.docs.forEach((d) => {
                const u = d.data();
                const email = (u.email || d.id || "").trim().toLowerCase();
                if (email && u.name) map[email] = u.name;
            });
            userNameMap = map;
            buildManualLogs();
            buildTaskLogs();
            buildInventoryLogs();
            emit();
        },
        (error) => {
            console.error("Error subscribing to user_access:", error);
        }
    );

    // 3. Task assignment / completion events (Firestore)
    const tasksRef = collection(db, "farm_data", "shared", "tasks");

    const buildTaskLogs = () => {
        taskLogs = rawTaskDocs.flatMap(({ id, t }) => {
            const entries = [];

            // assignedTo is stored on the task doc as an array of emails
            // (multi-assign support — see ScheduleActivity.parseAssignedTo).
            // Resolve each email to a real name via user_access, then join
            // into a plain string. Leaving it as an array of emails would
            // also make log.userName?.toLowerCase() in ActivityLogs.jsx
            // throw as soon as one of these entries reached the search filter.
            const rawAssignedTo = t.assignedTo || t.assignee || t.assignedToName;
            const assignedToList = Array.isArray(rawAssignedTo) ? rawAssignedTo : (rawAssignedTo ? [rawAssignedTo] : []);
            const assignedTo = assignedToList.length
                ? assignedToList.map(resolveName).join(", ")
                : "Unassigned";
            // assignedBy/doneBy are plain email strings (the app's login
            // "username" IS the email — see NavigationHelper/MainActivity),
            // so resolve those too.
            const assignedBy = resolveName(t.assignedBy || t.createdBy || t.assignedByName) || "Unknown";
            const title = t.title || t.name || t.taskName || "Untitled task";
            const createdAt = t.createdAt || t.assignedAt || t.timestamp;
            // The mobile app (ScheduleActivity.markTaskDoneInFirestore) writes
            // status: "Done" and a "doneAt" server timestamp when a task is
            // marked complete — it never writes "completed"/"completedAt"/
            // "updatedAt". Match those actual field/value names, falling back
            // to the older names in case some other writer used them.
            const isDone = t.status === "Done" || t.status === "completed";
            const completedAt = t.doneAt || t.completedAt || (isDone ? t.updatedAt : null);
            // Who actually tapped "Mark as Done" (an email) — more accurate
            // than assignedTo for a completion event, since an owner can also
            // complete a task assigned to someone else.
            const completedBy = resolveName(t.doneBy) || assignedTo;

            if (createdAt) {
                entries.push({
                    id: `task-assign-${id}`,
                    type: "task_assign",
                    module: "Tasks",
                    message: `${assignedBy} assigned "${title}" to ${assignedTo}`,
                    userName: assignedBy,
                    userEmail: "",
                    role: "",
                    timestamp: createdAt,
                });
            }

            if (completedAt) {
                entries.push({
                    id: `task-complete-${id}`,
                    type: "task_complete",
                    module: "Tasks",
                    message: `${completedBy} completed "${title}"`,
                    userName: completedBy,
                    userEmail: "",
                    role: "",
                    // Proof of completion captured by the mobile app's
                    // Mark-as-Done flow (both required there before the
                    // task can be marked Done).
                    details: t.doneComment || "",
                    imageBase64: t.doneImageUrl || "",
                    timestamp: completedAt,
                });
            }

            return entries;
        }).sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp))
          // Capped independently to 2x entryLimit (a task can contribute up
          // to two entries — assign + complete) since the tasks query below
          // fetches the whole collection with no limit of its own. See
          // emit() for why an unbounded array here used to cause other
          // problems when merged with the other three sources.
          .slice(0, entryLimit * 2);
    };

    const unsubTasks = onSnapshot(
        tasksRef,
        (snapshot) => {
            rawTaskDocs = snapshot.docs.map((d) => ({ id: d.id, t: d.data() }));
            buildTaskLogs();
            emit();
        },
        (error) => {
            console.error("Error subscribing to tasks:", error);
            emit();
        }
    );

    // 4. Feed/supplement quantity changes (Firestore) — written by the
    //    mobile app's stock-update screen (FeedInventoryActivity.commitFeedChange)
    //    as a structured before/after audit entry. Mapped into the same
    //    { type: "update", message, details, ... } shape the website's own
    //    quantity edits use, so both show up under "Updated" in the UI.
    const inventoryRef = collection(db, "inventory_history");
    const inventoryQuery = query(inventoryRef, orderBy("timestamp", "desc"), limit(entryLimit));

    const buildInventoryLogs = () => {
        inventoryLogs = rawInventoryDocs.map(({ id, entry }) => {
            const action = entry.action === "deduct" ? "decreased" : "increased";
            // Despite the field name, editedByName is populated from
            // AccountManager.getCurrentUsername() — which is the login
            // email (registerAccount(email, email, ...) stores username
            // == email), not a display name. Resolve it like the other
            // modules.
            const editorName = resolveName(entry.editedByName) || "Someone";
            return {
                id: `inventory-${id}`,
                type: "update",
                module: "Inventory",
                message: `${editorName} ${action} stock of ${entry.productName || "an item"} from ${entry.quantityBefore ?? "?"} to ${entry.quantityAfter ?? "?"}`,
                details: `Previous quantity: ${entry.quantityBefore ?? "?"} → New quantity: ${entry.quantityAfter ?? "?"}`,
                userName: editorName,
                userEmail: "",
                role: entry.editedByRole || "",
                timestamp: entry.timestamp,
            };
        });
    };

    const unsubInventory = onSnapshot(
        inventoryQuery,
        (snapshot) => {
            rawInventoryDocs = snapshot.docs.map((d) => ({ id: d.id, entry: d.data() }));
            buildInventoryLogs();
            emit();
        },
        (error) => {
            console.error("Error subscribing to inventory_history:", error);
            emit();
        }
    );

    return () => {
        unsubActivity();
        unsubEgg();
        unsubUsers();
        unsubTasks();
        unsubInventory();
    };

};