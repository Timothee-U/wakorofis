import { serve } from "std/server";

// Supabase Edge Function (Deno) - simple OpenAI-based classifier
// Usage: POST { text: string } -> returns { urgency, ai_category, transcript }
// - Set OPENAI_API_KEY as a secret for the function
// - Deploy with `supabase functions deploy analyze` (or via dashboard)

serve(async (req: Request) => {
  try {
    const body = await req.json().catch(() => ({}));
    const text = (body.text || '') as string;

    const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_KEY) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not set' }), { status: 500, headers: { 'content-type': 'application/json' } });
    }

    // Prompt the model to return strict JSON only
    const system = `You are an assistant that classifies short incident reports.\nRespond with a single JSON object exactly matching the schema: {"urgency":"low|medium|high","ai_category":"crowd_pressure|fight|medical|fire|other","transcript":"cleaned text"}. Do not add any extra text.`;
    const user = `Classify this text: "${text.replace(/"/g, '\\"')}"`;

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0,
        max_tokens: 200,
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(JSON.stringify({ error: `OpenAI error: ${errText}` }), { status: 502, headers: { 'content-type': 'application/json' } });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? '';

    // Expect the model to return strict JSON — attempt to parse it
    let parsed = null;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      // If parsing fails, fall back to simple heuristic
      parsed = { urgency: 'low', ai_category: 'other', transcript: text };
    }

    return new Response(JSON.stringify(parsed), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
});
