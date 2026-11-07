import { getLogoSource } from "@/lib/branding";
import { LogoImage } from "./logo-image";
import { cn } from "@/lib/utils";

export function Brand({ className }: { className?: string }) {
  const source = getLogoSource();
  return (
    <div className={cn("flex w-full max-w-64 items-center gap-3", className)}>
      {source && <LogoImage key={source} src={source} />}
      <div>
        <p className="whitespace-nowrap text-base font-bold tracking-tight text-primary">
          Sijilmassa Dental
        </p>
        <p className="mt-1 text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
          Gestion du cabinet
        </p>
      </div>
    </div>
  );
}
