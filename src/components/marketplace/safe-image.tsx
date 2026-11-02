"use client";

import { useState } from "react";
import { CarFront, Bike, Wrench } from "lucide-react";

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  category?: "CAR" | "MOTOR" | "SPARE_PART" | string;
  fallbackSrc?: string;
}

export function SafeImage({
  src,
  alt = "",
  className = "",
  category = "CAR",
  fallbackSrc,
  ...props
}: SafeImageProps) {
  const [hasError, setHasError] = useState(false);
  const [triedFallback, setTriedFallback] = useState(false);

  if (!src || (hasError && (!fallbackSrc || triedFallback))) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 select-none ${className}`}
        aria-label={alt}
      >
        {category === "MOTOR" ? (
          <Bike className="h-10 w-10 stroke-[1.5]" aria-hidden />
        ) : category === "SPARE_PART" ? (
          <Wrench className="h-10 w-10 stroke-[1.5]" aria-hidden />
        ) : (
          <CarFront className="h-10 w-10 stroke-[1.5]" aria-hidden />
        )}
      </div>
    );
  }

  const currentSrc = hasError && fallbackSrc && !triedFallback ? fallbackSrc : src;

  return (
    <img
      {...props}
      src={currentSrc}
      alt={alt}
      className={className}
      onError={() => {
        if (!hasError && fallbackSrc && !triedFallback) {
          setHasError(true);
        } else {
          setTriedFallback(true);
          setHasError(true);
        }
      }}
    />
  );
}
