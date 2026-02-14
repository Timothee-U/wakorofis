export type ServerAnalysis = {
  urgency?: 'low' | 'medium' | 'high';
  ai_category?: string;
  transcript?: string;
  summary?: string;
};

/**
 * Call a configured AI analysis endpoint (edge function / server) if VITE_AI_ANALYSIS_URL is set.
 * Expected to return JSON matching `ServerAnalysis`.
 * This is a thin client-side helper — the actual model call must be implemented server-side.
 */
export async function callServerAnalysis(payload: { text?: string | null; audio_url?: string | null }): Promise<ServerAnalysis | null> {
  const url = import.meta.env.VITE_AI_ANALYSIS_URL as string | undefined;
  if (!url) return null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ServerAnalysis;
    return data;
  } catch (err) {
    console.warn('AI analysis call failed', err);
    return null;
  }
}
