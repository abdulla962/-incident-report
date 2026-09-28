const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/rewrite") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      if (!env.OPENAI_API_KEY) return json({ error: "AI service is not configured. Add the OPENAI_API_KEY secret in Cloudflare." }, 500);

      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid request." }, 400); }
      const text = String(body?.text || "").trim();
      const field = body?.field === "action" ? "Action Taken" : "Incident Details";
      if (!text) return json({ error: "Please enter text first." }, 400);
      if (text.length > 5000) return json({ error: "Text is too long. Maximum 5000 characters." }, 400);

      const systemPrompt = `You are a professional administrative incident-report editor for a vehicle technical inspection center in Bahrain.
Rewrite the user's text into formal, clear, professional Arabic suitable for an official incident report.
Field: ${field}.
Rules:
- Rewrite only; do not invent or add facts, events, causes, dates, times, names, vehicle information, technical findings, threats, complaints, or actions that are not present in the original text.
- Preserve every factual detail, name, number, plate number, and sequence exactly as provided.
- Improve grammar, wording, clarity, and administrative professionalism.
- Remove colloquial wording and slang while preserving the meaning.
- Do not exaggerate or make legal conclusions.
- Do not use bullet points unless the original clearly requires them.
- Return ONLY the rewritten text, with no introduction, explanation, quotation marks, or labels.`;

      try {
        const apiRes = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-5",
            instructions: systemPrompt,
            input: text,
            max_output_tokens: 1200
          })
        });
        const data = await apiRes.json();
        if (!apiRes.ok) {
          return json({ error: data?.error?.message || "OpenAI request failed." }, apiRes.status);
        }
        const output = (data.output || [])
          .flatMap(item => item.content || [])
          .filter(part => part.type === "output_text")
          .map(part => part.text)
          .join("\n")
          .trim();
        if (!output) return json({ error: "AI returned an empty result." }, 502);
        return json({ text: output });
      } catch (e) {
        return json({ error: "Unable to reach the AI service." }, 502);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
