# Audit de l’interface du cabinet — phase 9.3A

## Périmètre et méthode

Les captures initiales ont été prises sur le code de départ, avant les retouches. L’audit utilise les routes du cabinet et deux comptes de test, Dentiste et Accueil, dans le harnais Playwright du dépôt. Le build Next.js communique avec Spring Boot et une base PostgreSQL 17.11 jetable sous Podman. Le lanceur vérifie les migrations V1 à V12, le schéma JPA, la disponibilité du backend et le refus des requêtes anonymes. Les noms, rendez-vous, soins et documents sont fictifs.

Les dimensions de la matrice sont 1440 × 900, 1280 × 800, 768 × 1024 et 390 × 844. Le dialogue CNOPS est aussi testé à 390 × 500. Les scénarios historiques conservent leurs dimensions propres. Les captures sont dans [test-results/phase-9.3a](../frontend/test-results/phase-9.3a), ignoré par Git. Le dossier `before` contient les relevés initiaux. `before-comparison` contient les prises complémentaires sur le build de départ conservé. `after` contient le rendu corrigé. Les fichiers `layout.json` consignent la largeur de débordement de page et les limites des dialogues. Les images jointes aux constats ont été ouvertes et comparées. Les fichiers portant le suffixe `-detail` montrent une zone située plus bas dans la page.

| Parcours | Rôle | Captures de la matrice et vérifications complémentaires |
| --- | --- | --- |
| Connexion | Anonyme | `guest-*-login`, validation vide, affichage du mot de passe, soumission en cours et identifiants refusés par le backend. Parcours de session testés dans `authentication.test.mjs`. |
| Tableau de bord `/` | Dentiste | `dentist-*-dashboard` aux quatre tailles. Indicateurs, accès rapide à l’agenda et à la facturation, aperçu sans rendez-vous. L’accueil ouvre son agenda. |
| Annuaire `/patients` | Dentiste et Accueil | `*-directory` aux quatre tailles. Annuaire de 22 patients, nom long, recherche vide, chargement et commandes de pagination. |
| Fiche, création et dossier patient | Dentiste et Accueil pour l’administratif, Dentiste pour le dossier de santé | Bureau et mobile, `*-patient`, `*-patient-wizard`, `*-patient-validation`, `*-questionnaire`. Le parcours du dossier vérifie le téléchargement A5 et le refus à l’accueil. |
| Agenda et rendez-vous | Dentiste et Accueil | `*-calendar` aux quatre tailles, grille jour et semaine, agenda mobile, création et modification au bureau et sur mobile. Les tests persistants couvrent chevauchement, conflit de version et changement d’heure. `appointment-outage` et `appointment-time-validation` montrent les retours associés. |
| Consultations | Dentiste | Bureau et mobile, répertoire, édition du brouillon et compte rendu avec soins tarifés et référence dentaire longue. `consultation-pricing` et `consultation-confirmation` montrent la tarification et la clôture. |
| Ordonnances | Dentiste | Bureau et mobile, historique patient et édition. `prescription-confirmation` montre le dialogue. Les parcours persistants vérifient la saisie des médicaments, l’ordonnance finalisée, le téléchargement A5 et l’impression. |
| Finances | Dentiste et Accueil | Bureau et mobile, `*-finances` et `*-payment`, totaux, registre, détail d’encaissement. `payment-confirmation` et `payment-success` montrent la confirmation et son résultat. Les tests couvrent le verso, l’historique et la reprise sur conflit. |
| Facturation | Dentiste et Accueil | Bureau et mobile, recherche par patient, historique vide et sélection de soins. `invoice-creation-review`, `invoice-issuance` et `invoice-issued` suivent le brouillon et son émission. Les tests couvrent aussi l’édition et les commandes PDF. |
| Assurance | Dentiste | Bureau et mobile, historique, formulaires CNSS, CNOPS et FAR, états désactivés et dialogue CNOPS dense. Les parcours persistants couvrent l’édition, la finalisation et les PDF. Les captures complémentaires montrent les commandes CNSS/CNOPS, l’aperçu CNOPS et le blocage FAR. |
| Structure du cabinet | Dentiste et Accueil | En-tête, rôle et navigation dans les captures authentifiées. `*-mobile-navigation` montre le tiroir. Le test contrôle l’ouverture au clavier, Échap et le retour du focus. Le refus d’accès Dentiste à l’accueil et la page introuvable authentifiée ont été capturés sur mobile. Le harnais vérifie aussi une panne réelle. |

## Constats et corrections

