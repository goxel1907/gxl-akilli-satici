import { products } from "../../api/src/data.js";
import { canStartConversation, requestsOptOut } from "../../api/src/policy.js";
import { scoreProspect, type ProspectSignal } from "../../api/src/prospecting.js";
import type { Approval, Channel, Lead, Message } from "../../api/src/types.js";

// A single named object owns this single-shop CRM. No process-local data or KV
// read/modify/write indexes participate in these transactions.
export const CRM_OBJECT_NAME = "GXLMarketStudio:crm:v1";
interface SqlCursor<T> { toArray(): T[]; }
export interface CrmSql { exec<T = Record<string, unknown>>(query: string, ...values: Array<string | number | null>): SqlCursor<T>; }
export interface CrmState { storage: { sql: CrmSql; transactionSync<T>(callback: () => T): T }; }
export interface CrmNamespace { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> }; }
export interface CrmEnv { CRM_STORE?: CrmNamespace; }
export interface CrmSnapshot { leads: Lead[]; approvals: Approval[]; messages: Message[]; metrics: { activeLeads: number; pendingApprovals: number; conversations: number }; }
export class CrmStorageError extends Error {}
const channels = new Set<Channel>(["whatsapp", "instagram", "facebook", "shopier", "letgo", "etsy", "email"]);
const signalTypes = new Set(["inbound_message", "product_favorite", "shop_follow", "ad_form", "comment", "story_reply", "cart", "order", "email_opt_in"]);
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export function isCrmRoute(request: Request): boolean {
  const path = new URL(request.url).pathname;
  return request.method === "GET" && ["/api/dashboard", "/api/leads", "/api/approvals"].includes(path)
    || request.method === "POST" && (["/api/prospects/intake", "/api/approvals"].includes(path) || /^\/api\/approvals\/[^/]+\/(approve|reject)$/.test(path));
}
export async function crmRequest(env: CrmEnv, request: Request): Promise<Response> {
  if (!env.CRM_STORE) throw new CrmStorageError("Kalıcı müşteri deposu bağlı değil. Sunucu yapılandırmasını kontrol edin.");
  try { return await env.CRM_STORE.get(env.CRM_STORE.idFromName(CRM_OBJECT_NAME)).fetch(request); }
  catch (cause) { throw new CrmStorageError("Kalıcı müşteri deposuna ulaşılamadı. Kayıtların durumu doğrulanamadı; yeniden deneyin.", { cause }); }
}
export async function readCrmSnapshot(env: CrmEnv): Promise<CrmSnapshot> {
  const response = await crmRequest(env, new Request("https://crm.internal/snapshot"));
  if (!response.ok) throw new CrmStorageError("Müşteri kayıtları okunamadı; boş müşteri listesi olarak gösterilmedi.");
  return response.json() as Promise<CrmSnapshot>;
}

