import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ZONES, CATEGORIES, type Zone } from '@/lib/crowdshield';
import { Shield, LogOut, Activity, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ZoneCard from '@/components/ZoneCard';
import IncidentFeed from '@/components/IncidentFeed';
import AnalyticsPanel from '@/components/AnalyticsPanel';

type Report = {
  id: string;
  zone: string;
  category: string;
  text: string | null;
  device_id: string;
  created_at: string;
  urgency?: string | null;
  ai_category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  transcript?: string | null;
};

const DashboardPage = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [activeTab, setActiveTab] = useState<'zones' | 'feed' | 'analytics'>('zones');
  const navigate = useNavigate();

  useEffect(() => {
    // Load initial reports from last 24 hours
    const loadReports = async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('reports')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false });
      if (data) setReports(data);
    };

    loadReports();

    // Subscribe to realtime
    const channel = supabase
      .channel('reports-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reports' },
        (payload) => {
          setReports((prev) => [payload.new as Report, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin');
  };

  const getZoneReports = (zone: Zone) => {
    const twoMinAgo = Date.now() - 2 * 60 * 1000;
    return reports.filter(
      (r) => r.zone === zone && new Date(r.created_at).getTime() > twoMinAgo
    );
  };

  const getUniqueDeviceCount = (zoneReports: Report[]) => {
    return new Set(zoneReports.map((r) => r.device_id)).size;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="px-4 py-3 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-3">
          <Shield className="w-7 h-7 text-shield" />
          <h1 className="font-display text-xl font-bold text-foreground tracking-tight">CrowdShield</h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-shield/10 text-shield font-medium">ADMIN</span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </header>

      {/* Tab Nav */}
      <nav className="px-4 py-2 border-b border-border flex gap-1">
        {[
          { id: 'zones' as const, label: 'Zone Status', icon: Activity },
          { id: 'feed' as const, label: 'Incident Feed', icon: Shield },
          { id: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-shield/10 text-shield'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 p-4">
        {activeTab === 'zones' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {ZONES.map((zone) => {
              const zoneReports = getZoneReports(zone);
              const uniqueCount = getUniqueDeviceCount(zoneReports);
              return (
                <ZoneCard
                  key={zone}
                  zone={zone}
                  reportCount={uniqueCount}
                  recentReports={zoneReports}
                />
              );
            })}
          </div>
        )}

        {activeTab === 'feed' && (
          <IncidentFeed
            reports={reports}
            onReportUpdated={(updated) => setReports((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsPanel reports={reports} />
        )}
      </main>
    </div>
  );
};

export default DashboardPage;
