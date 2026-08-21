import React, { useState, useEffect } from 'react';
import { ShoppingBag, AlertTriangle, Plus, Package, MapPin, Search, Pencil, SquarePen, Trash2, X } from 'lucide-react';
import { collection, doc, onSnapshot, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import LoadingScreen from '../components/LoadingScreen';
import { logActivity, getCurrentActor } from '../services/activityService';

export default function FeedInventory() {
  const [inventoryItems, setInventoryItems] = useState([]);
  const [activeTab, setActiveTab] = useState('All Items');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Quantity-update modal state
  const [editingItem, setEditingItem] = useState(null);
  const [newQuantity, setNewQuantity] = useState('');
  const [savingQuantity, setSavingQuantity] = useState(false);
  const [quantityError, setQuantityError] = useState('');

  // Item-details-edit modal state (everything except invNumber, which is
  // never editable from the website)
  const [editingDetailsItem, setEditingDetailsItem] = useState(null);
  const [detailsForm, setDetailsForm] = useState({
    name: '',
    category: 'Feed',
    description: '',
    location: '',
    unit: '',
    unitPrice: '',
  });
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState('');

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
          unit: data.unit || '',
          quantity: Number(data.quantity || 0),
          initialQuantity: Number(data.initialQuantity || data.quantity || 0),
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
      case 'In Stock': return 'bg-green-50 text-green-700 border-green-100';
      case 'Medium': return 'bg-orange-50 text-orange-700 border-orange-100';
      case 'Low Stock': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Out of Stock': return 'bg-red-50 text-red-700 border-red-100';
      default: return 'bg-gray-50 text-gray-700 border-gray-100';
    }
  };

  const getQuantityLabel = (category) => {
    if (category === 'Feed') return 'Quantity (Sack)';
    if (category === 'Supplements') return 'Quantity (Bottle)';
    return 'Quantity';
  };

  const getUnitLabel = (category) => {
    if (category === 'Feed') return 'Sack';
    if (category === 'Supplements') return 'Bottle';
    return 'Unit';
  };

  // Mirrors the Android app's calculateStatus() so both sides agree on the
  // same thresholds. The website is the source of truth for `status`: it
  // recomputes and writes it here; Android only reads it, never overwrites it.
  const calculateStatus = (qty, initialQty) => {
    if (initialQty <= 0) return 'In Stock';
    const ratio = qty / initialQty;
    if (ratio <= 0.2) return 'Low Stock';
    if (ratio <= 0.5) return 'Medium';
    return 'In Stock';
  };

  const handleDeleteItem = async (item) => {
    const confirmed = window.confirm(`Delete "${item.name}" from inventory? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'farm_data', 'shared', 'feed', item.id));

      const actor = getCurrentActor();
      await logActivity({
        type: 'delete',
        module: 'Inventory',
        message: `${actor.userName || actor.userEmail || 'Someone'} deleted ${item.name} from inventory`,
        details: `Removed item: ${item.name} (${item.category})`,
        ...actor,
        metadata: {
          itemId: item.id,
          itemName: item.name,
          category: item.category,
        },
      });
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Unable to delete this item. Please try again.');
    }
  };

  const openEditQuantity = (item) => {
    setEditingItem(item);
    setNewQuantity(String(item.quantity));
    setQuantityError('');
  };

  const closeEditQuantity = () => {
    if (savingQuantity) return;
    setEditingItem(null);
    setNewQuantity('');
    setQuantityError('');
  };

  const handleUpdateQuantity = async (e) => {
    e.preventDefault();
    if (!editingItem) return;

    const previousQuantity = editingItem.quantity;
    const parsedQuantity = Number(newQuantity);

    if (newQuantity.trim() === '' || Number.isNaN(parsedQuantity) || parsedQuantity < 0) {
      setQuantityError('Please enter a valid quantity (0 or greater).');
      return;
    }

    if (parsedQuantity === previousQuantity) {
      // Nothing actually changed — no need to write an update or log it.
      closeEditQuantity();
      return;
    }

    setSavingQuantity(true);
    setQuantityError('');

    try {
      const itemRef = doc(db, 'farm_data', 'shared', 'feed', editingItem.id);
      const newInitialQuantity = parsedQuantity > editingItem.initialQuantity
        ? parsedQuantity
        : editingItem.initialQuantity;
      const newStatus = calculateStatus(parsedQuantity, newInitialQuantity);

      await updateDoc(itemRef, {
        quantity: parsedQuantity,
        initialQuantity: newInitialQuantity,
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      // Every quantity change is automatically recorded in Activity Logs
      // under the "Updated" category, capturing who made the change, the
      // previous and new quantities, and the date/time (via serverTimestamp).
      const actor = getCurrentActor();
      await logActivity({
        type: 'update',
        message: `${actor.userName || actor.userEmail || 'Someone'} updated quantity of ${editingItem.name} from ${previousQuantity} to ${parsedQuantity}`,
        details: `Previous quantity: ${previousQuantity} → New quantity: ${parsedQuantity}`,
        ...actor,
        metadata: {
          itemId: editingItem.id,
          itemName: editingItem.name,
          category: editingItem.category,
          previousQuantity,
          newQuantity: parsedQuantity,
        },
      });

      closeEditQuantity();
    } catch (error) {
      console.error('Error updating quantity:', error);
      setQuantityError('Unable to update quantity. Please try again.');
    } finally {
      setSavingQuantity(false);
    }
  };

  const openEditDetails = (item) => {
    setEditingDetailsItem(item);
    setDetailsForm({
      name: item.name,
      category: item.category,
      description: item.description,
      location: item.location,
      unit: item.unit,
      unitPrice: String(item.unitPrice),
    });
    setDetailsError('');
  };

  const closeEditDetails = () => {
    if (savingDetails) return;
    setEditingDetailsItem(null);
    setDetailsError('');
  };

  const handleDetailsFieldChange = (field) => (e) => {
    setDetailsForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleUpdateDetails = async (e) => {
    e.preventDefault();
    if (!editingDetailsItem) return;

    const trimmedName = detailsForm.name.trim();
    const parsedUnitPrice = Number(detailsForm.unitPrice);

    if (!trimmedName) {
      setDetailsError('Please enter an item name.');
      return;
    }
    if (detailsForm.unitPrice.trim() === '' || Number.isNaN(parsedUnitPrice) || parsedUnitPrice < 0) {
      setDetailsError('Please enter a valid unit price (0 or greater).');
      return;
    }

    setSavingDetails(true);
    setDetailsError('');

    try {
      const itemRef = doc(db, 'farm_data', 'shared', 'feed', editingDetailsItem.id);

      // invNumber is intentionally never included here — it is not editable
      // from the website.
      await updateDoc(itemRef, {
        name: trimmedName,
        category: detailsForm.category,
        description: detailsForm.description.trim(),
        location: detailsForm.location.trim(),
        unit: detailsForm.unit.trim(),
        unitPrice: parsedUnitPrice,
        updatedAt: serverTimestamp(),
      });

      const actor = getCurrentActor();
      await logActivity({
        type: 'update',
        module: 'Inventory',
        message: `${actor.userName || actor.userEmail || 'Someone'} updated details of ${trimmedName}`,
        details: `Updated item details for ${editingDetailsItem.invNumber}`,
        ...actor,
        metadata: {
          itemId: editingDetailsItem.id,
          itemName: trimmedName,
          invNumber: editingDetailsItem.invNumber,
        },
      });

      closeEditDetails();
    } catch (error) {
      console.error('Error updating item details:', error);
      setDetailsError('Unable to update item details. Please try again.');
    } finally {
      setSavingDetails(false);
    }
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

      {/* Inventory Table */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Search */}
        <div className="p-4 border-b-2 border-gray-200">
          <div className="relative w-full lg:w-96">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
            <input
              type="text"
              placeholder="Search inventory..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border-2 border-gray-300 rounded-xl shadow-sm text-gray-900 placeholder-gray-400 focus:border-[#2D5016] focus:ring-4 focus:ring-[#2D5016]/10 outline-none transition-colors"
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-1 px-4 pt-3">
          {['All Items', 'Feed', 'Supplements'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === tab ? 'bg-[#2D5016] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-bold text-gray-500 uppercase tracking-wide border-b-2 border-gray-300">
                <th className="px-4 py-2.5">Item</th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Unit</th>
                <th className="px-4 py-2.5">Qty on Hand</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-gray-900">
                      {item.name}
                      <span className="ml-2 font-normal text-xs text-gray-400 font-mono">{item.invNumber}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{item.category}</td>
                  <td className="px-4 py-2.5 text-gray-500">{item.unit || getUnitLabel(item.category)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`font-bold ${item.status === 'In Stock' ? 'text-gray-900' : 'text-amber-600'}`}>
                      {item.quantity}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getStatusStyles(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditDetails(item)}
                        title="Edit item details"
                        className="p-1.5 text-gray-400 hover:text-[#2D5016] hover:bg-gray-100 rounded-md transition-colors"
                      >
                        <SquarePen className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEditQuantity(item)}
                        title="Edit quantity"
                        className="p-1.5 text-gray-400 hover:text-[#2D5016] hover:bg-gray-100 rounded-md transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item)}
                        title="Delete item"
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-md transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredItems.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">No inventory items found.</p>
          )}
        </div>

        {/* Summary */}
        <div className="px-4 py-3 border-t-2 border-gray-200 text-xs text-gray-400">
          Showing {filteredItems.length} of {inventoryItems.length} items — {lowStockCount} low stock
        </div>
      </div>
      </div>

      {/* Update Quantity Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Update Quantity</h3>
              <button
                onClick={closeEditQuantity}
                disabled={savingQuantity}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-4">{editingItem.name}</p>

            <form onSubmit={handleUpdateQuantity} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">
                  Current {getQuantityLabel(editingItem.category)}
                </label>
                <div className="text-lg font-bold text-gray-900">{editingItem.quantity}</div>
              </div>

              <div>
                <label htmlFor="newQuantity" className="block text-xs font-bold text-gray-400 uppercase mb-1">
                  New {getQuantityLabel(editingItem.category)}
                </label>
                <input
                  id="newQuantity"
                  type="number"
                  min="0"
                  step="1"
                  autoFocus
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#2D5016] outline-none"
                />
              </div>

              {quantityError && (
                <p className="text-sm text-red-600">{quantityError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEditQuantity}
                  disabled={savingQuantity}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 font-bold hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingQuantity}
                  className="flex-1 py-2.5 rounded-xl bg-[#2D5016] text-white font-bold hover:bg-[#24400f] disabled:opacity-50"
                >
                  {savingQuantity ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Item Details Modal — every field except invNumber, which is
          not editable from the website */}
      {editingDetailsItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Edit Item Details</h3>
              <button
                onClick={closeEditDetails}
                disabled={savingDetails}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-4 font-mono">{editingDetailsItem.invNumber}</p>

            <form onSubmit={handleUpdateDetails} className="space-y-4">
              <div>
                <label htmlFor="detailsName" className="block text-xs font-bold text-gray-400 uppercase mb-1">
                  Name
                </label>
                <input
                  id="detailsName"
                  type="text"
                  value={detailsForm.name}
                  onChange={handleDetailsFieldChange('name')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#2D5016] outline-none"
                />
              </div>

              <div>
                <label htmlFor="detailsCategory" className="block text-xs font-bold text-gray-400 uppercase mb-1">
                  Category
                </label>
                <select
                  id="detailsCategory"
                  value={detailsForm.category}
                  onChange={handleDetailsFieldChange('category')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#2D5016] outline-none bg-white"
                >
                  <option value="Feed">Feed</option>
                  <option value="Supplements">Supplements</option>
                </select>
              </div>

              <div>
                <label htmlFor="detailsDescription" className="block text-xs font-bold text-gray-400 uppercase mb-1">
                  Description
                </label>
                <textarea
                  id="detailsDescription"
                  value={detailsForm.description}
                  onChange={handleDetailsFieldChange('description')}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#2D5016] outline-none"
                />
              </div>

              <div>
                <label htmlFor="detailsLocation" className="block text-xs font-bold text-gray-400 uppercase mb-1">
                  Location
                </label>
                <input
                  id="detailsLocation"
                  type="text"
                  value={detailsForm.location}
                  onChange={handleDetailsFieldChange('location')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#2D5016] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="detailsUnit" className="block text-xs font-bold text-gray-400 uppercase mb-1">
                    Unit
                  </label>
                  <input
                    id="detailsUnit"
                    type="text"
                    value={detailsForm.unit}
                    onChange={handleDetailsFieldChange('unit')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#2D5016] outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="detailsUnitPrice" className="block text-xs font-bold text-gray-400 uppercase mb-1">
                    Unit Price
                  </label>
                  <input
                    id="detailsUnitPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={detailsForm.unitPrice}
                    onChange={handleDetailsFieldChange('unitPrice')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#2D5016] outline-none"
                  />
                </div>
              </div>

              {detailsError && (
                <p className="text-sm text-red-600">{detailsError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEditDetails}
                  disabled={savingDetails}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 font-bold hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDetails}
                  className="flex-1 py-2.5 rounded-xl bg-[#2D5016] text-white font-bold hover:bg-[#24400f] disabled:opacity-50"
                >
                  {savingDetails ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}