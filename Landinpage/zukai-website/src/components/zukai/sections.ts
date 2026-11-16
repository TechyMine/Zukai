export const SECTIONS = [
  { id: "top", label: "Home" },
  { id: "problem", label: "The problem" },
  { id: "how", label: "How it works" },
  { id: "features", label: "Features" },
  { id: "sample", label: "Hear a sample" },
  { id: "made-for", label: "Who it's for" },
  { id: "pricing", label: "Plans" },
  { id: "faq", label: "FAQ" },
  { id: "waitlist", label: "Join the waitlist" },
] as const;

export const POSES = [
  "hero-float",
  "confused-question",
  "carrying-document",
  "typing-laptop",
  "lightbulb-idea",
  "headphones-listening",
  "pointing-left",
  "pointing-right",
  "graduation-cap",
  "thumbs-up",
  "reading-book",
  "trophy-celebrate",
  "sleeping",
  "jetpack-flying",
] as const;
export type Pose = (typeof POSES)[number];
export const poseSrc = (p: Pose) => `/mascot/zuke-${p}.webp`;
