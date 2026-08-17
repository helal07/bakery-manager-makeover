/**
 * Factory → showroom supply pricing.
 *
 * A transfer line records the price the factory charged the showroom. When an
 * older line has no price stored we fall back to the product's default supply
 * price, and finally to its production cost, so historical reports never show
 * a blank/zero supply value.
 */
export type SupplyPriceSources = {
  /** Price stored on the transfer line (transfer_items.unit_price). */
  linePrice?: number | null;
  /** Product default supply price (products.transfer_price). */
  productTransferPrice?: number | null;
  /** Production cost (products.cost). */
  productCost?: number | null;
};

function positive(n: number | null | undefined): number | null {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Resolve the supply price using: line price → product supply price → cost. */
export function supplyPrice(s: SupplyPriceSources): number {
  return positive(s.linePrice) ?? positive(s.productTransferPrice) ?? positive(s.productCost) ?? 0;
}

/** Default price to prefill a new transfer line with. */
export function defaultSupplyPrice(p: { transferPrice?: number | null; cost?: number | null }): number {
  return supplyPrice({ productTransferPrice: p.transferPrice, productCost: p.cost });
}
