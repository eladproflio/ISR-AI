import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const convo = (messages as Array<{ role: string; content: string }>)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "Create a short, specific 2-5 word title for this conversation. No quotes, no trailing punctuation, no generic words like 'Chat' or 'Hello'. Reply with the title only.",
          },
          { role: "user", content: convo },
        ],
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ title: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await response.json();
    const raw: string = data.choices?.[0]?.message?.content ?? "";
    const title = raw
      .split("\n")[0]
      .replace(/^["'`\s\-–—]+|["'`\s\-–—.!?]+$/g, "")
      .slice(0, 60);
    return new Response(JSON.stringify({ title: title || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("title error:", e);
    return new Response(JSON.stringify({ title: null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});