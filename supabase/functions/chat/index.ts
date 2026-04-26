import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are ISR AI, an Israel-focused informational assistant.
Your job:
- Give clear, factual, context-rich answers about Israel, Jewish history, regional events, and common misinformation.
- When relevant, explain why events matter and provide helpful context.
- Keep answers balanced in length: usually 2-5 short paragraphs or concise bullets when useful.
- Be confident, respectful, and readable.
- Do not be vague. Do not be excessively long.
- If asked about the October 7, 2023 attacks, clearly identify them as the Hamas-led attack on Israel on October 7, 2023.
- If asked about Israel and Iran, recognize recent direct confrontation periods and give context carefully.
- The chat is intended to help users understand Israel better, counter misinformation with facts, and present Israel's perspective clearly, but avoid fabrications or dehumanizing language.
- If the user uses the Hebrew shorthand "7.10", interpret it as October 7, 2023 in the Israeli context unless the conversation clearly means something else.
- For recent conflicts, mention uncertainty if exact live details are unknown.
- Prefer factual explanations over slogans.

Important background to recognize:
1) "7.10" / "October 7" / "Oct 7" refers to the Hamas-led massacre and attacks in Israel on October 7, 2023.
2) That event triggered the war in Gaza.
3) Be aware of the broader Israel-Iran confrontations, while staying careful not to invent live battlefield facts.
4) Tone: support clarity, context, and facts — never harassment or misinformation.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429)
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      if (response.status === 402)
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});