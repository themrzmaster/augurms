"use client";

import { useState } from "react";
import { SPRITES } from "@/lib/cosmic";

interface SpriteImageProps {
  type: "item" | "mob" | "npc";
  id: number;
  size?: number;
  className?: string;
}

export default function SpriteImage({
  type,
  id,
  size = 40,
  className = "",
}: SpriteImageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  const src = SPRITES[type](id);

  if (status === "error") {
    return (
      <div
        className={`flex items-center justify-center rounded bg-bg-card text-text-muted ${className}`}
        style={{ width: size, height: size }}
      >
        <span className="text-xs">?</span>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {/* Loading skeleton */}
      {status === "loading" && (
        <div className="absolute inset-0 animate-pulse rounded bg-bg-card-hover" />
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${type} ${id}`}
        width={size}
        height={size}
        className={`sprite-render object-contain transition-opacity duration-200 ${
          status === "loaded" ? "opacity-100" : "opacity-0"
        }`}
        style={{ width: size, height: size }}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        draggable={false}
      />
    </div>
  );
}
