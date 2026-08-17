import { describe, expect, it } from "vitest";
import { defaultSupplyPrice, supplyPrice } from "./transfer-pricing";

describe("supplyPrice fallback order", () => {
  it("prefers the price stored on the transfer line", () => {
    expect(supplyPrice({ linePrice: 8, productTransferPrice: 9, productCost: 7 })).toBe(8);
  });

  it("falls back to the product supply price", () => {
    expect(supplyPrice({ linePrice: null, productTransferPrice: 9, productCost: 7 })).toBe(9);
    expect(supplyPrice({ linePrice: 0, productTransferPrice: 9, productCost: 7 })).toBe(9);
  });

  it("falls back to production cost", () => {
    expect(supplyPrice({ productTransferPrice: 0, productCost: 7 })).toBe(7);
  });

  it("returns 0 when nothing is known", () => {
    expect(supplyPrice({})).toBe(0);
  });
});

describe("defaultSupplyPrice", () => {
  it("uses the product supply price then cost", () => {
    expect(defaultSupplyPrice({ transferPrice: 8, cost: 7 })).toBe(8);
    expect(defaultSupplyPrice({ transferPrice: 0, cost: 7 })).toBe(7);
    expect(defaultSupplyPrice({})).toBe(0);
  });
});
