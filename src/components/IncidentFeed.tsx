import { CATEGORIES } from '@/lib/crowdshield';
import { format } from 'date-fns';

type Report = {
  id: string;
  zone: string;
  category: string;
  text: string | null;
  device_id: string;
  created_at: string;
};

const IncidentFeed = ({ reports }: { reports: Report[] }) => {
  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <h2 className="font-display text-lg font-semibold text-foreground">Live Incident Feed</h2>
      {reports.length === 0 && (
        <p className="text-muted-foreground text-sm">No incidents reported yet.</p>
      )}
      <div className="space-y-2">
        {reports.slice(0, 50).map((report) => {
          const cat = CATEGORIES.find((c) => c.id === report.category);
          return (
            <div
              key={report.id}
              className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border"
            >
              <span className="text-xl mt-0.5">{cat?.icon || '⚠️'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display font-semibold text-sm text-foreground">
                    {report.zone}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                    {cat?.label || report.category}
                  </span>
                </div>
                {report.text && (
                  <p className="text-sm text-muted-foreground mt-1 truncate">{report.text}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(report.created_at), 'HH:mm:ss')} · Device {report.device_id.slice(0, 8)}...
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default IncidentFeed;
