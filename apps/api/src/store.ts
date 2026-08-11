import { randomUUID } from "node:crypto";
import { approvals, leads, messages, products } from "./data.js";
import type { Approval, Lead, Message, Product } from "./types.js";

export const db = { products, leads, approvals, messages };

export function findLead(id: string): Lead | undefined {
  return db.leads.find((lead) => lead.id === id);
}

export function findProducts(ids: string[]): Product[] {
  return db.products.filter((product) => ids.includes(product.id));
}

export function createMessage(input: Omit<Message, "id" | "createdAt">): Message {
  const message: Message = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
  db.messages.push(message);
  return message;
}

export function createApproval(input: Omit<Approval, "id" | "createdAt" | "status">): Approval {
  const approval: Approval = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "pending"
  };
  db.approvals.push(approval);
  return approval;
}
