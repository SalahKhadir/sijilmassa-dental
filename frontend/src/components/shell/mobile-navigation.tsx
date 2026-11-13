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
import { DataScopeLabel } from "./data-scope-label";
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
          size="icon"
          className="lg:hidden"
          aria-label="Ouvrir le menu de navigation"
        >
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetTitle className="sr-only">Navigation du cabinet</SheetTitle>
        <SheetDescription className="sr-only">
          Accéder aux modules de Sijilmassa Dental.
        </SheetDescription>
        <div className="mt-1 mb-7 pr-12">{brand}</div>
        <Navigation onNavigate={() => setOpen(false)} />
        <p className="mt-auto pt-6 text-xs text-muted-foreground">
          <DataScopeLabel compact />
        </p>
      </SheetContent>
    </Sheet>
  );
}
