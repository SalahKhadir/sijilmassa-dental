# Sijilmassa Dental

Application de gestion d’un cabinet dentaire au Maroc, destinée à fonctionner sur le réseau local du cabinet. **Phase 5 — espace clinique du dentiste, patients et agenda partagé, avec données fictives en mémoire.**

## Démarrer le frontend

Prérequis : Node.js **22.13 ou supérieur** (Node.js 24 LTS conseillé) et **pnpm 12.6.0**. Une connexion Internet est nécessaire pour la première installation des dépendances.

```sh
cd frontend
pnpm install
pnpm dev
```

Ouvrir [http://localhost:3000](http://localhost:3000). Aucune variable d’environnement, clé API, police distante ou base de données n’est nécessaire. Les ressources de l’application sont locales après installation. Le serveur Next.js doit rester actif ; cette phase ne fournit pas de mode PWA avec cache hors ligne.

Pour vérifier la compilation et lancer le résultat localement :

```sh
cd frontend
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm start
```

`pnpm lint` n’accepte aucun avertissement. ESLint 9.39.5 est conservé pour respecter les contraintes des plugins React, imports et accessibilité de `eslint-config-next` ; le registre le signale comme obsolète, mais ces plugins ne déclarent pas encore de compatibilité avec ESLint 10. Le fichier `frontend/pnpm-lock.yaml` fixe les versions résolues ; `pnpm install --frozen-lockfile` permet de reproduire l’installation.

## Périmètre livré

- Next.js App Router, React, TypeScript strict, Tailwind CSS 4, ESLint et icônes Lucide.
- Composants shadcn/ui installés manuellement et adaptés : `Button`, `Card` et `Sheet` (primitives Radix). Configuration dans `frontend/components.json` ; aucun kit Stageshow utilisé dans les écrans fonctionnels. Référence : [installation manuelle shadcn/ui](https://ui.shadcn.com/docs/installation/manual).
- Navigation de bureau, tiroir modal sur mobile et tablette, barre supérieure, état actif et lien d’évitement au contenu.
- Tableau de bord de démonstration, quatre indicateurs, liste de rendez-vous et accès rapides.
- Pages d’attente pour les trois autres modules ; chargement, erreur récupérable, page 404 et état de liste vide réutilisable.
- Interface française, conventions `fr-MA`, montants affichés en MAD, typographie système.

| Route | Écran |
| --- | --- |
| `/login` | Prototype de connexion |
| `/` | Tableau de bord |
| `/patients` | Patients |
| `/rendez-vous` | Calendrier du cabinet |
| `/consultations` | Annuaire clinique, brouillons et consultations terminées |
| `/patients/[id]/clinique` | Questionnaire rapporté et historique clinique du patient |
| `/facturation` | Facturation |
| `/documents` | Documents |
| `/parametres` | Paramètres |

## Organisation

```text
frontend/
├── src/app/                 # Layout racine, /login et groupe (cabinet)
├── src/components/ui/       # Primitives shadcn/ui adaptées au projet
├── src/components/shell/    # Identité, navigation et barre supérieure
├── src/components/dashboard/
├── src/data/dashboard.ts    # Données entièrement fictives et typées
├── src/lib/                 # Navigation, formatage et utilitaire de classes
├── components.json
└── pnpm-lock.yaml
```

Les entrées de routes et les layouts utilisent des Server Components. Les vues qui consultent les dépôts mémoire partagés, les formulaires, les interactions de navigation et la reprise après erreur utilisent des Client Components.

## Design system

`frontend/src/app/globals.css` est la source unique des 16 couleurs canoniques définies dans `AGENTS.md`. Les variables sémantiques shadcn/ui y sont dérivées, puis exposées à Tailwind par `@theme inline`. Le jeton `--accent` reste l’or canonique ; pour les sélections de navigation, `--sidebar-accent` utilise la teinte bordeaux. Les nouveaux composants shadcn/ui doivent être adaptés à ces associations plutôt que remplacer la palette.

La typographie utilise Arial/Helvetica/sans-serif, sans téléchargement. Les couleurs de statut s’accompagnent d’un libellé et d’une icône. L’or est décoratif ; le texte courant utilise `--text` ou `--text-muted`. Les indicateurs de focus utilisent le bordeaux et les mouvements respectent `prefers-reduced-motion`.

## Données et limites

Le montant financier dans `frontend/src/data/dashboard.ts` reste une illustration fixe datée du 7 novembre 2026. Les compteurs patients et rendez-vous ainsi que la liste du tableau de bord lisent les dépôts partagés. Les montants source sont des entiers en centimes et leur conversion sert uniquement à l’affichage.

Les liens rapides ouvrent l’annuaire patients, l’agenda partagé et les modules en préparation. Le formulaire `/login` utilise React Hook Form et Zod pour valider des valeurs fictives. Son service typé renvoie l’état « indisponible » et un message explicite sur la future intégration Spring Boot. Le mot de passe est effacé après soumission. Le tableau de bord reste accessible comme aperçu de développement.

Le répertoire `backend/` reste réservé aux phases futures. `docs/` contient les consignes de sélection des composants visuels. Aucun déploiement, Docker ou schéma de base de données n’est ajouté. Le dépôt distinct `kaoutar_facturation` reste inchangé. La phase 5 conserve des données fictives en mémoire.

## Validation de la phase 1

Contrôles exécutés avec succès : `pnpm install`, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` et `pnpm peers check`.

Vérification navigateur sur la compilation de production : sept routes, sélection active, page 404, formats 1440/768/390/320 px, ouverture et fermeture du tiroir, focus clavier, Échap, fermeture après navigation et passage vers le bureau avec tiroir ouvert. Aucun débordement horizontal, erreur JavaScript ou appel réseau externe détecté. Les captures bureau et mobile ont été inspectées visuellement. Les 16 couleurs canoniques ont été vérifiées et les associations texte/fond contrôlées atteignent un contraste d’au moins 4,5:1. Ces contrôles ciblés ne constituent pas un audit complet d’accessibilité.

Les états de chargement, d’erreur et de liste vide sont présents dans le code ; le jeu statique ne déclenche pas naturellement ces cas. Les vérifications navigateur ont été ponctuelles et n’ajoutent pas de dépendance de test au projet.


## Identité et connexion — phase 2

Ouvrir [http://localhost:3000/login](http://localhost:3000/login) pour le prototype de connexion. Le groupe de routes `src/app/(cabinet)/` conserve les URL et le shell de la phase 1. `/login` dispose d’une composition indépendante avec panneau bordeaux et formulaire blanc, puis une colonne sur les petits écrans.

Le fichier officiel est attendu dans `frontend/public/branding/sijilmassa-dental-logo.svg`, ou avec son extension réelle `.png` ou `.webp`. La détection privilégie SVG, puis PNG, puis WebP. Après ajout, relancer le serveur de développement ou reconstruire le frontend. Le composant utilise `next/image`, conserve le ratio et les couleurs, et affiche un texte de repli en cas d’absence ou d’échec de chargement. Le logo officiel PNG fourni est intégré sans modification dans la barre latérale, le tiroir et la page de connexion.

Les champs possèdent des libellés, une validation obligatoire, des messages associés, un focus visible et des attributs d’autocomplétion. Le bouton d’affichage du mot de passe expose son état. Les contrôles attendent l’hydratation pour que la soumission passe par le gestionnaire React. Une soumission valide affiche l’indisponibilité du service, puis efface le mot de passe et rétablit son masquage.

`src/lib/auth/login-schema.ts` définit les entrées et `src/lib/auth/authentication-service.ts` expose le port `AuthenticationService`. Son contrat provisoire renvoie uniquement `unavailable`. Le contrat et l’adaptateur seront complétés lorsque l’API Spring Boot sera définie. Le prototype conserve les valeurs seulement dans le formulaire en mémoire. Les routes de démonstration restent accessibles librement.

Les dépendances ajoutées sont `react-hook-form`, `zod` et `@hookform/resolvers`. Les règles de sélection des effets et les ressources examinées sont documentées dans [les consignes des composants visuels](docs/ui-component-guidelines.md).


## Validation de la phase 2

Les commandes `pnpm lint`, `pnpm exec tsc --noEmit` et `pnpm build` passent. `pnpm test` utilise le runner natif de Node.js et vérifie les champs obligatoires, la normalisation de l’identifiant, la conservation exacte du mot de passe lors de la validation et les réponses toujours indisponibles du service provisoire.

Les contrôles Chromium couvrent la page `/login` à 1440, 768, 390 et 320 px, les erreurs associées aux champs, le focus, le clavier, le bouton d’affichage du mot de passe, l’état de soumission, le message d’indisponibilité et l’effacement du mot de passe. Le repli textuel avec logo absent, les contrôles inactifs sans JavaScript et la réduction des mouvements ont été vérifiés. Les captures bureau et mobile ont été inspectées. Les sept routes de la phase 1, la page 404 et le tiroir mobile passent aussi les contrôles de non-régression.

Le rendu du logo officiel PNG et le repli textuel après échec de chargement ont été contrôlés. Les 16 valeurs de couleur canoniques sont conservées.


## Gestion des patients — phase 3

`/patients` propose un annuaire de 20 dossiers fictifs avec recherche, tri, filtre administratif et pagination. Les fiches présentent les rubriques personnelles du formulaire du cabinet. Un écran dédié au prototype dentiste contient les antécédents, les allergies, les réponses Oui/Non/non renseignées et un historique fictif de traitements et paiements en lecture seule.

La création utilise un formulaire en quatre étapes. La modification administrative conserve les réponses de santé, tandis que le formulaire du dossier dentiste permet leur modification explicite. Les changements restent dans la mémoire de l’onglet pendant la navigation et sont réinitialisés au rechargement. Les confirmations précisent cette durée de vie.

Les modèles, fixtures, règles de validation et dépôt sont séparés des composants. La CIN est masquée dans les vues générales et exclue de la recherche. Les accès futurs au questionnaire nécessiteront une autorisation côté Spring Boot. Les détails des références PDF consultées, des écrans et des limites sont documentés dans [la documentation patients](docs/patient-management.md).

```sh
cd frontend
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

Les tests utilisent le runner Node existant, avec `tsx` pour TypeScript/React et Playwright pour les parcours navigateur. Le script navigateur gère son serveur local sur le port 3100.

La validation de la phase 3 comprend `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`, 20 tests de logique et de rendu avec `pnpm test`, et trois parcours Chromium avec `pnpm test:browser`. Les captures responsive ont été inspectées. La liste des fichiers concernés et les limites de l’état mémoire figurent dans la documentation patients.


## Agenda partagé — phase 4

`/rendez-vous` fournit les vues jour et semaine, avec un agenda quotidien lisible sur mobile. Les rendez-vous référencent les patients de la phase 3. Les formulaires permettent de créer, modifier et changer explicitement les statuts, avec des messages de conflit indiquant le créneau concerné.

Les horaires et durées du prototype sont configurés dans `frontend/src/lib/appointments/schedule.ts` et indiqués à l’écran comme exemples de développement. Les rendez-vous adjacents sont autorisés. Les statuts En attente, Confirmé et Terminé bloquent les créneaux, tandis que les entrées Annulé et Absent restent dans l’historique et libèrent leur créneau.

Les fiches administratives affichent les rendez-vous du patient et permettent de le présélectionner. Les compteurs du tableau de bord et de l’annuaire utilisent le même état mémoire. La navigation le conserve, tandis qu’un rechargement le réinitialise. Le futur backend devra valider les conflits de façon autoritaire entre plusieurs utilisateurs.

Les modèles, choix de présentation, règles de statut, tests et fichiers concernés sont détaillés dans [la documentation rendez-vous](docs/appointment-management.md).

La validation de phase 4 passe pour le lint, TypeScript, le build, 42 tests de logique/rendu et cinq parcours Chromium, avec contrôle visuel du calendrier sur bureau et mobile. Les limites restent celles d’un état mémoire par onglet et d’une validation de conflit qui devra être rendue autoritaire côté Spring Boot.


## Espace clinique du dentiste — phase 5

`/consultations` fournit la recherche par patient ou référence, les filtres de statut et le tri chronologique. `/patients/[id]/clinique` réutilise le questionnaire du dépôt patients et présente les consultations du patient. Le dossier administratif propose un accès identifié comme espace dentiste.

Le formulaire crée un brouillon avec un patient, une date et un motif. Il accepte les observations, l’évaluation, le plan, les notes et plusieurs soins cliniques. Les soins possèdent une date, une description, une référence dentaire libre et des notes. Les entrées enregistrées conservent leurs identifiants. Le patient d’une consultation enregistrée est conservé.

La clôture exige une confirmation et rend le compte rendu et ses soins en lecture seule. Depuis un rendez-vous, la création présélectionne son patient et son identifiant. Un rendez-vous déjà lié ouvre sa consultation existante. Les visites spontanées restent possibles. Les statuts cliniques et d’agenda se gèrent séparément.

Les 20 consultations synthétiques et les écritures restent dans la mémoire de l’onglet jusqu’au rechargement. Les écrans administratifs affichent uniquement un point d’entrée clinique. Les autorisations DENTIST/RECEPTIONIST, la persistance, les corrections de dossiers terminés et l’audit devront être appliqués côté Spring Boot.

Les références papier consultées, modèles, routes, choix de validation et fichiers concernés sont détaillés dans [la documentation clinique](docs/clinical-workspace.md). Les tableaux financiers fictifs existants restent en lecture seule et distincts des nouveaux soins.

La validation de phase 5 passe pour le lint, TypeScript, la compilation de production, 60 tests de logique/rendu et sept parcours Chromium. Les parcours existants patients, agenda et connexion passent également. Les captures de l’espace clinique ont été inspectées sur bureau et mobile. Le harnais permet de sélectionner un Chromium installé avec `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
