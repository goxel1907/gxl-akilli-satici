import { generateStructuredObject, hasAiProvider, type AiRuntimeEnv } from "../../api/src/structured-ai.js";

// Alıcı mesajı yardımcısı: Etsy mesajlaşmayı programlara açmaz; satıcı mesajı yapıştırır, uygulama Türkçesini,
// alıcının ne istediğini ve önerilen İngilizce cevabı (Türkçe anlamıyla) verir. Dolandırıcılık ve Etsy dışına
// yönlendirme işaretleri yapay zekâ olmadan da kurallarla yakalanır.

export class MessageAssistError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "MessageAssistError";
  }
}

export interface MessageAssistInput {
  text: string;
  sellerNoteTr?: string;
  productName?: string;
}

export interface MessageAssistResult {
  translationTr: string;
  intentTr: string;
  replyEn: string;
  replyTr: string;
  warningsTr: string[];
  aiUsed: boolean;
  noticeTr?: string;
}

const RED_FLAGS: Array<{ pattern: RegExp; warningTr: string }> = [
  { pattern: /\b(paypal|zelle|venmo|cash ?app|western union|wire transfer|bank transfer|gift ?cards?|crypto|bitcoin|usdt)\b/i, warningTr: "Etsy dışında ödeme isteniyor. Kabul etmeyin: en yaygın dolandırıcılık yöntemidir ve Etsy bu satışı korumaz." },
  { pattern: /\b(whats ?app|telegram|signal|wechat|text me|call me|my (phone )?number|e-?mail me|gmail|outlook|yahoo|dm me)\b/i, warningTr: "Alıcı Etsy dışında iletişim istiyor. Yalnız Etsy mesajlarından yazışın; Etsy dışına yönlendirmek kurala aykırıdır ve dolandırıcılık riski taşır." },
  { pattern: /https?:\/\/|www\.|bit\.ly|\.com\/\S/i, warningTr: "Mesajda bağlantı var. Tıklamayın; Etsy hesap bilgilerinizi başka sayfaya girmeyin." },
  { pattern: /\b(verify|verification|confirm your account|account (is )?(suspended|limited|on hold)|qr code|security code|one[- ]time code)\b/i, warningTr: "Sahte 'Etsy doğrulama' mesajı olabilir. Etsy sizden mesajla şifre, kod veya doğrulama istemez." },
  { pattern: /\b(refund|return|damaged|broken|never (arrived|received)|not (as described|received)|chargeback)\b/i, warningTr: "İade, hasar ya da teslim edilmedi talebi: Önce fotoğraf isteyin, Etsy'nin iade sürecine (Help with order / case) göre ilerleyin; Etsy dışında para göndermeyin." }
];

export function detectRedFlags(text: string): string[] {
  return RED_FLAGS.filter((flag) => flag.pattern.test(text)).map((flag) => flag.warningTr);
}

export function normalizeMessageInput(raw: Record<string, unknown>): MessageAssistInput {
  const text = String(raw.text || "").replace(/\r/g, "").trim();
  if (text.length < 2) throw new MessageAssistError("Alıcının mesajını yapıştırın.");
  if (text.length > 2000) throw new MessageAssistError("Mesaj çok uzun; en fazla 2000 karakter.");
  const sellerNoteTr = String(raw.sellerNoteTr || "").trim().slice(0, 500) || undefined;
  const productName = String(raw.productName || "").trim().slice(0, 120) || undefined;
  return { text, sellerNoteTr, productName };
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    translationTr: { type: "string" },
    intentTr: { type: "string" },
    replyEn: { type: "string" },
    replyTr: { type: "string" },
    warningsTr: { type: "array", items: { type: "string" } }
  },
  required: ["translationTr", "intentTr", "replyEn", "replyTr", "warningsTr"]
};

const clean = (value: unknown, max: number) => String(value || "").replace(/[<>]/g, "").replace(/[ \t]+/g, " ").trim().slice(0, max);

export async function assistBuyerMessage(input: MessageAssistInput, env: AiRuntimeEnv): Promise<MessageAssistResult> {
  const ruleWarnings = detectRedFlags(input.text);
  if (!hasAiProvider(env)) {
    return {
      translationTr: "",
      intentTr: "",
      replyEn: "",
      replyTr: "",
      warningsTr: ruleWarnings,
      aiUsed: false,
      noticeTr: "Çeviri ve cevap için sunucuda yapay zekâ anahtarı (GEMINI_API_KEY) gerekli. Aşağıdaki uyarılar yine de geçerlidir."
    };
  }
  let raw: Partial<MessageAssistResult>;
  try {
    raw = await generateStructuredObject<Partial<MessageAssistResult>>({
    schemaName: "gxl_buyer_message",
    schema: SCHEMA,
    prompt: [
      "You help a Turkish Etsy seller who does not speak English answer a buyer message.",
      "translationTr: faithful Turkish translation of the buyer message. intentTr: one Turkish sentence saying what the buyer wants.",
      "replyEn: a short, warm, professional English reply the seller can paste into Etsy messages. Rules:",
      "- Never ask or agree to talk or pay outside Etsy (no WhatsApp, email, PayPal, phone). Keep everything on Etsy.",
      "- Do not invent facts (dates, tracking numbers, materials, discounts). If a fact is needed and unknown, write it as a placeholder in square brackets, e.g. [tracking number].",
      "- If the seller's note is given, follow it exactly; it is the seller's decision.",
      "- No signature with a name; end with \"Thank you!\".",
      "replyTr: the Turkish meaning of replyEn so the seller knows what they are sending.",
      "warningsTr: Turkish warnings only for real risks (scam, off-platform payment or contact, suspicious links, refund requests). Empty if none.",
      input.productName ? `Product: ${JSON.stringify(input.productName)}` : "",
      input.sellerNoteTr ? `Seller's note (Turkish): ${JSON.stringify(input.sellerNoteTr)}` : "",
      `Buyer message: ${JSON.stringify(input.text)}`
    ].filter(Boolean).join("\n")
    }, env);
  } catch {
    return { translationTr: "", intentTr: "", replyEn: "", replyTr: "", warningsTr: ruleWarnings, aiUsed: false, noticeTr: "Yapay zekâ şu an yanıt vermedi; biraz sonra yeniden deneyin. Aşağıdaki uyarılar yine de geçerlidir." };
  }
  const aiWarnings = (Array.isArray(raw.warningsTr) ? raw.warningsTr : []).map((item) => clean(item, 300)).filter(Boolean).slice(0, 4);
  return {
    translationTr: clean(raw.translationTr, 3000),
    intentTr: clean(raw.intentTr, 300),
    replyEn: String(raw.replyEn || "").replace(/[<>]/g, "").trim().slice(0, 2000),
    replyTr: clean(raw.replyTr, 2500),
    warningsTr: [...new Set([...ruleWarnings, ...aiWarnings])],
    aiUsed: true
  };
}
