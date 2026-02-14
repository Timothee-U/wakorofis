import { useState } from 'react';
import { CATEGORIES } from '@/lib/crowdshield';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FileText } from 'lucide-react';

type Report = {
  id: string;
  zone: string;
  category: string;
  text: string | null;
  device_id: string;
  created_at: string;
  audio_url?: string | null;
  transcript?: string | null;
  urgency?: string | null;
  ai_category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

const badgeForUrgency = (u?: string | null) => {
  if (!u) return 'bg-muted text-muted-foreground';
  if (u === 'high') return 'bg-danger/10 text-danger';
  if (u === 'medium') return 'bg-amber-100 text-amber-700';
  return 'bg-green-100 text-green-700';
};

const IncidentFeed = ({ reports, onReportUpdated }: { reports: Report[]; onReportUpdated?: (r: Report) => void }) => {
  const exportReport = (r: Report) => {
    const html = `
      <html>
        <head>
          <title>Report ${r.id}</title>
          <style>body{font-family:Inter, Arial; padding:20px;}</style>
        </head>
        <body>
          <h1>Report</h1>
          <p><strong>Zone:</strong> ${r.zone}</p>
          <p><strong>Category:</strong> ${r.category}</p>
          <p><strong>Time:</strong> ${new Date(r.created_at).toLocaleString()}</p>
          <p><strong>Device:</strong> ${r.device_id}</p>
          <p><strong>Text:</strong> ${r.text ?? '—'}</p>
          <p><strong>AI urgency:</strong> ${r.urgency ?? '—'}</p>
          <p><strong>Transcript:</strong> ${r.transcript ?? '—'}</p>
          ${r.latitude && r.longitude ? `<p><strong>Location:</strong> ${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}</p>` : ''}
        </body>
      </html>`;

    const w = window.open('', '_blank');
    if (!w) { toast.error('Unable to open print window'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const updateReport = async (id: string, patch: Partial<Report>) => {
    const { error } = await supabase.from('reports').update(patch).eq('id', id);
    if (error) {
      toast.error('Failed to update report');
      return null;
    }
    toast.success('Report updated');
    return { id, ...patch } as Report;
  };

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
                  <span className={`text-xs px-2 py-0.5 rounded ${badgeForUrgency(report.urgency)}`}>{report.urgency ?? '—'}</span>
                </div>

                {report.text && (
                  <p className="text-sm text-muted-foreground mt-1 truncate">{report.text}</p>
                )}

                {report.transcript && (
                  <div className="mt-2 text-sm text-muted-foreground">Transcript: {report.transcript}</div>
                )}

                {report.audio_url && (
                  <div className="mt-2">
                    <audio controls src={report.audio_url} className="w-full" />
                  </div>
                )}

                {report.latitude && report.longitude && (
                  <a
                    className="text-xs text-muted-foreground mt-2 block"
                    href={`https://www.google.com/maps/search/?api=1&query=${report.latitude},${report.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View location
                  </a>
                )}

                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(report.created_at), 'HH:mm:ss')} · Device {report.device_id.slice(0, 8)}...
                </p>

                <div className="flex gap-2 mt-3">
                  <button onClick={() => exportReport(report)} className="text-xs px-2 py-1 rounded bg-shield/10 text-shield flex items-center gap-2"><FileText className="w-3 h-3"/> Export PDF</button>
                  <EditReportButton report={report} onSave={async (updated) => {
                    const patched = await updateReport(report.id, updated as Partial<Report>);
                    if (patched && onReportUpdated) onReportUpdated({ ...report, ...patched });
                  }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

function EditReportButton({ report, onSave }: { report: Report; onSave: (patch: Partial<Report>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(report.text ?? '');
  const [createdAt, setCreatedAt] = useState(() => {
    const dt = new Date(report.created_at);
    const isoLocal = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    return isoLocal;
  });

  return (
    <div>
      <button onClick={() => setOpen((s) => !s)} className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">Edit</button>
      {open && (
        <div className="mt-2 p-3 border border-border rounded bg-card space-y-2">
          <label className="text-xs text-muted-foreground">Text</label>
          <input className="w-full p-2 rounded border border-border bg-background text-sm" value={text} onChange={(e) => setText(e.target.value)} />
          <label className="text-xs text-muted-foreground">Reported at</label>
          <input type="datetime-local" className="w-full p-2 rounded border border-border bg-background text-sm" value={createdAt} onChange={(e) => setCreatedAt(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={async () => {
              const iso = new Date(createdAt).toISOString();
              await onSave({ text: text || null, created_at: iso });
              setOpen(false);
            }} className="text-xs px-2 py-1 rounded bg-shield/10 text-shield">Save</button>
            <button onClick={() => setOpen(false)} className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default IncidentFeed;
