import { useMemo } from 'react';
import { CATEGORIES, ZONES } from '@/lib/crowdshield';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format, startOfHour, subHours } from 'date-fns';

type Report = {
  id: string;
  zone: string;
  category: string;
  text: string | null;
  device_id: string;
  created_at: string;
};

const AnalyticsPanel = ({ reports }: { reports: Report[] }) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayReports = useMemo(
    () => reports.filter((r) => new Date(r.created_at) >= todayStart),
    [reports]
  );

  // Most common category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    todayReports.forEach((r) => {
      counts[r.category] = (counts[r.category] || 0) + 1;
    });
    return counts;
  }, [todayReports]);

  const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];

  // Most reported zone
  const zoneCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    todayReports.forEach((r) => {
      counts[r.zone] = (counts[r.zone] || 0) + 1;
    });
    return counts;
  }, [todayReports]);

  const topZone = Object.entries(zoneCounts).sort((a, b) => b[1] - a[1])[0];

  // Reports by hour chart data
  const chartData = useMemo(() => {
    const now = new Date();
    const hours: { label: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const hourStart = startOfHour(subHours(now, i));
      const hourEnd = startOfHour(subHours(now, i - 1));
      const count = todayReports.filter((r) => {
        const t = new Date(r.created_at);
        return t >= hourStart && t < hourEnd;
      }).length;
      hours.push({ label: format(hourStart, 'HH:mm'), count });
    }
    return hours;
  }, [todayReports]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="font-display text-lg font-semibold text-foreground">Analytics</h2>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-card border border-border p-5">
          <p className="text-sm text-muted-foreground">Total Reports Today</p>
          <p className="font-display text-3xl font-bold text-foreground mt-1">{todayReports.length}</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-5">
          <p className="text-sm text-muted-foreground">Most Common Category</p>
          <p className="font-display text-xl font-bold text-foreground mt-1">
            {topCategory
              ? `${CATEGORIES.find((c) => c.id === topCategory[0])?.icon} ${CATEGORIES.find((c) => c.id === topCategory[0])?.label}`
              : '—'}
          </p>
          {topCategory && (
            <p className="text-xs text-muted-foreground mt-1">{topCategory[1]} reports</p>
          )}
        </div>
        <div className="rounded-xl bg-card border border-border p-5">
          <p className="text-sm text-muted-foreground">Most Reported Zone</p>
          <p className="font-display text-xl font-bold text-foreground mt-1">
            {topZone ? topZone[0] : '—'}
          </p>
          {topZone && (
            <p className="text-xs text-muted-foreground mt-1">{topZone[1]} reports</p>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-xl bg-card border border-border p-5">
        <h3 className="font-display font-semibold text-sm text-foreground mb-4">Reports by Hour (Last 12h)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="count" fill="hsl(var(--shield))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPanel;
