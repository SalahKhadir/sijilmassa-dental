import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";
import { readServerSession } from "@/lib/auth/server-session";
export const metadata: Metadata = {
  title: {
    default: "Tableau de bord | Sijilmassa Dental",
    template: "%s | Sijilmassa Dental",
  },
  description: "Espace de gestion du cabinet dentaire Sijilmassa Dental.",
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const initial = await readServerSession();
  return (
    <html lang="fr-MA">
      <body>
        <a
          href="#contenu"
          className="fixed top-3 left-3 z-[100] -translate-y-24 rounded-lg bg-primary px-4 py-3 text-primary-foreground focus:translate-y-0"
        >
          Aller au contenu principal
        </a>
        <AuthProvider initial={initial}>{children}</AuthProvider>
      </body>
    </html>
  );
}
