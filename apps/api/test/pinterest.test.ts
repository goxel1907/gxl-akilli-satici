import assert from "node:assert/strict";
import test from "node:test";
import { autoEnqueuePins, boardNameFor, buildPinPayload, createPinterestConnectSession, enqueueListingPins, handlePinterestCallback, listPinJobs, parseListingId, processPinQueue, writePinterestSettings, type PinJob } from "../../worker/src/pinterest.js";
import { handleRequest } from "../../worker/src/index.js";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function memoryKv() {
  const values = new Map<string, string>();
  const store = {
    async get(key: string) { return values.get(key) ?? null; },
    async put(key: string, value: string) { values.set(key, value); },
    async delete(key: string) { values.delete(key); }
  };
  return { values, store };
}

const env = (store: ReturnType<typeof memoryKv>["store"]) => ({ PINTEREST_APP_ID: "app-1", PINTEREST_APP_SECRET: "secret-1", ETSY_API_KEY: "key", ETSY_SHARED_SECRET: "secret", ETSY_OAUTH: store, APP_ACCESS_TOKEN: "app-token" });

const listing = (state: string) => ({
  listing_id: 123456789,
  title: "Budget Planner Printable, Muthine Budget Planner, Sinking Funds Tracker, US Letter, A4, A5, Instant Download",
  description: "Muthine Budget Planner - an original budget planner with sinking funds and savings trackers.\n\nTHIS IS A DIGITAL PRODUCT.",
  state,
  tags: ["budget planner", "sinking funds", "savings tracker", "disney budget", "a5 planner", "bill tracker"],
  images: [
    { url_fullxfull: "https://i.etsystatic.com/wide.jpg", full_width: 3000, full_height: 2250 },
    { url_fullxfull: "https://i.etsystatic.com/tall.jpg", full_width: 1000, full_height: 1500 }
  ]
});

test("connect session asks for board and pin scopes and stores a one-time state", async () => {
  const kv = memoryKv();
  const session = await createPinterestConnectSession(new Request("https://gxl.example/api/pinterest/connect-session"), env(kv.store));
  const url = new URL(session.authorizationUrl);
  assert.equal(url.origin + url.pathname, "https://www.pinterest.com/oauth/");
  assert.equal(url.searchParams.get("client_id"), "app-1");
  assert.equal(url.searchParams.get("redirect_uri"), "https://gxl.example/pinterest/oauth/callback");
  assert.equal(url.searchParams.get("scope"), "boards:read,boards:write,pins:read,pins:write,user_accounts:read");
  assert.ok(kv.values.has(`pinterest:oauth:${url.searchParams.get("state")}`));

  let tokenRequest: { auth?: string | null; body?: string } = {};
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const target = new URL(String(input));
    if (target.pathname === "/v5/oauth/token") {
      tokenRequest = { auth: new Headers(init?.headers).get("authorization"), body: String(init?.body) };
      return Response.json({ access_token: "pina_token", refresh_token: "pinr_refresh", expires_in: 2_592_000, refresh_token_expires_in: 5_184_000, scope: "pins:write" });
    }
    if (target.pathname === "/v5/user_account") return Response.json({ username: "gxlmarketstudio" });
    return Response.json({}, { status: 404 });
  }) as typeof fetch;
  const callback = await handlePinterestCallback(new Request(`https://gxl.example/pinterest/oauth/callback?code=abc&state=${url.searchParams.get("state")}`), env(kv.store), fetcher);
  assert.equal(callback.status, 200);
  assert.equal(tokenRequest.auth, `Basic ${btoa("app-1:secret-1")}`);
  assert.match(tokenRequest.body || "", /grant_type=authorization_code/);
  const tokens = JSON.parse(kv.values.get("pinterest:tokens")!);
  assert.equal(tokens.username, "gxlmarketstudio");
  assert.equal(tokens.refreshToken, "pinr_refresh");
});

