import { sameProduct, type ProductIdentity } from "../../mobile/product-identity.js";

interface Store { get(key: string): Promise<string | null>; put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>; }
const PREFIX = "digital:handoff:";

export async function registerProductHandoff(store: Store, identity: ProductIdentity) {
  const handoff = { ...identity, id: crypto.randomUUID() };
  // A selected production project remains resumable until publication; it is
  // not the short-lived suggestion quote. Do not expire its identity mid-work.
  await store.put(`${PREFIX}${handoff.id}`, JSON.stringify(handoff));
  return handoff;
}

export async function matchesStoredHandoff(store: Store, id: string, actual: ProductIdentity): Promise<boolean> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return false;
  const raw = await store.get(`${PREFIX}${id}`);
  if (!raw) return false;
  try { return sameProduct(JSON.parse(raw) as ProductIdentity, actual); } catch { return false; }
}
