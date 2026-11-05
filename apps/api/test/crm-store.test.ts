import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { handleRequest } from "../../worker/src/index.js";
import { readCrmSnapshot, type CrmSnapshot } from "../../worker/src/crm-store.js";
import { crmFixture } from "./fixtures/crm.js";
import type { Approval, Lead } from "../src/types.js";

const headers = { authorization: "Bearer local-test", "content-type": "application/json" };
const intake = (handle = "test@example.invalid", content = "Is this in stock?") => ({ channel: "email", handle, displayName: "Local Test", signals: [{ type: "inbound_message", channel: "email", occurredAt: "2026-10-01T12:00:00.000Z", consent: false, productTags: [], text: content }] });
function client(fixture: ReturnType<typeof crmFixture>) {
  const env = { APP_ACCESS_TOKEN: "local-test", CRM_STORE: fixture.namespace };
  return { env, get: (path: string) => handleRequest(new Request(`https://local.invalid${path}`, { headers }), env), post: (path: string, body?: unknown) => handleRequest(new Request(`https://local.invalid${path}`, { method: "POST", headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env) };
}

test("CRM survives closing and reopening the database with customers, messages and approval decisions", async () => {
  const dir = await mkdtemp(join(process.cwd(), "crm-test-"));
  const path = join(dir, "crm.sqlite");
  let fixture = crmFixture(path);
  try {
    let api = client(fixture);
    const result = await api.post("/api/prospects/intake", intake());
    assert.equal(result.status, 201);
    const { lead } = await result.json() as { lead: Lead };
    const pending = await (await api.post("/api/approvals", { leadId: lead.id, draft: "Local draft", productIds: [] })).json() as Approval;
    assert.equal((await api.post(`/api/approvals/${pending.id}/approve`)).status, 200);
    fixture.close(); fixture = crmFixture(path); api = client(fixture);
    const saved = await (await api.get("/api/dashboard")).json() as CrmSnapshot;
    assert.equal(saved.leads[0].id, lead.id);
    assert.equal(saved.leads[0].stage, "active");
    assert.equal(saved.approvals[0].status, "approved");
    assert.equal(saved.messages[0].text, "Is this in stock?");
    assert.equal(saved.metrics.conversations, 1);
    assert.equal(saved.metrics.activeLeads, 1);
    assert.equal(saved.metrics.pendingApprovals, 0);
    assert.ok(saved.messages.every(message => message.direction === "inbound"));
  } finally { fixture.close(); await rm(dir, { recursive: true }); }
});

test("concurrent retries do not duplicate a customer, inbound message or pending draft", async () => {
  const fixture = crmFixture();
  try {
    const api = client(fixture);
    const responses = await Promise.all(Array.from({ length: 30 }, () => api.post("/api/prospects/intake", intake())));
    assert.ok(responses.every(response => response.status === 201));
    let snapshot = await readCrmSnapshot(api.env);
    assert.equal(snapshot.leads.length, 1); assert.equal(snapshot.messages.length, 1);
    const drafts = await Promise.all(Array.from({ length: 20 }, () => api.post("/api/approvals", { leadId: snapshot.leads[0].id, draft: "Local draft", productIds: [] })));
    const bodies = await Promise.all(drafts.map(response => response.json() as Promise<Approval>));
    assert.equal(new Set(bodies.map(approval => approval.id)).size, 1);
    const outcomes = await Promise.all([api.post(`/api/approvals/${bodies[0].id}/approve`), api.post(`/api/approvals/${bodies[0].id}/reject`)]);
    assert.deepEqual(outcomes.map(response => response.status).sort(), [200, 409]);
    snapshot = await readCrmSnapshot(api.env);
    assert.equal(snapshot.approvals.length, 1);
    assert.notEqual(snapshot.approvals[0].status, "pending");
    assert.equal(snapshot.leads[0].autoReplyAllowed, false);
    assert.equal(snapshot.messages.length, 1);
  } finally { fixture.close(); }
});

test("opt-out is durable, blocks an old approval, and cannot be undone by another intake", async () => {
  const fixture = crmFixture();
  try {
    const api = client(fixture);
    const { lead } = await (await api.post("/api/prospects/intake", intake())).json() as { lead: Lead };
    const approval = await (await api.post("/api/approvals", { leadId: lead.id, draft: "Local draft" })).json() as Approval;
    await api.post("/api/prospects/intake", intake(undefined, "STOP"));
    await api.post("/api/prospects/intake", intake(undefined, "Another message"));
    assert.equal((await api.post(`/api/approvals/${approval.id}/approve`)).status, 409);
    const saved = await readCrmSnapshot(api.env);
    assert.equal(saved.leads[0].stage, "blocked");
    assert.equal(saved.leads[0].consent, false);
    assert.equal(saved.approvals[0].status, "pending");
    assert.equal(saved.messages.length, 3);
  } finally { fixture.close(); }
});

test("a storage failure rolls back both the draft and lead state, and is never reported as saved", async () => {
  const fixture = crmFixture();
  try {
    const api = client(fixture);
    const { lead } = await (await api.post("/api/prospects/intake", intake())).json() as { lead: Lead };
    fixture.failWrites(true);
    assert.equal((await api.post("/api/approvals", { leadId: lead.id, draft: "Local draft" })).status, 503);
    fixture.failWrites(false);
    const saved = await readCrmSnapshot(api.env);
    assert.equal(saved.approvals.length, 0);
    assert.equal(saved.leads[0].stage, "qualified");
    assert.equal((await api.post("/api/approvals", { leadId: lead.id, draft: "Local draft" })).status, 201);
  } finally { fixture.close(); }
});

test("missing or failed CRM binding returns unavailable instead of an empty dashboard", async () => {
  for (const env of [{ APP_ACCESS_TOKEN: "local-test" }, { APP_ACCESS_TOKEN: "local-test", CRM_STORE: { idFromName: () => "x", get: () => ({ fetch: async () => { throw Error("offline"); } }) } }]) {
    const response = await handleRequest(new Request("https://local.invalid/api/dashboard", { headers }), env);
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { code: string }).code, "CRM_STORAGE_UNAVAILABLE");
  }
  const fixture = crmFixture();
  try {
    const response = await handleRequest(new Request("https://local.invalid/api/prospects/intake", { method: "POST", body: JSON.stringify(intake()) }), client(fixture).env);
    assert.equal(response.status, 401);
    assert.equal((await readCrmSnapshot(client(fixture).env)).leads.length, 0);
  } finally { fixture.close(); }
});

