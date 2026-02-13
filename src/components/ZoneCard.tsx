import { CATEGORIES } from '@/lib/crowdshield';

type Report = {
  id: string;
  zone: string;
  category: string;
  text: string | null;
  device_id: string;
  created_at: string;
};

type ZoneCardProps = {
  zone: string;
  reportCount: number;
  recentReports: Report[];
};

const ZoneCard = ({ zone, reportCount, recentReports }: ZoneCardProps) => {
  const status = reportCount >= 10 ? 'red' : reportCount >= 5 ? 'yellow' : 'green';

  const statusConfig = {
    green: {
      bg: 'bg-safe/10',
      border: 'border-safe/30',
      dot: 'bg-safe',
      label: 'SAFE',
      labelColor: 'text-safe',
    },
    yellow: {
      bg: 'bg-warning/10',
      border: 'border-warning/30',
      dot: 'bg-warning',
      label: 'CAUTION',
      labelColor: 'text-warning',
    },
    red: {
      bg: 'bg-danger/10',
      border: 'border-danger/50',
      dot: 'bg-danger',
      label: 'DANGER',
      labelColor: 'text-danger',
    },
  };

  const config = statusConfig[status];

  // Get top category
  const categoryCounts: Record<string, number> = {};
  recentReports.forEach((r) => {
    categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
  });
  const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div
      className={`rounded-xl border-2 p-5 transition-all ${config.bg} ${config.border} ${
        status === 'red' ? 'animate-flash-red' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-bold text-lg text-foreground">{zone}</h3>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${config.dot} ${status === 'red' ? 'animate-pulse' : ''}`} />
          <span className={`text-xs font-bold font-display ${config.labelColor}`}>{config.label}</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Reports (2 min)</span>
          <span className="font-display font-bold text-2xl text-foreground">{reportCount}</span>
        </div>

        {topCategory && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{CATEGORIES.find((c) => c.id === topCategory[0])?.icon}</span>
            <span>{CATEGORIES.find((c) => c.id === topCategory[0])?.label}</span>
            <span className="text-xs">×{topCategory[1]}</span>
          </div>
        )}

        {recentReports.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No recent reports</p>
        )}
      </div>
    </div>
  );
};

export default ZoneCard;
