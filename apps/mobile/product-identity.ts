export interface ProductIdentity { name: string; kind: string; productType: string; }

export function sameProduct(expected: ProductIdentity, actual: ProductIdentity): boolean {
  const clean = (text: string) => text.trim().replace(/\s+/g, " ");
  return clean(expected.name) === clean(actual.name) && expected.kind === actual.kind
    && clean(expected.productType).toLowerCase() === clean(actual.productType).toLowerCase();
}
