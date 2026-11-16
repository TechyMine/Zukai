import { Asset } from "./Asset";

export function Logo() {
  return (
    <a href="#top" className="flex h-9 items-center gap-2" aria-label="Zukai home">
      <Asset
        src="/brand/logo-mark.webp"
        alt=""
        className="h-9 w-9 object-contain"
        width={36}
        height={36}
      />
      <span className="font-display text-2xl tracking-wide text-primary">ZUKAI</span>
    </a>
  );
}
