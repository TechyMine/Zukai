import { useEffect, useRef, useState } from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { Headphones, Play } from "lucide-react";
import { Asset } from "./Asset";
import { scrollToId } from "@/lib/scroll";
import { openWaitlist } from "@/lib/waitlist-events";

const MESSAGES = ["Hi, I'm Zuke!", "Upload a PDF", "English or Hinglish?"];
const STATS = [
  { n: 4, label: "FILE FORMATS" },
  { n: 2, label: "LANGUAGES" },
  { n: 3, label: "DEPTH LEVELS" },
];

function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    setFine(
      window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
        (navigator.hardwareConcurrency ?? 8) > 4,
    );
  }, []);
  return fine;
}

function SpeechPill({ fine }: { fine: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState("");

  // Desktop: activate when the cursor is near (within 90px).
  useEffect(() => {
    if (!fine) {
      setActive(true);
      return;
    }
    const onMove = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      setActive(Math.hypot(dx, dy) < 90);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [fine]);

  useEffect(() => {
    if (!active) {
      setText("");
      return;
    }
    const msg = MESSAGES[idx] ?? "";
    let i = 0;
    const type = setInterval(() => {
      i++;
      setText(msg.slice(0, i));
      if (i >= msg.length) clearInterval(type);
    }, 45);
    const next = setTimeout(() => setIdx((v) => (v + 1) % MESSAGES.length), fine ? 2200 : 3000);
    return () => {
      clearInterval(type);
      clearTimeout(next);
    };
  }, [active, idx, fine]);

  return (
    <div
      ref={ref}
      aria-live="polite"
      className="flex h-9 min-w-[120px] items-center rounded-full border border-primary/40 bg-background/40 px-4 font-tech text-[11px] whitespace-nowrap text-primary transition-shadow sm:text-xs"
      style={{ boxShadow: active ? "0 0 24px -6px var(--primary)" : undefined }}
    >
      {text}
      {active && <span className="ml-0.5 inline-block h-3 w-px animate-pulse bg-primary" />}
    </div>
  );
}

function CountUp({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - t0) / 1200, 1);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to]);
  return <span ref={ref}>{v}</span>;
}

function Layer({
  x,
  y,
  depth,
  className,
  children,
  style,
}: {
  x: MotionValue<number>;
  y: MotionValue<number>;
  depth: number;
  className?: string;
  children: React.ReactNode;
  style?: { left?: string; top?: string };
}) {
  const tx = useTransform(x, (v) => v * depth);
  const ty = useTransform(y, (v) => v * depth);
  return (
    <motion.div className={className} style={{ ...style, x: tx, y: ty }}>
      {children}
    </motion.div>
  );
}

