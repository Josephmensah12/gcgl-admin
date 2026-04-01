/**
 * Format shipment date range for tooltip
 */
export function shipmentDateRange(shipment) {
  if (!shipment) return '';
  const fmtDate = (d) => {
    if (!d) return 'Active';
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  return `${fmtDate(shipment.start_date)} → ${fmtDate(shipment.end_date)}`;
}

/**
 * Shipment name with date tooltip wrapper
 */
export function ShipmentName({ shipment, className = '' }) {
  if (!shipment?.name) return <span className={className}>-</span>;
  return (
    <span className={className} title={shipmentDateRange(shipment)}>
      {shipment.name}
    </span>
  );
}