test("each listing gets three pins spread over days, without duplicates", async () => {
  const kv = memoryKv();
  const jobs = await enqueueListingPins(kv.store, { listingId: 123456789, boardName: "Printable Planners & Trackers", pins: [{ title: "Budget Planner Printable | Sinking Funds", description: "Plan your money with sinking funds." }] }, NOW);
  assert.deepEqual(jobs.map((job) => (Date.parse(job.dueAt) - NOW) / DAY), [0, 2, 5]);
  assert.equal(jobs[0].pin?.title, "Budget Planner Printable | Sinking Funds");
  assert.equal(jobs[1].pin, undefined);
  assert.deepEqual(await enqueueListingPins(kv.store, { listingId: 123456789, boardName: "x" }, NOW), []);
  await writePinterestSettings(kv.store, { auto: false });
  assert.equal(await autoEnqueuePins(kv.store, { listingId: 987654321, boardName: "x" }), 0);
  assert.equal(parseListingId("https://www.etsy.com/listing/1234567890/budget-planner?ref=shop"), 1234567890);
  assert.equal(parseListingId("https://www.etsy.com/tr/listing/1234567/x"), 1234567);
  assert.equal(parseListingId("abc"), undefined);
  assert.equal(boardNameFor({ kind: "coloring" }), "Printable Coloring Pages");
  assert.equal(boardNameFor({ craft: "crochet" }), "Crochet Patterns");
  assert.equal(boardNameFor({ noun: "prayer beads" }), "Prayer Beads");
});

test("pin payload uses the Etsy sales link, the tallest image, keywords and safe hashtags", () => {
  const job = { id: "job1", listingId: 123456789, pinIndex: 0, boardName: "x", aiAssisted: true } as PinJob;
  const payload = buildPinPayload(job, listing("active"), "board-9");
  assert.equal(payload.board_id, "board-9");
  assert.equal(payload.link, "https://www.etsy.com/listing/123456789?utm_source=pinterest&utm_medium=social&utm_campaign=gxl_autopin");
  assert.equal(payload.media_source.url, "https://i.etsystatic.com/tall.jpg");
  assert.ok(payload.title.length <= 100);
  assert.ok(payload.description.length <= 800);
  assert.match(payload.description, /#budgetplanner/);
  assert.doesNotMatch(payload.description, /disney/i);
  assert.match(payload.description, /Perfect for: budget planner, sinking funds/);
  assert.deepEqual((payload as { ai_disclosures?: unknown }).ai_disclosures, { values: ["AI_MODIFIED"] });
  const second = buildPinPayload({ ...job, pinIndex: 1, link: "https://www.shopier.com/goxsel/1" }, listing("active"), "board-9");
  assert.equal(second.media_source.url, "https://i.etsystatic.com/wide.jpg");
  assert.equal(second.link, "https://www.shopier.com/goxsel/1");
});

test("queue waits for the Etsy listing to go live, then creates the board and the pin", async () => {
  const kv = memoryKv();
  await kv.store.put("pinterest:tokens", JSON.stringify({ accessToken: "old", refreshToken: "pinr", expiresAt: 0, scope: "pins:write" }));
  await enqueueListingPins(kv.store, { listingId: 123456789, boardName: "Printable Planners & Trackers", aiAssisted: false }, NOW);
  let state = "draft";
  const calls: Array<{ path: string; method: string; body?: unknown; auth?: string | null }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const target = new URL(String(input));
    const body = typeof init?.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init?.body;
    calls.push({ path: target.pathname, method: init?.method || "GET", body, auth: new Headers(init?.headers).get("authorization") });
    if (target.hostname === "api.etsy.com") return Response.json(listing(state));
    if (target.pathname === "/v5/oauth/token") return Response.json({ access_token: "fresh", refresh_token: "pinr2", expires_in: 2_592_000 });
    if (target.pathname === "/v5/boards" && init?.method === "POST") return Response.json({ id: "board-1" }, { status: 201 });
    if (target.pathname === "/v5/boards") return Response.json({ items: [] });
    if (target.pathname === "/v5/pins") return Response.json({ id: "9001" }, { status: 201 });
    return Response.json({}, { status: 404 });
  }) as typeof fetch;

  const waiting = await processPinQueue(env(kv.store), kv.store, fetcher, NOW);
  assert.equal(waiting.status, "waiting_listing");
  let jobs = await listPinJobs(kv.store);
  assert.equal(Date.parse(jobs[0].dueAt) - NOW, 6 * 60 * 60 * 1000);
  assert.equal(calls.filter((call) => call.path.startsWith("/v5/")).length, 0);

  state = "active";
  const posted = await processPinQueue(env(kv.store), kv.store, fetcher, NOW + 7 * 60 * 60 * 1000);
  assert.equal(posted.status, "posted");
  jobs = await listPinJobs(kv.store);
  assert.equal(jobs[0].pinUrl, "https://www.pinterest.com/pin/9001/");
  assert.ok(calls.some((call) => call.path === "/v5/oauth/token"));
  const pinCall = calls.find((call) => call.path === "/v5/pins")!;
  assert.equal(pinCall.auth, "Bearer fresh");
  assert.equal((pinCall.body as { board_id: string }).board_id, "board-1");
  assert.equal((pinCall.body as { ai_disclosures?: unknown }).ai_disclosures, undefined);
  assert.equal(calls.filter((call) => call.path === "/v5/boards" && call.method === "POST").length, 1);
  assert.deepEqual(await processPinQueue(env(kv.store), kv.store, fetcher, NOW + 8 * 60 * 60 * 1000), { skipped: "nothing_due" });

  const next = await processPinQueue(env(kv.store), kv.store, fetcher, NOW + 2 * DAY + 1000);
  assert.equal(next.status, "posted");
  assert.equal(calls.filter((call) => call.path === "/v5/boards" && call.method === "POST").length, 1);
});

