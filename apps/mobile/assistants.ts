// Satıcının üyeliği olan yapay zekâlar. Paketler her birinin yapabildiğine göre yazılır.
// Gemini: Google Arama ile Etsy'ye bakabilir, görsel üretir (fotoğraf gibi sahneler), kod çalıştırır; indirilebilir
// PDF/ZIP dosyası her hesapta verilemeyebilir, bu yüzden dosya üretiminde ChatGPT/Claude daha güvenilirdir.
export type Assistant = "chatgpt" | "claude" | "gemini";
export const ASSISTANTS: Array<{ id: Assistant; label: string }> = [{ id: "chatgpt", label: "ChatGPT" }, { id: "claude", label: "Claude" }, { id: "gemini", label: "Gemini" }];
export const isAssistant = (value: unknown): value is Assistant => value === "chatgpt" || value === "claude" || value === "gemini";
export const assistantName = (value: unknown) => value === "claude" ? "Claude" : value === "gemini" ? "Gemini" : "ChatGPT";
// Türkçe ekler: "ChatGPT’ye", "Claude’a", "Gemini’ye" ve belirtme hâli.
export const assistantTo = (value: unknown) => value === "claude" ? "Claude’a" : value === "gemini" ? "Gemini’ye" : "ChatGPT’ye";
export const assistantAcc = (value: unknown) => value === "claude" ? "Claude’u" : value === "gemini" ? "Gemini’yi" : "ChatGPT’yi";
export const assistantHome = (value: unknown) => value === "claude" ? "https://claude.ai/" : value === "gemini" ? "https://gemini.google.com/app" : "https://chatgpt.com/";
export function assistantHint(value: unknown): string {
  if (value === "claude") return "Claude: dosyaları ve vektör (SVG) çizimleri kendisi yapar; fotoğraf üretemez. Fotoğraf gibi sahneler için görsel promptunu verir, onu bir görsel aracında (ör. Gemini) çalıştırırsınız.";
  if (value === "gemini") return "Gemini: Google Arama ile rakiplere bakar, fotoğraf gibi sahneleri ve kapak zeminini çok iyi üretir. PDF/ZIP dosyası veremezse baskıya hazır HTML verir; dosya üretiminde ChatGPT veya Claude daha güvenilirdir.";
  return "ChatGPT: görselleri kendi görsel aracıyla, dosyaları Python ile üretir ve indirme bağlantısı verir.";
}
