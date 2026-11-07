import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Tableau de bord | Sijilmassa Dental",
    template: "%s | Sijilmassa Dental",
  },
  description: "Espace de gestion du cabinet dentaire Sijilmassa Dental.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr-MA">
      <body>
        <a
          href="#contenu"
          className="fixed top-3 left-3 z-[100] -translate-y-24 rounded-lg bg-primary px-4 py-3 text-primary-foreground focus:translate-y-0"
        >
          Aller au contenu principal
        </a>
        {children}
      </body>
    </html>
  );
}
