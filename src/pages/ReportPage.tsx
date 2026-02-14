import { useState, useEffect, useRef } from 'react';
import { Shield, AlertTriangle, Mic, MapPin, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { 
  getDeviceId, canSubmitReport, markReportSubmitted, 
  getSecondsUntilNextReport, ZONES, CATEGORIES, type Zone, type Category, analyzeTextForUrgency
} from '@/lib/crowdshield';
import { toast } from 'sonner';

const ReportPage = () => {
  const [step, setStep] = useState<'idle' | 'category' | 'details' | 'submitted'>('idle');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedZone, setSelectedZone] = useState<Zone>(ZONES[0]);
  const [text, setText] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Recording + transcript
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Location
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);

  // AI suggestions
  const [suggestedUrgency, setSuggestedUrgency] = useState<string | null>(null);
  const [suggestedCategory, setSuggestedCategory] = useState<string | null>(null);

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

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Audio recording not supported in this browser');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioUrl(URL.createObjectURL(blob));
        // try to produce a short automatic transcript from any captured text input if available
      };

      mr.start();
      setIsRecording(true);

      // try lightweight client-side speech recognition while recording (if supported)
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const r = new SpeechRecognition();
        recognitionRef.current = r;
        r.lang = 'en-US';
        r.interimResults = true;
        let interim = '';
        let finalTranscript = '';
        r.onresult = (ev: any) => {
          interim = '';
          for (let i = 0; i < ev.results.length; i++) {
            const res = ev.results[i];
            if (res.isFinal) finalTranscript += res[0].transcript;
            else interim += res[0].transcript;
          }
          setTranscript((finalTranscript + ' ' + interim).trim() || null);
        };
        r.onerror = () => { /* ignore */ };
        try { r.start(); } catch (err) { /* ignore start errors */ }
      }
    } catch (err) {
      console.error(err);
      toast.error('Could not start microphone — permission denied?');
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
      recognitionRef.current = null;
    }
  };

  const captureLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Location not supported in this browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => {
        console.warn(err);
        toast.error('Could not get location — permission denied?');
      },
      { enableHighAccuracy: true, maximumAge: 30_000 }
    );
  };

  const applyAISuggestion = (sourceText?: string) => {
    const input = sourceText || transcript || text || '';
    if (!input) return;
    const { urgency, ai_category } = analyzeTextForUrgency(input);
    setSuggestedUrgency(urgency);
    setSuggestedCategory(ai_category);
  };

  const handleSubmit = async () => {
    if (!selectedCategory) return;
    setSubmitting(true);

    // If we have recorded audio, assemble blob
    let audioBlob: Blob | null = null;
    if (audioUrl) {
      // re-create blob from chunks (MediaRecorder onstop already saved it in memory via audioChunksRef)
      audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    }

    let audio_public_url: string | null = null;
    if (audioBlob) {
      const key = `${getDeviceId()}/${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from('reports-audio')
        .upload(key, audioBlob, { contentType: 'audio/webm' });
      if (!uploadError) {
        const { data } = supabase.storage.from('reports-audio').getPublicUrl(key);
        audio_public_url = data?.publicUrl ?? null;
      } else {
        console.warn('audio upload failed', uploadError);
        toast.error('Audio upload failed; sending report without audio');
      }
    }

    // prefer transcript from speech recognition if present (can be overridden by server)
    let finalTranscriptToSend = transcript || null;

    // Try server-side AI analysis first (if configured), otherwise fall back to on-device heuristic
    let urgencyToSend = suggestedUrgency;
    let aiCatToSend = suggestedCategory;

    const combinedText = (finalTranscriptToSend || text || '').trim();
    if (import.meta.env.VITE_AI_ANALYSIS_URL) {
      try {
        const { callServerAnalysis } = await import('@/lib/ai');
        const serverRes = await callServerAnalysis({ text: combinedText || null, audio_url: audio_public_url });
        if (serverRes) {
          urgencyToSend = serverRes.urgency ?? urgencyToSend;
          aiCatToSend = serverRes.ai_category ?? aiCatToSend;
          // prefer server transcript if provided
          if (serverRes.transcript) {
            finalTranscriptToSend = serverRes.transcript;
          }
        }
      } catch (err) {
        console.warn('server AI analysis failed', err);
      }
    }

    if (!urgencyToSend && combinedText) {
      const res = analyzeTextForUrgency(combinedText);
      urgencyToSend = res.urgency;
      aiCatToSend = res.ai_category;
    }

    const insertPayload: any = {
      zone: selectedZone,
      category: selectedCategory,
      text: text.trim() || finalTranscriptToSend || null,
      device_id: getDeviceId(),
      audio_url: audio_public_url,
      transcript: finalTranscriptToSend,
      urgency: urgencyToSend || null,
      ai_category: aiCatToSend || null,
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
      setSelectedCategory(null);
      setText('');
      setAudioUrl(null);
      setTranscript(null);
      setCoords(null);
      setSuggestedUrgency(null);
      setSuggestedCategory(null);
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

            <div className="space-y-2 border border-border rounded-lg p-3 bg-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mic className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium text-foreground">Audio recording</div>
                    <div className="text-xs text-muted-foreground">Tap to record; AI will attempt transcription and urgency detection.</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isRecording && (
                    <button onClick={startRecording} className="px-3 py-1 rounded bg-shield/10 text-shield text-sm">Record</button>
                  )}
                  {isRecording && (
                    <button onClick={stopRecording} className="px-3 py-1 rounded bg-danger/10 text-danger text-sm">Stop</button>
                  )}
                </div>
              </div>

              {audioUrl && (
                <div className="mt-2">
                  <audio controls src={audioUrl} className="w-full" />
                  <p className="text-xs text-muted-foreground mt-2">Transcript: {transcript ?? '— (pending)'} </p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => applyAISuggestion()} className="text-xs px-2 py-1 rounded bg-shield/10 text-shield">Apply AI suggestion</button>
                    <button onClick={() => { setAudioUrl(null); audioChunksRef.current = []; setTranscript(null); }} className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">Discard</button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border border-border rounded-lg p-3 bg-card">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium text-foreground">Location</div>
                  <div className="text-xs text-muted-foreground">Share approximate location with the organizer</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">{coords ? `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}` : 'Not shared'}</div>
                <button onClick={captureLocation} className="mt-2 px-3 py-1 rounded bg-shield/10 text-shield text-sm">Share location</button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">AI suggestion</div>
              <div className="flex items-center gap-2">
                <div className="px-2 py-1 rounded bg-secondary text-secondary-foreground text-xs">Urgency: {suggestedUrgency ?? '—'}</div>
                <div className="px-2 py-1 rounded bg-secondary text-secondary-foreground text-xs">AI category: {suggestedCategory ?? '—'}</div>
                <button onClick={() => applyAISuggestion()} className="ml-auto text-xs px-2 py-1 rounded bg-shield/10 text-shield">Refresh</button>
              </div>
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
