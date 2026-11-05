export function mergeLocalProducts<T extends { id: string }>(remote: T[], local: T[]): T[] {
  return [...new Map([...remote, ...local].map(item => [item.id, item])).values()];
}

export function generationKey(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

export function uploadPrices(prefill?: { priceUsd?: number; priceTry?: number }) {
  return { usd: prefill?.priceUsd ? String(prefill.priceUsd) : "", try: prefill?.priceTry ? String(prefill.priceTry) : "" };
}
