import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

/* ===========================================================================
   App Status (system_settings/app_status)

   A single shared doc that gates the Android app's login screen (see
   MainActivity.checkMaintenanceThenProceed()) via a live Firestore listener.
   Written from here (the website's App Settings page); read by both the
   website and the mobile app.

   No new Firestore rules needed — system_settings already allows
   read: isAuthed(), write: isOwner() (see firestore.rules), which covers
   both apps since both sign in anonymously.

   Fields:
     maintenanceMode: boolean — true blocks entry on the Android login screen
     message:         string  — shown to users while blocked (optional;
                                 Android falls back to a default message)
     updatedAt:       server timestamp
     updatedBy:       display name of whoever last changed it, for the
                       website's own UI (not read by the Android app)
=========================================================================== */

const APP_STATUS_REF = doc(db, "system_settings", "app_status");

export const subscribeToAppStatus = (callback) => {
    return onSnapshot(
        APP_STATUS_REF,
        (snapshot) => {
            const data = snapshot.exists() ? snapshot.data() : {};
            callback({
                maintenanceMode: data.maintenanceMode === true,
                message: data.message || "",
                updatedAt: data.updatedAt || null,
                updatedBy: data.updatedBy || "",
            });
        },
        (error) => {
            console.error("Error subscribing to app_status:", error);
        }
    );
};

export const setMaintenanceMode = async ({ enabled, message, updatedBy }) => {
    await setDoc(
        APP_STATUS_REF,
        {
            maintenanceMode: !!enabled,
            message: message || "",
            updatedAt: serverTimestamp(),
            updatedBy: updatedBy || "",
        },
        { merge: true }
    );
};