export class CrmStore {
  private sql: CrmSql;
  constructor(private ctx: CrmState) {
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS crm_leads (id TEXT PRIMARY KEY, channel TEXT NOT NULL, handle TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(channel, handle))");
    this.sql.exec("CREATE TABLE IF NOT EXISTS crm_approvals (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS crm_messages (id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, created_at TEXT NOT NULL, text TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(lead_id, created_at, text))");
    this.sql.exec("CREATE INDEX IF NOT EXISTS crm_message_leads ON crm_messages(lead_id)");
  }
  private rows<T>(table: "crm_leads" | "crm_approvals"): T[] {
    return this.sql.exec<{ data: string }>(`SELECT data FROM ${table} ORDER BY rowid`).toArray().map(row => JSON.parse(row.data) as T);
  }
  private lead(id: string): Lead | undefined {
    const row = this.sql.exec<{ data: string }>("SELECT data FROM crm_leads WHERE id = ?", id).toArray()[0];
    return row ? JSON.parse(row.data) as Lead : undefined;
  }
  private saveLead(lead: Lead) {
    this.sql.exec("INSERT INTO crm_leads(id,channel,handle,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data", lead.id, lead.channel, lead.handle, JSON.stringify(lead));
  }
  private snapshot(): CrmSnapshot {
    const leads = this.rows<Lead>("crm_leads");
    const approvals = this.rows<Approval>("crm_approvals");
    const messages = this.sql.exec<{ data: string }>("SELECT data FROM crm_messages ORDER BY rowid DESC LIMIT 20").toArray().reverse().map(row => JSON.parse(row.data) as Message);
    const conversations = this.sql.exec<{ count: number }>("SELECT COUNT(DISTINCT lead_id) AS count FROM crm_messages").toArray()[0].count;
    return { leads, approvals, messages, metrics: { activeLeads: leads.filter(row => row.stage === "active").length, pendingApprovals: approvals.filter(row => row.status === "pending").length, conversations } };
  }
  async fetch(request: Request): Promise<Response> {
    let input: Record<string, unknown> = {};
    if (request.method === "POST") {
      const body = await request.text();
      if (new TextEncoder().encode(body).byteLength > 64_000) return Response.json({ error: "Müşteri kaydı çok büyük." }, { status: 413 });
      try { input = body.trim() ? JSON.parse(body) : {}; if (!input || typeof input !== "object" || Array.isArray(input)) throw Error(); }
      catch { return Response.json({ error: "Müşteri bilgileri okunamadı." }, { status: 400 }); }
    }
    // The complete read/check/write sequence is synchronous and transactional.
    // Failed storage writes throw; an acknowledged mutation is never memory-only.
    return this.ctx.storage.transactionSync(() => this.route(request.method, new URL(request.url).pathname, input));
  }
  private route(method: string, path: string, input: Record<string, unknown>): Response {
    const json = (status: number, value: unknown) => Response.json(value, { status });
    if (method === "GET" && (path === "/snapshot" || path === "/api/dashboard")) {
      const snapshot = this.snapshot();
      return json(200, path === "/snapshot" ? snapshot : { ...snapshot, metrics: { ...snapshot.metrics, catalogProducts: products.length }, products });
    }
    if (method === "GET" && path === "/api/leads") return json(200, this.rows<Lead>("crm_leads"));
    if (method === "GET" && path === "/api/approvals") return json(200, this.rows<Approval>("crm_approvals"));
    if (method === "POST" && path === "/api/prospects/intake") return this.intake(input);
    if (method === "POST" && path === "/api/approvals") {
      const lead = this.lead(text(input.leadId, 100));
      if (!lead) return json(404, { error: "Müşteri adayı bulunamadı." });
      if (!canStartConversation(lead)) return json(409, { error: "İzin/engelleme kuralı nedeniyle ilk temas oluşturulamaz." });
      const draft = text(input.draft, 8000);
      if (!draft) return json(400, { error: "Onaya sunulacak mesaj taslağı gerekli." });
      // Mobile retry must not create another pending copy of the same draft.
      const productIds = [...new Set(Array.isArray(input.productIds) ? input.productIds.map(id => text(id, 100)).filter(Boolean) : [])].slice(0, 30);
      const pending = this.rows<Approval>("crm_approvals").find(row => row.leadId === lead.id && row.status === "pending" && row.draft === draft && JSON.stringify([...row.productIds].sort()) === JSON.stringify([...productIds].sort()));
      if (pending) return json(200, pending);
      const approval: Approval = { id: crypto.randomUUID(), leadId: lead.id, channel: lead.channel, draft, productIds, status: "pending", createdAt: new Date().toISOString() };
      this.sql.exec("INSERT INTO crm_approvals(id,data) VALUES(?,?)", approval.id, JSON.stringify(approval));
      lead.stage = "contact_pending"; this.saveLead(lead);
      return json(201, approval);
    }
    const match = path.match(/^\/api\/approvals\/([^/]+)\/(approve|reject)$/);
    if (method === "POST" && match) {
      const row = this.sql.exec<{ data: string }>("SELECT data FROM crm_approvals WHERE id=?", match[1]).toArray()[0];
      if (!row) return json(404, { error: "Onay kaydı bulunamadı." });
      const approval = JSON.parse(row.data) as Approval;
      if (approval.status !== "pending") return json(409, { error: "Bu kayıt daha önce sonuçlandırıldı." });
      const lead = this.lead(approval.leadId);
      if (match[2] === "approve" && (!lead || !canStartConversation(lead))) return json(409, { error: "Müşterinin iletişim izni kaldırılmış veya müşteri engellenmiş. Mesaj onaylanamaz." });
      approval.status = match[2] === "approve" ? "approved" : "rejected";
      approval.decidedAt = new Date().toISOString();
      this.sql.exec("UPDATE crm_approvals SET data=? WHERE id=?", JSON.stringify(approval), approval.id);
      if (lead && approval.status === "approved") { lead.stage = "active"; lead.autoReplyAllowed = false; this.saveLead(lead); }
      else if (lead?.stage === "contact_pending" && !this.rows<Approval>("crm_approvals").some(item => item.leadId === lead.id && item.status === "pending")) { lead.stage = "qualified"; this.saveLead(lead); }
      return json(200, { approval, delivery: { accepted: false, mode: "manual_handoff", reason: approval.status === "approved" ? "Kanal gönderim anahtarı bağlı değil; onaylı taslak uygulamada paylaşılmalı." : "Taslak reddedildi." } });
    }
    return json(404, { error: "Müşteri işlemi bulunamadı." });
  }
  private intake(input: Record<string, unknown>): Response {
    const json = (status: number, value: unknown) => Response.json(value, { status });
    const channel = text(input.channel, 20) as Channel;
    const displayName = text(input.displayName, 150);
    const handle = text(input.handle, 200);
    if (!channels.has(channel) || !displayName || !handle || !Array.isArray(input.signals) || !input.signals.length || input.signals.length > 30) return json(400, { error: "Kaynak, görünen ad, kanal kimliği ve gerçek etkileşim sinyali gerekli (en fazla 30 sinyal)." });
    const signals: ProspectSignal[] = [];
    for (const value of input.signals) {
      if (!value || typeof value !== "object") return json(400, { error: "Etkileşim sinyali geçersiz." });
      const row = value as Record<string, unknown>;
      const occurredAt = text(row.occurredAt, 40);
      if (!signalTypes.has(String(row.type)) || row.channel !== channel || !Number.isFinite(Date.parse(occurredAt)) || Date.parse(occurredAt) > Date.now() + 300_000 || typeof row.consent !== "boolean" || !Array.isArray(row.productTags)) return json(400, { error: "Sinyalin türü, kanalı, zamanı, izni veya ürün etiketleri geçersiz." });
      signals.push({ type: row.type as ProspectSignal["type"], channel, occurredAt: new Date(occurredAt).toISOString(), consent: row.consent, productTags: row.productTags.map(tag => text(tag, 80)).filter(Boolean).slice(0, 30), text: text(row.text, 8000) });
    }
    const scored = scoreProspect(signals, products.flatMap(product => product.tags));
    if (!scored.canDraftFirstContact) return json(202, { stored: false, classification: "market_signal", scored, reason: "Açık iletişim izni veya müşterinin başlattığı talep yok." });
    const existing = this.sql.exec<{ data: string }>("SELECT data FROM crm_leads WHERE channel=? AND handle=?", channel, handle).toArray()[0];
    const old = existing ? JSON.parse(existing.data) as Lead : undefined;
    const inbound = signals.filter(signal => signal.type === "inbound_message");
    const lastInboundAt = [old?.lastInboundAt, ...inbound.map(signal => signal.occurredAt)].filter((item): item is string => Boolean(item)).sort().at(-1);
    const optedOut = inbound.some(signal => requestsOptOut(signal.text || ""));
    const blocked = old?.stage === "blocked" || optedOut;
    const lead: Lead = { id: old?.id || crypto.randomUUID(), displayName, channel, handle, stage: blocked ? "blocked" : old?.stage === "active" || old?.stage === "contact_pending" ? old.stage : "qualified", consent: !blocked, interests: scored.matchedInterests, score: scored.score, lastInboundAt, autoReplyAllowed: false };
    this.saveLead(lead);
    for (const signal of inbound.filter(signal => signal.text)) {
      const message: Message = { id: crypto.randomUUID(), leadId: lead.id, channel, direction: "inbound", text: signal.text!, mediaUrls: [], createdAt: signal.occurredAt, automated: false };
      this.sql.exec("INSERT OR IGNORE INTO crm_messages(id,lead_id,created_at,text,data) VALUES(?,?,?,?,?)", message.id, lead.id, message.createdAt, message.text, JSON.stringify(message));
    }
    return json(201, { stored: true, classification: lastInboundAt ? "real_customer" : "permissioned_prospect", lead, scored });
  }
}
