# Facturation, paiements et suivi financier — phase 7

## Périmètre

Le frontend gère des brouillons de factures, leur émission, des règlements successifs et l’annulation des factures sans règlement. Toutes les données sont fictives. Les écritures restent dans la mémoire de l’onglet pendant la navigation Next.js et disparaissent au rechargement. Les autres phases sont conservées.

Routes disponibles : `/facturation`, `/facturation/nouvelle`, `/facturation/[id]` et `/facturation/[id]/modifier`. La création accepte `patientId` et `consultationId` en présélection. Un identifiant inconnu ou une consultation d’un autre patient affiche une erreur explicite.

## Modèles et dépôts

| Modèle | Responsabilité |
| --- | --- |
| `ClinicalTreatment` existant | Faits cliniques, conservés dans le dépôt des consultations |
| `BillableService` | Catalogue facultatif avec suggestion de prix optionnelle |
| `Invoice` | Patient, consultation éventuelle, date, cycle de vie, lignes et métadonnées d’émission/annulation |
| `InvoiceLine` | Copie de la date, de la dent éventuelle, de la désignation et du prix convenu ; références catalogue et soin facultatives |
| `Payment` | Règlement reçu, facture, patient dérivé de la facture, montant, date, mode, référence et note administrative |
| Solde patient | Calcul dérivé des factures émises actives et des règlements, jamais saisi indépendamment |

`InvoiceRepository`, `PaymentRepository` et `BillableServiceRepository` exposent des opérations typées. Une fabrique commune conserve les invariants entre factures et paiements. Les données entrantes sont validées par Zod dans le dépôt, indépendamment des formulaires React Hook Form. Chaque lecture et chaque résultat d’écriture est une copie. Les instances sont isolées.

`BillingProvider` est placé dans le layout cabinet, sous les dépôts patients et consultations. Il conserve une instance et une révision partagée. Le tableau de bord et les historiques lisent les mêmes factures et règlements. Il n’existe aucune écriture dans localStorage, sessionStorage, IndexedDB ou un tableau serveur global.

## Prix et montants

Le dentiste choisit le prix de chaque ligne. Une suggestion de catalogue est copiée à l’ajout puis reste modifiable, y compris à zéro explicite. Une ligne personnalisée ne nécessite aucun catalogue. Le prix effectivement convenu est conservé dans `unitPriceMinor` et les changements ultérieurs du catalogue ne recalculent aucune facture enregistrée.

Le prototype permet par exemple de remplacer une suggestion fictive de 400 DH par 350 DH ou 450 DH. Ces exemples ne représentent pas les tarifs du cabinet. Aucun rôle n’est techniquement appliqué dans cette phase. Spring Boot devra réserver les décisions de prix au rôle DENTIST et définir les opérations autorisées au rôle RECEPTIONIST.

Les montants stockés sont des nombres entiers sûrs de centimes. La conversion des saisies, la multiplication et les sommes passent par BigInt, puis vérifient la limite `Number.MAX_SAFE_INTEGER`. Une émission qui ferait dépasser cette limite aux indicateurs globaux est rejetée avant toute écriture. Le frontend cible ES2020 pour BigInt.

La saisie accepte une virgule ou un point et au maximum deux décimales. Elle refuse les montants négatifs, les séparateurs de milliers, les exposants et les décimales supplémentaires. Aucun arrondi implicite n’est effectué. L’éditeur crée un acte par ligne, avec date obligatoire, numéro de dent facultatif, désignation et prix. Il ne présente plus de quantité ou de prix unitaire générique. Le champ interne `quantity` reste fixé à 1 pour les nouvelles lignes et permet de relire les anciens snapshots. Lorsqu’un ancien brouillon est ouvert, son total de ligne devient le prix unique de l’acte ; une facture déjà émise reste inchangée. L’affichage conserve exactement les deux décimales, même aux limites d’entiers.

Le sous-total et le total sont identiques. Aucun taux, TVA, frais obligatoire ou libellé HT/TTC n’est introduit. Le traitement fiscal devra être confirmé avec le cabinet.

## Cycle de vie et numérotation

Le champ interne `lifecycle` prend BROUILLON, EMISE ou ANNULEE. Le statut affiché ajoute PARTIELLEMENT_PAYEE et PAYEE, dérivés des règlements.

