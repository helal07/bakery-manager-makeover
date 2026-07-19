import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Card } from "@/components/app-shell";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Building2, Bell, Palette, Database, Printer,
  Save, Download, Upload, Check, Store, FileText,
} from "lucide-react";
import {
  getCompany, saveCompany, defaultCompany, type CompanySettings,
  getInvoiceSettings, saveInvoiceSettings, defaultInvoiceSettings, type InvoiceSettings, type PaperSize, pageTitle } from "@/lib/company-settings";
import { InvoicePreview, sampleInvoice } from "@/components/invoice-preview";
import {
  getProfile, saveProfile, getSoftware, saveSoftware,
  type UserProfile, type SoftwarePrefs,
} from "@/lib/profile-settings";
import { uploadImage } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings/")({
  head: () => ({ meta: [{ title: pageTitle("Settings") }] }),
  component: SettingsPage,
});

type Tab = "software";
type Section =
  | "company" | "invoice" | "appearance" | "notifications" | "printing" | "backup";

const NAV: { tab: Tab; groups: { label: string; items: { id: Section; label: string; icon: any }[] }[] }[] = [
  {
    tab: "software",
    groups: [{
      label: "System",
      items: [
        { id: "company", label: "Company", icon: Building2 },
        { id: "invoice", label: "Invoice", icon: FileText },
        { id: "appearance", label: "Appearance", icon: Palette },
        { id: "notifications", label: "Notifications", icon: Bell },
        { id: "printing", label: "Printing", icon: Printer },
        { id: "backup", label: "Backup & Data", icon: Database },
      ],
    }],
  },
];

