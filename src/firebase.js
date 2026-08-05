// Firebase core
import { initializeApp } from "firebase/app";

// Firebase services
import { getFirestore, doc, setDoc, deleteDoc } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getDatabase } from "firebase/database";

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