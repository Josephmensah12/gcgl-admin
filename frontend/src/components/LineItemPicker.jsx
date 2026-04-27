import { useState, useEffect } from 'react';
import axios from 'axios';

export const CUBIC_RATE = 0.0105;

const fmt = (n) => `$${(parseFloat(n) || 0).toFixed(2)}`;

/**
 * Three-tab picker for adding line items: catalog (fixed price), custom
 * (volumetric — L×W×H × CUBIC_RATE), or manual (free description + price).
 *
 * Photo capture is supported on every type (max 3 per item).
 *
 * Emits the picked item via `onAdd(item)` where `item` matches the shape
 * the backend's POST /pickups/:id/items endpoint expects:
 *   { type, description, quantity, base_price, catalogItemId?, catalogName?,
 *     dimensions?, photos[] }
 *
 * The picker manages its own catalog fetch and form state. It does not
 * persist anything; the parent decides whether to commit immediately or
 * stage to a draft.
 */
export default function LineItemPicker({ onAdd }) {
  const [catalog, setCatalog] = useState([]);
  const [itemType, setItemType] = useState('fixed');
  const [catFilter, setCatFilter] = useState('');
  const [customForm, setCustomForm] = useState({ length: '', width: '', height: '', quantity: '1', description: '' });
  const [manualForm, setManualForm] = useState({ description: '', price: '', quantity: '1' });
  const [photos, setPhotos] = useState([]); // staged photos for the next add
  const [notesDraft, setNotesDraft] = useState(''); // optional comment applied to the next add
  const [flash, setFlash] = useState('');

  useEffect(() => {
    axios.get('/api/v1/create-invoice/catalog').then((res) => setCatalog(res.data.data)).catch(() => {});
  }, []);

  const showFlash = (msg) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 1500);
  };

  const addPhoto = (file) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 600;
        const scale = Math.min(1, maxW / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.7);
        setPhotos((prev) => [...prev, compressed].slice(0, 3));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = (idx) => setPhotos((prev) => prev.filter((_, i) => i !== idx));

  const consumeNotes = () => {
    const n = notesDraft.trim();
    setNotesDraft('');
    return n || null;
  };

  const handleAddCatalog = (catItem) => {
    onAdd({
      type: 'fixed',
      catalogItemId: catItem.id,
      catalogName: catItem.name,
      description: catItem.description || null,
      notes: consumeNotes(),
      quantity: 1,
      base_price: parseFloat(catItem.price),
      photos: [...photos],
    });
    setPhotos([]);
    showFlash(`${catItem.name} added`);
  };

  const handleAddCustom = () => {
    const l = parseFloat(customForm.length) || 0;
    const w = parseFloat(customForm.width) || 0;
    const h = parseFloat(customForm.height) || 0;
    const qty = parseInt(customForm.quantity) || 1;
    if (!(l > 0 && w > 0 && h > 0)) return;
    const price = Math.round(l * w * h * CUBIC_RATE * 100) / 100;
    onAdd({
      type: 'custom',
      description: customForm.description || `${l}×${w}×${h}"`,
      notes: consumeNotes(),
      quantity: qty,
      base_price: price,
      dimensions: { length: l, width: w, height: h },
      photos: [...photos],
    });
    setCustomForm({ length: '', width: '', height: '', quantity: '1', description: '' });
    setPhotos([]);
    showFlash('Custom item added');
  };

  const handleAddManual = () => {
    const price = parseFloat(manualForm.price) || 0;
    const qty = parseInt(manualForm.quantity) || 1;
    if (!(price > 0) || !manualForm.description.trim()) return;
    onAdd({
      type: 'manual',
      description: manualForm.description.trim(),
      notes: consumeNotes(),
      quantity: qty,
      base_price: price,
      photos: [...photos],
    });
    setManualForm({ description: '', price: '', quantity: '1' });
    setPhotos([]);
    showFlash('Item added');
  };

  const categories = [...new Set(catalog.map((c) => c.category))];

  return (
    <div className="space-y-4">
      {flash && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold shadow-lg">
          {flash}
        </div>
      )}

      {/* Type toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {[['fixed', 'Catalog'], ['custom', 'Dimensions'], ['manual', 'Manual Price']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setItemType(key)}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium ${itemType === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Photo staging — applies to whichever item is added next */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-gray-500 font-medium">Photos for next item:</span>
        {photos.map((p, i) => (
          <div key={i} className="relative w-12 h-12">
            <img src={p} alt="" className="w-12 h-12 rounded-md object-cover border border-gray-200" />
            <button
              type="button"
              onClick={() => removePhoto(i)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center leading-none"
            >
              x
            </button>
          </div>
        ))}
        {photos.length < 3 && (
          <label className="w-12 h-12 rounded-md border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-primary-400 text-gray-400 hover:text-primary-500">
            <span className="text-xl">+</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { if (e.target.files[0]) addPhoto(e.target.files[0]); e.target.value = ''; }}
            />
          </label>
        )}
      </div>

      {/* Optional comment — describes contents inside the box, etc. */}
      <div>
        <label className="block text-[11px] text-gray-500 font-medium mb-1">
          Comment for next item <span className="text-gray-400">(optional)</span>
        </label>
        <input
          type="text"
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          placeholder="e.g. Barbie doll, fragile, blue model"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm placeholder-gray-400"
        />
      </div>

      {itemType === 'fixed' && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              type="button"
              onClick={() => setCatFilter('')}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${!catFilter ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCatFilter(c)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${catFilter === c ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {catalog.filter((c) => !catFilter || c.category === catFilter).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleAddCatalog(item)}
                className="text-left rounded-lg border border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors overflow-hidden"
              >
                {item.image ? (
                  <div className="w-full h-24 bg-gray-100">
                    <img src={item.image} alt={item.name} className="w-full h-full object-contain p-1" />
                  </div>
                ) : (
                  <div className="w-full h-24 bg-gray-100" />
                )}
                <div className="p-2">
                  <p className="font-medium text-sm text-gray-900 leading-tight">{item.name}</p>
                  <p className="text-xs text-gray-500">{item.category}</p>
                  <p className="font-bold text-green-600 mt-0.5">{fmt(parseFloat(item.price))}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {itemType === 'custom' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {['length', 'width', 'height'].map((k) => (
              <div key={k}>
                <label className="block text-xs text-gray-500 mb-1">{k.charAt(0).toUpperCase() + k.slice(1)} (in)</label>
                <input
                  type="number"
                  value={customForm[k]}
                  onChange={(e) => setCustomForm((p) => ({ ...p, [k]: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Quantity</label>
              <input
                type="number"
                min="1"
                value={customForm.quantity}
                onChange={(e) => setCustomForm((p) => ({ ...p, quantity: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
              <input
                type="text"
                value={customForm.description}
                onChange={(e) => setCustomForm((p) => ({ ...p, description: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
          {customForm.length && customForm.width && customForm.height && (
            <p className="text-sm text-gray-600">
              Price:{' '}
              <span className="font-bold text-green-600">
                {fmt((parseFloat(customForm.length) || 0) * (parseFloat(customForm.width) || 0) * (parseFloat(customForm.height) || 0) * CUBIC_RATE)}
              </span>{' '}
              per unit
            </p>
          )}
          <button
            type="button"
            onClick={handleAddCustom}
            className="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
          >
            + Add Custom Item
          </button>
        </div>
      )}

      {itemType === 'manual' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">For items that don't fit a catalog or standard dimensions — describe it and set your price.</p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Description</label>
            <input
              type="text"
              placeholder="e.g. Oversized barrel, Assorted goods"
              value={manualForm.description}
              onChange={(e) => setManualForm((p) => ({ ...p, description: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Price ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={manualForm.price}
                onChange={(e) => setManualForm((p) => ({ ...p, price: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Quantity</label>
              <input
                type="number"
                min="1"
                value={manualForm.quantity}
                onChange={(e) => setManualForm((p) => ({ ...p, quantity: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleAddManual}
            disabled={!manualForm.description.trim() || !(parseFloat(manualForm.price) > 0)}
            className="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add Item
          </button>
        </div>
      )}
    </div>
  );
}
