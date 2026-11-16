import { useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { cn } from "@/lib/utils";
import { poseSrc, type Pose } from "./sections";

type Side = "left" | "right";

/**
 * Zuke beside a section: slides in from its side, floats, drifts with scroll,
 * and jetpacks out toward the next section's side as the section leaves.
 * Place inside a `relative` container; it positions itself at that side's top corner.
 */
export function ScrollMascot({
  pose,
  side,
  alt = "",
  className,
}: {
  pose: Pose;
  side: Side;
  alt?: string | undefined;
  className?: string | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const drift = useTransform(scrollYProgress, [0, 1], [40, -40]);
  const exitX = useTransform(scrollYProgress, [0.86, 1], [0, side === "right" ? -160 : 160]);
  const exitO = useTransform(scrollYProgress, [0.92, 1], [1, 0]);
  const [leaving, setLeaving] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (v) => setLeaving(v > 0.88));
  const shown: Pose = !reduce && leaving ? "jetpack-flying" : pose;
  const dir = side === "right" ? 1 : -1;

  return (
    <div
      ref={ref}
      aria-hidden={!alt}
      className={cn(
        "pointer-events-none absolute top-0 z-10 w-[96px] sm:w-[120px] md:w-[170px] lg:w-[210px]",
        side === "right" ? "right-0" : "left-0",
        className,
      )}
    >
      <motion.div
        initial={reduce ? false : { x: 120 * dir, opacity: 0, rotate: 12 * dir }}
        whileInView={{ x: 0, opacity: 1, rotate: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ type: "spring", stiffness: 110, damping: 14 }}
      >
        <motion.div style={reduce ? {} : { y: drift, x: exitX, opacity: exitO }}>
          <motion.div
            animate={reduce ? {} : { y: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="relative aspect-square"
          >
            <AnimatePresence initial={false}>
              <motion.img
                key={shown}
                src={poseSrc(shown)}
                alt={alt}
                width={400}
                height={400}
                loading="lazy"
                decoding="async"
                draggable={false}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_18px_24px_rgba(0,0,0,.5)]"
                style={side === "left" && shown === "jetpack-flying" ? { scaleX: -1 } : {}}
              />
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}

/** Section heading row that reserves room on the mascot's side, so Zuke never covers text. */
export function SectionHead({
  eyebrow,
  title,
  intro,
  side,
  pose,
  alt,
}: {
  eyebrow: string;
  title: string;
  intro?: string | undefined;
  side: Side;
  pose: Pose;
  alt?: string | undefined;
}) {
  return (
    <div
      className={cn(
        "relative min-h-[96px] sm:min-h-[120px] md:min-h-[170px]",
        side === "right"
          ? "pr-[104px] sm:pr-[132px] md:pr-[190px] lg:pr-[230px]"
          : "pl-[104px] sm:pl-[132px] md:pl-[190px] lg:pl-[230px]",
      )}
    >
      <p className="font-tech text-xs tracking-widest text-primary sm:text-sm">{eyebrow}</p>
      <h2 className="mt-3 font-display text-[clamp(1.6rem,4.6vw,4rem)] leading-[1.02] text-foreground uppercase">
        {title}
      </h2>
      {intro && <p className="mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">{intro}</p>}
      <ScrollMascot pose={pose} side={side} alt={alt} />
    </div>
  );
}
