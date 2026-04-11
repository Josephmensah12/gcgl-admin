import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from '../components/LoadingSpinner';
import { PackingListSheet } from './PackingList';

/* Bulk packing list — every invoice assigned to a shipment, one per page. */

export default function ShipmentPackingLists() {
  const { id } = useParams();
  const [shipment, setShipment] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get(`/api/v1/shipments/${id}`),
      axios.get('/api/v1/settings').catch(() => ({ data: { data: {} } })),
    ])
      .then(([shRes, setRes]) => {
        setShipment(shRes.data.data);
        setCompany((setRes.data.data || {}).companyInfo || null);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!loading && shipment) {
      document.body.classList.add('print-mode');
      return () => document.body.classList.remove('print-mode');
    }
  }, [loading, shipment]);

  if (loading) return <LoadingSpinner />;
  if (!shipment) return <p className="text-center py-12 text-[#9CA3C0]">Shipment not found</p>;

  const invoices = shipment.invoices || [];
  const sorted = [...invoices].sort((a, b) => (a.invoiceNumber || 0) - (b.invoiceNumber || 0));

  return (
    <div className="packing-viewport">
      <div className="packing-toolbar no-print">
        <Link to={`/shipments/${id}`} className="packing-toolbar-back">← Back to shipment</Link>
        <div className="packing-toolbar-meta">
          <span className="packing-toolbar-title">{shipment.name}</span>
          <span className="packing-toolbar-count">{sorted.length} packing list{sorted.length === 1 ? '' : 's'}</span>
        </div>
        <button onClick={() => window.print()} className="packing-toolbar-print">Print All</button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-center py-12 text-[#9CA3C0]">No invoices assigned to this shipment.</p>
      ) : (
        sorted.map((inv, idx) => (
          <div
            key={inv.id}
            className={idx < sorted.length - 1 ? 'packing-page-break' : ''}
          >
            <PackingListSheet invoice={inv} shipmentName={shipment.name} company={company} />
          </div>
        ))
      )}
    </div>
  );
}
