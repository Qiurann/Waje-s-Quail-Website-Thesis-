import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, rtdb } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import LoadingScreen from '../components/LoadingScreen';
import { subscribeToAppStatus } from '../services/appSettings';
import { subscribeToAuditTrail } from '../services/activityService';

// Same type -> label/color mapping as pages/ActivityLogs.jsx, kept in sync
// so a badge here always matches how that same entry is labeled there.
const TYPE_META = {
  login: { label: 'Login', color: 'bg-green-100 text-green-700' },
  logout: { label: 'Logout', color: 'bg-gray-100 text-gray-700' },
  create: { label: 'Created', color: 'bg-blue-100 text-blue-700' },
  update: { label: 'Updated', color: 'bg-amber-100 text-amber-700' },
  delete: { label: 'Deleted', color: 'bg-red-100 text-red-700' },
  task_assign: { label: 'Task Assigned', color: 'bg-indigo-100 text-indigo-700' },
  task_complete: { label: 'Task Completed', color: 'bg-teal-100 text-teal-700' },
  egg_count: { label: 'Egg Count', color: 'bg-orange-100 text-orange-700' },
  maintenance: { label: 'Maintenance', color: 'bg-purple-100 text-purple-700' },
};

// Same Firestore-Timestamp-or-string handling as ActivityLogs.jsx's
// formatTimestamp, condensed to date + time for this card.
function formatEntryDate(ts) {
  if (!ts) return '';
  const date = typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function Home() {
  const navigate = useNavigate();
  const [eggCount, setEggCount] = useState(0);
  const [feedItems, setFeedItems] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [systemDown, setSystemDown] = useState(false);

  useEffect(() => {
    // 1. Listen to Realtime Database for Egg Collection (today's stat card
    // only — Recent Activity below is now sourced from the same audit
    // trail as the Activity Logs page, see subscribeToAuditTrail below).
    const eggRef = ref(rtdb, 'egg_collections');
    const unsubscribeRtdb = onValue(eggRef, (snapshot) => {
      const data = snapshot.val();
      const todayStr = new Date().toLocaleDateString('en-CA');

      if (data) {
        if (typeof data === 'number') {
          setEggCount(data);
        } else {
          const entries = Object.values(data).filter((e) => e && e.date);
          const todayEntry = entries.find((e) => e.date === todayStr);
          setEggCount(todayEntry?.total || 0);
        }
      } else {
        setEggCount(0);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error listening to egg_collections for Home page:", error);
      setSystemDown(true);
      // Without this, a transient read error (e.g. permissions still
      // propagating right after login) leaves `loading` stuck true forever,
      // so the full-screen LoadingScreen overlay never goes away until the
      // page is refreshed. Clear it here too so the dashboard still renders.
      setLoading(false);
    });

    // 2. Listen to Firestore for Feed Inventory
    const feedCollectionRef = collection(db, 'farm_data', 'shared', 'feed');
    const unsubscribeFeed = onSnapshot(feedCollectionRef, (snapshot) => {
      const items = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          name: data.name || 'Unnamed Item',
          status: data.status || 'In Stock',
        });
      });
      setFeedItems(items);
    }, (error) => {
      console.error("Error fetching feed inventory for Home page:", error);
      setFeedItems([]);
      setSystemDown(true);
    });

    // 3. Listen to App Settings for Maintenance Mode, so the dashboard's
    // System State card always reflects the live setting from App Settings.
    const unsubscribeAppStatus = subscribeToAppStatus((status) => {
      setMaintenanceMode(status.maintenanceMode);
    });

    // 4. Recent Activity — the same merged audit trail (logins/logouts,
    // task events, inventory updates, egg counts, etc.) that the Activity
    // Logs page shows, just capped to the latest few here.
    const unsubscribeActivity = subscribeToAuditTrail((entries) => {
      setRecentActivity(entries.slice(0, 4));
    }, 4);

    return () => {
      unsubscribeRtdb();
      unsubscribeFeed();
      unsubscribeAppStatus();
      unsubscribeActivity();
    };
  }, []);

  const lowStockItems = feedItems.filter((item) => item.status === 'Low Stock');

  // System State reflects the live app_status doc (App Settings ->
  // Maintenance Mode) plus whether the dashboard's own Firestore/RTDB
  // listeners are actually connected.
  const systemState = maintenanceMode
    ? { value: 'Maintenance Mode' }
    : systemDown
    ? { value: 'System Down' }
    : { value: 'Operational' };

  const statCards = [
    {
      label: 'Eggs Collected Today',
      value: eggCount.toLocaleString(),
      accent: 'border-l-green-500',
      valueColor: 'text-green-700',
    },
    {
      // Count of distinct inventory items — both Feed and Supplements docs
      // live together in farm_data/shared/feed — not a sum of their
      // quantities — summing "sacks" and "bottles" together into one number
      // was meaningless across mixed units anyway (see FeedInventory.jsx's
      // per-category getQuantityLabel/Unit).
      label: 'Inventory Items',
      value: feedItems.length.toLocaleString(),
      accent: 'border-l-blue-500',
      valueColor: 'text-blue-700',
    },
    {
      label: 'Low Stock Alerts',
      value: lowStockItems.length,
      accent: 'border-l-red-500',
      valueColor: 'text-red-700',
    },
    {
      label: 'System State',
      value: systemState.value,
      accent: maintenanceMode
        ? 'border-l-amber-500'
        : systemDown
        ? 'border-l-red-500'
        : 'border-l-purple-500',
      valueColor: maintenanceMode
        ? 'text-amber-700'
        : systemDown
        ? 'text-red-700'
        : 'text-purple-700',
    },
  ];

  return (
    <>
      {loading && <LoadingScreen message="Preparing your farm overview..." />}
      <div className="space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((card) => (
            <div
              key={card.label}
              className={`bg-white border border-gray-300 border-l-4 ${card.accent} rounded-2xl p-6 shadow-sm`}
            >
              <div className="text-xs font-bold uppercase tracking-wide text-gray-700 mb-3">{card.label}</div>
              <div className={`font-extrabold ${card.valueColor} ${String(card.value).length > 10 ? 'text-2xl' : 'text-4xl'}`}>
                {card.value}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Recent Activity */}
          <div className="bg-white border border-gray-300 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4">Recent Activities</h3>
            {recentActivity.length > 0 ? (
              <ul className="divide-y divide-gray-300">
                {recentActivity.map((entry) => {
                  const meta = TYPE_META[entry.type] || { label: entry.type || 'Activity', color: 'bg-gray-100 text-gray-700' };
                  return (
                    <li key={entry.id} className="flex items-center justify-between py-3 gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`text-xs font-semibold ${meta.color} px-2 py-1 rounded-md whitespace-nowrap`}>
                          {meta.label}
                        </span>
                        <span className="text-sm text-gray-900 truncate">
                          {entry.message}
                        </span>
                      </div>
                      <span className="text-xs text-gray-800 whitespace-nowrap">{formatEntryDate(entry.timestamp)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-gray-700 py-2">No recent activity logged yet.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}