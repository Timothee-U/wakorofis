import { useState, useEffect, useCallback } from 'react';
import { Shield, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { 
  getDeviceId, canSubmitReport, markReportSubmitted, 
  getSecondsUntilNextReport, ZONES, CATEGORIES, type Zone, type Category 
} from '@/lib/crowdshield';
import { toast } from 'sonner';

const ReportPage = () => {
  const [step, setStep] = useState<'idle' | 'category' | 'details' | 'submitted'>('idle');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedZone, setSelectedZone] = useState<Zone>(ZONES[0]);
  const [text, setText] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setCooldown(getSecondsUntilNextReport());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleDangerClick = () => {
    if (!canSubmitReport()) {
      toast.error(`Please wait ${cooldown}s before submitting another report`);
      return;
    }
    setStep('category');
  };

  const handleCategorySelect = (cat: Category) => {
    setSelectedCategory(cat);
    setStep('details');
  };

  const handleSubmit = async () => {
    if (!selectedCategory) return;
    setSubmitting(true);

    const { error } = await supabase.from('reports').insert({
      zone: selectedZone,
      category: selectedCategory,
      text: text.trim() || null,
      device_id: getDeviceId(),
    });

    setSubmitting(false);

    if (error) {
      toast.error('Failed to submit report. Try again.');
      return;
    }

    markReportSubmitted();
    setStep('submitted');
    setTimeout(() => {
      setStep('idle');
      setSelectedCategory(null);
      setText('');
    }, 3000);
  };

  const handleBack = () => {
    if (step === 'details') setStep('category');
    else if (step === 'category') setStep('idle');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="px-4 py-3 flex items-center gap-3 border-b border-border">
        <Shield className="w-7 h-7 text-shield" />
        <h1 className="font-display text-xl font-bold text-foreground tracking-tight">CrowdShield</h1>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {step === 'idle' && (
          <div className="flex flex-col items-center gap-6 w-full max-w-sm">
            <div className="text-center space-y-2">
              <p className="text-muted-foreground text-sm font-body">
                Tap the button below to report an emergency
              </p>
            </div>
            <button
              onClick={handleDangerClick}
              disabled={cooldown > 0}
              className={`
                w-48 h-48 rounded-full flex flex-col items-center justify-center gap-2
                bg-danger text-danger-foreground font-display font-bold text-xl
                shadow-lg transition-all duration-200
                ${cooldown > 0 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:scale-105 active:scale-95 animate-pulse-danger cursor-pointer'}
              `}
            >
              <AlertTriangle className="w-10 h-10" />
              {cooldown > 0 ? `Wait ${cooldown}s` : 'REPORT\nDANGER'}
            </button>
            <p className="text-xs text-muted-foreground text-center">
              Only report genuine emergencies.<br />Rate limited to 1 report per 60 seconds.
            </p>
          </div>
        )}

        {step === 'category' && (
          <div className="w-full max-w-sm space-y-4">
            <button onClick={handleBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              ← Back
            </button>
            <h2 className="font-display text-lg font-semibold text-foreground">What's happening?</h2>
            <div className="grid gap-3">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategorySelect(cat.id)}
                  className="flex items-center gap-3 p-4 rounded-lg bg-card border border-border hover:border-danger/50 hover:bg-danger/5 transition-all text-left"
                >
                  <span className="text-2xl">{cat.icon}</span>
                  <span className="font-display font-medium text-card-foreground">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'details' && (
          <div className="w-full max-w-sm space-y-4">
            <button onClick={handleBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              ← Back
            </button>
            <h2 className="font-display text-lg font-semibold text-foreground">Details</h2>
            
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">Category</label>
              <p className="text-foreground font-medium">
                {CATEGORIES.find(c => c.id === selectedCategory)?.icon}{' '}
                {CATEGORIES.find(c => c.id === selectedCategory)?.label}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">Zone</label>
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value as Zone)}
                className="w-full p-3 rounded-lg bg-card border border-border text-foreground font-body focus:outline-none focus:ring-2 focus:ring-shield"
              >
                {ZONES.map((zone) => (
                  <option key={zone} value={zone}>{zone}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">
                Additional info <span className="text-xs">(optional, max 100 chars)</span>
              </label>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 100))}
                placeholder="Brief description..."
                maxLength={100}
                className="w-full p-3 rounded-lg bg-card border border-border text-foreground font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-shield"
              />
              <p className="text-xs text-muted-foreground text-right">{text.length}/100</p>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full p-4 rounded-lg bg-danger text-danger-foreground font-display font-bold text-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        )}

        {step === 'submitted' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-20 h-20 rounded-full bg-safe/20 flex items-center justify-center">
              <span className="text-4xl">✓</span>
            </div>
            <h2 className="font-display text-xl font-bold text-safe">Report Submitted</h2>
            <p className="text-muted-foreground text-sm">
              Thank you. Security has been notified.
            </p>
          </div>
        )}
      </main>

      {/* Footer nav */}
      <footer className="px-4 py-3 border-t border-border text-center">
        <a href="/admin" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Organizer Login →
        </a>
      </footer>
    </div>
  );
};

export default ReportPage;
