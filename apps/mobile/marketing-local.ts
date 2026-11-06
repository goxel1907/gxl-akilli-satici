export function localWhatsappLink(number: string, message = ""): string | undefined {
  const digits = number.replace(/\D/g, "");
  if (!digits) return undefined;
  const full = digits.startsWith("90") ? digits : digits.startsWith("0") ? `9${digits}` : `90${digits}`;
  if (!/^90\d{10}$/.test(full)) throw Error("WhatsApp numarasını 05xx xxx xx xx biçiminde yazın.");
  return `https://wa.me/${full}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}
export function addLocalWhatsapp(plan: any, number: string, channel: string): any {
  if (channel !== "shopier" || !number.trim()) return plan;
  const link = localWhatsappLink(number);
  if (!link) return plan;
  return { ...plan, channels: (plan.channels || []).map((item: any) => item.id !== "whatsapp" || item.decision === "skip" ? item : {
    ...item,
    stepsTr: (item.stepsTr || []).map((step: string) => step.includes("numaranızı girerseniz") ? "Aşağıdaki 'Bana yaz' bağlantısını izinli kanallarda paylaşabilirsiniz; numaranız telefonda bağlantıya eklendi." : step),
    copy: [{ labelTr: "'Bana yaz' bağlantısı", text: link }, ...(item.copy || []).filter((block: any) => block.labelTr !== "'Bana yaz' bağlantısı")]
  }) };
}
