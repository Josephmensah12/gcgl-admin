import { useState, useEffect } from 'react';
import axios from 'axios';
import LoadingSpinner from '../../components/LoadingSpinner';
import PageHeader from '../../components/layout/PageHeader';
import { useLayout } from '../../components/layout/Layout';
import toast from 'react-hot-toast';

export default function CatalogManager() {
  const { onMenuClick } = useLayout();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', category: '', price: '', image: '', capacityWeight: '1' });

  const loadItems = async () => {
    try {
      const res = await axios.get('/api/v1/catalog', { params: { search, category: catFilter } });
      setItems(res.data.data.items);
      setCategories(res.data.data.categories);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadItems(); }, [search, catFilter]);

  const openCreate = () => {
    setEditingItem(null);
    setForm({ name: '', description: '', category: '', price: '', image: '', capacityWeight: '1' });
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setForm({ name: item.name, description: item.description || '', category: item.category, price: item.price, image: item.image || '', capacityWeight: item.capacityWeight ?? '1' });
    setShowForm(true);
  };

  const handleImageUpload = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 400;
        const scale = Math.min(1, maxW / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        setForm((f) => ({ ...f, image: canvas.toDataURL('image/jpeg', 0.8) }));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await axios.put(`/api/v1/catalog/${editingItem.id}`, form);
      } else {
        await axios.post('/api/v1/catalog', form);
      }
      setShowForm(false);
      loadItems();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this catalog item?')) return;
    try {
      await axios.delete(`/api/v1/catalog/${id}`);
      loadItems();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Delete failed');
    }
  };

  if (loading) return <LoadingSpinner />;

  // Group by category
  const grouped = {};
  items.forEach((item) => {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  });

  return (
    <>
      <PageHeader title="Catalog" subtitle="Manage product categories and fixed-price items" onMenuClick={onMenuClick} hideSearch />
    <div className="space-y-6">
      {/* Controls */}
      <div className="gc-card p-4">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="flex gap-3 flex-1">
            <input
              type="text" value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items..."
              className="flex-1 max-w-md px-4 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">All Categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={openCreate} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
            + Add Item
          </button>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 gc-backdrop-in" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 gc-scale-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{editingItem ? 'Edit Item' : 'Add Catalog Item'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input type="text" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" list="categories" />
                <datalist id="categories">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                  <input type="number" step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Capacity Weight</label>
                  <input type="number" step="0.01" min="0" max="2" value={form.capacityWeight}
                    onChange={(e) => setForm((f) => ({ ...f, capacityWeight: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <p className="text-[10px] text-gray-400 mt-0.5">1.0 = normal, 0.15 = reduced (e.g. TVs)</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
                <div className="flex items-center gap-3">
                  {form.image ? (
                    <div className="relative">
                      <img src={form.image} alt="Preview" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                      <button type="button" onClick={() => setForm((f) => ({ ...f, image: '' }))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">x</button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 cursor-pointer hover:bg-gray-50">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Upload Photo
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => { if (e.target.files[0]) handleImageUpload(e.target.files[0]); e.target.value = ''; }} />
                    </label>
                  )}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
                  {editingItem ? 'Update' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Items by category */}
      {Object.entries(grouped).map(([category, catItems]) => (
        <div key={category} className="gc-card p-5">
          <h3 className="font-semibold text-gray-900 mb-3">{category} ({catItems.length})</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {catItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100">
                {item.image ? (
                  <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-gray-200" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0 text-gray-400">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{item.name}</p>
                  {item.description && <p className="text-xs text-gray-500 truncate">{item.description}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="font-semibold text-gray-900">${parseFloat(item.price).toFixed(2)}</span>
                    {parseFloat(item.capacityWeight || 1) !== 1 && (
                      <p className="text-[10px] text-amber-600 font-medium">{item.capacityWeight}x wt</p>
                    )}
                  </div>
                  <button onClick={() => openEdit(item)} className="text-primary-600 hover:text-primary-700">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <div className="text-center py-12">
          <p className="text-[#9CA3C0] mb-4">No catalog items</p>
          <button onClick={openCreate} className="px-4 h-10 rounded-[10px] bg-[#6366F1] text-white text-[13px] font-semibold hover:bg-[#4F46E5]">
            Add First Item
          </button>
        </div>
      )}
    </div>
    </>
  );
}
