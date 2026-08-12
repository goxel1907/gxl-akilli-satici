import type OpenAI from "openai";

export interface AiRuntimeEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_VISION_MODEL?: string;
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
      generationConfig: {
        responseFormat: {
          text: { mimeType: "application/json", schema: request.schema }
        }
      }
    })
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    console.error(`Gemini request failed (${response.status}): ${details}`);
    throw new Error(response.status === 429 ? "AI_FREE_QUOTA_EXCEEDED" : "AI_PROVIDER_REQUEST_FAILED");
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

export function hasAiProvider(overrides?: AiRuntimeEnv): boolean {
  const env = { ...nodeEnvironment(), ...overrides };
  return Boolean(env.GEMINI_API_KEY || env.OPENAI_API_KEY);
}

export async function generateStructuredObject<T>(request: StructuredRequest, overrides?: AiRuntimeEnv): Promise<T> {
  const env = { ...nodeEnvironment(), ...overrides };
  if (env.GEMINI_API_KEY) return callGemini<T>(request, env);
  if (env.OPENAI_API_KEY) return callOpenAI<T>(request, env);
  throw new Error("AI_PROVIDER_NOT_CONFIGURED");
}