| Priorité | Route, rôle et taille | Constat et correction | Preuve avant → après |
| --- | --- | --- | --- |
| Haute | Document CNOPS, Dentiste, mobile | Le récapitulatif et les actions défilaient ensemble. Le dialogue borne sa hauteur au viewport. Le corps est une région nommée qui défile au clavier. Annuler et Confirmer restent visibles. Les motifs de blocage restent listés en clair. | [Comparaison des confirmations](../frontend/test-results/phase-9.3a/confirmation-comparison.jpg) |
| Haute | Annuaire, deux rôles, tablette et mobile | Les en-têtes Référence, Téléphone et Statut se touchaient. Les cellules partagent des espacements et le nom long se replie. Une région nommée permet d’atteindre toutes les colonnes au clavier. Le registre des soins et les factures réutilisent cette présentation. | `dentist-tablet-directory`, `dentist-mobile-directory`, `receptionist-mobile-finances` |
| Haute | En-tête et tiroir, deux rôles, mobile | Le titre « Consultations » était tronqué et le tiroir indiquait une ancienne phase de démonstration. Le menu et la déconnexion utilisent des cibles de 44 px, nommées pour les lecteurs d’écran. Le rôle reste visible. Le tiroir indique la portée des données. | `dentist-mobile-consultation-treatments`, `dentist-mobile-navigation`, `receptionist-mobile-navigation` |
| Haute | Route introuvable, Dentiste, mobile | Deux en-têtes et deux zones principales s’affichaient. La page introuvable utilise la structure du cabinet une seule fois. Le bandeau de démonstration est réservé aux routes de démonstration. | `dentist-mobile-not-found` |
| Moyenne | Connexion et dossier de santé, anonyme et Dentiste, mobile | L’avis annonçait des données fictives dans les modules métier. Il indique désormais quel compte utiliser. Le dossier de santé et la révision du formulaire identifient l’accès Dentiste, avec une mention distincte dans les démonstrations. Le bouton de visibilité rejoint les autres commandes à icône et le bouton de soumission signale l’attente. | `guest-mobile-login`, `guest-mobile-login-validation`, `dentist-mobile-questionnaire` |
| Moyenne | Consultation et dossier patient, Dentiste, bureau et mobile | L’indicateur de statut et l’action d’édition se répartissaient comme deux blocs indépendants. Les actions et statuts se regroupent et passent à la ligne ensemble. Les noms longs restent lisibles. Les étapes de création patient occupent deux colonnes sur mobile pour libérer de la place au formulaire. | `consultation-pricing`, `dentist-mobile-consultation-treatments`, `dentist-mobile-patient-validation` |
| Moyenne | Agenda, deux rôles, quatre tailles | La ligne de contexte répétait le titre et les boutons précédent/suivant occupaient chacun la largeur d’une action textuelle. L’heure du cabinet figure dans le sous-titre. Les commandes à icône ont une taille uniforme et conservent leur nom accessible. | `dentist-desktop-calendar-week`, `receptionist-laptop-calendar`, `receptionist-mobile-calendar` |
| Moyenne | Formulaires, deux rôles, bureau et mobile | Les champs de saisie, listes déroulantes et zones de texte avaient des tailles et états d’erreur différents. Les contrôles partagent leurs styles de bordure, de focus et d’invalidation. Le paiement place ses deux champs sur toute la largeur mobile. Les cases FDI ont une cible élargie et un état coché explicite. | `dentist-mobile-patient-validation`, `receptionist-mobile-payment-detail`, `dentist-mobile-insurance-cnops-detail` |
| Moyenne | Patients, rendez-vous et documents, rôles autorisés | Les messages de chargement occupaient une ligne seule, et les erreurs de lecture changeaient de présentation selon le module. Les squelettes annoncent le chargement dans une région live. Les alertes et actions de reprise partagent un panneau. | `dentist-desktop-directory-loading`, `dentist-desktop-directory-empty`, `appointment-outage` |

## Composants et accessibilité

- `Button` conserve la hauteur de 44 px, normalise les variantes et distingue le retrait d’un soin par la variante destructive. Les confirmations et la connexion associent le texte d’attente à `aria-busy`. La réduction des mouvements couvre l’indicateur.
- `Input`, `Select` et `Textarea` gardent leurs contrôles natifs. Les champs invalides ont une bordure dédiée et le formulaire conserve les associations de messages et règles de validation.
- `DialogPanel` réunit la présentation des confirmations clinique, paiement, ordonnance, facture et assurance. Radix garde le piégeage du focus et Échap. Les règles de confirmation et de récupération restent celles des écrans existants.
- `ScrollableTable` garde les légendes, en-têtes, montants alignés et colonnes consultables. `ListLoading` et `ReadError` regroupent les styles de retour de lecture. `PageHeading` groupe les actions et les statuts.
- Rapports calculés sur les jetons utilisés. Texte atténué sur fond chaud 5,86:1, texte danger sur blanc 4,95:1 et sur fond chaud 4,64:1, bordeaux sur sa teinte 10,90:1, bordure des champs sur blanc 3,72:1 et sur fond chaud 3,49:1. Les valeurs canoniques restent celles du guide du dépôt.

## Limites et suivi 9.3B

