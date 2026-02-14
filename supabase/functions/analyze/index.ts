import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const text = (body.text || "") as string;

    if (!text.trim()) {
      return new Response(
        JSON.stringify({ urgency: "low", ai_category: "other", transcript: text }),
        { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not set" }),
        { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an assistant that classifies short incident reports for crowd safety at events.
Respond ONLY by calling the classify_incident tool. No extra text.`,
          },
          {
            role: "user",
            content: `Classify this incident report: "${text.replace(/"/g, '\\"')}"`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_incident",
              description: "Return the classification of the incident report.",
              parameters: {
                type: "object",
                properties: {
                  urgency: {
                    type: "string",
                    enum: ["low", "medium", "high"],
                    description: "How urgent is this incident?",
                  },
                  ai_category: {
                    type: "string",
                    enum: ["crowd_pressure", "fight", "medical", "fire", "other"],
                    description: "The category of the incident.",
                  },
                  transcript: {
                    type: "string",
                    description: "A cleaned-up version of the original text.",
                  },
                },
                required: ["urgency", "ai_category", "transcript"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "classify_incident" } },
        temperature: 0,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("AI gateway error:", resp.status, errText);

      if (resp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }
      if (resp.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "content-type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ urgency: "low", ai_category: "other", transcript: text }),
        { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    const data = await resp.json();

    // Extract tool call arguments
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed = { urgency: "low", ai_category: "other", transcript: text };

    if (toolCall?.function?.arguments) {
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch {
        console.warn("Failed to parse tool call arguments");
      }
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    console.error("analyze error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  }
});
