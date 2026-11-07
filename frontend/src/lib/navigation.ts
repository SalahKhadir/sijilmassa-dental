export const navigation = [
  {
    href: "/",
    label: "Tableau de bord",
    icon: "dashboard",
    description: "Une vue d’ensemble de votre cabinet.",
  },
  {
    href: "/patients",
    label: "Patients",
    icon: "patients",
    description: "Gérez les dossiers administratifs de vos patients.",
  },
  {
    href: "/rendez-vous",
    label: "Rendez-vous",
    icon: "calendar",
    description: "Organisez les consultations du cabinet.",
  },
  {
    href: "/consultations",
    label: "Consultations",
    icon: "consultations",
    description: "Suivez les consultations et les soins de vos patients.",
  },
  {
    href: "/facturation",
    label: "Facturation",
    icon: "billing",
    description:
      "Gérez les factures et les règlements du cabinet.",
  },
  {
    href: "/documents",
    label: "Documents",
    icon: "documents",
    description:
      "Retrouvez les ordonnances et préparez leur impression.",
  },
  {
    href: "/parametres",
    label: "Paramètres",
    icon: "settings",
    description:
      "Les réglages du cabinet seront disponibles dans une prochaine phase.",
  },
] as const;