- Le délai intermittent autour de « Actualiser les finances », signalé en 9.2C, reste au suivi même si un passage de la suite réussit. Voir [l’intégration des PDF d’assurance](insurance-pdf-integration.md).
- Sur la fiche de santé d’un patient archivé, le code transmet `disabled` à un lien via `Button asChild`. Un lien HTML ne prend pas en charge cet attribut. L’écran de modification bloque la saisie et les tests vérifient ce blocage. La commande de navigation elle-même reste à traiter en 9.3B.
- La génération du PDF FAR reste bloquée en attendant les règles métier. Le parcours existant vérifie l’explication affichée et le refus HTTP correspondant.
- Dans le cas d’une heure inexistante au changement d’heure, le formulaire de rendez-vous peut afficher deux messages pour le même créneau. Voir `appointment-time-validation`.
- Les tableaux de facturation et de finances restent défilants sur écran étroit. La lecture simultanée de toutes les colonnes nécessite un écran plus large.
- La matrice ne couvre pas chaque combinaison d’écran et de taille. Le lecteur PDF natif est vérifié par le parcours navigateur. Les captures de PDF portent sur les commandes de la page du cabinet et l’emplacement de l’aperçu CNOPS. La vue 404 anonyme redirige vers la connexion. Le rendu de la page d’erreur React de segment et l’usage avec un lecteur d’écran restent à vérifier. L’application présente le rôle et une commande de déconnexion dans l’en-tête. Les retours de notification observés sont des messages intégrés aux écrans.

## Vérification

Le build et les tests nécessitant des processus locaux ont été exécutés dans une copie temporaire sans configuration du cabinet. Le build initial dans le répertoire de travail a rencontré une restriction de port local de Turbopack. Le build final utilise Turbopack et le CLI Next.js installé. Les tests du moteur d’ordonnance nécessitent également la création de processus enfants.

| Vérification | Commande ou sélection | Résultat |
| --- | --- | --- |
| Tests ciblés | `node --import tsx --test --experimental-test-isolation=none tests/*components.test.mjs tests/authentication.test.mjs tests/financial.test.mjs tests/persistent-insurance.test.mjs` | 61/61 |
| Suite frontend | `node --import tsx --test --experimental-test-isolation=none tests/*.test.mjs`, commande de `pnpm test` | 368/368 |
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Réussi |
| ESLint | `pnpm lint` | Réussi, zéro avertissement |
| Production Next.js | `node node_modules/next/dist/bin/next build` | Réussi |
| Parcours métier Playwright | `node tests/browser/run-real-integration.mjs` avec trois sélections `BROWSER_TEST_FILE` | 41/41. Rendez-vous, clinique, dossier et finances 17/17. Assurance et factures 14/14. Ordonnances 10/10. |
| Connexion et patients Playwright | `authentication.test.mjs` puis `persistent-patients.test.mjs`, bases jetables distinctes | 5/5 et 5/5 |
| Matrice Playwright | `BROWSER_TEST_FILE=ui-stabilization.test.mjs node tests/browser/run-real-integration.mjs` | 1/1. 92 états mesurés. Aucun débordement horizontal de page ni dialogue hors viewport. Vérification du focus et du défilement clavier. |
| Relecture visuelle | [Navigation](../frontend/test-results/phase-9.3a/navigation-comparison.jpg), [tableaux](../frontend/test-results/phase-9.3a/tables-comparison.jpg), [formulaires](../frontend/test-results/phase-9.3a/forms-comparison.jpg), [confirmations](../frontend/test-results/phase-9.3a/confirmation-comparison.jpg), [accès](../frontend/test-results/phase-9.3a/access-comparison.jpg), [dossier de santé](../frontend/test-results/phase-9.3a/questionnaire-comparison.jpg), [assurance et PDF](../frontend/test-results/phase-9.3a/insurance-pdf-comparison.jpg) | Comparaisons ouvertes et inspectées |
| Git | `git diff --check` et `git status` | [Liste des fichiers modifiés](../frontend/test-results/phase-9.3a/changed-files.txt) |

Pour reproduire les captures de la matrice, définir `SIJ_AUDIT_DIR` vers un dossier ignoré et reprendre les prérequis du [harnais d’intégration](patient-frontend-integration.md#préparation-automatique-isolée). Le mode `ready` du moteur d’ordonnance a servi aux parcours PDF persistants. Les exécutions regroupées ont rencontré des HTTP 429 lors de la connexion dans les parcours patient et assurance. Les lots isolés utilisent des bases distinctes et gardent le limiteur actif.

Le contrôle de panne du harnais a arrêté Spring Boot après les parcours. Le proxy a renvoyé des réponses 503 sans cache, les écrans ont affiché l’indisponibilité et les contrôles de stockage navigateur et de journaux ont réussi. Le backend a été compilé pour le lanceur de test. La suite Maven n’a pas été relancée puisque le diff ne contient aucun changement backend.
