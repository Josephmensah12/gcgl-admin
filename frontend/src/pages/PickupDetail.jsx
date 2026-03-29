import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';

export default function PickupDetail() {
  const { id } = useParams();
  const [pickup, setPickup] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`/api/v1/pickups/${id}`)
      .then((res) => setPickup(res.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingSpinner />;
  if (!pickup) return <p className="text-center py-12 text-gray-500">Invoice not found</p>;

  return (
    <div className="space-y-6">
      <Link to="/pickups" className="inline-flex items-center text-sm text-primary-600 hover:text-primary-700 gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Invoices
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice Info */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Invoice #{pickup.invoiceNumber}</h2>
            <div className="flex gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-medium
                ${pickup.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {pickup.paymentStatus}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                {pickup.warehouseDays} days in warehouse
              </span>
            </div>
          </div>

          {/* Line Items */}
          <h3 className="font-semibold text-gray-900 mb-3">Line Items</h3>
          <div className="space-y-3">
            {pickup.lineItems?.map((item) => (
              <div key={item.id} className="flex items-start gap-4 p-3 rounded-lg bg-gray-50">
                {item.photos?.length > 0 && (
                  <img src={item.photos[0].data} alt="" className="w-16 h-16 rounded-lg object-cover" />
                )}
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    {item.catalogName || item.description || 'Custom Item'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {item.type === 'custom' && item.dimensionsL
                      ? `${item.dimensionsL}" x ${item.dimensionsW}" x ${item.dimensionsH}"`
                      : item.type}
                    {' '} &middot; Qty: {item.quantity}
                  </p>
                </div>
                <p className="font-semibold">${parseFloat(item.finalPrice).toFixed(2)}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-200 mt-4 pt-4 text-right">
            <p className="text-2xl font-bold text-gray-900">${parseFloat(pickup.finalTotal).toFixed(2)}</p>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Customer</h3>
            <p className="font-medium">{pickup.customerName}</p>
            <p className="text-sm text-gray-500">{pickup.customerEmail}</p>
            <p className="text-sm text-gray-500">{pickup.customerPhone}</p>
            <p className="text-sm text-gray-500 mt-1">{pickup.customerAddress}</p>
          </div>

          {pickup.recipientName && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Recipient (Ghana)</h3>
              <p className="font-medium">{pickup.recipientName}</p>
              <p className="text-sm text-gray-500">{pickup.recipientPhone}</p>
              <p className="text-sm text-gray-500">{pickup.recipientAddress}</p>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Shipment</h3>
            {pickup.Shipment ? (
              <Link to={`/shipments/${pickup.Shipment.id}`} className="text-primary-600 hover:text-primary-700 font-medium">
                {pickup.Shipment.name}
              </Link>
            ) : (
              <p className="text-gray-400">Not assigned</p>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Date</span><span>{new Date(pickup.createdAt).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Items</span><span>{pickup.originalItemCount}{pickup.addedItemCount > 0 ? `+${pickup.addedItemCount}` : ''}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Payment</span><span>{pickup.paymentMethod || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Amount Paid</span><span>${parseFloat(pickup.amountPaid || 0).toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
