import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';

export default function ShipmentDetail() {
  const { id } = useParams();
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    axios.get(`/api/v1/shipments/${id}`)
      .then((res) => setShipment(res.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const updateStatus = async (newStatus) => {
    setUpdating(true);
    try {
      const res = await axios.put(`/api/v1/shipments/${id}`, { status: newStatus });
      setShipment((prev) => ({ ...prev, ...res.data.data }));
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const statusPipeline = ['collecting', 'ready', 'shipped', 'transit', 'customs', 'delivered'];

  const getCapacityColor = (pct) => {
    if (pct >= 90) return 'bg-red-500';
    if (pct >= 70) return 'bg-amber-500';
    return 'bg-primary-500';
  };

  if (loading) return <LoadingSpinner />;
  if (!shipment) return <p className="text-center py-12 text-gray-500">Shipment not found</p>;

  const fmt = (n) => `$${(parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const currentIndex = statusPipeline.indexOf(shipment.status);

  return (
    <div className="space-y-6">
      <Link to="/shipments" className="inline-flex items-center text-sm text-primary-600 hover:text-primary-700 gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Shipments
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{shipment.name}</h2>
            <p className="text-sm text-gray-500">Created {new Date(shipment.createdAt).toLocaleDateString()}</p>
          </div>
          <div className="flex gap-2">
            {currentIndex < statusPipeline.length - 1 && (
              <button
                onClick={() => updateStatus(statusPipeline[currentIndex + 1])}
                disabled={updating}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50"
              >
                Move to {statusPipeline[currentIndex + 1]}
              </button>
            )}
          </div>
        </div>

        {/* Status Pipeline */}
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {statusPipeline.map((status, i) => (
            <div key={status} className="flex items-center">
              <div className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize whitespace-nowrap
                ${i <= currentIndex ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {status}
              </div>
              {i < statusPipeline.length - 1 && (
                <div className={`w-8 h-0.5 ${i < currentIndex ? 'bg-primary-600' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Capacity & Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500 mb-2">Capacity</p>
          <div className="flex justify-between text-sm mb-1">
            <span>{fmt(shipment.totalValue)}</span>
            <span className="text-gray-500">{fmt(shipment.maxCapacity)}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div className={`h-3 rounded-full ${getCapacityColor(shipment.capacityPercent)}`} style={{ width: `${shipment.capacityPercent}%` }} />
          </div>
          <p className="text-sm font-semibold mt-2">{shipment.capacityPercent}%</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Total Invoices</p>
          <p className="text-2xl font-bold text-gray-900">{shipment.invoices?.length || 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Shipped Date</p>
          <p className="text-2xl font-bold text-gray-900">
            {shipment.shippedAt ? new Date(shipment.shippedAt).toLocaleDateString() : 'Not yet'}
          </p>
        </div>
      </div>

      {/* Invoices in shipment */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Assigned Invoices</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Invoice #</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {shipment.invoices?.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/pickups/${inv.id}`} className="font-medium text-primary-600 hover:text-primary-700">
                      #{inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{inv.Customer?.fullName || inv.customerName}</td>
                  <td className="px-4 py-3">{inv.lineItems?.length || 0}</td>
                  <td className="px-4 py-3 font-medium">{fmt(inv.finalTotal)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                      ${inv.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {inv.paymentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{new Date(inv.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!shipment.invoices || shipment.invoices.length === 0) && (
            <p className="text-center py-8 text-gray-400">No invoices assigned to this shipment</p>
          )}
        </div>
      </div>
    </div>
  );
}
