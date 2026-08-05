import React, { useState, useEffect } from 'react';
import { ShoppingBag, AlertTriangle, Plus, Package, MapPin, Search } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import LoadingScreen from '../components/LoadingScreen';

export default function FeedInventory() {
  const [inventoryItems, setInventoryItems] = useState([]);
  const [activeTab, setActiveTab] = useState('All Items');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Formatting for Currency (PH)
  const phpCurrency = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  });

  useEffect(() => {
    const feedCollectionRef = collection(db, 'farm_data', 'shared', 'feed');
    
    const unsubscribe = onSnapshot(feedCollectionRef, (snapshot) => {
      const items = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          name: data.name || 'Unnamed',
          invNumber: data.invNumber || '#INV----',
          description: data.description || '',
          category: data.category || 'Feed',
          location: data.location || 'Location Info',
          quantity: Number(data.quantity || 0),
          unitPrice: Number(data.unitPrice || 0),
          status: data.status || 'In Stock',
          totalValue: Number(data.quantity || 0) * Number(data.unitPrice || 0)
        });
      });
      setInventoryItems(items);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching feed inventory:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Derived Summary Stats
  const totalInventoryValue = inventoryItems.reduce((acc, item) => acc + item.totalValue, 0);
  const lowStockCount = inventoryItems.filter(item => item.status === 'Low Stock').length;
  const uniqueLocations = new Set(inventoryItems.map(item => item.location)).size;

  // Filtering Logic
  const filteredItems = inventoryItems.filter((item) => {
    const matchesTab = activeTab === 'All Items' || item.category === activeTab;
    const matchesSearch = searchQuery === '' || 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.invNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const getStatusStyles = (status) => {
    switch (status) {
      case 'In Stock': return 'bg-green-100 text-green-700 border-green-200';
      case 'Medium': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Low Stock': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getQuantityLabel = (category) => {
    if (category === 'Feed') return 'Quantity (Sack)';
    if (category === 'Supplements') return 'Quantity (Bottle)';
    return 'Quantity';
  };

  return (
    <>
      {loading && <LoadingScreen message="Checking feed stock levels..." />}
      <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <Package className="w-10 h-10 text-blue-600" />
            <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">Value</span>
          </div>
          <div className="text-2xl font-bold text-blue-900 mb-1">{phpCurrency.format(totalInventoryValue)}</div>
          <div className="text-sm text-blue-700">Total Inventory Value</div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <ShoppingBag className="w-10 h-10 text-green-600" />
            <span className="bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full">Items</span>
          </div>
          <div className="text-3xl font-bold text-green-900 mb-1">{inventoryItems.length}</div>
          <div className="text-sm text-green-700">Total Items</div>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-300 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <AlertTriangle className="w-10 h-10 text-red-600" />
            <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full">Alert</span>
          </div>
          <div className="text-3xl font-bold text-red-900 mb-1">{lowStockCount}</div>
          <div className="text-sm text-red-700">Low Stock Items</div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <MapPin className="w-10 h-10 text-purple-600" />
            <span className="bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">Locations</span>
          </div>
          <div className="text-3xl font-bold text-purple-900 mb-1">{uniqueLocations}</div>
          <div className="text-sm text-purple-700">Stored Locations</div>
        </div>
      </div>

      {/* Controls: Tabs and Search */}
      <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
        <div className="flex bg-gray-200 p-1 rounded-xl">
          {['All Items', 'Feed', 'Supplements'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === tab ? 'bg-[#2D5016] text-white shadow-md' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, INV, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#2D5016] outline-none"
          />
        </div>
      </div>

      {/* Inventory Grid */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-1" />
          <h3 className="text-xl font-bold text-gray-900">{filteredItems.length} items found</h3>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredItems.map((item) => {
            return (
              <div key={item.id} className="border border-gray-200 rounded-2xl p-5 hover:border-[#2D5016] hover:shadow-md transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                      <ShoppingBag className="w-6 h-6 text-[#2D5016]" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900">{item.name}</h4>
                      <p className="text-xs text-gray-500 font-mono">{item.invNumber}</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusStyles(item.status)}`}>
                    {item.status}
                  </span>
                </div>

                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{item.description}</p>

                <div className="grid grid-cols-3 gap-4 py-4 border-t border-gray-100">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-bold">{getQuantityLabel(item.category)}</p>
                    <p className="text-lg font-bold text-gray-900">{item.quantity}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-bold">Unit Price</p>
                    <p className="text-lg font-bold text-gray-900">{phpCurrency.format(item.unitPrice)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase font-bold">Total Value</p>
                    <p className="text-lg font-bold text-[#2D5016]">{phpCurrency.format(item.totalValue)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <span className="flex items-center gap-1 text-xs font-medium text-gray-500">
                    <MapPin className="w-3 h-3" /> {item.location}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </>
  );
}