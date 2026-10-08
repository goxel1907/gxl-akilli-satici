// Pinterest (ve diğer platform) uygulama başvurularında istenen herkese açık gizlilik politikası.
const CONTACT_EMAIL = "gxl.marketstudio@gmail.com";
export const PRIVACY_PATHS = new Set(["/privacy", "/gxlmarketstudio/privacy", "/gxlmarketstudio/privacy-policy", "/gxlmarketstudio-privacy-policy", "/gxl-market-studio/privacy", "/gxl-market-studio/privacy-policy"]);

export function privacyPolicyPage(): Response {
  const updated = "2026-10-08";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GXLMarketStudio Privacy Policy</title></head>
<body style="margin:0;background:#f7f2e8;font-family:system-ui,sans-serif;color:#17201d;line-height:1.6"><main style="max-width:760px;margin:40px auto;padding:24px"><section style="background:white;border-radius:20px;padding:28px">
<h1>GXLMarketStudio Privacy Policy</h1>
<p><strong>GXLMarketStudio</strong> (GXL Market Studio, Etsy shop: etsy.com/shop/GXLMarketStudio) · GXL Akıllı Satıcı app · Last updated ${updated}</p>
<h2>What the app does</h2>
<p>GXL Akıllı Satıcı is a private tool used by the owner of the GXL Market Studio shop to prepare Etsy listings and to publish Pins that link to the shop's own Etsy listings. It is not offered to the public.</p>
<h2>Data we access</h2>
<ul>
<li><strong>Pinterest:</strong> with the account owner's permission (OAuth), the app reads basic account information (username) and boards, creates boards for the shop's product categories and creates Pins for the shop's own listings. It does not read, store or share other users' data, followers or messages.</li>
<li><strong>Etsy:</strong> the app reads public listing data (title, description, tags, images, status) of the shop's own listings and creates draft listings in the shop.</li>
</ul>
<h2>How data is stored</h2>
<p>Access tokens are stored only in the app's private, encrypted Cloudflare key-value storage. They are never stored in the mobile app, in source code or in third-party services, and they are never sold or shared. Pin and listing texts are generated for the shop's own products only.</p>
<h2>Retention and deletion</h2>
<p>The owner can disconnect Pinterest at any time in the app (Etsy → Pinterest), which deletes the stored Pinterest tokens immediately. Access can also be revoked from Pinterest account settings. Queued Pin jobs are kept only to show their status and are limited to the most recent 300 jobs.</p>
<h2>Contact</h2>
<p>Questions about this policy: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
</section></main></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
