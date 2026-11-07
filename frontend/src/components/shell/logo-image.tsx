"use client";

import Image from "next/image";
import { useState } from "react";

export function LogoImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div className="relative size-11 shrink-0">
      <Image
        src={src}
        alt="Logo officiel de Sijilmassa Dental"
        fill
        sizes="44px"
        className="object-contain"
        unoptimized
        onError={() => setFailed(true)}
      />
    </div>
  );
}
