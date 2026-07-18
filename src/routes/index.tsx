import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchLandingContent,
  defaultLanding,
  type LandingContent,
} from "@/lib/landing-content";
import { listCarousels, type CarouselSlide } from "@/lib/landing-carousels";
import { listLandingProducts, type LandingProduct } from "@/lib/landing-products";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  Cake,
  Cookie,
  Croissant,
  ShoppingBag,
  Phone,
  Mail,
  MapPin,
  Clock,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Muzahid Food · Freshly baked, honestly made" },
      {
        name: "description",
        content:
          "Muzahid Food — a family-run bakery factory producing breads, biscuits, cakes and pastries for our showrooms and partner retailers.",
      },
      { property: "og:title", content: "Muzahid Food · Freshly baked, honestly made" },
      { property: "og:description", content: "Muzahid Food — a family-run bakery factory producing breads, biscuits, cakes and pastries for our showrooms and partner retailers." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Landing,
});

const productIcons = [Croissant, Cookie, Cake, ShoppingBag];

function setFavicon(href: string) {
  if (typeof document === "undefined") return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
}

function Landing() {
  const { data, refetch } = useQuery({
    queryKey: ["landing-content"],
    queryFn: fetchLandingContent,
    staleTime: 60_000,
  });
  const c: LandingContent = data ?? defaultLanding;

  const { data: carousels = [], refetch: refetchCarousels } = useQuery<CarouselSlide[]>({
    queryKey: ["landing-carousels-public"],
    queryFn: () => listCarousels({ onlyActive: true }),
    staleTime: 60_000,
  });

  const { data: featuredProducts = [], refetch: refetchFeatured } = useQuery<LandingProduct[]>({
    queryKey: ["landing-featured-products"],
    queryFn: () => listLandingProducts(),
    staleTime: 60_000,
  });

  const [company, setCompany] = useState<Awaited<ReturnType<typeof import("@/lib/company-settings").getCompany>> | null>(null);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { getCompany } = await import("@/lib/company-settings");
      const cc = await getCompany();
      if (mounted) setCompany(cc);
    };
    load();
    const onUpdate = () => {
      load();
      refetch();
      refetchCarousels();
      refetchFeatured();
    };
    window.addEventListener("company-settings-updated", onUpdate);
    window.addEventListener("landing-content-updated", onUpdate);
    return () => {
      mounted = false;
      window.removeEventListener("company-settings-updated", onUpdate);
      window.removeEventListener("landing-content-updated", onUpdate);
    };
  }, [refetch, refetchCarousels, refetchFeatured]);

  const brandName = company?.name || c.brand.name;
  const brandTagline = company?.tagline || c.brand.tagline;
  const logoUrl = company?.logoDataUrl;

  useEffect(() => {
    if (logoUrl) setFavicon(logoUrl);
  }, [logoUrl]);
  useEffect(() => {
    if (typeof document !== "undefined" && brandName) {
      document.title = `${brandName} · ${brandTagline || "Freshly baked, honestly made"}`;
    }
  }, [brandName, brandTagline]);

  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-md bg-primary text-primary-foreground grid place-items-center font-bold overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt={brandName} className="size-full object-cover" />
              ) : (
                brandName.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="leading-tight">
              <div className="font-semibold">{brandName}</div>
              <div className="text-[11px] text-muted-foreground hidden sm:block">
                {brandTagline}
              </div>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#products" className="hover:text-primary">Products</a>
            <a href="#story" className="hover:text-primary">Story</a>
            <a href="#contact" className="hover:text-primary">Contact</a>
          </nav>
          {signedIn ? (
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              Open Dashboard <ArrowRight className="size-4" />
            </Link>
          ) : (
            <Link
              to="/auth"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-primary font-medium mb-4">
            <Cake className="size-3.5" /> {brandTagline}
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight max-w-3xl mx-auto">
            {c.hero.headline}
          </h1>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            {c.hero.subhead}
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <a
              href={c.hero.ctaPrimary.href}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              {c.hero.ctaPrimary.label} <ArrowRight className="size-4" />
            </a>
            <a
              href={c.hero.ctaSecondary.href}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md border border-border text-sm font-medium hover:bg-accent"
            >
              {c.hero.ctaSecondary.label}
            </a>
          </div>
        </div>
      </section>

      {/* Carousel */}
      {carousels.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-4">
          <Carousel opts={{ loop: true }} className="w-full">
            <CarouselContent>
              {carousels.map((s) => {
                const inner = (
                  <div className="relative aspect-[16/6] w-full overflow-hidden rounded-xl border border-border bg-muted">
                    <img src={s.imageUrl} alt={s.title} className="absolute inset-0 size-full object-cover" />
                    {(s.title || s.subtitle) && (
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent flex items-end p-6">
                        <div className="text-white">
                          {s.title && <div className="text-lg sm:text-2xl font-semibold">{s.title}</div>}
                          {s.subtitle && <div className="text-sm opacity-90 mt-1">{s.subtitle}</div>}
                        </div>
                      </div>
                    )}
                  </div>
                );
                return (
                  <CarouselItem key={s.id}>
                    {s.linkUrl ? (
                      <a href={s.linkUrl} target="_blank" rel="noreferrer">{inner}</a>
                    ) : (
                      inner
                    )}
                  </CarouselItem>
                );
              })}
            </CarouselContent>
            {carousels.length > 1 && (
              <>
                <CarouselPrevious />
                <CarouselNext />
              </>
            )}
          </Carousel>
        </section>
      )}

      {/* Featured products (from backend) */}
      {featuredProducts.length > 0 && (
        <section id="featured" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold">Featured products</h2>
            <p className="text-muted-foreground mt-2">Handpicked from our current catalog.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {featuredProducts.map((p) => (
              <div key={p.id} className="rounded-lg border border-border bg-card overflow-hidden hover:border-primary/40 transition-colors">
                <div className="aspect-square bg-muted grid place-items-center overflow-hidden">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} className="size-full object-cover" />
                  ) : (
                    <Cake className="size-10 text-muted-foreground" />
                  )}
                </div>
                <div className="p-3">
                  <div className="text-xs text-muted-foreground">{p.category}</div>
                  <div className="font-medium text-sm mt-0.5 line-clamp-1">{p.name}</div>
                  <div className="text-sm text-primary font-semibold mt-1">৳ {p.price.toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Products (static highlights) */}
      <section id="products" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold">What we bake</h2>
          <p className="text-muted-foreground mt-2">Made fresh every day at our factory.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {c.products.map((p, i) => {
            const Icon = productIcons[i % productIcons.length];
            return (
              <div key={i} className="p-6 rounded-lg border border-border bg-card hover:border-primary/40 transition-colors">
                <div className="size-10 rounded-md bg-primary/10 text-primary grid place-items-center mb-4">
                  <Icon className="size-5" />
                </div>
                <h3 className="font-semibold">{p.name}</h3>
                <p className="text-sm text-muted-foreground mt-1.5">{p.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Story */}
      <section id="story" className="bg-muted/30 border-y border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold">{c.story.title}</h2>
          <p className="mt-4 text-muted-foreground leading-relaxed whitespace-pre-line">
            {c.story.body}
          </p>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold">Get in touch</h2>
          <p className="text-muted-foreground mt-2">We'd love to hear from you.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {[
            { icon: MapPin, label: "Address", value: c.contact.address },
            { icon: Phone, label: "Phone", value: c.contact.phone },
            { icon: Mail, label: "Email", value: c.contact.email },
            { icon: Clock, label: "Hours", value: c.contact.hours },
          ].map((r) => (
            <div key={r.label} className="p-5 rounded-lg border border-border bg-card text-center">
              <r.icon className="size-5 text-primary mx-auto mb-2" />
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{r.label}</div>
              <div className="mt-1 text-sm font-medium break-words">{r.value}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <div>© {new Date().getFullYear()} {brandName}. All rights reserved.</div>
          <Link to="/auth" className="hover:text-primary">Staff sign in</Link>
        </div>
      </footer>
    </div>
  );
}
