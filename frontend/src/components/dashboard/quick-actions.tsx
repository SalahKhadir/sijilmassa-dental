import Link from "next/link";
import {
  ArrowRight,
  CalendarPlus,
  UsersRound,
  ReceiptText,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
const actions = [
  {
    href: "/rendez-vous",
    title: "Ouvrir l’agenda",
    detail: "Préparer votre journée",
    icon: CalendarPlus,
  },
  {
    href: "/patients",
    title: "Accéder aux patients",
    detail: "Espace administratif",
    icon: UsersRound,
  },
  {
    href: "/facturation",
    title: "Ouvrir la facturation",
    detail: "Factures et paiements",
    icon: ReceiptText,
  },
];
export function QuickActions({ demo = false }: { demo?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Accès rapides</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.map(({ href, title, detail, icon: Icon }) => (
          <Link
            key={href}
            href={demo && ["/patients", "/rendez-vous"].includes(href) ? `/demo${href}` : href}
            className="group flex items-center gap-3 rounded-lg border p-3 hover:border-primary/30 hover:bg-primary-tint/30"
          >
            <span className="rounded-lg bg-muted p-2.5 text-primary">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">{title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {detail}
              </span>
            </span>
            <ArrowRight
              aria-hidden="true"
              className="size-4 text-muted-foreground group-hover:text-primary"
            />
          </Link>
        ))}
        <p className="pt-3 text-xs leading-5 text-muted-foreground">
          Ces accès ouvrent les modules en préparation. La saisie sera ajoutée
          ultérieurement.
        </p>
      </CardContent>
    </Card>
  );
}