function SettingsPage() {
  const [tab, setTab] = useState<Tab>("software");
  const [section, setSection] = useState<Section>("company");
  const [profile, setProfile] = useState<UserProfile>(() => ({
    name: "", email: "", phone: "", bio: "", language: "en", timezone: "Asia/Dhaka",
  }));
  useEffect(() => { getProfile().then(setProfile).catch(() => {}); }, []);
  const [company, setCompany] = useState<CompanySettings>(defaultCompany);
  useEffect(() => {
    getCompany().then(setCompany).catch(() => {});
  }, []);
  const [software, setSoftware] = useState<SoftwarePrefs>({
    theme: "system", density: "comfortable", dateFormat: "DD MMM YYYY",
    lowStockAlerts: true, dailySummary: true, soundOnSale: false,
    autoBackup: true, backupFrequency: "daily", sessionTimeout: 60,
    twoFactor: false, receiptSize: "80mm", printLogo: true,
  });
  useEffect(() => { getSoftware().then(setSoftware).catch(() => {}); }, []);
  const [pw, setPw] = useState({ curr: "", next: "", conf: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const first = NAV.find(n => n.tab === tab)!.groups[0].items[0].id;
    setSection(first);
  }, [tab]);

  const savePersonal = async () => {
    if (!profile.name.trim()) return toast.error("Name is required");
    try { await saveProfile(profile); toast.success("Profile updated"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const saveCompanyAll = async () => {
    if (!company.name.trim()) return toast.error("Company name is required");
    try {
      await saveCompany(company);
      window.dispatchEvent(new Event("company-settings-updated"));
      toast.success("Company saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const [invoice, setInvoice] = useState<InvoiceSettings>(defaultInvoiceSettings);
  const [invoicePaper, setInvoicePaper] = useState<PaperSize>("A4");
  useEffect(() => { getInvoiceSettings().then((v) => { setInvoice(v); setInvoicePaper(v.defaultPaper); }).catch(() => {}); }, []);
  const patchInvoice = (patch: Partial<InvoiceSettings>) => setInvoice((prev) => ({ ...prev, ...patch }));
  const saveInvoiceAll = async () => {
    try {
      await saveInvoiceSettings(invoice);
      window.dispatchEvent(new Event("company-settings-updated"));
      toast.success("Invoice settings saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const resetInvoice = () => setInvoice(defaultInvoiceSettings);
  const saveSoft = (patch: Partial<SoftwarePrefs>) => {
    const next = { ...software, ...patch };
    setSoftware(next);
    saveSoftware(next).catch((e) => toast.error((e as Error).message));
  };
  const savePassword = () => {
    if (pw.next.length < 6) return toast.error("Password must be at least 6 characters");
    if (pw.next !== pw.conf) return toast.error("Passwords do not match");
    setPw({ curr: "", next: "", conf: "" });
    toast.success("Password updated");
  };
  const onAvatar = async (f?: File) => {
    if (!f) return;
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? "me";
      const { url } = await uploadImage("customer-avatars", uid, f);
      setProfile(p => ({ ...p, avatarDataUrl: url }));
      toast.success("Photo uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const onLogo = async (f?: File) => {
    if (!f) return;
    try {
      const { url, path } = await uploadImage("company-logos", "current", f);
      const next = { ...company, logoDataUrl: url, logoPath: path };
      setCompany(next);
      await saveCompany(next);
      window.dispatchEvent(new Event("company-settings-updated"));
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const exportData = () => {
    const dump = { profile, company, software, at: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `crumbco-backup-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    toast.success("Backup downloaded");
  };
  const importData = (f?: File) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(String(r.result));
        if (d.profile) { saveProfile(d.profile).catch(() => {}); setProfile(d.profile); }
        if (d.company) { saveCompany(d.company).catch(() => {}); setCompany(d.company); }
        if (d.software) { saveSoftware(d.software).catch(() => {}); setSoftware(d.software); }
        toast.success("Backup restored");
      } catch { toast.error("Invalid backup file"); }
    };
    r.readAsText(f);
  };
  const initials = useMemo(() =>
    profile.name.split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase(), [profile.name]);

  return (
    <AppShell title="Settings" subtitle="Manage your profile and software preferences">
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
        <Card className="p-2 h-fit">
          {NAV.find(n => n.tab === tab)!.groups.map(g => (
            <div key={g.label}>
              <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{g.label}</div>
              <div className="space-y-0.5">
                {g.items.map(it => {
                  const Icon = it.icon;
                  const active = section === it.id;
                  return (
                    <button key={it.id} onClick={() => setSection(it.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition ${active ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}>
                      <Icon className="size-4" /> {it.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {tab === "software" && (
            <div>
              <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Organization</div>
              <div className="space-y-0.5">
                <Link
                  to="/settings/showrooms"
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition hover:bg-muted"
                >
                  <Store className="size-4" /> Showrooms
                </Link>
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          {tab === "software" && section === "company" && (
            <Panel title="Company Information" desc="Shown on invoices, receipts and reports">
              <div className="flex items-center gap-4 pb-4 border-b border-border">
                <div className="size-16 rounded-md border border-border bg-muted grid place-items-center overflow-hidden">
                  {company.logoDataUrl
                    ? <img src={company.logoDataUrl} alt="" className="size-full object-cover" />
                    : <Building2 className="size-6 text-muted-foreground" />}
                </div>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm cursor-pointer hover:bg-muted">
                  <Upload className="size-3.5" />Upload logo
                  <input type="file" accept="image/*" className="hidden" onChange={e => onLogo(e.target.files?.[0])} />
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4">
                <Fld label="Company name *"><Text value={company.name} onChange={v => setCompany({ ...company, name: v })} /></Fld>
                <Fld label="Tagline"><Text value={company.tagline ?? ""} onChange={v => setCompany({ ...company, tagline: v })} /></Fld>
                <Fld label="Phone"><Text value={company.phone ?? ""} onChange={v => setCompany({ ...company, phone: v })} /></Fld>
                <Fld label="Email"><Text value={company.email ?? ""} onChange={v => setCompany({ ...company, email: v })} /></Fld>
                <Fld label="VAT registration"><Text value={company.vatReg ?? ""} onChange={v => setCompany({ ...company, vatReg: v })} /></Fld>
                <Fld label="Invoice footer"><Text value={company.footerNote ?? ""} onChange={v => setCompany({ ...company, footerNote: v })} /></Fld>
                <Fld label="Address" full>
                  <textarea rows={2} value={company.address} onChange={e => setCompany({ ...company, address: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm" />
                </Fld>
              </div>
              <SaveBar onSave={saveCompanyAll} />
            </Panel>
          )}

          {tab === "software" && section === "invoice" && (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
              <div className="space-y-5">
                <Panel title="Header" desc="Logo, business identity and invoice title">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Fld label="Invoice title"><Text value={invoice.invoiceTitle} onChange={v => patchInvoice({ invoiceTitle: v })} /></Fld>
                    <Fld label="Header style">
                      <Select value={invoice.headerStyle} onChange={v => patchInvoice({ headerStyle: v as InvoiceSettings["headerStyle"] })}
                        options={[["gradient","Gradient"],["solid","Solid"],["bordered","Bordered"],["minimal","Minimal"]]} />
                    </Fld>
                    <Fld label="Accent colour (CSS)"><Text value={invoice.accentColor} onChange={v => patchInvoice({ accentColor: v })} /></Fld>
                    <Fld label="Number prefix"><Text value={invoice.numberPrefix} onChange={v => patchInvoice({ numberPrefix: v })} /></Fld>
                    <Fld label="Number padding (digits)">
                      <Text value={String(invoice.numberPadding)} onChange={v => patchInvoice({ numberPadding: Math.max(1, Math.min(12, Number(v) || 6)) })} />
                    </Fld>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-1">
                    <Toggle label="Show logo" checked={invoice.showLogo} onChange={v => patchInvoice({ showLogo: v })} />
                    <Toggle label="Show business name" checked={invoice.showBusinessName} onChange={v => patchInvoice({ showBusinessName: v })} />
                    <Toggle label="Show tagline" checked={invoice.showTagline} onChange={v => patchInvoice({ showTagline: v })} />
                    <Toggle label="Show VAT registration" checked={invoice.showVatReg} onChange={v => patchInvoice({ showVatReg: v })} />
                  </div>
                </Panel>

                <Panel title="Outlet & customer" desc="Labels and visibility of info blocks">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Fld label="Outlet label"><Text value={invoice.labelOutlet} onChange={v => patchInvoice({ labelOutlet: v })} /></Fld>
                    <Fld label="Billed-to label"><Text value={invoice.labelBilledTo} onChange={v => patchInvoice({ labelBilledTo: v })} /></Fld>
                    <Fld label="Details label"><Text value={invoice.labelDetails} onChange={v => patchInvoice({ labelDetails: v })} /></Fld>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-1">
                    <Toggle label="Show outlet block" checked={invoice.showOutletBlock} onChange={v => patchInvoice({ showOutletBlock: v })} />
                    <Toggle label="Show customer block" checked={invoice.showCustomerBlock} onChange={v => patchInvoice({ showCustomerBlock: v })} />
                    <Toggle label="Show 'Served by'" checked={invoice.showServedBy} onChange={v => patchInvoice({ showServedBy: v })} />
                  </div>
                </Panel>

                <Panel title="Items table" desc="Columns to include on the invoice">
                  <div className="grid grid-cols-2 gap-1">
                    <Toggle label="Row number (#)" checked={invoice.colIndex} onChange={v => patchInvoice({ colIndex: v })} />
                    <Toggle label="SKU under item name" checked={invoice.colSku} onChange={v => patchInvoice({ colSku: v })} />
                    <Toggle label="Quantity" checked={invoice.colQty} onChange={v => patchInvoice({ colQty: v })} />
                    <Toggle label="Unit price" checked={invoice.colPrice} onChange={v => patchInvoice({ colPrice: v })} />
                    <Toggle label="Line amount" checked={invoice.colAmount} onChange={v => patchInvoice({ colAmount: v })} />
                    <Toggle label="Zebra rows (A4)" checked={invoice.zebraRows} onChange={v => patchInvoice({ zebraRows: v })} />
                  </div>
                </Panel>

                <Panel title="Totals" desc="Rows shown in the totals block">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Fld label="Currency symbol"><Text value={invoice.currencySymbol} onChange={v => patchInvoice({ currencySymbol: v })} /></Fld>
                    <Fld label="Decimal places">
                      <Text value={String(invoice.decimals)} onChange={v => patchInvoice({ decimals: Math.max(0, Math.min(4, Number(v) || 0)) })} />
                    </Fld>
                    <Fld label="Date format">
                      <select
                        value={invoice.dateFormat}
                        onChange={e => patchInvoice({ dateFormat: e.target.value as typeof invoice.dateFormat })}
                        className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
                      >
                        <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                        <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                        <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                        <option value="DD MMM YYYY">DD MMM YYYY</option>
                        <option value="DD/MM/YYYY HH:mm">DD/MM/YYYY HH:mm</option>
                        <option value="MM/DD/YYYY HH:mm">MM/DD/YYYY HH:mm</option>
                      </select>
                    </Fld>

                    <Fld label="Subtotal label"><Text value={invoice.labelSubtotal} onChange={v => patchInvoice({ labelSubtotal: v })} /></Fld>
                    <Fld label="Tax label"><Text value={invoice.labelTax} onChange={v => patchInvoice({ labelTax: v })} /></Fld>
                    <Fld label="Shipping label"><Text value={invoice.labelShipping} onChange={v => patchInvoice({ labelShipping: v })} /></Fld>
                    <Fld label="Grand total label"><Text value={invoice.labelGrandTotal} onChange={v => patchInvoice({ labelGrandTotal: v })} /></Fld>
                    <Fld label="Paid label"><Text value={invoice.labelPaid} onChange={v => patchInvoice({ labelPaid: v })} /></Fld>
                    <Fld label="Due label"><Text value={invoice.labelDue} onChange={v => patchInvoice({ labelDue: v })} /></Fld>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-1">
                    <Toggle label="Show subtotal" checked={invoice.showSubtotal} onChange={v => patchInvoice({ showSubtotal: v })} />
                    <Toggle label="Show tax" checked={invoice.showTax} onChange={v => patchInvoice({ showTax: v })} />
                    <Toggle label="Show shipping" checked={invoice.showShipping} onChange={v => patchInvoice({ showShipping: v })} />
                    <Toggle label="Show grand total" checked={invoice.showGrandTotal} onChange={v => patchInvoice({ showGrandTotal: v })} />
                    <Toggle label="Show paid" checked={invoice.showPaid} onChange={v => patchInvoice({ showPaid: v })} />
                    <Toggle label="Show previous due" checked={invoice.showPreviousDue} onChange={v => patchInvoice({ showPreviousDue: v })} />
                    <Toggle label="Show due" checked={invoice.showDue} onChange={v => patchInvoice({ showDue: v })} />
                  </div>
                </Panel>

                <Panel title="Footer" desc="Notes, terms and signature lines">
                  <Fld label="Footer note" full>
                    <textarea rows={2} value={invoice.footerNote} onChange={e => patchInvoice({ footerNote: e.target.value })}
                      className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm" />
                  </Fld>
                  <div className="mt-3">
                    <Fld label="Terms & conditions" full>
                      <textarea rows={3} value={invoice.termsText} onChange={e => patchInvoice({ termsText: e.target.value })}
                        className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm" />
                    </Fld>
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Fld label="Customer signature caption"><Text value={invoice.sigCustomer} onChange={v => patchInvoice({ sigCustomer: v })} /></Fld>
                    <Fld label="Authorised signature caption"><Text value={invoice.sigAuthorized} onChange={v => patchInvoice({ sigAuthorized: v })} /></Fld>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-1">
                    <Toggle label="Show signatures (A4)" checked={invoice.showSignatures} onChange={v => patchInvoice({ showSignatures: v })} />
                    <Toggle label="Show 'Powered by' line" checked={invoice.showPoweredBy} onChange={v => patchInvoice({ showPoweredBy: v })} />
                  </div>
                </Panel>

                <Panel title="Print & badges" desc="Paper size, thermal styling and status badges">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Fld label="Default paper">
                      <Select value={invoice.defaultPaper} onChange={v => patchInvoice({ defaultPaper: v as PaperSize })}
                        options={[["A4","A4"],["80mm","Thermal 80mm"],["58mm","Thermal 58mm"]]} />
                    </Fld>
                    <Fld label="Paid badge text"><Text value={invoice.badgePaid} onChange={v => patchInvoice({ badgePaid: v })} /></Fld>
                    <Fld label="Partial badge text"><Text value={invoice.badgePartial} onChange={v => patchInvoice({ badgePartial: v })} /></Fld>
                    <Fld label="Credit badge text"><Text value={invoice.badgeCredit} onChange={v => patchInvoice({ badgeCredit: v })} /></Fld>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-1">
                    <Toggle label="Auto-print after sale" checked={invoice.autoPrint} onChange={v => patchInvoice({ autoPrint: v })} />
                    <Toggle label="Show logo on thermal" checked={invoice.thermalShowLogo} onChange={v => patchInvoice({ thermalShowLogo: v })} />
                    <Toggle label="Monospace thermal font" checked={invoice.thermalMonospace} onChange={v => patchInvoice({ thermalMonospace: v })} />
                  </div>
                </Panel>

                <div className="flex justify-between gap-2">
                  <button onClick={resetInvoice} className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted">
                    Reset to defaults
                  </button>
                  <button onClick={saveInvoiceAll} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
                    <Save className="size-3.5" />Save invoice settings
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <Card className="p-4 xl:sticky xl:top-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-sm font-semibold">Live preview</h2>
                      <p className="text-xs text-muted-foreground">Reflects unsaved changes</p>
                    </div>
                    <div className="flex gap-1 text-xs">
                      {(["A4","80mm","58mm"] as const).map(p => (
                        <button key={p} onClick={() => setInvoicePaper(p)}
                          className={`px-2 py-1 rounded-md border ${invoicePaper === p ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-muted/30 p-3 overflow-auto max-h-[80vh]">
                    <InvoicePreview snapshot={sampleInvoice} settings={invoice} company={company} paper={invoicePaper} />
                  </div>
                </Card>
              </div>
            </div>
          )}

          {tab === "software" && section === "appearance" && (
            <Panel title="Appearance" desc="Theme and layout density">
              <Fld label="Theme">
                <div className="grid grid-cols-3 gap-2">
                  {(["system","light","dark"] as const).map(t => (
                    <button key={t} onClick={() => saveSoft({ theme: t })}
                      className={`px-3 py-3 rounded-md border text-sm capitalize ${software.theme === t ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}>
                      {software.theme === t && <Check className="size-3.5 inline mr-1" />}{t}
                    </button>
                  ))}
                </div>
              </Fld>
              <div className="mt-4">
                <Fld label="Density">
                  <Select value={software.density} onChange={v => saveSoft({ density: v as any })}
                    options={[["comfortable","Comfortable"],["compact","Compact"]]} />
                </Fld>
              </div>
            </Panel>
          )}

          {tab === "software" && section === "notifications" && (
            <Panel title="Notifications" desc="Alerts and app sounds">
              <Toggle label="Low stock alerts" desc="Notify when a product or raw material drops below its threshold"
                checked={software.lowStockAlerts} onChange={v => saveSoft({ lowStockAlerts: v })} />
              <Toggle label="Daily summary" desc="Email a daily sales, expense and stock summary"
                checked={software.dailySummary} onChange={v => saveSoft({ dailySummary: v })} />
              <Toggle label="Sound on sale" desc="Play a chime when an order is completed at the POS"
                checked={software.soundOnSale} onChange={v => saveSoft({ soundOnSale: v })} />
            </Panel>
          )}

          {tab === "software" && section === "printing" && (
            <Panel title="Printing" desc="Receipts, labels and invoice output">
              <Fld label="Receipt size">
                <Select value={software.receiptSize} onChange={v => saveSoft({ receiptSize: v as any })}
                  options={[["58mm","Thermal 58mm"],["80mm","Thermal 80mm"],["A4","A4 invoice"]]} />
              </Fld>
              <div className="mt-4">
                <Toggle label="Print company logo on receipts" desc="Uses the logo from Company Information"
                  checked={software.printLogo} onChange={v => saveSoft({ printLogo: v })} />
              </div>
            </Panel>
          )}

          {tab === "software" && section === "backup" && (
            <Panel title="Backup & Data" desc="Export or restore your workspace data">
              <Toggle label="Automatic backups" desc="Snapshot local data on a schedule"
                checked={software.autoBackup} onChange={v => saveSoft({ autoBackup: v })} />
              <div className="mt-4">
                <Fld label="Backup frequency">
                  <Select value={software.backupFrequency} onChange={v => saveSoft({ backupFrequency: v as any })}
                    options={[["daily","Daily"],["weekly","Weekly"],["monthly","Monthly"]]} />
                </Fld>
              </div>
              <div className="mt-6 pt-4 border-t border-border flex flex-wrap gap-2">
                <button onClick={exportData} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted">
                  <Download className="size-3.5" />Export backup
                </button>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted cursor-pointer">
                  <Upload className="size-3.5" />Restore backup
                  <input type="file" accept="application/json" className="hidden" onChange={e => importData(e.target.files?.[0])} />
                </label>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition ${active ? "bg-background shadow-sm font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
      {icon}{children}
    </button>
  );
}

function Panel({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      {children}
    </Card>
  );
}

function Fld({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

function Text({ value, onChange, type = "text" }: { value: string; onChange: (v: string) => void; type?: string }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)}
    className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm" />;
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm">
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
      </div>
      <button onClick={() => onChange(!checked)}
        className={`shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition ${checked ? "bg-primary" : "bg-muted border border-border"}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

function SaveBar({ onSave }: { onSave: () => void }) {
  return (
    <div className="mt-5 pt-4 border-t border-border flex justify-end">
      <button onClick={onSave} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
        <Save className="size-3.5" />Save changes
      </button>
    </div>
  );
}
