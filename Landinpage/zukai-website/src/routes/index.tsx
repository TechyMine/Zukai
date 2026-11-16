import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect } from "react";
import Lenis from "lenis";
import { Nav } from "@/components/zukai/Nav";
import { Hero } from "@/components/zukai/Hero";
import { WaitlistModal } from "@/components/zukai/WaitlistModal";
import { POSES, poseSrc } from "@/components/zukai/sections";
import { setLenis } from "@/lib/scroll";

const BelowFold = lazy(() => import("@/components/zukai/BelowFold"));
const Footer = lazy(() =>
  import("@/components/zukai/BelowFold").then((m) => ({ default: m.Footer })),
);

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Zukai",
  operatingSystem: "Android",
  applicationCategory: "EducationalApplication",
  description:
    "Turns PDF, DOCX, PPTX and TXT documents into simple spoken explanations in English or Hinglish.",
  inLanguage: ["en", "hi-Latn"],
  releaseNotes: "Coming soon to Android. Join the waitlist.",
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zukai — Listen to any document, understand everything" },
      {
        name: "description",
        content:
          "Zukai turns your PDF, DOCX, PPTX or TXT into a simple spoken explanation in English or Hinglish. Join the Android waitlist.",
      },
      { property: "og:title", content: "Zukai — Listen. Understand everything." },
      {
        property: "og:description",
        content: "Upload any document and hear it explained simply in English or Hinglish.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Zukai — Listen. Understand everything." },
      {
        name: "twitter:description",
        content: "Upload any document and hear it explained simply in English or Hinglish.",
      },
    ],
    links: [
      { rel: "canonical", href: "/" },
      { rel: "preload", as: "image", href: "/art/hero-cubes.webp", fetchPriority: "high" },
      { rel: "preload", as: "image", href: "/mascot/zuke-hero-float.webp" },
    ],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(jsonLd) }],
  }),
  component: Index,
});

function Index() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lenis = reduce ? null : new Lenis({ lerp: 0.1 });
    setLenis(lenis);
    let raf = 0;
    const loop = (t: number) => {
      lenis?.raf(t);
      raf = requestAnimationFrame(loop);
    };
    if (lenis) raf = requestAnimationFrame(loop);
    // Warm the cache for every Zuke pose so swaps crossfade instantly.
    const idle = setTimeout(
      () =>
        POSES.forEach((p) => {
          const i = new Image();
          i.src = poseSrc(p);
        }),
      2500,
    );
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(idle);
      lenis?.destroy();
      setLenis(null);
    };
  }, []);

  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <Suspense fallback={<div className="min-h-screen" />}>
          <BelowFold />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
      <WaitlistModal />
    </>
  );
}
