import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readServerSession } from "@/lib/auth/server-session";
import { dashboardFor } from "@/lib/auth/permissions";
import { SessionBoundary } from "@/components/auth/session-boundary";
import {
  CalendarDays,
  FolderHeart,
  ReceiptText,
} from "lucide-react";
import { Brand } from "@/components/shell/brand";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage() {
  const session = await readServerSession();
  if (session.status === "authenticated") redirect(dashboardFor(session.user.role));
  return (
    <main
      id="contenu"
      tabIndex={-1}
      className="min-h-dvh outline-none lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"
    >
      <section
        aria-label="Sijilmassa Dental, gestion du cabinet"
        className="relative flex flex-col justify-between overflow-hidden bg-primary px-6 py-5 text-primary-foreground sm:px-12 lg:min-h-dvh lg:p-14 xl:p-20"
      >
        <div className="relative z-10 w-fit max-w-full rounded-xl bg-surface px-5 py-4">
          <Brand />
        </div>
        <div className="relative z-10 hidden max-w-lg py-16 lg:block">
          <span
            aria-hidden="true"
            className="mb-7 hidden h-1 w-10 rounded-full bg-accent lg:block"
          />
          <p className="mb-4 hidden text-xs font-semibold tracking-[0.18em] text-primary-tint uppercase lg:block">
            L’espace de votre cabinet
          </p>
          <h2 className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl lg:text-4xl xl:text-5xl">
            Votre cabinet.
            <br className="hidden lg:block" /> Une journée bien organisée.
          </h2>
          <p className="mt-5 hidden max-w-sm text-base leading-7 text-primary-tint lg:block">
            Un espace commun pour accompagner le quotidien du dentiste et de
            l’accueil.
          </p>
          <ul className="mt-10 hidden space-y-5 text-sm text-primary-tint lg:block">
            <li className="flex items-center gap-3">
              <CalendarDays className="size-5" aria-hidden="true" />
              L’agenda de votre journée
            </li>
            <li className="flex items-center gap-3">
              <FolderHeart className="size-5" aria-hidden="true" />
              Les repères de votre cabinet
            </li>
            <li className="flex items-center gap-3">
              <ReceiptText className="size-5" aria-hidden="true" />
              Le suivi administratif
            </li>
          </ul>
        </div>
        <p className="relative z-10 hidden text-xs text-primary-tint lg:block">
          Sijilmassa Dental · Pensé pour le quotidien du cabinet
        </p>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -bottom-40 hidden size-[30rem] rounded-full border border-primary-light/40 lg:block"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -bottom-24 hidden size-[22rem] rounded-full border border-primary-light/40 lg:block"
        />
      </section>
      <section
        aria-labelledby="login-title"
        className="flex flex-col justify-center bg-surface px-6 py-10 sm:px-12 sm:py-14 lg:px-16 xl:px-24"
      >
        <div className="mx-auto w-full max-w-md">
          <p className="mb-3 text-xs font-semibold tracking-widest text-secondary uppercase">
            Bienvenue au cabinet
          </p>
          <h1 id="login-title" className="text-3xl font-bold tracking-tight">
            Connexion
          </h1>
          <p className="mt-3 mb-8 text-sm leading-6 text-muted-foreground">
            Retrouvez votre espace Sijilmassa Dental.
          </p>
          <SessionBoundary login><LoginForm /></SessionBoundary>
          <div className="mt-8 border-t pt-6">
            <p className="text-xs leading-5 text-muted-foreground">Accès réservé aux comptes créés localement. Aucun compte ne peut être créé depuis cette page.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
