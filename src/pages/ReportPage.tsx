import { useState, useEffect, useRef } from 'react';
import { Shield, AlertTriangle, Mic, MapPin, Loader2, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  getDeviceId, canSubmitReport, markReportSubmitted,
  getSecondsUntilNextReport, ZONES, CATEGORIES, type Zone, type Category,
} from '@/lib/crowdshield';
import { callServerAnalysis } from '@/lib/ai';
import { toast } from 'sonner';
import bgHero from '@/assets/bg-hero.jpg';

const ReportPage = () => {
  const [step, setStep] = useState<'idle' | 'details' | 'submitted'>('idle');
  const [selectedZone, setSelectedZone] = useState<Zone>(ZONES[0]);
  const [text, setText] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Recording + transcript
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Location - auto-captured
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  // AI results
  const [aiUrgency, setAiUrgency] = useState<string | null>(null);
  const [aiCategory, setAiCategory] = useState<string | null>(null);

  // Auto-capture location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      setLocationLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
          setLocationLoading(false);
        },
        () => setLocationLoading(false),
        { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 }
      );
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setCooldown(getSecondsUntilNextReport()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleDangerClick = () => {
    if (!canSubmitReport()) {
      toast.error(`Please wait ${cooldown}s before submitting another report`);
      return;
    }
    setStep('details');
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Audio recording not supported');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data?.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioUrl(URL.createObjectURL(blob));
      };
      mr.start();
      setIsRecording(true);

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const r = new SpeechRecognition();
        recognitionRef.current = r;
        r.lang = 'en-US';
        r.interimResults = true;
        let finalT = '';
        r.onresult = (ev: any) => {
          let interim = '';
          for (let i = 0; i < ev.results.length; i++) {
            if (ev.results[i].isFinal) finalT += ev.results[i][0].transcript;
            else interim += ev.results[i][0].transcript;
          }
          setTranscript((finalT + ' ' + interim).trim() || null);
        };
        r.onerror = () => {};
        try { r.start(); } catch {}
      }
    } catch {
      toast.error('Microphone permission denied');
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
  };

  // Run AI analysis on text/transcript
  const runAIAnalysis = async () => {
    const input = (transcript || text || '').trim();
    if (!input) {
      toast.error('Add text or record audio first');
      return;
    }
    setAnalyzing(true);
    try {
      const result = await callServerAnalysis({ text: input });
      if (result) {
        setAiUrgency(result.urgency ?? null);
        setAiCategory(result.ai_category ?? null);
        if (result.transcript) setTranscript(result.transcript);
        toast.success('AI analysis complete');
      } else {
        toast.error('AI analysis unavailable');
      }
    } catch {
      toast.error('AI analysis failed');
    }
    setAnalyzing(false);
  };

  const handleSubmit = async () => {
    setSubmitting(true);

    // Upload audio if present
    let audio_public_url: string | null = null;
    if (audioUrl && audioChunksRef.current.length) {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const key = `${getDeviceId()}/${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from('reports-audio')
        .upload(key, audioBlob, { contentType: 'audio/webm' });
      if (!uploadError) {
        const { data } = supabase.storage.from('reports-audio').getPublicUrl(key);
        audio_public_url = data?.publicUrl ?? null;
      }
    }

    // Run AI if not already done
    const combinedText = (transcript || text || '').trim();
    let urgency = aiUrgency;
    let category = aiCategory;

    if (!urgency && combinedText) {
      const result = await callServerAnalysis({ text: combinedText });
      if (result) {
        urgency = result.urgency ?? null;
        category = result.ai_category ?? null;
      }
    }

    const finalCategory = category || 'other';

    const insertPayload: any = {
      zone: selectedZone,
      category: finalCategory,
      text: text.trim() || transcript || null,
      device_id: getDeviceId(),
      audio_url: audio_public_url,
      transcript: transcript,
      urgency: urgency || null,
      ai_category: category || null,
      latitude: coords?.lat ?? null,
      longitude: coords?.lon ?? null,
    };

    const { error } = await supabase.from('reports').insert(insertPayload);
    setSubmitting(false);

    if (error) {
      toast.error('Failed to submit report. Try again.');
      return;
    }

    markReportSubmitted();
    setStep('submitted');
    setTimeout(() => {
      setStep('idle');
      setText('');
      setAudioUrl(null);
      setTranscript(null);
      setAiUrgency(null);
      setAiCategory(null);
    }, 3000);
  };

  const urgencyColor = (u: string | null) => {
    if (u === 'high') return 'text-danger';
    if (u === 'medium') return 'text-warning';
    return 'text-safe';
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${bgHero})` }}
      />
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        <header className="px-4 py-3 flex items-center gap-3 border-b border-border/50 bg-card/30 backdrop-blur-md">
          <Shield className="w-7 h-7 text-shield" />
          <h1 className="font-display text-2xl font-bold text-foreground tracking-wide uppercase">CrowdShield</h1>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
          {step === 'idle' && (
            <div className="flex flex-col items-center gap-8 w-full max-w-sm">
              <div className="text-center space-y-2">
                <h2 className="font-display text-3xl font-bold text-foreground uppercase tracking-wider">Report Danger</h2>
                <p className="text-muted-foreground text-sm font-body">
                  Tap the button to alert security instantly
                </p>
              </div>

              <button
                onClick={handleDangerClick}
                disabled={cooldown > 0}
                className={`
                  w-52 h-52 rounded-full flex flex-col items-center justify-center gap-2
                  bg-danger text-danger-foreground font-display font-bold text-2xl uppercase
                  shadow-[0_0_40px_hsl(var(--danger)/0.4)] transition-all duration-200 border-2 border-danger-glow/30
                  ${cooldown > 0
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:scale-105 active:scale-95 animate-pulse-danger cursor-pointer hover:shadow-[0_0_60px_hsl(var(--danger)/0.6)]'}
                `}
              >
                <AlertTriangle className="w-12 h-12" />
                {cooldown > 0 ? `Wait ${cooldown}s` : 'REPORT'}
              </button>

              {/* Auto location status */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" />
                {locationLoading ? 'Getting location...' : coords ? `Location: ${coords.lat.toFixed(3)}, ${coords.lon.toFixed(3)}` : 'Location unavailable'}
              </div>

              <p className="text-xs text-muted-foreground/60 text-center">
                Rate limited to 1 report per 60 seconds
              </p>
            </div>
          )}

          {step === 'details' && (
            <div className="w-full max-w-sm space-y-4">
              <button onClick={() => setStep('idle')} className="text-sm text-muted-foreground hover:text-foreground transition-colors font-body">
                ← Back
              </button>
              <h2 className="font-display text-2xl font-bold text-foreground uppercase tracking-wide">Incident Details</h2>

              {/* Zone */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Zone</label>
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

              {/* Text */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  What happened? <span className="normal-case">(optional)</span>
                </label>
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 200))}
                  placeholder="Describe the incident..."
                  maxLength={200}
                  className="w-full p-3 rounded-lg bg-card border border-border text-foreground font-body placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-shield"
                />
                <p className="text-xs text-muted-foreground/50 text-right">{text.length}/200</p>
              </div>

              {/* Audio */}
              <div className="border border-border rounded-lg p-3 bg-card/60 backdrop-blur-sm space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mic className={`w-4 h-4 ${isRecording ? 'text-danger animate-glow-pulse' : 'text-muted-foreground'}`} />
                    <span className="text-sm font-medium text-foreground">
                      {isRecording ? 'Recording...' : 'Voice Report'}
                    </span>
                  </div>
                  {!isRecording ? (
                    <button onClick={startRecording} className="px-3 py-1.5 rounded-md bg-shield/15 text-shield text-sm font-medium hover:bg-shield/25 transition-colors">
                      Record
                    </button>
                  ) : (
                    <button onClick={stopRecording} className="px-3 py-1.5 rounded-md bg-danger/15 text-danger text-sm font-medium hover:bg-danger/25 transition-colors">
                      Stop
                    </button>
                  )}
                </div>

                {audioUrl && (
                  <div className="space-y-2">
                    <audio controls src={audioUrl} className="w-full" />
                    {transcript && <p className="text-xs text-muted-foreground">Transcript: {transcript}</p>}
                    <button
                      onClick={() => { setAudioUrl(null); audioChunksRef.current = []; setTranscript(null); }}
                      className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground"
                    >
                      Discard
                    </button>
                  </div>
                )}
              </div>

              {/* AI Analysis */}
              <button
                onClick={runAIAnalysis}
                disabled={analyzing || (!text.trim() && !transcript)}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-lg bg-shield/15 text-shield font-display font-semibold text-sm uppercase tracking-wider hover:bg-shield/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {analyzing ? 'Analyzing...' : 'AI Analyze'}
              </button>

              {(aiUrgency || aiCategory) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {aiUrgency && (
                    <span className={`text-xs px-2.5 py-1 rounded-full bg-card border border-border font-medium ${urgencyColor(aiUrgency)}`}>
                      Urgency: {aiUrgency}
                    </span>
                  )}
                  {aiCategory && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-card border border-border font-medium text-shield">
                      {CATEGORIES.find(c => c.id === aiCategory)?.icon} {CATEGORIES.find(c => c.id === aiCategory)?.label || aiCategory}
                    </span>
                  )}
                </div>
              )}

              {/* Location */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground border border-border rounded-lg p-2 bg-card/40">
                <MapPin className="w-3 h-3" />
                {coords
                  ? <span>Location: {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}</span>
                  : <span>{locationLoading ? 'Getting location...' : 'Location unavailable'}</span>
                }
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full p-4 rounded-lg bg-danger text-danger-foreground font-display font-bold text-lg uppercase tracking-wider hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 shadow-[0_0_20px_hsl(var(--danger)/0.3)]"
              >
                {submitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          )}

          {step === 'submitted' && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-20 h-20 rounded-full bg-safe/20 border border-safe/30 flex items-center justify-center shadow-[0_0_30px_hsl(var(--safe)/0.3)]">
                <span className="text-4xl">✓</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-safe uppercase tracking-wider">Report Submitted</h2>
              <p className="text-muted-foreground text-sm">
                Security has been notified.
              </p>
            </div>
          )}
        </main>

        <footer className="px-4 py-3 border-t border-border/50 text-center bg-card/20 backdrop-blur-sm">
          <a href="/admin" className="text-xs text-muted-foreground hover:text-foreground transition-colors font-body">
            Organizer Login →
          </a>
        </footer>
      </div>
    </div>
  );
};

export default ReportPage;
