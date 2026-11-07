"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Navigation } from "./navigation";
export function MobileNavigation({ brand }: { brand: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          className="px-2 lg:hidden"
          aria-label="Ouvrir le menu de navigation"
        >
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetTitle className="sr-only">Navigation du cabinet</SheetTitle>
        <SheetDescription className="sr-only">
          Accéder aux modules de Sijilmassa Dental.
        </SheetDescription>
        <div className="mt-14 mb-8">{brand}</div>
        <Navigation onNavigate={() => setOpen(false)} />
        <p className="mt-auto pt-8 text-xs text-muted-foreground">
          Phase 7 · Démonstration
        </p>
      </SheetContent>
    </Sheet>
  );
}
