import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase'; // Ensure db is exported from your firebase.js
import { toast } from 'sonner';
import LoadingScreen from '../components/LoadingScreen';
import { logActivity } from '../services/activityService';

export default function Login() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      
      // Query Firestore for the user
      const usersRef = collection(db, 'user_access'); // Match your collection name
      const q = query(usersRef, where('email', '==', email), where('password', '==', password));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error('Invalid email or password.');
      }

      // Login success
      const userData = querySnapshot.docs[0].data();
      localStorage.setItem('user', JSON.stringify(userData)); // Basic session management

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
          <h2 className="text-2xl font-bold text-[#2D5016] mb-2">Welcome Back!</h2>
          <p className="text-gray-600 mb-6">Sign in to manage your farm</p>
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

            {/* Remember Me */}
            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 text-[#2D5016] focus:ring-[#2D5016]"
                />
                <span className="text-sm text-gray-600">Remember me</span>
              </label>
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