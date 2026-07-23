import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import Autoplay from "embla-carousel-autoplay";
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
  Sparkles,
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
      { property: "og:description", content: "A family-run bakery factory producing breads, biscuits, cakes and pastries." },
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

  const brandName = c.brand.name || company?.name || defaultLanding.brand.name;
  const brandTagline = c.brand.tagline || company?.tagline || defaultLanding.brand.tagline;
  const logoUrl = c.brand.logoUrl || company?.logoDataUrl;
  const theme = c.theme;
  const nav = c.nav;

  const themeStyle = useMemo(
    () =>
      ({
        "--l-bg": theme.bg,
        "--l-surface": theme.surface,
        "--l-text": theme.text,
        "--l-muted": theme.muted,
        "--l-primary": theme.primary,
        "--l-primary-fg": theme.primaryFg,
        "--l-story-bg": theme.storyBg,
        "--l-story-fg": theme.storyFg,
      }) as React.CSSProperties,
    [theme],
  );

  const autoplay = useRef(
    Autoplay({ delay: c.carousel.intervalMs || 5000, stopOnInteraction: false }),
  );
  useEffect(() => {
    autoplay.current.options.delay = c.carousel.intervalMs || 5000;
  }, [c.carousel.intervalMs]);

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

  const heroSlide = carousels[0];

  return (
    <div
      className="min-h-screen"
      style={{ ...themeStyle, background: "var(--l-bg)", color: "var(--l-text)" }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-40 backdrop-blur border-b"
        style={{ background: `${theme.bg}d9`, borderColor: `${theme.primary}1a` }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="size-10 rounded-full grid place-items-center font-bold overflow-hidden ring-2"
              style={{ background: theme.primary, color: theme.primaryFg, borderColor: theme.primary }}
            >
              {logoUrl ? (
                <img src={logoUrl} alt={brandName} className="size-full object-cover" />
              ) : (
                brandName.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="leading-tight">
              <div className="font-semibold" style={{ color: theme.text }}>{brandName}</div>
              <div className="text-[11px] hidden sm:block" style={{ color: theme.muted }}>
                {brandTagline}
              </div>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm" style={{ color: theme.text }}>
            <a href="#products" className="hover:opacity-70 transition-opacity">{nav.productsLabel}</a>
            <a href="#story" className="hover:opacity-70 transition-opacity">{nav.storyLabel}</a>
            <a href="#contact" className="hover:opacity-70 transition-opacity">{nav.contactLabel}</a>
          </nav>
          {signedIn ? (
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium shadow-sm hover:opacity-90"
              style={{ background: theme.primary, color: theme.primaryFg }}
            >
              {nav.dashboardLabel} <ArrowRight className="size-4" />
            </Link>
          ) : (
            <Link
              to="/auth"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium shadow-sm hover:opacity-90"
              style={{ background: theme.primary, color: theme.primaryFg }}
            >
              {nav.signInLabel}
            </Link>
          )}
        </div>
      </header>


      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-100/60 via-[#fdf8f2] to-[#fdf8f2]" />
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-orange-200/40 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 size-96 rounded-full bg-rose-200/30 blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-amber-800 font-semibold mb-5 px-3 py-1 rounded-full bg-amber-100 border border-amber-200/70">
              <Sparkles className="size-3.5" /> {brandTagline}
            </div>
            <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-amber-950 leading-[1.05]">
              {c.hero.headline}
            </h1>
            <p className="mt-6 text-base sm:text-lg text-amber-950/70 max-w-xl leading-relaxed">
              {c.hero.subhead}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={c.hero.ctaSecondary.href || "#products"}
                className="inline-flex items-center gap-1.5 px-6 py-3 rounded-full text-sm font-medium shadow-sm hover:opacity-90"
                style={{ background: theme.primary, color: theme.primaryFg }}
              >
                {c.hero.ctaSecondary.label} <ArrowRight className="size-4" />
              </a>
              <a
                href="#story"
                className="inline-flex items-center gap-1.5 px-6 py-3 rounded-full border text-sm font-medium hover:opacity-70"
                style={{ borderColor: `${theme.primary}33`, color: theme.text }}
              >
                {nav.storyLabel}
              </a>
            </div>

            <div className="mt-10 flex items-center gap-6 text-xs text-amber-950/60">
              <div><span className="text-2xl font-bold text-amber-900 block">15+</span> Years baking</div>
              <div className="h-8 w-px bg-amber-900/10" />
              <div><span className="text-2xl font-bold text-amber-900 block">50+</span> Products</div>
              <div className="h-8 w-px bg-amber-900/10" />
              <div><span className="text-2xl font-bold text-amber-900 block">10k+</span> Weekly customers</div>
            </div>
          </div>

          {/* Hero visual — carousel or fallback */}
          <div className="relative">
            {carousels.length > 0 ? (
              <Carousel opts={{ loop: true }} plugins={c.carousel.autoplay ? [autoplay.current] : []} className="w-full">
                <CarouselContent>
                  {carousels.map((s) => (
                    <CarouselItem key={s.id}>
                      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl border border-amber-900/10 shadow-2xl shadow-amber-900/10 bg-amber-100">
                        <img src={s.imageUrl} alt={s.title} className="absolute inset-0 size-full object-cover" />
                        {(s.title || s.subtitle) && (
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent flex items-end p-6">
                            <div className="text-white">
                              {s.title && <div className="text-xl sm:text-2xl font-semibold">{s.title}</div>}
                              {s.subtitle && <div className="text-sm opacity-90 mt-1">{s.subtitle}</div>}
                            </div>
                          </div>
                        )}
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                {carousels.length > 1 && (
                  <>
                    <CarouselPrevious className="left-3 bg-white/90 border-none" />
                    <CarouselNext className="right-3 bg-white/90 border-none" />
                  </>
                )}
              </Carousel>
            ) : (
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl border border-amber-900/10 shadow-2xl shadow-amber-900/10 bg-gradient-to-br from-amber-200 via-orange-200 to-rose-200 grid place-items-center">
                <Cake className="size-28 text-amber-900/40" />
              </div>
            )}
            {/* small floating card */}
            <div className="hidden sm:flex absolute -bottom-6 -left-6 items-center gap-3 bg-white rounded-2xl shadow-xl border border-amber-900/5 px-4 py-3">
              <div className="size-10 rounded-full bg-amber-100 grid place-items-center">
                <Croissant className="size-5 text-amber-900" />
              </div>
              <div className="text-xs">
                <div className="font-semibold text-amber-950">Baked this morning</div>
                <div className="text-amber-900/60">Delivered fresh daily</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured products */}
      {featuredProducts.length > 0 && (
        <section id="featured" className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <div className="flex items-end justify-between mb-8">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-amber-800 font-semibold mb-2">Bestsellers</div>
              <h2 className="text-3xl sm:text-4xl font-bold text-amber-950">Featured products</h2>
            </div>
            <p className="text-amber-950/60 text-sm hidden sm:block max-w-xs text-right">
              Handpicked from our current catalog — fresh from the oven.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {featuredProducts.map((p) => (
              <div key={p.id} className="group rounded-2xl bg-white overflow-hidden border border-amber-900/10 hover:shadow-xl hover:shadow-amber-900/10 transition-all">
                <div className="aspect-square bg-amber-50 grid place-items-center overflow-hidden">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} className="size-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <Cake className="size-10 text-amber-900/30" />
                  )}
                </div>
                <div className="p-3.5">
                  <div className="text-[11px] uppercase tracking-wider text-amber-800/70">{p.category}</div>
                  <div className="font-medium text-sm mt-1 text-amber-950 line-clamp-1">{p.name}</div>
                  <div className="text-base text-amber-900 font-bold mt-1.5">৳ {p.price.toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* What we bake */}
      <section id="products" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="text-center mb-12">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-800 font-semibold mb-2">Our craft</div>
          <h2 className="text-3xl sm:text-4xl font-bold text-amber-950">What we bake</h2>
          <p className="text-amber-950/60 mt-3 max-w-lg mx-auto">Made fresh every day at our factory with honest ingredients.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {c.products.map((p, i) => {
            const Icon = productIcons[i % productIcons.length];
            return (
              <div key={i} className="p-6 rounded-2xl bg-white border border-amber-900/10 hover:border-amber-900/30 hover:-translate-y-1 transition-all duration-300">
                <div className="size-12 rounded-xl bg-amber-100 text-amber-900 grid place-items-center mb-4">
                  <Icon className="size-6" />
                </div>
                <h3 className="font-semibold text-amber-950">{p.name}</h3>
                <p className="text-sm text-amber-950/60 mt-2 leading-relaxed">{p.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Story */}
      <section id="story" className="bg-amber-900 text-amber-50 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-10 -left-10 size-80 rounded-full bg-orange-300 blur-3xl" />
          <div className="absolute -bottom-10 -right-10 size-80 rounded-full bg-rose-300 blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-20 sm:py-24 text-center">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-200 font-semibold mb-3">Since day one</div>
          <h2 className="text-3xl sm:text-4xl font-bold">{c.story.title}</h2>
          <p className="mt-6 text-amber-100/90 leading-relaxed whitespace-pre-line text-base sm:text-lg max-w-2xl mx-auto">
            {c.story.body}
          </p>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="text-center mb-12">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-800 font-semibold mb-2">Say hello</div>
          <h2 className="text-3xl sm:text-4xl font-bold text-amber-950">Get in touch</h2>
          <p className="text-amber-950/60 mt-3">Visit our factory, call us, or drop a line.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {[
            { icon: MapPin, label: "Address", value: c.contact.address },
            { icon: Phone, label: "Phone", value: c.contact.phone },
            { icon: Mail, label: "Email", value: c.contact.email },
            { icon: Clock, label: "Hours", value: c.contact.hours },
          ].map((r) => (
            <div key={r.label} className="p-6 rounded-2xl bg-white border border-amber-900/10 text-center hover:shadow-lg transition-shadow">
              <div className="size-11 rounded-full bg-amber-100 grid place-items-center mx-auto mb-3">
                <r.icon className="size-5 text-amber-900" />
              </div>
              <div className="text-[11px] uppercase tracking-[0.15em] text-amber-800/70 font-medium">{r.label}</div>
              <div className="mt-1.5 text-sm font-medium text-amber-950 break-words">{r.value}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-amber-900/10 bg-[#fdf8f2]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-amber-950/60">
          <div>© {new Date().getFullYear()} {brandName}. All rights reserved.</div>
          <div>Baked with care in Bangladesh.</div>
        </div>
      </footer>
    </div>
  );
}
