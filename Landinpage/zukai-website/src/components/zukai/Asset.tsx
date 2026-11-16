import { useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Image that falls back to a labeled placeholder box when the file is missing. */
export function Asset({
  src,
  className,
  alt,
  ...rest
}: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const [broken, setBroken] = useState(false);
  if (broken)
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-dashed border-border bg-card p-2 text-center text-xs text-muted-foreground",
          className,
        )}
      >
        {src.split("/").pop()}
      </div>
    );
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setBroken(true)}
      className={className}
      draggable={false}
      {...rest}
    />
  );
}
