/**
 * Skeleton loading placeholders — replaces full-page spinners with
 * shimmer effects that match the actual content layout.
 */

function Shimmer({ className = '' }) {
  return (
    <div className={`animate-pulse bg-gradient-to-r from-[#F4F6FA] via-[#E9EBF2] to-[#F4F6FA] bg-[length:200%_100%] rounded-[10px] ${className}`} />
  );
}

export function SkeletonKpiCard() {
  return (
    <div className="gc-card p-5">
      <Shimmer className="h-3 w-24 mb-3" />
      <Shimmer className="h-8 w-32 mb-2" />
      <Shimmer className="h-3 w-20" />
    </div>
  );
}

export function SkeletonTableRow({ cols = 6 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Shimmer className={`h-4 ${i === 0 ? 'w-16' : i === 1 ? 'w-24' : 'w-20'}`} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 6, cols = 6 }) {
  return (
    <div className="gc-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="px-4 py-3">
                  <Shimmer className="h-3 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {Array.from({ length: rows }).map((_, i) => (
              <SkeletonTableRow key={i} cols={cols} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="gc-card p-6">
      <Shimmer className="h-5 w-40 mb-4" />
      <Shimmer className="h-3 w-full mb-2" />
      <Shimmer className="h-3 w-3/4 mb-2" />
      <Shimmer className="h-3 w-1/2" />
    </div>
  );
}

export function SkeletonPage({ kpiCards = 3, tableRows = 8, tableCols = 6 }) {
  return (
    <div className="space-y-6">
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${kpiCards} gap-4`}>
        {Array.from({ length: kpiCards }).map((_, i) => (
          <SkeletonKpiCard key={i} />
        ))}
      </div>
      <SkeletonTable rows={tableRows} cols={tableCols} />
    </div>
  );
}

export default Shimmer;
