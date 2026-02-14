export type ServerAnalysis = {
  urgency?: 'low' | 'medium' | 'high';
  ai_category?: string;
  transcript?: string;
  summary?: string;
};

/**
 * Call the analyze edge function to classify an incident report using AI.
 */
export async function callServerAnalysis(payload: { text?: string | null; audio_url?: string | null }): Promise<ServerAnalysis | null> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
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
