import { config } from "./config";

const RETRY_STATUS = [429, 500, 503];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function request(model: string, system: string, user: string) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent";
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    }),
    signal: AbortSignal.timeout(60000),
  });
}

export async function generate(system: string, user: string): Promise<string> {
  const models = [config.LLM_MODEL];
  if (config.LLM_FALLBACK_MODEL !== config.LLM_MODEL) {
    models.push(config.LLM_FALLBACK_MODEL);
  }

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      const secs = () => ((Date.now() - t0) / 1000).toFixed(1);
      try {
        const res = await request(model, system, user);
        if (res.ok) {
          const data: any = await res.json();
          const parts = data?.candidates?.[0]?.content?.parts ?? [];
          const text = parts.map((p: any) => p.text ?? "").join("").trim();
          if (text) {
            console.log(`LLM ${model} ok in ${secs()}s`);
            return text;
          }
          console.log(`LLM ${model} empty response in ${secs()}s`);
          break;
        }
        console.log(`LLM ${model} status ${res.status} in ${secs()}s`);
        if (!RETRY_STATUS.includes(res.status)) break;
      } catch (e: any) {
        console.log(`LLM ${model} error after ${secs()}s: ${e.message}`);
      }
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error("LLM failed after trying all models");
}
