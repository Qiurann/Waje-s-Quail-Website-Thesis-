// Firebase core
import { initializeApp } from "firebase/app";

// Firebase services
import { getFirestore, doc, setDoc, deleteDoc, enableNetwork, disableNetwork } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getDatabase, goOffline, goOnline } from "firebase/database";

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyATeu_ZLnQRFpbh71uWPC-KN5OY6ougvmo",
  authDomain: "exp1-cff54.firebaseapp.com",
  databaseURL: "https://exp1-cff54-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "exp1-cff54",
  storageBucket: "exp1-cff54.firebasestorage.app",
  messagingSenderId: "441160922275",
  appId: "1:441160922275:web:3be95c1efc6090eac8fb16",
  measurementId: "G-8QHS6048KT"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);

// ── Auth bootstrap ──────────────────────────────────────────────────────────
// The Firestore rules require request.auth to be set (they look up
// sessions/$(request.auth.uid) for every privileged read/write). The Android
// app satisfies this with an anonymous Firebase Auth session created at login
// (MainActivity.enterApp). The website must do the same thing, or every call
// gets rejected with "Missing or insufficient permissions" before it ever
// checks email/password. Call ensureAnonymousAuth() before touching Firestore.
let authReadyPromise = null;

export function ensureAnonymousAuth() {
  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          if (user) {
            unsubscribe();
            resolve(user);
          }
        },
        (err) => {
          unsubscribe();
          reject(err);
        }
      );

      if (!auth.currentUser) {
        signInAnonymously(auth).catch((err) => {
          unsubscribe();
          reject(err);
        });
      }
    });
  }
  return authReadyPromise;
}

// ── sessions/{uid} helpers ───────────────────────────────────────────────────
// Mirrors NavigationHelper on Android: write the session doc on successful
// login (so isOwner()/isApprovedStaff() in the rules can find it), delete it
// on logout.
export async function writeSession({ uid, email, role, status }) {
  await setDoc(doc(db, "sessions", uid), { email, role, status });
}

export async function clearSession(uid) {
  if (!uid) return;
  await deleteDoc(doc(db, "sessions", uid));
}

// ── Recover from back/forward-cache (bfcache) restores ──────────────────────
// When the browser navigates away with the page eligible for bfcache, Chrome
// freezes JS execution and closes any open WebSockets (both the RTDB socket
// and Firestore's WebChannel "Listen" stream) out from under the SDKs —
// neither SDK watches for this itself. On restore, the page resumes with
// those connections dead, so `onValue`/`onSnapshot` listeners stop receiving
// updates and the ones that hit an outright error (e.g. Firestore's Listen
// stream getting a 400 after coming back) can leave listeners stuck.
// `pageshow` with `event.persisted === true` is the standard signal that the
// page just came out of bfcache (a normal first load never sets this), so we
// use it to force both SDKs to drop and re-establish their connections.
if (typeof window !== "undefined") {
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;

    goOffline(rtdb);
    goOnline(rtdb);

    disableNetwork(db)
      .then(() => enableNetwork(db))
      .catch((err) => console.error("Failed to reconnect Firestore after bfcache restore:", err));
  });
}