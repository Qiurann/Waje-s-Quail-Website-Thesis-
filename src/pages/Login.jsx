import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth, ensureAnonymousAuth, writeSession } from '../firebase'; // Ensure db is exported from your firebase.js
import { toast } from 'sonner';
import LoadingScreen from '../components/LoadingScreen';
import { logActivity } from '../services/activityService';
import { claimTabForSession } from '../services/sessionGuard';
import {
  markSessionStart,
  getLoginLockState,
  recordFailedLogin,
  clearLoginAttempts,
} from '../services/sessionSecurity.js';

// Generic on purpose: shown for a wrong password, an email that doesn't
// exist, AND a valid staff (non-owner) login. Distinguishing between those
// cases in the UI would let an attacker use this form as an oracle to
// confirm a real email address, or even a real staff email+password pair,
// without ever needing owner access.
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

export default function Login() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Read straight from the form instead of trusting `email`/`password`
    // state alone. Browser/password-manager autofill often sets the input's
    // DOM value without firing a real `input` event, so React's controlled
    // state can still be '' on the very first submit even though the field
    // visibly shows the filled-in text — the query below would then run
    // with blank credentials and fail. FormData always reflects what's
    // actually in the DOM right now, so this makes the very first submit
    // reliable regardless of how the fields got filled in.
    const formData = new FormData(e.currentTarget);
    const emailValue = (formData.get('email') || email || '').toString().trim();
    const passwordValue = (formData.get('password') || password || '').toString();

    // Too many recent failures for this email on this browser — don't even
    // touch Firestore. See services/sessionSecurity.js for what this does
    // and doesn't protect against.
    const lockState = getLoginLockState(emailValue);
    if (lockState.locked) {
      const minutesLeft = Math.max(1, Math.ceil(lockState.remainingMs / 60000));
      toast.error(`Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`);
      return;
    }

    try {
      setLoading(true);

      // App.jsx kicks off anonymous auth once, on first page load. But if
      // that one-shot attempt failed (e.g. a network hiccup while the page
      // was loading), auth.currentUser is still null and every Firestore
      // call below needs it. Calling ensureAnonymousAuth() here re-attempts
      // it when the earlier attempt failed (see firebase.js) and simply
      // resolves immediately when it already succeeded, so this is always
      // safe/cheap and makes a login attempt self-healing instead of
      // failing forever until the page is refreshed.
      try {
        await ensureAnonymousAuth();
      } catch {
        throw new Error('Could not connect to the server. Please check your connection and try again.');
      }

      // Query Firestore for the user
      const usersRef = collection(db, 'user_access'); // Match your collection name
      const q = query(usersRef, where('email', '==', emailValue), where('password', '==', passwordValue));
      const querySnapshot = await getDocs(q);

      // Records the failure, logs it for the owner's audit trail, and
      // throws the generic message shown in the UI. If this attempt was
      // the one that crossed the lockout threshold, logs that separately
      // too so a brute-force burst is easy to spot in Activity Logs.
      const failLogin = (details, extra = {}) => {
        const state = recordFailedLogin(emailValue);
        logActivity({
          type: 'login_failed',
          message: `Failed login attempt for ${emailValue}`,
          userEmail: emailValue,
          details,
          ...extra,
        });
        if (state.lockedUntil) {
          logActivity({
            type: 'login_locked',
            message: `${emailValue} locked out after repeated failed login attempts`,
            userEmail: emailValue,
            details: `${state.count} failed attempts in a row.`,
          });
        }
        throw new Error(INVALID_CREDENTIALS_MESSAGE);
      };

      if (querySnapshot.empty) {
        failLogin('No matching email/password.');
      }

      // Login success
      const userData = querySnapshot.docs[0].data();

      // The website is owner-only. Staff accounts are for the mobile app;
      // block them here before any session doc is written so a staff
      // login never reaches the dashboard. The error shown to the user is
      // intentionally the same generic message as above — see
      // INVALID_CREDENTIALS_MESSAGE — even though we log the real reason
      // here for the owner's audit trail.
      if (userData.role !== 'owner') {
        failLogin('Valid staff credentials used on the owner-only website.', {
          userName: userData.name,
          role: userData.role,
        });
      }

      // The Firestore rules key every privileged read/write off
      // sessions/{uid} (looked up via request.auth.uid), because the app
      // uses anonymous Firebase Auth for everyone. Anonymous auth was
      // already confirmed above, so this just reads the uid — without
      // writing sessions/{uid} here, isApprovedStaff()/isOwner() in the
      // rules always evaluate false and every subsequent call (reading feed
      // inventory, updating quantities, writing activity logs) gets
      // silently rejected with "Missing or insufficient permissions".
      // Write the session doc now, using the same uid, so the rules can
      // find it.
      const uid = auth.currentUser.uid;
      await writeSession({
        uid,
        email: userData.email,
        role: userData.role,
        status: userData.status,
      });

      // Firestore Security Rules cache the result of get()/exists() lookups
      // used *inside* rules (here, every other collection's rule reads
      // sessions/{uid} to check isOwner()) for a couple of seconds after the
      // referenced document changes. writeSession() above already waited for
      // the write itself to be acknowledged, but the rules engine's cache of
      // it can still lag just behind that for a moment. Navigating to the
      // dashboard immediately can land the very first Firestore reads
      // (inventory, activity logs, etc.) inside that gap, so they come back
      // "Missing or insufficient permissions" and the page looks broken —
      // which is exactly what a refresh (and logging in again) fixes, since
      // by then the rules cache has caught up. A short pause here lets it
      // catch up before we ever navigate, so the dashboard loads correctly
      // on the very first try.
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Store uid alongside the profile so Dashboard.handleLogout can call
      // clearSession(user.uid) to remove the session doc again.
      //
      // Deliberately exclude `password`: userData is the raw Firestore
      // doc, which still has the plaintext password field on it (see the
      // query above). Without this, that password sat in localStorage —
      // in the clear, indefinitely, readable by any script on the page —
      // for the entire session even though nothing on the website ever
      // needs it after login.
      const { password: _password, ...safeUserData } = userData;
      const sessionUser = { ...safeUserData, uid };
      localStorage.setItem('user', JSON.stringify(sessionUser)); // Basic session management

      // Starts the absolute-session-lifetime clock and clears any past
      // failed-attempt lockout for this email now that it's succeeded.
      // See services/sessionSecurity.js.
      markSessionStart();
      clearLoginAttempts(emailValue);

      // Tells Dashboard this is a fresh login (as opposed to a refresh or
      // in-app navigation) so it can start with the sidebar collapsed
      // instead of remembering whatever state it was left in. Read once
      // and cleared by Dashboard on mount — see Dashboard.jsx.
      sessionStorage.setItem('justLoggedIn', '1');

      // Marks this browser tab as the owner of the new session, so the
      // session guard (App.jsx) knows a later refresh/navigation in this
      // same tab is not a session end. See services/sessionGuard.js.
      claimTabForSession(uid);

      logActivity({
        type: 'login',
        message: `${userData.name || userData.email} logged in`,
        userName: userData.name,
        userEmail: userData.email,
        role: userData.role,
      });

      toast.success('Successfully logged in!');
      navigate('/dashboard');
    } catch (error) {
      console.error('Login error:', error);
      toast.error(error.message || 'Failed to login. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {loading && <LoadingScreen message="Accessing farm records..." />}
      <div className="min-h-screen bg-gradient-to-br from-[#2D5016] via-[#3d6b1f] to-[#2D5016] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand Section */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-white rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg">
            <img src="/logo_quailfarm.png" alt="Waje's Quail Farm Logo" className="w-14 h-14 object-contain" />
          </div>
          <h1 className="text-white text-3xl font-bold mb-2">Waje's Quail Farm</h1>
          <p className="text-white/80">Farm Management System</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  id="email"
                  name="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#2D5016] focus:border-transparent outline-none transition-all text-gray-900 placeholder-gray-400"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#2D5016] focus:border-transparent outline-none transition-all text-gray-900 placeholder-gray-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#2D5016] text-white py-3 rounded-xl font-medium hover:bg-[#3d6b1f] transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
        <p className="text-center text-white/60 text-sm mt-6">
          © 2026 Waje's Quail Farm. All rights reserved.
        </p>
      </div>
    </div>
    </>
  );
}