test("pinterest endpoints report status, queue a listing link and require confirmation", async () => {
  const kv = memoryKv();
  const headers = { authorization: "Bearer app-token", "content-type": "application/json" };
  const status = await (await handleRequest(new Request("https://gxl.example/api/pinterest/status", { headers }), env(kv.store))).json() as { configured: boolean; connected: boolean; settings: { auto: boolean } };
  assert.equal(status.configured, true);
  assert.equal(status.connected, false);
  assert.equal(status.settings.auto, true);
  assert.equal((await handleRequest(new Request("https://gxl.example/api/pinterest/queue", { method: "POST", headers, body: JSON.stringify({ listingUrl: "https://www.etsy.com/listing/1234567890/x" }) }), env(kv.store))).status, 409);
  const queued = await handleRequest(new Request("https://gxl.example/api/pinterest/queue", { method: "POST", headers, body: JSON.stringify({ confirm: true, listingUrl: "https://www.etsy.com/listing/1234567890/x", link: "https://www.shopier.com/goxsel/1" }) }), env(kv.store));
  assert.equal(queued.status, 201);
  const list = await (await handleRequest(new Request("https://gxl.example/api/pinterest/queue", { headers }), env(kv.store))).json() as { jobs: PinJob[] };
  assert.equal(list.jobs.length, 3);
  assert.equal(list.jobs[0].link, "https://www.shopier.com/goxsel/1");
  const bad = await handleRequest(new Request("https://gxl.example/api/pinterest/queue", { method: "POST", headers, body: JSON.stringify({ confirm: true, listingUrl: "nope" }) }), env(kv.store));
  assert.equal(bad.status, 400);
});

test("public privacy policy page explains Pinterest data use without app authentication", async () => {
  const response = await handleRequest(new Request("https://gxl.example/privacy"), {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  const html = await response.text();
  assert.match(html, /Privacy Policy/);
  assert.match(html, /Pinterest/);
  assert.match(html, /disconnect/i);
  for (const path of ["/GXLMarketStudio/privacy-policy", "/gxl-market-studio/privacy", "/GXLMarketStudio-privacy-policy/"]) {
    assert.equal((await handleRequest(new Request(`https://gxl.example${path}`), {})).status, 200, path);
  }
});
