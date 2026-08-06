import { describe, it, expect } from "vitest";
import { renderStockReportHtml, type StockExportColumn } from "@/lib/stock-report-export";
import type { CompanySettings } from "@/lib/company-settings";

const company = {
  name: "Muzahid Food & Beverage",
  address: "Dhaka, Bangladesh",
  phone: "+8801682000977",
  email: "info@muzahidfood.com",
} as CompanySettings;

const columns: StockExportColumn[] = [
  { key: "name", label: "Product" },
  { key: "qty", label: "Qty", align: "right" },
  { key: "value", label: "Value", align: "right" },
];

const rows = [
  { name: "Butter Bun", qty: 120, value: 3600 },
  { name: "Cream Biscuit", qty: 40, value: 2000 },
];

describe("renderStockReportHtml", () => {
  const html = renderStockReportHtml({
    title: "Finished Products Stock",
    company,
    columns,
    rows,
    totals: { qty: 160, value: 5600 },
    totalsLabel: "Total",
  });

  it("includes the company header and report title", () => {
    expect(html).toContain("Muzahid Food &amp; Beverage");
    expect(html).toContain("Dhaka, Bangladesh");
    expect(html).toContain("Finished Products Stock");
  });

  it("renders every row and column", () => {
    for (const c of columns) expect(html).toContain(c.label);
    expect(html).toContain("Butter Bun");
    expect(html).toContain("Cream Biscuit");
    expect((html.match(/<tr>/g) ?? []).length).toBeGreaterThanOrEqual(rows.length);
  });

  it("renders a totals footer", () => {
    expect(html).toContain("<tfoot>");
    expect(html).toContain("5600");
    expect(html).toContain("Total");
  });

  it("respects right alignment", () => {
    expect(html).toContain('text-align:right');
  });

  it("escapes HTML in data", () => {
    const out = renderStockReportHtml({
      title: "X",
      company,
      columns: [{ key: "name", label: "Product" }],
      rows: [{ name: "<script>alert(1)</script>" }],
    });
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("uses A4 page setup and reports line count", () => {
    expect(html).toContain("size: A4 portrait");
    expect(html).toContain("2 line item(s)");
  });

  it("omits the footer when no totals are given", () => {
    const out = renderStockReportHtml({ title: "X", company, columns, rows });
    expect(out).not.toContain("<tfoot>");
  });
});
