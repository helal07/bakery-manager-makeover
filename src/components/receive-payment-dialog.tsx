import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const sb = supabase as any;

type DueSale = { id: string; created_at: string; total: number; paid: number; due: number };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  onSaved?: () => void;
};

export function ReceivePaymentDialog({ open, onOpenChange, customerId, customerName, customerPhone, onSaved }: Props) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saleId, setSaleId] = useState<string>("__none__");
  const [dueSales, setDueSales] = useState<DueSale[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setMethod("Cash");
    setPaidOn(new Date().toISOString().slice(0, 10));
    setNote("");
    setSaleId("__none__");
    (async () => {
      const digits = (customerPhone ?? "").replace(/\D/g, "");
      const { data } = await sb
        .from("sales")
        .select("id,created_at,total,paid,due,customer_id,customer_phone")
        .gt("due", 0)
        .order("created_at", { ascending: false });
      const rows = ((data ?? []) as any[]).filter((s) => {
        if (s.customer_id === customerId) return true;
        const p = (s.customer_phone ?? "").replace(/\D/g, "");
        return digits && p === digits;
      });
      setDueSales(rows as DueSale[]);
    })();
  }, [open, customerId, customerPhone]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      const targetSaleId = saleId === "__none__" ? null : saleId;
      const { error } = await sb.from("customer_payments").insert({
        customer_id: customerId,
        customer_name: customerName ?? null,
        customer_phone: customerPhone ?? null,
        sale_id: targetSaleId,
        amount: amt,
        method,
        paid_on: paidOn,
        note: note.trim() || null,
      });
      if (error) throw error;

      if (targetSaleId) {
        // Re-fetch latest sale figures to avoid stale state overwriting concurrent updates
        const { data: fresh } = await sb
          .from("sales")
          .select("total, paid")
          .eq("id", targetSaleId)
          .maybeSingle();
        if (fresh) {
          const total = Number(fresh.total || 0);
          const newPaid = Math.min(total, Number(fresh.paid || 0) + amt);
          const newDue = Math.max(0, total - newPaid);
          const { error: upErr } = await sb
            .from("sales")
            .update({ paid: newPaid, due: newDue })
            .eq("id", targetSaleId);
          if (upErr) throw upErr;
        }
      }
      toast.success("Payment recorded");
      onOpenChange(false);
      onSaved?.();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive Payment{customerName ? ` · ${customerName}` : ""}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rp-amount">Amount</Label>
              <Input id="rp-amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-date">Paid on</Label>
              <Input id="rp-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Cash", "Card", "bKash", "Nagad", "Rocket", "Bank"].map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Apply to invoice (optional)</Label>
            <Select value={saleId} onValueChange={setSaleId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">General payment (no specific invoice)</SelectItem>
                {dueSales.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.id.slice(0, 8).toUpperCase()} · {new Date(s.created_at).toLocaleDateString()} · Due ৳{Math.round(Number(s.due)).toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-note">Note</Label>
            <Input id="rp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional reference" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Record Payment"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