const CUBES = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 37 + 8) % 92}%`,
  top: `${(i * 53 + 5) % 90}%`,
  size: 10 + ((i * 7) % 22),
  depth: 10 + (i % 4) * 12,
  dur: 6 + (i % 5),
  delay: i * 0.3,
  rot: (i * 47) % 90,
}));

function CursorBlobs() {
  const mx = useMotionValue(-200),
    my = useMotionValue(-200);
  const springs = [
    {
      s: useSpring(mx, { stiffness: 180, damping: 20 }),
      t: useSpring(my, { stiffness: 180, damping: 20 }),
      size: 70,
    },
    {
      s: useSpring(mx, { stiffness: 90, damping: 18 }),
      t: useSpring(my, { stiffness: 90, damping: 18 }),
      size: 110,
    },
    {
      s: useSpring(mx, { stiffness: 45, damping: 16 }),
      t: useSpring(my, { stiffness: 45, damping: 16 }),
      size: 150,
    },
  ];
  useEffect(() => {
    const on = (e: PointerEvent) => {
      mx.set(e.clientX);
      my.set(e.clientY);
    };
    window.addEventListener("pointermove", on);
    return () => window.removeEventListener("pointermove", on);
  }, [mx, my]);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      {springs.map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-primary blur-2xl"
          style={{
            x: b.s,
            y: b.t,
            width: b.size,
            height: b.size,
            marginLeft: -b.size / 2,
            marginTop: -b.size / 2,
            opacity: 0.22 - i * 0.05,
          }}
        />
      ))}
    </div>
  );
}

export function Hero() {
  const fine = useFinePointer();
  const px = useMotionValue(0),
    py = useMotionValue(0);
  const x = useSpring(px, { stiffness: 60, damping: 18 }),
    y = useSpring(py, { stiffness: 60, damping: 18 });
  useEffect(() => {
    if (!fine) return;
    const on = (e: PointerEvent) => {
      px.set(e.clientX / window.innerWidth - 0.5);
      py.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("pointermove", on);
    return () => window.removeEventListener("pointermove", on);
  }, [fine, px, py]);

  return (
    <section id="top" className="relative isolate overflow-hidden">
      {fine && <CursorBlobs />}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[20%] bottom-[-30%] -z-10 aspect-square w-[min(110vw,1100px)] rounded-full opacity-60 lg:right-[-12%] lg:bottom-[-45%]"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--highlight) 75%, transparent) 0%, color-mix(in oklab, var(--primary) 30%, transparent) 35%, transparent 68%)",
        }}
      />

      <div className="relative mx-auto max-w-[1920px] px-5 pt-10 pb-12 md:px-[7%] lg:min-h-[calc(100svh-6rem)] lg:pt-[clamp(3rem,8vh,7rem)]">
        <div className="relative z-10 lg:w-[52%]">
          <h1 className="font-display uppercase text-foreground">
            <span className="flex flex-wrap items-end gap-x-[0.25em] lg:flex-nowrap gap-y-2">
              <span className="text-hero-sm">Listen</span>
              <span className="mb-[0.35em] flex flex-col items-start gap-1">
                <Headphones
                  aria-hidden
                  className="h-[clamp(1.6rem,3vw,3rem)] w-[clamp(1.6rem,3vw,3rem)] -rotate-12 text-primary drop-shadow-[0_4px_0_var(--primary-foreground)]"
                  strokeWidth={2.5}
                />
                <span className="font-tech text-[clamp(.62rem,1.25vw,1.35rem)] leading-tight text-primary">
                  Audio learning, supercharged
                </span>
              </span>
            </span>
            <span className="block text-hero tracking-tight">Understand</span>
            <span className="mt-1 flex flex-wrap items-center lg:flex-nowrap gap-x-[clamp(.75rem,1.5vw,1.5rem)] gap-y-3">
              <span className="text-hero-sm">Everything</span>
              <span className="flex items-center gap-3 font-sans normal-case">
                <button
                  onClick={() => scrollToId("sample")}
                  aria-label="Play an audio sample"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105 hover:shadow-glow sm:h-14 sm:w-14"
                >
                  <Play className="ml-1 h-5 w-5 fill-current sm:h-6 sm:w-6" />
                </button>
                <SpeechPill fine={fine} />
              </span>
            </span>
          </h1>

          <dl className="mt-[clamp(2rem,5vh,3.5rem)] flex items-stretch">
            {STATS.map((s, i) => (
              <div key={s.label} className="flex items-stretch">
                {i > 0 && (
                  <span
                    aria-hidden
                    className="mx-[clamp(.9rem,3vw,2.5rem)] w-px bg-gradient-divider"
                  />
                )}
                <div>
                  <dt className="sr-only">{s.label}</dt>
                  <dd className="text-[clamp(1.6rem,3.2vw,2.75rem)] leading-none font-semibold text-foreground">
                    <CountUp to={s.n} />
                  </dd>
                  <dd
                    aria-hidden
                    className="mt-2 font-tech text-[clamp(.55rem,.9vw,.8rem)] tracking-wide text-muted-foreground"
                  >
                    {s.label}
                  </dd>
                </div>
              </div>
            ))}
          </dl>

          <div className="mt-[clamp(2rem,5vh,3.5rem)] flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <button
              onClick={openWaitlist}
              className="btn-glossy w-full rounded-full px-9 py-4 text-sm font-semibold tracking-wide sm:w-auto sm:text-base"
            >
              JOIN THE WAITLIST
            </button>
            <button
              onClick={() => scrollToId("sample")}
              className="w-full rounded-full border border-border px-7 py-4 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary sm:w-auto sm:text-base"
            >
              Hear a sample
            </button>
          </div>
        </div>

        {/* Visual: below text on mobile, overlapping headline on desktop */}
        <div className="relative mx-auto mt-10 aspect-square w-full max-w-[520px] lg:absolute lg:top-[2%] lg:right-[3%] lg:mt-0 lg:w-[54%] lg:max-w-[980px]">
          <Layer x={x} y={y} depth={-18} className="absolute inset-0">
            <motion.div
              animate={{ rotate: [0, 2, 0, -2, 0] }}
              transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
              className="h-full w-full"
            >
              <Asset
                src="/art/hero-cubes.webp"
                alt=""
                fetchPriority="high"
                className="h-full w-full object-contain"
                width={1000}
                height={1000}
              />
            </motion.div>
          </Layer>
          {CUBES.map((c, i) => (
            <Layer
              key={i}
              x={x}
              y={y}
              depth={c.depth}
              className="absolute"
              style={{ left: c.left, top: c.top }}
            >
              <motion.div
                animate={{ y: [0, -14, 0], rotate: [c.rot, c.rot + 25, c.rot] }}
                transition={{
                  duration: c.dur,
                  delay: c.delay,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <Asset
                  src="/art/cube-1.webp"
                  alt=""
                  className="object-contain"
                  style={{ width: c.size * (fine ? 1.4 : 1), height: c.size * (fine ? 1.4 : 1) }}
                />
              </motion.div>
            </Layer>
          ))}
          <Layer x={x} y={y} depth={36} className="absolute bottom-[4%] left-[14%] w-[44%]">
            <motion.div
              animate={{ y: [0, -16, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            >
              <Asset
                src="/mascot/zuke-hero-float.webp"
                alt="Zuke, the Zukai robot, waving hello"
                className="w-full object-contain drop-shadow-[0_30px_40px_rgba(0,0,0,.55)]"
                width={800}
                height={800}
              />
            </motion.div>
          </Layer>
        </div>
      </div>
    </section>
  );
}
