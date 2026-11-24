import assert from "node:assert/strict";
import test from "node:test";
import { classifyDriveEntry, driveConnectUrl, driveStatus, handleDriveCallback, importDriveFile, scanDriveFolder } from "../../worker/src/google-drive.js";
import { readStoredFile } from "../../worker/src/digital-delivery.js";

function memory() {
  const values = new Map<string, any>();
  const store = {
    async get(key: string, type?: string) { const value = values.get(key); return value === undefined ? null : type === "arrayBuffer" ? value : typeof value === "string" ? value : new TextDecoder().decode(value); },
    async put(key: string, value: any) { values.set(key, value instanceof ReadableStream ? await new Response(value).arrayBuffer() : value); },
    async delete(key: string) { values.delete(key); }
  };
  return { store, values };
}
const noise = (size: number, seed: number) => { const out = new Uint8Array(size); let x = seed; for (let i = 0; i < size; i++) { x = (x * 1103515245 + 12345) >>> 0; out[i] = x >>> 24; } return out; };

test("Drive connects once, shows the weekly renewal and pulls a big ZIP on the server with range checks", async () => {
  const { zipSync } = await import("fflate");
  const { store, values } = memory();
  const env = { GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", ETSY_OAUTH: store };
  assert.equal((await driveStatus({ ETSY_OAUTH: store })).configured, false);
  const { url } = await driveConnectUrl(env, "https://api.example");
  const auth = new URL(url);
  assert.equal(auth.searchParams.get("scope"), "https://www.googleapis.com/auth/drive.readonly");
  assert.equal(auth.searchParams.get("redirect_uri"), "https://api.example/google/oauth/callback");
  const zip = Uint8Array.from(zipSync({ "Print-2x3.png": noise(3_500_000, 1), "Print-3x4.png": noise(3_500_000, 2) }, { level: 0 }));
  const ranges: string[] = [];
  const fetcher = (async (input: string, init: RequestInit = {}) => {
    const target = new URL(input);
    if (target.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "access", refresh_token: "refresh", expires_in: 3600 });
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer access");
    if (target.pathname === "/drive/v3/files" && /mimeType='application\/vnd.google-apps.folder'/.test(target.searchParams.get("q") || "") && /name='GXL'/.test(target.searchParams.get("q") || "")) return Response.json({ files: [{ id: "folder123" }] });
    if (target.pathname === "/drive/v3/files") return Response.json({ files: [
      { id: "zipfile0001", name: "Wall-Art-2x3.zip", size: String(zip.length), mimeType: "application/zip" },
      { id: "img00000010", name: "listing-10.jpg", size: "300000", mimeType: "image/jpeg" },
      { id: "img00000002", name: "listing-2.jpg", size: "300000", mimeType: "image/jpeg" },
      { id: "imgzip00001", name: "listing-images.zip", size: "9000000", mimeType: "application/zip" },
      { id: "huge0000001", name: "All-Sizes.zip", size: String(25 * 1024 * 1024), mimeType: "application/zip" }] });
    if (target.pathname === "/drive/v3/files/zipfile0001" && target.searchParams.get("alt") !== "media") return Response.json({ name: "Wall-Art-2x3.zip", size: String(zip.length), mimeType: "application/zip" });
    if (target.pathname === "/drive/v3/files/zipfile0001") {
      const range = new Headers(init.headers).get("range");
      if (!range) return new Response(zip);
      ranges.push(range);
      const [, start, end] = range.match(/bytes=(\d+)-(\d+)/)!;
      return new Response(zip.slice(Number(start), Number(end) + 1), { status: 206 });
    }
    throw new Error(`unexpected ${input}`);
  }) as typeof fetch;
  const state = [...values.keys()].find(key => key.startsWith("google:drive:state:"))!.slice("google:drive:state:".length);
  const callback = await handleDriveCallback(new Request(`https://api.example/google/oauth/callback?state=${state}&code=abc`), env, fetcher);
  assert.equal(callback.status, 200);
  const status = await driveStatus(env);
  assert.equal(status.connected, true); assert.equal(status.daysLeft, 7);
  assert.equal((await driveStatus(env, Date.now() + 8 * 86_400_000)).expired, true, "after 7 days the app asks to reconnect");
  const scan = await scanDriveFolder(env, fetcher);
  assert.deepEqual(scan.entries.map(entry => `${entry.name}:${entry.role}`), ["All-Sizes.zip:skip", "listing-2.jpg:image", "listing-10.jpg:image", "listing-images.zip:image_zip", "Wall-Art-2x3.zip:file"]);
  assert.match(scan.entries[0].noteTr!, /20 MB/);
  const staged = await importDriveFile(env, { fileId: "zipfile0001", role: "file" }, async () => undefined, fetcher);
  assert.ok(ranges.length >= 2, "head and tail are read with range requests");
  const meta = JSON.parse(values.get(`digital:upload-part:${staged.id}:meta`));
  assert.deepEqual(meta.qa.names, ["Print-2x3.png", "Print-3x4.png"]);
  assert.deepEqual(new Uint8Array((await readStoredFile(store as never, meta.storedKey))!), zip, "the whole file is stored as it is in Drive");
});

