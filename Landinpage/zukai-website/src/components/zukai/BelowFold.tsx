import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FaAndroid } from "react-icons/fa6";
import { SOCIALS } from "./socials";
import { Pause, Play, Check, Clock } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionHead } from "./ScrollMascot";
import { TiltCard } from "./TiltCard";
import { Asset } from "./Asset";
import { Logo } from "./Logo";
import { WaitlistForm } from "./WaitlistForm";
import { SECTIONS, poseSrc, type Pose } from "./sections";
import { openWaitlist } from "@/lib/waitlist-events";
import { scrollToId } from "@/lib/scroll";

/* 1. Marquee */
function Marquee() {
  const items = ["PDF", "DOCX", "PPTX", "TXT", "ENGLISH", "HINGLISH"];
  const row = [...items, ...items];
  return (
    <div
      className="relative overflow-hidden border-y border-border bg-card/60 py-5"
      aria-label="Supported formats and languages: PDF, DOCX, PPTX, TXT, English, Hinglish"
    >
      <div aria-hidden className="marquee-track flex w-max">
        {[0, 1].map((k) => (
          <div key={k} className="flex shrink-0 items-center">
            {row.map((t, i) => (
              <span
                key={`${k}${i}`}
                className="flex items-center font-display text-xl text-foreground sm:text-3xl"
              >
                <span className="px-6 sm:px-10">{t}</span>
                <span className="h-2.5 w-2.5 rotate-45 bg-primary shadow-glow" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* 2. Problem */
function Problem() {
  const cards = [
    {
      art: "books",
      title: "Dense documents",
      body: "Pages of jargon that take an hour to get through.",
    },
    {
      art: "notebook",
      title: "Short attention spans",
      body: "Your focus fades long before the chapter ends.",
    },
    {
      art: "atoms",
      title: "Lost halfway",
      body: "By page ten you forget what page two was about.",
    },
  ];
  return (
    <section
      id="problem"
      className="section-pad container-z scroll-mt-4"
      aria-labelledby="problem-h"
    >
      <SectionHead
        side="left"
        pose="confused-question"
        eyebrow="THE PROBLEM"
        title="You read a lot. You remember little."
      />
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {cards.map((c) => (
          <TiltCard key={c.title} className="p-7">
            <Asset
              src={`/art/art-${c.art}.webp`}
              alt=""
              width={400}
              height={400}
              loading="lazy"
              className="h-28 w-28 object-contain"
            />
            <h3 className="mt-5 text-xl font-semibold text-foreground">{c.title}</h3>
            <p className="mt-2 text-muted-foreground">{c.body}</p>
          </TiltCard>
        ))}
      </div>
    </section>
  );
}

/* 3. How it works */
const STEPS: { title: string; body: string; pose: Pose }[] = [
  {
    title: "Upload your document",
    body: "PDF, DOCX, PPTX or TXT — straight from your phone.",
    pose: "carrying-document",
  },
  {
    title: "AI reads it chapter by chapter",
    body: "Zukai breaks the document into clear sections.",
    pose: "typing-laptop",
  },
  {
    title: "A simple spoken explanation is written",
    body: "Plain language in English or Hinglish, at the depth you choose.",
    pose: "lightbulb-idea",
  },
  {
    title: "Listen anywhere",
    body: "On the bus, at the gym, or with your eyes closed.",
    pose: "headphones-listening",
  },
];
function HowItWorks() {
  const [active, setActive] = useState(0);
  const step = STEPS[active] ?? STEPS[0]!;
  return (
    <section id="how" className="section-pad container-z scroll-mt-4" aria-labelledby="how-h">
      <div className="relative">
        <p className="font-tech text-xs tracking-widest text-primary sm:text-sm">HOW IT WORKS</p>
        <h2
          id="how-h"
          className="mt-3 font-display text-[clamp(1.6rem,4.6vw,4rem)] leading-[1.02] text-foreground uppercase"
        >
          Four steps to understanding
        </h2>
      </div>
      {/* Desktop sticky stage */}
      <div className="mt-12 hidden gap-12 lg:grid lg:grid-cols-[1fr_minmax(320px,420px)]">
        <ol>
          {STEPS.map((s, i) => (
            <motion.li
              key={s.title}
              onViewportEnter={() => setActive(i)}
              viewport={{ amount: 0.6 }}
              className="flex min-h-[60vh] items-center"
            >
              <div
                className={`transition-opacity duration-300 ${active === i ? "opacity-100" : "opacity-35"}`}
              >
                <span className="font-tech text-5xl text-primary">0{i + 1}</span>
                <h3 className="mt-3 font-display text-4xl text-foreground uppercase">{s.title}</h3>
                <p className="mt-3 max-w-md text-lg text-muted-foreground">{s.body}</p>
              </div>
            </motion.li>
          ))}
        </ol>
        <div className="sticky top-[12vh] h-[76vh] self-start">
          <div className="relative mx-auto flex h-full max-h-[680px] w-full max-w-[340px] flex-col rounded-[2.75rem] border-[6px] border-secondary bg-card p-6 shadow-glow">
            <div className="mx-auto mb-6 h-1.5 w-20 rounded-full bg-secondary" />
            <p className="font-tech text-xs text-primary">STEP 0{active + 1} / 04</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{step.title}</p>
            <div className="mt-3 flex gap-1.5">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full ${i <= active ? "bg-primary" : "bg-secondary"}`}
                />
              ))}
            </div>
            <div className="relative mt-auto aspect-square">
              {STEPS.map((s, i) => (
                <img
                  key={s.pose}
                  src={poseSrc(s.pose)}
                  alt={i === active ? `Zuke: ${s.title}` : ""}
                  width={400}
                  height={400}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-contain transition-opacity duration-300"
                  style={{ opacity: i === active ? 1 : 0 }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Mobile cards */}
      <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:hidden">
        {STEPS.map((s, i) => (
          <li key={s.title} className="glass-card flex items-center gap-4 p-5">
            <img
              src={poseSrc(s.pose)}
              alt=""
              width={400}
              height={400}
              loading="lazy"
              className="h-24 w-24 shrink-0 object-contain"
            />
            <div>
              <span className="font-tech text-sm text-primary">0{i + 1}</span>
              <h3 className="text-lg font-semibold text-foreground">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* 4. Features */
const FEATURES = [
  {
    art: "sound",
    title: "English and Hinglish",
    body: "Explanations in the language you think in.",
  },
  { art: "lightbulb", title: "Three depth modes", body: "Quick summary, Standard and Deep dive." },
  {
    art: "notebook",
    title: "Chapters and live transcript",
    body: "A transcript that follows the audio as it plays.",
  },
  {
    art: "books",
    title: "Listen your way",
    body: "Background playback, 0.75x to 2x speed and a sleep timer.",
  },
  {
    art: "upload",
    title: "Offline and MP3",
    body: "Download for offline listening or export as MP3.",
  },
  { art: "trophy", title: "Daily goal and streak", body: "Build a listening habit that sticks." },
  {
    art: "atoms",
    title: "True to your document",
    body: "Names, numbers and dates are checked against the source.",
  },
  {
    art: "graduation",
    title: "Private by design",
    body: "Your files are stored privately and you can delete them anytime.",
  },
];
function Features() {
  return (
    <section id="features" className="section-pad container-z scroll-mt-4">
      <SectionHead
        side="right"
        pose="pointing-left"
        eyebrow="FEATURES"
        title="Everything you need to learn by ear"
      />
      <div className="relative mt-10 grid auto-rows-fr gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <TiltCard key={f.title} className={`flex flex-col p-6`}>
            <Asset
              src={`/art/art-${f.art}.webp`}
              alt=""
              width={400}
              height={400}
              loading="lazy"
              className="pointer-events-none absolute -right-6 -bottom-6 h-36 w-36 object-contain opacity-90"
            />
            <h3 className="relative max-w-[70%] text-lg font-semibold text-foreground">
              {f.title}
            </h3>
            <p className="relative mt-2 max-w-[68%] text-sm text-muted-foreground">{f.body}</p>
          </TiltCard>
        ))}
      </div>
    </section>
  );
}

/* 5. Hear it */
function useFileExists(url: string) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch(url, { method: "HEAD" })
      .then((r) => live && setOk(r.ok && (r.headers.get("content-type") ?? "").startsWith("audio")))
      .catch(() => live && setOk(false));
    return () => {
      live = false;
    };
  }, [url]);
  return ok;
}
function HearIt() {
  const [lang, setLang] = useState<"en" | "hi">("en");
  const src = `/audio/sample-${lang}.mp3`;
  const exists = useFileExists(src);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    setPlaying(false);
    setProgress(0);
  }, [lang]);
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused)
      a.play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    else {
      a.pause();
      setPlaying(false);
    }
  };
  const disabled = exists !== true;
  return (
    <section id="sample" className="section-pad container-z scroll-mt-4">
      <SectionHead
        side="left"
        pose="headphones-listening"
        eyebrow="HEAR IT"
        title="Dense in. Simple out."
      />
      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <div className="glass-card p-6 sm:p-8">
          <div
            role="radiogroup"
            aria-label="Sample language"
            className="inline-flex rounded-full border border-border p-1"
          >
            {(["en", "hi"] as const).map((l) => (
              <button
                key={l}
                role="radio"
                aria-checked={lang === l}
                onClick={() => setLang(l)}
                className={`min-h-11 rounded-full px-5 text-sm font-medium transition-colors ${lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {l === "en" ? "English" : "Hinglish"}
              </button>
            ))}
          </div>
          <div className="mt-8 flex items-center gap-5">
            <button
              onClick={toggle}
              disabled={disabled}
              aria-label={
                disabled ? "Sample coming soon" : playing ? "Pause sample" : "Play sample"
              }
              className="btn-glossy flex h-16 w-16 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-50"
            >
              {playing ? (
                <Pause className="h-6 w-6 fill-current" />
              ) : (
                <Play className="ml-1 h-6 w-6 fill-current" />
              )}
            </button>
            <div aria-hidden className="flex h-16 flex-1 items-end gap-1 overflow-hidden">
              {Array.from({ length: 36 }, (_, i) => (
                <span
                  key={i}
                  className={`wave-bar w-full rounded-full bg-primary ${playing ? "" : "[animation-play-state:paused]"}`}
                  style={{
                    height: `${30 + ((i * 37) % 70)}%`,
                    animationDelay: `${(i % 9) * 0.09}s`,
                    opacity: i / 36 < progress ? 1 : 0.4,
                  }}
                />
              ))}
            </div>
          </div>
          {disabled ? (
            <p className="mt-6 text-sm text-muted-foreground">
              {exists === null ? "Loading sample…" : "Sample coming soon"}
            </p>
          ) : (
            <>
              <audio
                ref={audio}
                src={src}
                preload="none"
                onTimeUpdate={(e) =>
                  setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))
                }
                onEnded={() => setPlaying(false)}
              />
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(progress * 1000)}
                aria-label="Sample progress"
                onChange={(e) => {
                  const a = audio.current;
                  if (a?.duration) a.currentTime = (Number(e.target.value) / 1000) * a.duration;
                }}
                className="mt-6 w-full accent-[var(--primary)]"
              />
            </>
          )}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="glass-card p-6">
            <p className="font-tech text-xs text-muted-foreground">BEFORE</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Photosynthesis is the process by which chlorophyll-containing organisms convert
              electromagnetic radiation into chemical energy, synthesising glucose from carbon
              dioxide and water while releasing molecular oxygen as a by-product of the
              light-dependent reactions.
            </p>
          </div>
          <div className="glass-card border-primary/40 p-6">
            <p className="font-tech text-xs text-primary">AFTER</p>
            <p className="mt-3 text-sm leading-relaxed text-foreground">
              Plants are basically solar-powered kitchens. They take sunlight, water and air, and
              cook up sugar to grow. The leftover? Fresh oxygen — the air we breathe.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* 6. Made for */
function MadeFor() {
  const groups = {
    students: [
      "Turn textbooks and notes into revision you can listen to",
      "Catch up on readings during your commute",
      "Hinglish explanations that feel like a friend teaching you",
    ],
    pros: [
      "Get through reports and research before the meeting",
      "Listen to policies and specs while you multitask",
      "Deep dive mode for the details that matter",
    ],
  };
  const teams = ["Shared libraries", "Roles", "Audit logs", "Admin controls"];
  const list = (items: string[]) => (
    <ul className="grid gap-3">
      {items.map((t) => (
        <li key={t} className="flex gap-3 text-foreground">
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          {t}
        </li>
      ))}
    </ul>
  );
  return (
    <section id="made-for" className="section-pad container-z scroll-mt-4">
      <SectionHead
        side="right"
        pose="graduation-cap"
        eyebrow="MADE FOR"
        title="Built for people who learn on the move"
      />
      <Tabs defaultValue="students" className="mt-10">
        <TabsList className="h-auto flex-wrap rounded-full border border-border bg-card p-1">
          {[
            ["students", "Students"],
            ["pros", "Professionals"],
            ["teams", "Teams"],
          ].map(([v, l]) => (
            <TabsTrigger
              key={v}
              value={v!}
              className="min-h-11 rounded-full px-5 text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {l}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="glass-card mt-5 p-6 sm:p-8">
          <TabsContent value="students" className="mt-0">
            {list(groups.students)}
          </TabsContent>
          <TabsContent value="pros" className="mt-0">
            {list(groups.pros)}
          </TabsContent>
          <TabsContent value="teams" className="mt-0">
            <ul className="grid gap-3 sm:grid-cols-2">
              {teams.map((t) => (
                <li
                  key={t}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-foreground"
                >
                  {t}
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs text-primary">
                    <Clock className="h-3 w-3" />
                    Coming soon
                  </span>
                </li>
              ))}
            </ul>
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}

/* 7. Pricing teaser */
function Pricing() {
  const plans = [
    {
      name: "Free",
      items: ["Monthly listening allowance", "English and Hinglish", "All file formats"],
    },
    {
      name: "Pro",
      items: ["More listening every month", "Deep dive mode", "Offline downloads and MP3 export"],
      hot: true,
    },
    { name: "Team", items: ["Shared libraries", "Roles and admin controls", "Audit logs"] },
  ];
  return (
    <section id="pricing" className="section-pad container-z scroll-mt-4">
      <SectionHead
        side="left"
        pose="thumbs-up"
        eyebrow="PLANS"
        title="Start free. Go further later."
        intro="Pricing announced soon."
      />
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {plans.map((p) => (
          <TiltCard
            key={p.name}
            className={`flex flex-col p-7 ${p.hot ? "border-primary/50 shadow-glow" : ""}`}
          >
            <h3 className="font-display text-3xl text-foreground uppercase">{p.name}</h3>
            <p className="mt-1 font-tech text-xs text-primary">PRICING ANNOUNCED SOON</p>
            <ul className="mt-6 grid gap-3">
              {p.items.map((t) => (
                <li key={t} className="flex gap-3 text-sm text-foreground">
                  <Check className="h-5 w-5 shrink-0 text-primary" />
                  {t}
                </li>
              ))}
            </ul>
            <button
              onClick={openWaitlist}
              className={`mt-8 min-h-12 rounded-full font-semibold ${p.hot ? "btn-glossy" : "border border-border text-foreground hover:border-primary hover:text-primary"}`}
            >
              Join the waitlist
            </button>
          </TiltCard>
        ))}
      </div>
    </section>
  );
}

/* 8. FAQ */
const FAQ = [
  [
    "Is Zukai available now?",
    "Not yet. Zukai is coming to Android first — join the waitlist and we'll let you know the moment it's ready.",
  ],
  ["Which files can I use?", "PDF, DOCX, PPTX and TXT."],
  ["Which languages are supported?", "English and Hinglish."],
  ["Does it work offline?", "Yes — audio you've downloaded plays without a connection."],
  ["Is my document private?", "Your files are stored privately, and you can delete them anytime."],
  [
    "How much does it cost?",
    "There's a free plan with a monthly allowance. Paid plans are coming.",
  ],
];
function Faq() {
  return (
    <section id="faq" className="section-pad container-z scroll-mt-4">
      <SectionHead side="right" pose="reading-book" eyebrow="FAQ" title="Questions, answered" />
      <Accordion type="single" collapsible className="glass-card mt-10 px-6 sm:px-8">
        {FAQ.map(([q, a], i) => (
          <AccordionItem key={q} value={`q${i}`} className="border-border last:border-0">
            <AccordionTrigger className="min-h-14 text-left text-base font-semibold text-foreground hover:text-primary hover:no-underline">
              {q}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

/* 9. Final CTA */
function FinalCta() {
  return (
    <section id="waitlist" className="section-pad container-z scroll-mt-4">
      <div className="glass-card relative overflow-hidden p-7 sm:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -bottom-40 h-[500px] w-[500px] rounded-full opacity-50"
          style={{ background: "radial-gradient(circle, var(--primary), transparent 65%)" }}
        />
        <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 px-4 py-2 font-tech text-xs text-primary">
              <FaAndroid className="h-4 w-4" />
              COMING TO ANDROID
            </span>
            <h2 className="mt-5 font-display text-[clamp(1.8rem,5.4vw,4.8rem)] leading-[1] text-foreground uppercase">
              Start listening to understand
            </h2>
            <p className="mt-4 max-w-lg text-muted-foreground">
              Join the waitlist and be first to turn your documents into simple spoken explanations.
            </p>
            <div className="mt-8 max-w-xl">
              <WaitlistForm source="final-cta" />
            </div>
          </div>
          <img
            src={poseSrc("trophy-celebrate")}
            alt="Zuke celebrating with a trophy"
            width={400}
            height={400}
            loading="lazy"
            className="mx-auto w-40 object-contain sm:w-56 lg:w-72"
          />
        </div>
      </div>
    </section>
  );
}

/* 10. Footer */
export function Footer() {
  return (
    <footer className="relative border-t border-border">
      <div className="container-z relative grid gap-10 py-14 md:grid-cols-[1.2fr_2fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">
            Turn any document into a simple spoken explanation.
          </p>
          <div className="mt-6 flex gap-2">
            {SOCIALS.map(({ label: l, href, Icon: I }) => (
              <a
                key={l}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={l}
                className="social-flip flex h-11 w-11 items-center justify-center rounded-full border border-border text-foreground"
              >
                <I className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-3 pr-[100px] sm:grid-cols-3 md:pr-[180px]"
        >
          {SECTIONS.filter((s) => s.id !== "top").map((s) => (
            <button
              key={s.id}
              onClick={() => scrollToId(s.id)}
              className="min-h-11 text-left text-sm text-muted-foreground hover:text-primary"
            >
              {s.label}
            </button>
          ))}
        </nav>
        <img
          src={poseSrc("sleeping")}
          alt=""
          width={400}
          height={400}
          loading="lazy"
          className="absolute right-4 bottom-16 w-[90px] object-contain md:right-10 md:w-[160px]"
        />
      </div>
      <div className="container-z flex flex-col gap-3 border-t border-border py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} Zukai. All rights reserved.</p>
        <div className="flex gap-5">
          <a href="#" className="hover:text-primary">
            Privacy
          </a>
          <a href="#" className="hover:text-primary">
            Terms
          </a>
        </div>
      </div>
    </footer>
  );
}

export default function BelowFold() {
  return (
    <>
      <Marquee />
      <Problem />
      <HowItWorks />
      <Features />
      <HearIt />
      <MadeFor />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  );
}
