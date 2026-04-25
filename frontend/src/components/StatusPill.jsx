const SHIPMENT_STATUS_CONFIG = {
  collecting: {
    label: 'Collecting',
    bg: 'rgba(59,130,246,0.10)',
    color: '#3B82F6',
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  },
  ready: {
    label: 'Ready',
    bg: 'rgba(139,92,246,0.10)',
    color: '#8B5CF6',
    icon: 'M5 13l4 4L19 7',
  },
  shipped: {
    label: 'Shipped',
    bg: 'rgba(245,158,11,0.10)',
    color: '#F59E0B',
    icon: 'M8 7h8M8 7a2 2 0 01-2-2V3h12v2a2 2 0 01-2 2M8 7v10a2 2 0 002 2h4a2 2 0 002-2V7',
  },
  transit: {
    label: 'In Transit',
    bg: 'rgba(234,179,8,0.10)',
    color: '#CA8A04',
    icon: 'M3 12h4l3-8 4 16 3-8h4',
  },
  customs: {
    label: 'Customs',
    bg: 'rgba(249,115,22,0.10)',
    color: '#F97316',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  },
  delivered: {
    label: 'Delivered',
    bg: 'rgba(16,185,129,0.10)',
    color: '#10B981',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
};

const PAYMENT_STATUS_CONFIG = {
  paid: {
    label: 'Paid',
    bg: 'rgba(16,185,129,0.10)',
    color: '#10B981',
    icon: 'M5 13l4 4L19 7',
  },
  partial: {
    label: 'Partial',
    bg: 'rgba(245,158,11,0.10)',
    color: '#F59E0B',
    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  unpaid: {
    label: 'Unpaid',
    bg: 'rgba(239,68,68,0.09)',
    color: '#EF4444',
    icon: 'M12 9v2m0 4h.01M12 21a9 9 0 110-18 9 9 0 010 18z',
  },
  cancelled: {
    label: 'Cancelled',
    bg: 'rgba(156,163,192,0.14)',
    color: '#6B7194',
    icon: 'M6 18L18 6M6 6l12 12',
  },
};

const CONFIGS = {
  shipment: SHIPMENT_STATUS_CONFIG,
  payment: PAYMENT_STATUS_CONFIG,
};

export default function StatusPill({ status, kind = 'shipment', size = 'md', showIcon = true, label }) {
  const config = CONFIGS[kind]?.[status];
  if (!config) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#F4F6FA] text-[#9CA3C0] capitalize">
        {label || status || 'Unknown'}
      </span>
    );
  }
  const sizing = size === 'sm'
    ? { pad: 'px-2 py-0.5', text: 'text-[10.5px]', icon: 'w-3 h-3', gap: 'gap-1' }
    : { pad: 'px-2.5 py-1', text: 'text-[11px]', icon: 'w-3.5 h-3.5', gap: 'gap-1.5' };

  return (
    <span
      className={`inline-flex items-center ${sizing.gap} ${sizing.pad} rounded-md ${sizing.text} font-semibold`}
      style={{ background: config.bg, color: config.color }}
    >
      {showIcon && (
        <svg className={sizing.icon} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d={config.icon} />
        </svg>
      )}
      {label || config.label}
    </span>
  );
}