- Un brouillon peut être vide, sans numéro. Ses lignes peuvent être ajoutées, déplacées ou retirées après confirmation. Les lignes conservées gardent leur identifiant et un identifiant retiré n’est pas recyclé. Le patient est conservé après création.
- L’émission exige une confirmation et au moins une ligne complète. Elle attribue le numéro, copie le nom et la référence administrative du patient et verrouille les lignes. Une modification du brouillon pendant la validation bloque l’émission.
- Une facture émise avec solde positif est EMISE sans paiement, puis PARTIELLEMENT_PAYEE après un règlement. Le solde nul donne PAYEE. Une facture explicitement nulle est également PAYEE et indique « Montant nul · Aucun règlement requis », sans créer un règlement fictif.
- L’annulation exige un motif et une confirmation. Elle est réservée aux factures émises sans aucun règlement. Le numéro, les lignes et les dates sont conservés. La facture annulée ne contribue plus aux sommes à encaisser.

Le projet distinct [kaoutar_facturation](https://github.com/SalahKhadir/kaoutar_facturation) a été inspecté en lecture seule depuis sa copie locale. Son modèle utilise `AAAA-001`. Cette convention est conservée : année de la date de facture, tiret, séquence d’au moins trois chiffres. La fonction pure `nextInvoiceNumber` isole l’allocation simulée pour faciliter son remplacement par le backend. Le numéro est attribué à l’émission à partir du maximum de l’année, en incluant les factures annulées. Les brouillons ne consomment pas de numéro. Le jeu initial contient les numéros 2026-001 à 2026-010, dont le dernier est annulé.

Les opérations concurrentes dans cette instance mémoire ne peuvent réutiliser un numéro. Un rechargement réinitialise le prototype, y compris sa séquence. Cette stratégie ne garantit aucune conformité légale et ne constitue pas une numérotation de production. Le backend devra attribuer les numéros atomiquement avec contrainte d’unicité et règles comptables validées.

## Règlements et corrections

Un règlement doit avoir une date valide, un montant strictement positif, une facture existante émise et un montant inférieur ou égal au solde courant. Le dépôt vérifie le solde au moment de l’écriture. Une facture de 950 DH peut recevoir 400 puis 300 DH ; un nouveau versement de 300 DH est refusé car il ne reste que 250 DH.

Chaque demande possède un `operationId`. Une répétition du même identifiant avec le même contenu retourne le règlement existant ; un contenu différent est rejeté. Le formulaire conserve cet identifiant lors d’une nouvelle tentative de confirmation. Le dépôt empêche aussi deux opérations simultanées de dépasser le solde. Ces garanties s’appliquent seulement à l’instance mémoire de l’onglet.

Les modes Espèces, Carte bancaire, Virement, Chèque et Autre servent à classer un encaissement déjà reçu. Aucun prestataire de paiement n’est appelé. La date est saisie explicitement ; aucune règle supplémentaire de rapprochement avec la date de facture n’est présumée.

Les règlements sont consultables dans l’ordre chronologique et ne peuvent être modifiés ou supprimés. Dès qu’un règlement existe, l’annulation simple est bloquée. Les avoirs, remboursements, contrepassations, corrections et rapprochements devront former un parcours comptable explicite avec autorisation, motif, audit et conservation de l’historique.

## Dossier patient, consultation et tableau de bord

L’historique reprend les concepts du dossier papier : Date, Traitements / prestations, Prix, Reçu et Reste. Chaque groupe correspond à une facture. Les désignations sont réunies ; le reçu et le reste sont calculés pour toute la facture. Un paiement partiel n’est jamais réparti arbitrairement entre ses prestations. Le détail des règlements reste attaché à cette même facture, sans duplication d’écriture.

Les brouillons affichent un prix prévisionnel et un reste à établir après émission. Les factures annulées gardent le montant initial pour l’historique, avec un reste à encaisser nul. Les anciens exemples papier en lecture seule de phase 3 restent distincts ; ils ne sont pas additionnés aux nouvelles factures.

« Créer une facture » depuis une consultation présélectionne patient et consultation. Les lignes sont ajoutées explicitement depuis le catalogue ou une saisie libre. Les soins cliniques et les notes ne sont pas importés automatiquement. Le dépôt accepte une référence de soin et vérifie sa présence dans la consultation ; un même soin ne peut apparaître deux fois sur des factures actives ou des brouillons. L’interface avertit lorsqu’une consultation possède déjà une facture active. Les lignes personnalisées restent possibles et nécessitent une vérification humaine des doublons de prestation.

La création d’une facture ne modifie ni consultation, ni soin, ni rendez-vous, ni ordonnance. Les tables financières n’affichent aucune note clinique, allergie ou réponse au questionnaire. Elles utilisent une projection administrative de l’identité ; les contrôles d’accès réels restent à implémenter côté serveur.

Les indicateurs distinguent Montant facturé, Montant encaissé et Reste à encaisser. Seules les factures émises actives participent aux charges et aux soldes. Le jeu initial compte 13 factures, 9 règlements, 8 550 DH facturés, 4 950 DH encaissés, 3 600 DH à encaisser, trois factures partiellement payées et trois sans règlement. Les indicateurs de l’annuaire portent sur tous les patients ou le patient présélectionné ; les filtres de liste ne changent pas ces indicateurs, comme précisé à l’écran.

## PDF de facture A5 — phase 7.1

Le fond approuvé `docs/references/pdf-templates/facture_background.png` est une image RGB de 1410 × 2000 px à 242 ppp. Ses dimensions physiques déclarées sont d’environ 147,99 × 209,92 mm. Son ratio est supérieur de 0,034 % au ratio A5 théorique. Le générateur conserve le ratio de l’image, la centre sur une page ISO A5 de 419,53 × 595,28 points et laisse le faible écart en marge blanche. Il ne l’étire pas et ne le recadre pas.

Une copie identique par empreinte est distribuée dans `frontend/public/pdf-templates/facture_background.png`. Elle sert uniquement de ressource statique au générateur dans le navigateur. Les PDF produits restent des URL Blob en mémoire et ne sont ni placés dans `public/`, ni enregistrés dans le dépôt simulé.

`pdf-lib` pose sur le fond le numéro, la date de facture, l’identité administrative du patient, les actes dentaires, leur date, la dent éventuelle, leur désignation et leur prix. Le total, le montant reçu et le reste à encaisser proviennent des mêmes fonctions que l’écran. La police locale Liberation Sans prend en charge les accents français. Les descriptions passent par un retour à la ligne mesuré ; un dépassement de la zone A5 bloque la génération avec une erreur au lieu de tronquer le texte.

Le PNG contient l’identité visuelle et les coordonnées du cabinet. Il ne contient pas IF `73149010`, ICE `003999044000004` et INP `084209071`. Le générateur ajoute donc chaque identifiant une seule fois au-dessus du pied de page. La configuration `clinicFinancialIdentifiers` reste immuable et aucun autre identifiant ni règle fiscale n’a été ajouté.

Les brouillons portent un marquage visible « BROUILLON ». Les factures annulées portent « ANNULÉE ». Une facture émise utilise le nom et la référence copiés lors de l’émission ; un brouillon utilise la projection administrative courante du patient. Le titre du document reprend le numéro définitif quand il existe.

`InvoicePdfService.render(invoice, payments, patient)` charge le fond et la police locale puis appelle le moteur pur `renderInvoicePdf`. Le détail d’une facture prépare un aperçu réel dans un lecteur intégré et propose téléchargement, impression et ouverture dans un nouvel onglet. L’impression demande A5 et taille réelle. Le PDF de démonstration n’est pas présenté comme légalement certifié.

La génération vérifie la taille source 1410 × 2000 px, la compatibilité du ratio A5, les glyphes de la police, la hauteur des lignes et les limites financières. Le fond source et sa copie publique ont la même empreinte SHA-256 : `124825673d6d3623bcaafea91786b026a3e73c9635b98faae085fb59ba9196b5`.

## Fichiers concernés

| Chemin | Changement de phase 7 |
| --- | --- |
| `frontend/src/lib/billing/` | Modèles, validation, calculs exacts, numérotation isolée, dépôts mémoire et moteur PDF A5 |
| `frontend/src/data/billing.ts` | Catalogue et écritures synthétiques déterministes |
| `frontend/src/components/billing/` | Fournisseur partagé, annuaire, éditeur d’actes dentaires, détail, aperçu PDF, règlements, historique et indicateurs |
| `docs/references/pdf-templates/facture_background.png`, `frontend/public/pdf-templates/facture_background.png` | Fond officiel source et copie publique identique |
| `frontend/src/app/(cabinet)/facturation/` | Quatre routes de facturation |
| `frontend/src/app/(cabinet)/layout.tsx`, `[module]/page.tsx` | Dépôt partagé et retrait de la page d’attente facturation |
| `frontend/src/components/patients/patient-profile.tsx` | Historique financier administratif |
| `frontend/src/components/consultations/consultation-details.tsx` | Factures liées et présélection |
| `frontend/src/components/dashboard/dashboard-overview.tsx`, `stat-card.tsx` | Indicateurs du dépôt partagé et retour à la ligne des grands montants |
| `frontend/src/data/dashboard.ts` | Suppression de l’ancien montant fixe devenu inutilisé |
| `frontend/src/lib/navigation.ts`, `components/shell/{application-shell,mobile-navigation}.tsx` | Description du module et mention phase 7 |
| `frontend/tsconfig.json` | Cible ES2020 pour BigInt |
| `frontend/tests/billing*.test.mjs`, `tests/browser/billing.test.mjs` | Tests financiers, PDF et parcours navigateur ciblé |
| `README.md`, `docs/ui-component-guidelines.md`, ce document | Périmètre, limites et validations |

Les changements de phase 6 déjà présents dans l’arbre de travail sont conservés. Aucune dépendance supplémentaire n’a été ajoutée pour la phase 7. Les couleurs canoniques, le logo et les références PDF sont conservés.

## Backend et limites restantes

L’état du frontend est modifiable par l’utilisateur et n’est pas autoritaire. Il n’existe pas d’authentification ni d’autorisation réelle. Le serveur devra imposer les droits de prix et d’encaissement, valider les relations, effectuer atomiquement numérotation et paiements, imposer l’unicité des demandes, gérer les conflits entre postes, conserver les copies immuables émises et auditer toutes les corrections.

Il faudra aussi prévoir le stockage sécurisé des PDF, les téléchargements autorisés, la sauvegarde et la restauration. Les règles fiscales, les avoirs et la conservation documentaire demandent une validation avec le cabinet. Aucune conformité juridique, fiscale ou de protection des données n’est revendiquée.

## Validation

Les tests de logique couvrent conversion exacte, limites d’entiers, quantités internes, totaux, prix libres, champs d’acte dentaire, brouillons, émission, numérotation, liens patients/consultations/soins, règlements partiels, trop-perçu, simultanéité, idempotence, annulations, copies isolées et filtres. Les tests PDF contrôlent la copie exacte du PNG, la page A5, les actes, les dates, la dent, les soldes, l’unicité des trois identifiants, le marquage du brouillon et le refus d’un dépassement. Les tests de rendu contrôlent aussi les statuts français, les valeurs financières, la confidentialité des tables et les états vide/chargement/erreur.

Commandes exécutées depuis `frontend/` sur la version finale :

```sh
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/home/sakhadir/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome pnpm test:browser
```

Le lint sans avertissement, TypeScript et la compilation de production passent. `pnpm test` passe avec 104 tests, dont 23 nouveaux tests financiers de logique et de rendu. Les 12 parcours Chromium passent, dont deux nouveaux parcours de facturation. Le chemin Chromium ci-dessus est propre à ce poste ; ailleurs, utiliser `pnpm exec playwright install chromium` puis `pnpm test:browser`.

Les parcours financiers couvrent la présélection depuis une consultation, le prix suggéré librement remplacé, les lignes personnalisées, leur déplacement et leur retrait confirmé, l’enregistrement et la modification du brouillon, l’émission avec focus et Échap, les paiements 400/300/250 DH et le refus du trop-perçu, le dossier patient, les compteurs du tableau de bord, l’annulation avec motif, les filtres, la pagination, les liens invalides et la perte d’un document temporaire après rechargement. Les tailles 1440, 1280, 768, 390 et 320 px passent sans débordement horizontal. Les captures bureau et mobile ont été inspectées dans `/tmp/sijilmassa-billing-phase7/`.

Les parcours existants patients, agenda, clinique, ordonnances et connexion passent également. Les contextes financiers n’ont relevé ni erreur JavaScript ni requête externe ; leurs stockages Web et cookies restent vides. Les mouvements réduits et le clavier sont couverts par les parcours ciblés, sans constituer un audit complet d’accessibilité.

Les 16 couleurs canoniques, le logo et les empreintes des sept PDF de référence sont inchangés. `git diff --check` passe. Ce paragraphe consigne la validation initiale de phase 7, antérieure à l’intégration du fond de facture en phase 7.1.

### Validation du correctif 7.1

Le test ciblé `node --import tsx --test --experimental-test-isolation=none tests/billing-pdf.test.mjs` passe avec trois tests. Il contrôle le fond PNG octet par octet, la page A5, les actes dentaires, les trois soldes, l’unicité des identifiants, le brouillon et le refus d’un débordement. La suite `pnpm test` passe avec 107 tests et conserve les calculs de paiement existants.

`pnpm lint`, `pnpm exec tsc --noEmit` et `pnpm build` passent sur la version finale. Un seul parcours Chromium ciblé a été lancé avec `--test-name-pattern='consultation invoice'`. Il passe et vérifie le prix libre, le brouillon, le numéro automatique `2026-011`, l’aperçu PDF réel, le téléchargement `facture-2026-011.pdf`, la commande d’impression et les paiements partiels avec refus du trop-perçu.

Le PDF de contrôle `/tmp/pdfs/sijilmassa-phase7-1/facture-2026-002.pdf` a été rendu avec Poppler à 150 ppp puis inspecté visuellement. L’en-tête, le tableau, les totaux, les identifiants et le pied de page sont lisibles et ne se chevauchent pas. `pdfinfo` confirme une page de 419,528 × 595,276 points, sans rotation.
