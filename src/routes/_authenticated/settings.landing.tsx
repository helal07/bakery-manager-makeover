import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, Card } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, Save, RotateCcw, ExternalLink } from "lucide-react";
import {
  fetchLandingContent,
  saveLandingContent,
  defaultLanding,
  type LandingContent,
} from "@/lib/landing-content";

export const Route = createFileRoute("/_authenticated/settings/landing")({
  head: () => ({ meta: [{ title: "Landing Page · Settings" }] }),
  component: LandingEditor,
});

function LandingEditor() {
  const [content, setContent] = useState<LandingContent>(defaultLanding);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLandingContent().then((c) => {
      setContent(c);
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await saveLandingContent(content);
      toast.success("Landing page updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = () => {
    setContent(defaultLanding);
    toast.message("Reverted to default (not saved yet).");
  };

  const addProduct = () =>
    setContent((c) => ({ ...c, products: [...c.products, { name: "New product", desc: "" }] }));
  const updateProduct = (i: number, patch: Partial<{ name: string; desc: string }>) =>
    setContent((c) => ({
      ...c,
      products: c.products.map((p, idx) => (idx === i ? { ...p, ...patch } : p)),
    }));
  const removeProduct = (i: number) =>
    setContent((c) => ({ ...c, products: c.products.filter((_, idx) => idx !== i) }));

  if (loading) {
    return (
      <AppShell title="Landing Page" subtitle="Loading…">
        <div className="text-sm text-muted-foreground">Loading content…</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Landing Page"
      subtitle="Edit the public homepage content (visible to signed-out visitors)."
      actions={
        <div className="flex gap-2">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent"
          >
            <ExternalLink className="size-4" /> Preview
          </a>
          <Button variant="outline" size="sm" onClick={resetToDefault}>
            <RotateCcw className="size-4" /> Reset
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="size-4" /> {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-5xl">
        {/* Brand */}
        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-semibold">Brand</h2>
          <div>
            <Label>Name</Label>
            <Input
              value={content.brand.name}
              onChange={(e) => setContent({ ...content, brand: { ...content.brand, name: e.target.value } })}
            />
          </div>
          <div>
            <Label>Tagline</Label>
            <Input
              value={content.brand.tagline}
              onChange={(e) => setContent({ ...content, brand: { ...content.brand, tagline: e.target.value } })}
            />
          </div>
        </Card>

        {/* Hero */}
        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-semibold">Hero</h2>
          <div>
            <Label>Headline</Label>
            <Textarea
              rows={2}
              value={content.hero.headline}
              onChange={(e) => setContent({ ...content, hero: { ...content.hero, headline: e.target.value } })}
            />
          </div>
          <div>
            <Label>Subheadline</Label>
            <Textarea
              rows={3}
              value={content.hero.subhead}
              onChange={(e) => setContent({ ...content, hero: { ...content.hero, subhead: e.target.value } })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Primary button</Label>
              <Input
                value={content.hero.ctaPrimary.label}
                onChange={(e) => setContent({ ...content, hero: { ...content.hero, ctaPrimary: { ...content.hero.ctaPrimary, label: e.target.value } } })}
              />
            </div>
            <div>
              <Label>Link</Label>
              <Input
                value={content.hero.ctaPrimary.href}
                onChange={(e) => setContent({ ...content, hero: { ...content.hero, ctaPrimary: { ...content.hero.ctaPrimary, href: e.target.value } } })}
              />
            </div>
            <div>
              <Label>Secondary button</Label>
              <Input
                value={content.hero.ctaSecondary.label}
                onChange={(e) => setContent({ ...content, hero: { ...content.hero, ctaSecondary: { ...content.hero.ctaSecondary, label: e.target.value } } })}
              />
            </div>
            <div>
              <Label>Link</Label>
              <Input
                value={content.hero.ctaSecondary.href}
                onChange={(e) => setContent({ ...content, hero: { ...content.hero, ctaSecondary: { ...content.hero.ctaSecondary, href: e.target.value } } })}
              />
            </div>
          </div>
        </Card>

        {/* Story */}
        <Card className="p-5 space-y-3 lg:col-span-2">
          <h2 className="text-sm font-semibold">Story</h2>
          <div>
            <Label>Title</Label>
            <Input
              value={content.story.title}
              onChange={(e) => setContent({ ...content, story: { ...content.story, title: e.target.value } })}
            />
          </div>
          <div>
            <Label>Body</Label>
            <Textarea
              rows={5}
              value={content.story.body}
              onChange={(e) => setContent({ ...content, story: { ...content.story, body: e.target.value } })}
            />
          </div>
        </Card>

        {/* Products */}
        <Card className="p-5 space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Product highlights</h2>
            <Button variant="outline" size="sm" onClick={addProduct}>
              <Plus className="size-4" /> Add
            </Button>
          </div>
          <div className="space-y-3">
            {content.products.map((p, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 items-start">
                <Input
                  placeholder="Name"
                  value={p.name}
                  onChange={(e) => updateProduct(i, { name: e.target.value })}
                />
                <Textarea
                  rows={2}
                  placeholder="Description"
                  value={p.desc}
                  onChange={(e) => updateProduct(i, { desc: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => removeProduct(i)}
                  className="size-9 grid place-items-center rounded text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            {content.products.length === 0 && (
              <p className="text-xs text-muted-foreground">No products listed.</p>
            )}
          </div>
        </Card>

        {/* Contact */}
        <Card className="p-5 space-y-3 lg:col-span-2">
          <h2 className="text-sm font-semibold">Contact</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Address</Label>
              <Input value={content.contact.address} onChange={(e) => setContent({ ...content, contact: { ...content.contact, address: e.target.value } })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={content.contact.phone} onChange={(e) => setContent({ ...content, contact: { ...content.contact, phone: e.target.value } })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={content.contact.email} onChange={(e) => setContent({ ...content, contact: { ...content.contact, email: e.target.value } })} />
            </div>
            <div>
              <Label>Hours</Label>
              <Input value={content.contact.hours} onChange={(e) => setContent({ ...content, contact: { ...content.contact, hours: e.target.value } })} />
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}