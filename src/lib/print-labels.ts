import JsBarcode from "jsbarcode";

export type LabelSize = "38x25" | "30x40" | "A4-38x25" | "A4-30x40";
export type ReceiptSize = "58mm" | "80mm" | "A4";

export type LabelInput = {
  sku: string;
  name: string;
  price?: number;
  mfgDate?: string;
  expiryDate?: string;
};

const SIZE_MAP: Record<LabelSize, { w: number; h: number; sheet: "single" | "A4" }> = {
  "38x25": { w: 38, h: 25, sheet: "single" },
  "30x40": { w: 30, h: 40, sheet: "single" },
  "A4-38x25": { w: 38, h: 25, sheet: "A4" },
  "A4-30x40": { w: 30, h: 40, sheet: "A4" },
};

function barcodeSvg(value: string, w: number, h: number): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, value || "000000", {
      format: "CODE128",
      width: 1.2,
      height: Math.max(20, h * 2),
      displayValue: false,
      margin: 0,
    });
  } catch {
    /* ignore invalid values */
  }
  svg.setAttribute("width", `${w}mm`);
  svg.setAttribute("height", `${h}mm`);
  svg.setAttribute("preserveAspectRatio", "none");
  return svg.outerHTML;
}

function labelHtml(item: LabelInput, w: number, h: number): string {
  const barcodeH = Math.max(6, Math.floor(h * 0.45));
  return `
    <div class="lbl" style="width:${w}mm;height:${h}mm;">
      <div class="name">${escape(item.name)}</div>
      ${item.price != null ? `<div class="price">৳${item.price.toFixed(2)}</div>` : ""}
      ${item.mfgDate || item.expiryDate ? `<div class="dates">${item.mfgDate ? "MFG " + item.mfgDate : ""}${item.expiryDate ? "  EXP " + item.expiryDate : ""}</div>` : ""}
      <div class="bc">${barcodeSvg(item.sku, w - 4, barcodeH)}</div>
      <div class="sku">${escape(item.sku)}</div>
    </div>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function printLabels(item: LabelInput, qty: number, size: LabelSize) {
  const { w, h, sheet } = SIZE_MAP[size];
  const items = Array.from({ length: Math.max(1, qty) }, () => labelHtml(item, w, h)).join("");
  const pageCss =
    sheet === "A4"
      ? `@page { size: A4; margin: 8mm; } .grid { display:flex; flex-wrap:wrap; gap:2mm; }`
      : `@page { size: ${w}mm ${h}mm; margin: 0; } .grid { display:block; } .lbl { page-break-after: always; }`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title>
    <style>
      ${pageCss}
      * { box-sizing: border-box; }
      body { margin:0; font-family: Arial, sans-serif; }
      .lbl { border: 0; padding: 1mm 1.5mm; display:flex; flex-direction:column; justify-content:space-between; overflow:hidden; }
      .name { font-size: 8pt; font-weight: 700; line-height:1.1; }
      .price { font-size: 9pt; font-weight: 700; }
      .dates { font-size: 6pt; color:#333; }
      .bc { display:flex; justify-content:center; }
      .bc svg { width: 100%; height: auto; }
      .sku { font-size: 6pt; text-align:center; letter-spacing:.5px; }
    </style></head>
    <body><div class="grid">${items}</div>
    <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 300); };<\/script>
    </body></html>`;
  const win = window.open("", "_blank", "width=800,height=600");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function printReceiptHtml(bodyHtml: string, size: ReceiptSize) {
  const width = size === "58mm" ? "58mm" : size === "80mm" ? "80mm" : "210mm";
  const pageCss =
    size === "A4"
      ? `@page { size: A4; margin: 12mm; }`
      : `@page { size: ${width} auto; margin: 2mm; }`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title>
    <style>${pageCss} body{font-family: Arial, sans-serif; width:${width}; margin:0;} </style>
    </head><body>${bodyHtml}
    <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300);};<\/script>
    </body></html>`;
  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}