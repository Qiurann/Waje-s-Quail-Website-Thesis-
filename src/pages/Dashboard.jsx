import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Menu, Home, Users, User, LogOut, ShoppingBag, Activity, Wrench } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { clearSession } from '../firebase';
import { logActivity } from '../services/activityService';
import { releaseTabSession } from '../services/sessionGuard';

// Sidebar width bounds (px) for the drag-to-resize handle. These match the
// two fixed states the click-to-toggle button already used (w-20 / w-64),
// so dragging and clicking always land on the same two widths.
const COLLAPSED_WIDTH = 80;  // w-20
const EXPANDED_WIDTH = 256;  // w-64
const SNAP_THRESHOLD = (COLLAPSED_WIDTH + EXPANDED_WIDTH) / 2;

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Retrieve user data from localStorage as we are using custom Firestore-based login
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  // Start collapsed immediately after a fresh login (see Login.jsx, which
  // sets this flag right before navigating here) instead of always opening
  // wide by default. Read once on mount and clear it right away so it
  // doesn't re-trigger on a later in-app navigation or refresh within the
  // same session.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const justLoggedIn = sessionStorage.getItem('justLoggedIn') === '1';
    return !justLoggedIn;
  });
  useEffect(() => {
    sessionStorage.removeItem('justLoggedIn');
  }, []);

  // Drag-to-resize: lets the person grab the sidebar's right edge and drag
  // it instead of only clicking the toggle button at the bottom. It doesn't
  // resize to an arbitrary width — dragging past the midpoint between the
  // collapsed and expanded widths snaps sidebarOpen to whichever side
  // you're closer to when the drag ends, same two fixed states as before.
  const [isDragging, setIsDragging] = useState(false);
  const [dragWidth, setDragWidth] = useState(null); // live width while dragging, null when not
  const asideRef = useRef(null);

  const handleDragStart = (e) => {
    e.preventDefault();
    setIsDragging(true);
    setDragWidth(sidebarOpen ? EXPANDED_WIDTH : COLLAPSED_WIDTH);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const left = asideRef.current?.getBoundingClientRect().left ?? 0;
      const raw = e.clientX - left;
      const clamped = Math.min(EXPANDED_WIDTH, Math.max(COLLAPSED_WIDTH, raw));
      setDragWidth(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragWidth((w) => {
        setSidebarOpen((w ?? COLLAPSED_WIDTH) >= SNAP_THRESHOLD);
        return null;
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // What's actually rendered as the aside's width: mid-drag it follows the
  // cursor (via dragWidth), otherwise it's one of the two fixed states.
  const currentWidth = dragWidth ?? (sidebarOpen ? EXPANDED_WIDTH : COLLAPSED_WIDTH);
  // Labels only render once there's roughly enough room for them, so text
  // doesn't wrap/overflow mid-drag before it snaps to the expanded width.
  const showLabels = currentWidth > SNAP_THRESHOLD;

  const handleLogout = async () => {
    // Log the activity BEFORE clearing the session — activity_logs writes
    // require sessions/{uid} to still exist per the Firestore rules (see
    // firebase.js). Clearing the session first causes this write to be
    // silently rejected as a permissions error.
    logActivity({
      type: 'logout',
      message: `${user?.name || user?.email || 'A user'} logged out`,
      userName: user?.name,
      userEmail: user?.email,
      role: user?.role,
    });

    try {
      await clearSession(user?.uid);
    } catch (err) {
      console.error('Failed to clear session:', err);
    }

    localStorage.removeItem('user');
    // Release this tab's session marker so the session guard doesn't try to
    // record a second (duplicate) Logout if the user later closes this same
    // tab or refreshes at the login page. See services/sessionGuard.js.
    releaseTabSession();
    toast.success('Successfully logged out');
    navigate('/');
  };

  const mainNavItems = [
    { icon: Home, label: 'Dashboard', path: '/dashboard' },
    { icon: Users, label: 'User Management', path: '/dashboard/user-management' },
    { icon: ShoppingBag, label: 'Inventory', path: '/dashboard/feed-inventory' },
    { icon: Activity, label: 'Activity Logs', path: '/dashboard/activity-logs' },
    // Owner-only: controls system_settings/app_status, which gates the
    // mobile app's login screen. See services/appSettings.js.
    ...(user?.role === 'owner'
      ? [{ icon: Wrench, label: 'App Settings', path: '/dashboard/app-settings' }]
      : []),
  ];

  const bottomNavItems = [
    { icon: LogOut, label: 'Logout', action: handleLogout },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        ref={asideRef}
        style={{ width: currentWidth }}
        className={`relative bg-[#2D5016] text-white flex-shrink-0 flex flex-col ${
          isDragging ? '' : 'transition-all duration-300'
        }`}
      >
        {/* Logo */}
        <div className="p-6 border-b-2 border-white/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img src="/logo_quailfarm.png" alt="Logo" className="w-7 h-7 object-contain" />
            </div>
            {showLabels && (
              <div>
                <h1 className="font-bold text-lg leading-tight text-white whitespace-nowrap">Waje's Quail Farm</h1>
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
                {showLabels && <span className="font-medium whitespace-nowrap">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bottom Navigation */}
        <div className="p-4 border-t-2 border-white/20 space-y-1">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            
            return (
              <button
                key={item.label}
                onClick={item.action || (() => item.path && navigate(item.path))}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/80 hover:bg-white/10 hover:text-white transition-all"
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {showLabels && <span className="font-medium whitespace-nowrap">{item.label}</span>}
              </button>
            );
          })}
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-4 border-t-2 border-white/20 hover:bg-white/10 transition-colors"
        >
          <Menu className="w-5 h-5 mx-auto" />
        </button>

        {/* Drag handle — grab the right edge to resize instead of clicking
            the toggle button above. Releasing snaps to whichever fixed
            width (collapsed/expanded) is closer, per the drag logic above. */}
        <div
          onMouseDown={handleDragStart}
          title="Drag to resize"
          className={`absolute top-0 right-0 h-full w-1.5 cursor-col-resize group ${
            isDragging ? 'bg-white/30' : 'hover:bg-white/20'
          }`}
        >
          <div className="absolute top-1/2 right-0 -translate-y-1/2 w-1 h-10 rounded-full bg-white/40 group-hover:bg-white/70 transition-colors" />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b-2 border-gray-200 px-8 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {mainNavItems.find(item => item.path === location.pathname)?.label || 'Farm Overview'}
              </h2>
            </div>
            
            <div className="flex items-center gap-4">
              {/* User Profile (display only — not a navigation link) */}
              <div
                className="flex items-center gap-3 rounded-full pl-1 pr-4 py-1"
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
              </div>
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