"use client";

import Image from "next/image";

function optimizeRemoteUrl(src: string, width = 800): string {
  if (!src) return src;
  try {
    const url = new URL(src);
    if (url.hostname === "images.unsplash.com") {
      url.searchParams.set("w", String(width));
      url.searchParams.set("q", "80");
      url.searchParams.set("auto", "format");
      url.searchParams.set("fit", "crop");
      return url.toString();
    }
  } catch {
    return src;
  }
  return src;
}

type OptimizedImageProps = {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
  sizes?: string;
  width?: number;
  quality?: number;
};

export default function OptimizedImage({
  src,
  alt,
  priority = false,
  className = "object-cover",
  sizes = "(max-width: 768px) 100vw, 33vw",
  width = 800,
  quality = 80,
}: OptimizedImageProps) {
  if (!src) return null;

  const optimizedSrc = optimizeRemoteUrl(src, width);

  return (
    <Image
      src={optimizedSrc}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      quality={quality}
      className={className}
      unoptimized
    />
  );
}
