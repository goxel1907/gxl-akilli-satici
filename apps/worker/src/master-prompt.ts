import type { AdVisual } from "./ad-visuals.js";

// Android paylaşımı ChatGPT/Claude'da her seferinde yeni sohbet açar; yeni sohbet önceki parçayı (ad, palet, spec) bilmez.
// Bu yüzden tüm parçalar sıralı adımlarla tek bir pakete toplanır: tek paylaşım, tek sohbet, tutarlı ürün.
export interface MasterPromptInput {
  name: string;
  productLabel: string;
  specName: "Product spec" | "Design spec";
  filesBrief: string;
  artPrompts?: string[];
  renderPrompt?: string;
  adVisuals: AdVisual[];
  pins?: Array<{ title: string; description: string; overlay: string }>;
  checklist: string[];
}

export function buildMasterPrompt(input: MasterPromptInput): string {
  const spec = input.specName;
  const pinVisual = input.adVisuals.find((visual) => visual.aspect.startsWith("2:3"));
  // Sanat gerektiren türlerde dosyalar görselleri yerleştirdiği için önce görseller üretilir.
  const steps: Array<{ title: string; body: string }> = [
    { title: `${spec} first`, body: `Read the whole package. Before any file, output the ${spec} JSON described in Brief A. It is the single source of truth: every later file and image must match it exactly (name, palette hex codes, fonts, page or motif list, counts). If I ask for a change, update the JSON first and show it again. Show the final JSON again when the product files are finished.` }
  ];
  if (input.artPrompts?.length) steps.push({ title: "Artwork", body: "Create the artworks in Brief B one image per reply, in the spec palette and one consistent style. Name them page-01.png, page-02.png and so on; the product files will place them." });
  steps.push({ title: "Product files", body: "Build the product files exactly as Brief A says, pass by pass. Give me each file as a download when you can create files; otherwise give complete print-ready HTML I can save as PDF." });
  if (input.renderPrompt) steps.push({ title: "Product renders", body: `Create the renders in Brief R, one image per reply. Use the ${spec} JSON from step 1 of this chat; show exactly its motif counts and colors.` });
  steps.push({ title: "Listing images", body: "Create the listing images in Brief C one per reply, in order. The product shown must be the real pages or item from this chat. If you cannot see them as images, ask me to upload 2-3 screenshots first. Never draw text, letters or logos in the image; I add headlines later in Canva." });
  if (input.pins?.length && pinVisual) steps.push({ title: "Pinterest images", body: `For each pin in Brief D create one 2:3 vertical image based on image C${pinVisual.slot}, changing the scene so the pins look different and match each pin's angle. Keep the top 30% clean for the headline.` });
  steps.push({ title: "Final check", body: "Check everything against the Final checklist and list what passes and what still needs fixing." });

  const lines = [
    `# ${input.name} - complete product package (GXL Market Studio)`,
    "",
    `This is ONE package for an original Etsy ${input.productLabel}. Do every step in THIS chat, in order, so the name, palette, fonts and ${spec} stay identical in every file and image. Do not split the work across chats.`,
    "",
    "## How we will work",
    "- Work one step at a time. End each step with \"STEP n DONE - write next to continue\" and wait for me.",
    "- If a step does not fit in one reply, stop at a clean point and continue when I write \"next\".",
    ...steps.map((step, index) => `- STEP ${index + 1} - ${step.title}: ${step.body}`),
    "",
    "## Tool notes",
    "- ChatGPT: make images with the built-in image generator and build the files with Python (for example reportlab or HTML to PDF), then give download links.",
    "- Claude: you cannot make photos. Build the files with your file tools (HTML, SVG or PDF) and make artwork as clean vector SVG. For photo steps, return the prompts unchanged with the spec values filled in, so I can run them in an image tool.",
    "",
    "---",
    "## Brief A - product files",
    // Brief içindeki başlıklar bir alt düzeye iner; paketin kendi bölümleriyle karışmaz.
    input.filesBrief.trim().replace(/^## /gm, "### ")
  ];
  if (input.artPrompts?.length) {
    lines.push("", "## Brief B - artwork (one image per reply)", ...input.artPrompts.map((prompt, index) => `B${index + 1}. ${prompt}`));
  }
  if (input.renderPrompt) {
    lines.push("", "## Brief R - product renders (one image per reply)", input.renderPrompt.replace(/ \(paste the Design spec JSON from the finished pattern here\): <DESIGN SPEC JSON>/, `: the ${spec} JSON from step 1 of this chat`).trim());
  }
  lines.push("", "## Brief C - listing images (one per reply, in this order)");
  for (const visual of input.adVisuals) {
    lines.push(`### C${visual.slot}. ${visual.titleTr} - ${visual.aspect}`, `Used for: ${visual.useTr}${visual.overlay ? `. Headline added later in Canva: "${visual.overlay}"` : ""}`, visual.prompt, "");
  }
  if (input.pins?.length) {
    lines.push("## Brief D - Pinterest pins");
    input.pins.forEach((pin, index) => lines.push(`D${index + 1}. Title: ${pin.title}`, `Description: ${pin.description}`, `Headline added later: ${pin.overlay}`, ""));
  }
  lines.push("## Final checklist", ...input.checklist.map((item) => `- ${item}`));
  return lines.join("\n");
}
