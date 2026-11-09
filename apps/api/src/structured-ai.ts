import type OpenAI from "openai";

export interface AiRuntimeEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_VISION_MODEL?: string;
  // Cloudflare Workers AI bağlaması (wrangler.jsonc "ai"): anahtar gerektirmez, ücretsiz günlük kotayla çalışır.
  AI?: { run(model: string, input: Record<string, unknown>): Promise<any> };
  WORKERS_AI_VISION_MODEL?: string;
  WORKERS_AI_TEXT_MODEL?: string;
}

interface StructuredRequest {
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  imageDataUrls?: string[];
  vision?: boolean;
}

function nodeEnvironment(): AiRuntimeEnv {
  if (typeof process === "undefined" || !process.env) return {};
  return process.env;
}

function parseImageDataUrl(value: string): { mimeType: string; data: string } {
  const match = value.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/);
  if (!match) throw new Error("INVALID_IMAGE_INPUT");
  return { mimeType: match[1] === "image/jpg" ? "image/jpeg" : match[1], data: match[2] };
}

function extractGeminiText(payload: any): string {
  const text = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text || "").join("").trim();
  if (!text) throw new Error("EMPTY_ANALYSIS");
  return text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
}

async function callGemini<T>(request: StructuredRequest, env: AiRuntimeEnv): Promise<T> {
  const model = env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const parts: Array<Record<string, unknown>> = [{ text: request.prompt }];
  for (const image of request.imageDataUrls || []) {
    const parsed = parseImageDataUrl(image);
    parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.data } });
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY || ""
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: request.schema }
    }),
    signal: AbortSignal.timeout(45000)
  });

  if (!response.ok) {
    console.error(`Gemini request failed (${response.status})`);
    throw new Error(response.status === 429 ? "AI_FREE_QUOTA_EXCEEDED" : response.status === 400 ? "AI_PROVIDER_INVALID_REQUEST" : response.status === 401 || response.status === 403 ? "AI_PROVIDER_ACCESS_DENIED" : "AI_PROVIDER_REQUEST_FAILED");
  }
  return JSON.parse(extractGeminiText(await response.json())) as T;
}

async function callOpenAI<T>(request: StructuredRequest, env: AiRuntimeEnv): Promise<T> {
  const { default: OpenAIClient } = await import("openai");
  const client: OpenAI = new OpenAIClient({ apiKey: env.OPENAI_API_KEY });
  const content: any[] = [{ type: "input_text", text: request.prompt }];
  for (const image_url of request.imageDataUrls || []) content.push({ type: "input_image", image_url, detail: "high" });
  const response = await client.responses.create({
    model: request.vision ? env.OPENAI_VISION_MODEL || env.OPENAI_MODEL || "gpt-5.6" : env.OPENAI_MODEL || "gpt-5.6-luna",
    store: false,
    input: [{ role: "user", content }],
    text: { format: { type: "json_schema", name: request.schemaName, strict: true, schema: request.schema as any } }
  });
  if (!response.output_text) throw new Error("EMPTY_ANALYSIS");
  return JSON.parse(response.output_text) as T;
}

// Gemini veya OpenAI anahtarı yoksa Cloudflare Workers AI kullanılır (yeni hesap ya da anahtar gerekmez).
// Görsel model tek fotoğrafa bakar; sonuç JSON olarak istenir ve ilk {...} bloğu okunur.
async function callWorkersAi<T>(request: StructuredRequest, env: AiRuntimeEnv): Promise<T> {
  const model = request.vision ? env.WORKERS_AI_VISION_MODEL || "@cf/meta/llama-3.2-11b-vision-instruct" : env.WORKERS_AI_TEXT_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const prompt = `${request.prompt}\n\nReturn ONLY one JSON object, no other text, matching this JSON schema:\n${JSON.stringify(request.schema)}`;
  const input: Record<string, unknown> = { messages: [{ role: "user", content: prompt }], max_tokens: 1200, temperature: 0.2 };
  if (request.vision && request.imageDataUrls?.length) input.image = Array.from(Uint8Array.from(atob(parseImageDataUrl(request.imageDataUrls[0]).data), (char) => char.charCodeAt(0)));
  let result: any;
  try { result = await env.AI!.run(model, input); }
  catch (error) {
    // Meta Llama görsel modeli hesap başına bir kez lisans onayı ister.
    if (!/agree|license/i.test(String((error as Error)?.message || error))) throw error;
    await env.AI!.run(model, { prompt: "agree" });
    result = await env.AI!.run(model, input);
  }
  const text = typeof result?.response === "string" ? result.response : typeof result === "string" ? result : JSON.stringify(result?.response ?? "");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("EMPTY_ANALYSIS");
  return JSON.parse(match[0]) as T;
}

export function hasAiProvider(overrides?: AiRuntimeEnv): boolean {
  const env = { ...nodeEnvironment(), ...overrides };
  return Boolean(env.GEMINI_API_KEY || env.OPENAI_API_KEY || env.AI);
}

export async function generateStructuredObject<T>(request: StructuredRequest, overrides?: AiRuntimeEnv): Promise<T> {
  const env = { ...nodeEnvironment(), ...overrides };
  try {
    if (env.GEMINI_API_KEY) return await callGemini<T>(request, env);
    if (env.OPENAI_API_KEY) return await callOpenAI<T>(request, env);
    if (env.AI) return await callWorkersAi<T>(request, env);
    throw new Error("AI_PROVIDER_NOT_CONFIGURED");
  } catch (error) {
    const status = Number((error as { status?: number })?.status);
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "APIConnectionTimeoutError")) throw new Error("AI_PROVIDER_TIMEOUT");
    if (error instanceof SyntaxError || error instanceof Error && error.message === "EMPTY_ANALYSIS") throw new Error("AI_PROVIDER_INVALID_RESPONSE");
    if (status === 429) throw new Error("AI_FREE_QUOTA_EXCEEDED");
    if (status === 400) throw new Error("AI_PROVIDER_INVALID_REQUEST");
    if (status === 401 || status === 403) throw new Error("AI_PROVIDER_ACCESS_DENIED");
    throw error;
  }
}
