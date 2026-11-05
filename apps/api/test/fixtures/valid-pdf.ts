// Small, parseable PDFs with explicit page geometry; no fake signature-only files.
export function validPdf(name = "Audit.pdf"): Uint8Array<ArrayBuffer> {
  const [w, h] = /half.?letter/i.test(name) ? [396, 612] : /a4/i.test(name) ? [595.28, 841.89] : /a5/i.test(name) ? [419.53, 595.28] : [612, 792];
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << >> >>`];
  let text = `%PDF-1.4\n% ${name.replace(/[^A-Za-z0-9 .-]/g, "")}\n% ${"x".repeat(1200)}\n`;
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(text)); text += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(text);
  text += `xref\n0 4\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Uint8Array.from(Buffer.from(text));
}
