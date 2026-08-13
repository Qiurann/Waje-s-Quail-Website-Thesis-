import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Egg, Package, AlertTriangle, ShieldCheck, Bell } from 'lucide-react';
import { db, rtdb } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import LoadingScreen from '../components/LoadingScreen';

export default function Home() {
  const navigate = useNavigate();
  const [eggCount, setEggCount] = useState(0);
  const [feedQuantity, setFeedQuantity] = useState(0);
  const [feedItems, setFeedItems] = useState([]);
  const [recentEggLogs, setRecentEggLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Get user data from local storage
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const firstName = (user?.name || user?.fullName || 'Farmer').split(' ')[0];

  useEffect(() => {
    // 1. Listen to Realtime Database for Egg Collection
    const eggRef = ref(rtdb, 'egg_collections');
    const unsubscribeRtdb = onValue(eggRef, (snapshot) => {
      const data = snapshot.val();
      const todayStr = new Date().toLocaleDateString('en-CA');

      if (data) {
        if (typeof data === 'number') {
          setEggCount(data);
          setRecentEggLogs([]);
        } else {
          const entries = Object.values(data).filter((e) => e && e.date);
          const todayEntry = entries.find((e) => e.date === todayStr);
          setEggCount(todayEntry?.total || 0);

          const sorted = [...entries]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 4);
          setRecentEggLogs(sorted);
        }
      } else {
        setEggCount(0);
        setRecentEggLogs([]);
      }
      setLoading(false);
    });

    // 2. Listen to Firestore for Feed Inventory
    const feedCollectionRef = collection(db, 'farm_data', 'shared', 'feed');
    const unsubscribeFeed = onSnapshot(feedCollectionRef, (snapshot) => {
      let totalFeed = 0;
      const items = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        totalFeed += Number(data.quantity || 0);
        items.push({
          id: doc.id,
          name: data.name || 'Unnamed Item',
          status: data.status || 'In Stock',
        });
      });
      setFeedQuantity(totalFeed);
      setFeedItems(items);
    }, (error) => {
      console.error("Error fetching feed quantity for Home page:", error);
      setFeedQuantity(0);
      setFeedItems([]);
    });

    return () => {
      unsubscribeRtdb();
      unsubscribeFeed();
    };
  }, []);

  const lowStockItems = feedItems.filter((item) => item.status === 'Low Stock');

  const statCards = [
    {
      label: 'Eggs Collected Today',
      value: eggCount.toLocaleString(),
      icon: Egg,
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      badge: 'Today',
      badgeBg: 'bg-green-600',
    },
    {
      label: 'Feed Stock (sacks)',
      value: feedQuantity.toLocaleString(),
      icon: Package,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      badge: 'Stock',
      badgeBg: 'bg-blue-600',
    },
    {
      label: 'Low Stock Alerts',
      value: lowStockItems.length,
      icon: AlertTriangle,
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      badge: 'Alert',
      badgeBg: 'bg-red-600',
    },
    {
      label: 'System Health',
      value: 'Good',
      icon: ShieldCheck,
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      badge: 'Status',
      badgeBg: 'bg-purple-600',
    },
  ];

  return (
    <>
      {loading && <LoadingScreen message="Preparing your farm overview..." />}
      <div className="space-y-6">
        {/* Welcome line */}
        <p className="text-gray-500">
          Welcome back, <span className="font-semibold text-gray-800">{firstName}</span>
        </p>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                <div className="flex items-start justify-between mb-4">
                  <span className="text-sm text-gray-500">{card.label}</span>
                  <div className={`w-9 h-9 ${card.iconBg} rounded-lg flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${card.iconColor}`} />
                  </div>
                </div>
                <div className="text-3xl font-bold text-gray-900">{card.value}</div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Alerts & Notifications */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-gray-900">Alerts & Notifications</h3>
            </div>
            {lowStockItems.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {lowStockItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-3 text-sm text-gray-700">
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full flex-shrink-0" />
                    {item.name} is below reorder level
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400 py-2">All stock levels are healthy right now.</p>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4">Recent Activity</h3>
            {recentEggLogs.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {recentEggLogs.map((entry, idx) => (
                  <li key={idx} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-md">
                        Egg Log
                      </span>
                      <span className="text-sm text-gray-700">
                        {(entry.total || 0).toLocaleString()} eggs collected
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">{entry.date}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400 py-2">No recent activity logged yet.</p>
            )}
          </div>
        </div>

        <p className="text-center text-gray-400 text-xs pt-2">
          Live updates connected to Waje's Quail Farm Database
        </p>
      </div>
    </>
  );
}