test("Drive entries are sorted into sale files, images and image packs", () => {
  assert.equal(classifyDriveEntry({ id: "x", name: "Planner-US-Letter.pdf", size: 5_000_000 }).role, "file");
  assert.equal(classifyDriveEntry({ id: "x", name: "listing-03.png", size: 9_000_000 }).noteTr, "8 MB'tan büyük; telefon küçültüp gönderir.");
  assert.equal(classifyDriveEntry({ id: "x", name: "notes.txt" }).role, "skip");
});

test("the Google key can be pasted in the app: stored encrypted, never shown back, used for connecting", async () => {
  const { handleRequest } = await import("../../worker/src/index.js");
  const { store, values } = memory();
  const env = { APP_ACCESS_TOKEN: "local-test", ETSY_OAUTH: store };
  const auth = { authorization: "Bearer local-test", "content-type": "application/json" };
  const call = (path: string, body?: unknown) => handleRequest(new Request(`https://api.example${path}`, body === undefined ? { headers: auth } : { method: "POST", headers: auth, body: JSON.stringify(body) }), env as never);
  const clientId = "123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com", clientSecret = "GOCSPX-abcdefghijklmnopqrstuvwx";
  assert.equal((await (await call("/api/drive/status")).json() as { configured: boolean }).configured, false);
  assert.equal((await call("/api/drive/credentials", { confirm: true, clientId: "wrong", clientSecret })).status, 400);
  assert.equal((await call("/api/drive/credentials", { clientId, clientSecret })).status >= 400, true, "saving needs explicit confirmation");
  const saved = await call("/api/drive/credentials", { confirm: true, clientId, clientSecret });
  assert.equal(saved.status, 200);
  assert.doesNotMatch(await saved.text(), /GOCSPX/);
  const raw = String(values.get("google:drive:client"));
  assert.doesNotMatch(raw, /GOCSPX-abcdefghijklmnopqrstuvwx/, "the secret is encrypted at rest");
  const status = await (await call("/api/drive/status")).text();
  assert.match(status, /"configured":true/); assert.match(status, /"source":"app"/); assert.doesNotMatch(status, /GOCSPX/);
  const { url } = await (await call("/api/drive/connect", {})).json() as { url: string };
  assert.equal(new URL(url).searchParams.get("client_id"), clientId);
  // Google'a giden token isteğinde şifresi çözülmüş secret kullanılır.
  let sentSecret = "";
  const state = new URL(url).searchParams.get("state")!;
  const fetcher = (async (_input: string, init: RequestInit) => { sentSecret = new URLSearchParams(String(init.body)).get("client_secret") || ""; return Response.json({ access_token: "a", refresh_token: "r", expires_in: 3600 }); }) as typeof fetch;
  assert.equal((await handleDriveCallback(new Request(`https://api.example/google/oauth/callback?state=${state}&code=c`), env, fetcher)).status, 200);
  assert.equal(sentSecret, clientSecret);
  // Başka bir sunucu anahtarıyla şifre çözülemez.
  assert.equal((await driveStatus({ APP_ACCESS_TOKEN: "other", ETSY_OAUTH: store })).configured, false);
});