test("malformed, mismatched and future signals are rejected without partial records", async () => {
  const fixture = crmFixture();
  try {
    const api = client(fixture);
    for (const change of [{ type: "invented" }, { occurredAt: "not a date" }, { occurredAt: "2099-01-01" }, { channel: "instagram" }, { productTags: null }, { consent: "true" }]) {
      const body = intake(); Object.assign(body.signals[0], change);
      assert.equal((await api.post("/api/prospects/intake", body)).status, 400);
    }
    assert.equal((await api.post("/api/prospects/intake", null)).status, 400);
    assert.equal((await readCrmSnapshot(api.env)).leads.length, 0);
    const body = intake(); body.signals[0].type = "product_favorite";
    assert.equal((await api.post("/api/prospects/intake", body)).status, 202);
    assert.equal((await readCrmSnapshot(api.env)).leads.length, 0);
  } finally { fixture.close(); }
});

test("rejecting the final pending draft restores the lead and the latest inbound date never regresses", async () => {
  const fixture = crmFixture();
  try {
    const api = client(fixture);
    const body = intake(); body.signals[0].occurredAt = "2026-10-03T12:00:00.000Z";
    const { lead } = await (await api.post("/api/prospects/intake", body)).json() as { lead: Lead };
    const approval = await (await api.post("/api/approvals", { leadId: lead.id, draft: "Local draft" })).json() as Approval;
    await api.post("/api/prospects/intake", intake());
    let saved = await readCrmSnapshot(api.env);
    assert.equal(saved.leads[0].stage, "contact_pending");
    assert.equal(saved.leads[0].lastInboundAt, "2026-10-03T12:00:00.000Z");
    await api.post(`/api/approvals/${approval.id}/reject`);
    saved = await readCrmSnapshot(api.env);
    assert.equal(saved.leads[0].stage, "qualified");
    assert.equal(saved.metrics.pendingApprovals, 0);
  } finally { fixture.close(); }
});
