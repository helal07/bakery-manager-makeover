import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell, Card } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Save, RotateCcw, ExternalLink, Upload, Image as ImageIcon } from "lucide-react";
import {
  fetchLandingContent,
  saveLandingContent,
  defaultLanding,
  defaultTheme,
  type LandingContent,
} from "@/lib/landing-content";
import {
  listCarousels,
  upsertCarousel,
  deleteCarousel,
  uploadCarouselImage,
  type CarouselSlide,
} from "@/lib/landing-carousels";
import {
  listAllProductsForLanding,
  setProductShowOnLanding,
  type LandingProduct,
} from "@/lib/landing-products";


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
      window.dispatchEvent(new Event("landing-content-updated"));
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
          <div>
            <Label>Logo URL (public)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://…/logo.png"
                value={content.brand.logoUrl ?? ""}
                onChange={(e) => setContent({ ...content, brand: { ...content.brand, logoUrl: e.target.value } })}
              />
              <BrandLogoUpload
                onUploaded={(url) => setContent((c) => ({ ...c, brand: { ...c.brand, logoUrl: url } }))}
              />
            </div>
            {content.brand.logoUrl && (
              <img src={content.brand.logoUrl} alt="logo" className="mt-2 size-14 rounded object-cover border" />
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              Shown in the public header/favicon. Use an image URL from a public bucket for reliability.
            </p>
          </div>
        </Card>

        {/* Navigation labels */}
        <Card className="p-5 space-y-3">
          <h2 className="text-sm font-semibold">Menu labels</h2>
          <p className="text-xs text-muted-foreground">Rename the public site's navigation.</p>
          <div className="grid grid-cols-2 gap-2">
            {(["productsLabel", "storyLabel", "contactLabel", "signInLabel", "dashboardLabel"] as const).map((k) => (
              <div key={k}>
                <Label className="text-xs capitalize">{k.replace("Label", "")}</Label>
                <Input
                  value={content.nav[k]}
                  onChange={(e) => setContent({ ...content, nav: { ...content.nav, [k]: e.target.value } })}
                />
              </div>
            ))}
          </div>
          <div className="pt-2 border-t">
            <h3 className="text-xs font-semibold mb-2">Section headings</h3>
            <div className="grid grid-cols-1 gap-2">
              {(["featuredTitle", "craftTitle", "contactTitle"] as const).map((k) => (
                <div key={k}>
                  <Label className="text-xs capitalize">{k.replace("Title", "")}</Label>
                  <Input
                    value={content.sections[k]}
                    onChange={(e) => setContent({ ...content, sections: { ...content.sections, [k]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Theme colors */}
        <Card className="p-5 space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Landing colors</h2>
              <p className="text-xs text-muted-foreground">Customize the public landing palette. Click any swatch to change.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setContent({ ...content, theme: { ...defaultTheme } })}
            >
              <RotateCcw className="size-4" /> Reset colors
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              [
                ["bg", "Page background"],
                ["surface", "Card surface"],
                ["text", "Text"],
                ["muted", "Muted text"],
                ["primary", "Primary / buttons"],
                ["primaryFg", "Primary text"],
                ["storyBg", "Story background"],
                ["storyFg", "Story text"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={content.theme[key]}
                    onChange={(e) =>
                      setContent({ ...content, theme: { ...content.theme, [key]: e.target.value } })
                    }
                    className="size-9 rounded border cursor-pointer"
                  />
                  <Input
                    value={content.theme[key]}
                    onChange={(e) =>
                      setContent({ ...content, theme: { ...content.theme, [key]: e.target.value } })
                    }
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            ))}
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

        {/* Carousel manager */}
        <Card className="p-5 space-y-3 lg:col-span-2">
          <CarouselManager />
        </Card>

        {/* Product publisher */}
        <Card className="p-5 space-y-3 lg:col-span-2">
          <ProductPublisher />
        </Card>
      </div>
    </AppShell>
  );
}

function CarouselManager() {
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const reload = async () => {
    setLoading(true);
    try {
      setSlides(await listCarousels());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load carousels");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    reload();
  }, []);

  const addSlide = async () => {
    try {
      await upsertCarousel({
        title: "New slide",
        imageUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1600",
        sortOrder: slides.length,
        isActive: true,
      });
      await reload();
      window.dispatchEvent(new Event("landing-content-updated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Add failed");
    }
  };

  const save = async (s: CarouselSlide) => {
    try {
      await upsertCarousel(s);
      toast.success("Slide saved");
      window.dispatchEvent(new Event("landing-content-updated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this slide?")) return;
    try {
      await deleteCarousel(id);
      await reload();
      window.dispatchEvent(new Event("landing-content-updated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const onUpload = async (s: CarouselSlide, file: File) => {
    setUploadingId(s.id);
    try {
      const url = await uploadCarouselImage(file);
      await upsertCarousel({ ...s, imageUrl: url });
      await reload();
      window.dispatchEvent(new Event("landing-content-updated"));
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Carousel slides</h2>
          <p className="text-xs text-muted-foreground">Shown at the top of the landing page.</p>
        </div>
        <Button variant="outline" size="sm" onClick={addSlide}>
          <Plus className="size-4" /> Add slide
        </Button>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : slides.length === 0 ? (
        <p className="text-xs text-muted-foreground">No slides yet.</p>
      ) : (
        <div className="space-y-3">
          {slides.map((s) => (
            <div key={s.id} className="grid grid-cols-1 md:grid-cols-[160px_1fr_auto] gap-3 items-start border border-border rounded-md p-3">
              <div className="aspect-[16/9] rounded bg-muted overflow-hidden grid place-items-center">
                {s.imageUrl ? (
                  <img src={s.imageUrl} alt={s.title} className="size-full object-cover" />
                ) : (
                  <ImageIcon className="size-6 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Title</Label>
                    <Input
                      value={s.title}
                      onChange={(e) =>
                        setSlides((arr) => arr.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Subtitle</Label>
                    <Input
                      value={s.subtitle ?? ""}
                      onChange={(e) =>
                        setSlides((arr) => arr.map((x) => (x.id === s.id ? { ...x, subtitle: e.target.value } : x)))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Image URL</Label>
                    <Input
                      value={s.imageUrl}
                      onChange={(e) =>
                        setSlides((arr) => arr.map((x) => (x.id === s.id ? { ...x, imageUrl: e.target.value } : x)))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Link (optional)</Label>
                    <Input
                      value={s.linkUrl ?? ""}
                      onChange={(e) =>
                        setSlides((arr) => arr.map((x) => (x.id === s.id ? { ...x, linkUrl: e.target.value } : x)))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Sort order</Label>
                    <Input
                      type="number"
                      value={s.sortOrder}
                      onChange={(e) =>
                        setSlides((arr) => arr.map((x) => (x.id === s.id ? { ...x, sortOrder: Number(e.target.value) || 0 } : x)))
                      }
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <Switch
                      checked={s.isActive}
                      onCheckedChange={(v) =>
                        setSlides((arr) => arr.map((x) => (x.id === s.id ? { ...x, isActive: v } : x)))
                      }
                    />
                    <span className="text-xs text-muted-foreground">Active</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={(el) => {
                    fileRefs.current[s.id] = el;
                  }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUpload(s, f);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRefs.current[s.id]?.click()}
                  disabled={uploadingId === s.id}
                >
                  <Upload className="size-4" /> {uploadingId === s.id ? "Uploading…" : "Upload"}
                </Button>
                <Button size="sm" onClick={() => save(s)}>
                  <Save className="size-4" /> Save
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(s.id)} className="text-destructive">
                  <Trash2 className="size-4" /> Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductPublisher() {
  const [items, setItems] = useState<LandingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const reload = async () => {
    setLoading(true);
    try {
      setItems(await listAllProductsForLanding());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    reload();
  }, []);

  const toggle = async (p: LandingProduct, v: boolean) => {
    setItems((arr) => arr.map((x) => (x.id === p.id ? { ...x, showOnLanding: v } : x)));
    try {
      await setProductShowOnLanding(p.id, v);
      window.dispatchEvent(new Event("landing-content-updated"));
    } catch (e) {
      setItems((arr) => arr.map((x) => (x.id === p.id ? { ...x, showOnLanding: !v } : x)));
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const filtered = items.filter(
    (p) =>
      !query ||
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.sku.toLowerCase().includes(query.toLowerCase()),
  );
  const publishedCount = items.filter((p) => p.showOnLanding).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold">Publish products on landing</h2>
          <p className="text-xs text-muted-foreground">
            {publishedCount} of {items.length} published
          </p>
        </div>
        <Input
          placeholder="Search product…"
          className="max-w-xs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="border border-border rounded-md divide-y max-h-[420px] overflow-auto">
          {filtered.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3">
              <div className="size-10 rounded bg-muted overflow-hidden grid place-items-center shrink-0">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.name} className="size-full object-cover" />
                ) : (
                  <ImageIcon className="size-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {p.sku} · {p.category} · ৳ {p.price.toFixed(2)}
                </div>
              </div>
              <Switch checked={p.showOnLanding} onCheckedChange={(v) => toggle(p, v)} />
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground p-3">No products match.</p>
          )}
        </div>
      )}
    </div>
  );
}