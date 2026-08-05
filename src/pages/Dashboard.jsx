import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Menu, Home, Users, User, LogOut, ShoppingBag, Bell, Activity } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { clearSession } from '../firebase';
import { logActivity } from '../services/activityService';

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Retrieve user data from localStorage as we are using custom Firestore-based login
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    try {
      await clearSession(user?.uid);
    } catch (err) {
      console.error('Failed to clear session:', err);
    }

    logActivity({
      type: 'logout',
      message: `${user?.name || user?.email || 'A user'} logged out`,
      userName: user?.name,
      userEmail: user?.email,
      role: user?.role,
    });

    localStorage.removeItem('user');
    toast.success('Successfully logged out');
    navigate('/');
  };

  const mainNavItems = [
    { icon: Home, label: 'Dashboard', path: '/dashboard' },
    { icon: Users, label: 'User Management', path: '/dashboard/user-management' },
    { icon: ShoppingBag, label: 'Feed Inventory', path: '/dashboard/feed-inventory' },
    { icon: Activity, label: 'Activity Logs', path: '/dashboard/activity-logs' },
  ];

  const bottomNavItems = [
    { icon: LogOut, label: 'Logout', action: handleLogout },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-[#2D5016] text-white transition-all duration-300 flex flex-col`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img src="/logo_quailfarm.png" alt="Logo" className="w-7 h-7 object-contain" />
            </div>
            {sidebarOpen && (
              <div>
                <h1 className="font-bold text-lg leading-tight">Waje's Quail Farm</h1>
                <p className="text-xs text-white/60">Farm Management</p>
              </div>
            )}
          </div>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {mainNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-white/15 text-white font-semibold shadow-inner ring-1 ring-white/10'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'stroke-[2.5px]' : ''}`} />
                {sidebarOpen && <span className="font-medium">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bottom Navigation */}
        <div className="p-4 border-t border-white/10 space-y-1">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            
            return (
              <button
                key={item.label}
                onClick={item.action || (() => item.path && navigate(item.path))}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/80 hover:bg-white/10 hover:text-white transition-all"
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && <span className="font-medium">{item.label}</span>}
              </button>
            );
          })}
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-4 border-t border-white/10 hover:bg-white/10 transition-colors"
        >
          <Menu className="w-5 h-5 mx-auto" />
        </button>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200 px-8 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 font-medium mb-0.5">
                Waje's Quail Farm <span className="mx-1 text-gray-300">/</span> {mainNavItems.find(item => item.path === location.pathname)?.label || 'Farm Overview'}
              </p>
              <h2 className="text-2xl font-bold text-gray-900">
                {mainNavItems.find(item => item.path === location.pathname)?.label || 'Farm Overview'}
              </h2>
              <p className="text-sm text-gray-600 mt-0.5">
                {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                <span className="mx-2 text-gray-300">|</span>
                <span className="font-mono text-[#2D5016] font-bold">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Notification Bell */}
              <button className="relative p-2 rounded-full hover:bg-gray-100 transition-colors">
                <Bell className="w-5 h-5 text-gray-500" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
              </button>

              {/* User Profile */}
              <button
                onClick={() => navigate('/dashboard/profile')}
                className="flex items-center gap-3 hover:bg-gray-100 rounded-full pl-1 pr-4 py-1 transition-colors"
              >
                <div className="w-10 h-10 bg-[#2D5016] rounded-full flex items-center justify-center overflow-hidden border border-gray-200">
                  {user.profilePic && user.profilePic !== "" ? (
                    <img 
                      src={user.profilePic} 
                      alt="Profile" 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none'; // Hide broken image if URL fails
                      }}
                    />
                  ) : (
                    <User className="w-6 h-6 text-white" />
                  )}
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">
                    {user?.name || user?.email || 'User'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {user?.role === 'owner' ? 'Farm Owner' : 
                     user?.role === 'backup_owner' ? 'Co Farm Owner' : 
                     'Farm Staff'}
                  </p>
                </div>
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-7xl mx-auto p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
