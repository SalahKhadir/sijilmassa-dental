# Gestion des rendez-vous — phase 8.4B

Le calendrier principal `/rendez-vous` utilise désormais Spring Boot et PostgreSQL : vues jour/semaine/mobile, création avec patient réel, édition versionnée, statuts et conflits. Les parcours synthétiques restent sous `/demo/rendez-vous` et le tableau de bord synthétique sous `/demo`, sans mélange d’identifiants. Voir [l’intégration frontend](appointment-frontend-integration.md) pour l’architecture, les fuseaux, la revalidation entre postes, les limites et la procédure de test.

Le contrat de phase 8.4A fait autorité : durée 30–180 minutes, pas d’horaires fictifs, pas de motif/notes libres, TERMINE réservé au dentiste et immuable. Les sections ci-dessous décrivent le prototype historique, sans remplacer ces règles.

**Validation de phase 8.4B : 229 tests frontend, 80 tests backend et 35 parcours navigateur réels réussis, sans échec ni test ignoré.** Le build de production Webpack passe ; le build Turbopack reste bloqué par l’ouverture de port du sandbox. Voir le rapport lié ci-dessus pour les commandes et limites.

## Historique — phase 4

## Agenda du cabinet

Le prototype utilise un agenda partagé pour un seul dentiste. `AppointmentProvider` est monté dans le layout `(cabinet)`, à l’intérieur de `PatientProvider`. Il reçoit la même instance de dépôt patients que les écrans de phase 3 et crée une instance privée de dépôt de rendez-vous pour la durée de vie de ce layout.

Les données restent dans la mémoire de l’onglet. La navigation Next.js entre les écrans conserve les créations, modifications et changements de statut. Un rechargement, une nouvelle fenêtre ou une sortie vers `/login` recrée les fixtures initiales. Les navigateurs du dentiste et de l’accueil auront besoin du futur backend pour voir les mêmes écritures et prévenir les conflits concurrents.

## Configuration de développement

`frontend/src/lib/appointments/schedule.ts` contient les horaires et limites d’exemple. Les écrans et la validation lisent cette configuration. Les valeurs actuelles sont lundi à vendredi de 09:00 à 12:30 puis de 14:00 à 18:00, samedi de 09:00 à 13:00 et dimanche fermé. La durée du prototype est un entier compris entre 30 et 180 minutes, avec une valeur initiale de 30 minutes. Ces paramètres sont des choix de développement à confirmer avec le cabinet.

Les catégories administratives Consultation, Contrôle, Détartrage, Soin dentaire, Extraction et Autre sont centralisées dans `types.ts`. Un nouveau formulaire propose Consultation, 09:00 et la journée sélectionnée. Le statut initial est toujours `EN_ATTENTE`.

Les douze fixtures ont des identifiants et dates fixes du 2 au 7 novembre 2026. Elles comprennent des entrées adjacentes et des entrées historiques annulées ou absentes superposées à d’autres rendez-vous. La navigation par date permet de retrouver ces exemples ultérieurement.

## Routes et présentation

| Route | Parcours |
| --- | --- |
| `/rendez-vous` | Vue jour ou semaine, choix de date, aujourd’hui et navigation précédente/suivante |
| `/rendez-vous?date=AAAA-MM-JJ` | Ouverture directe d’une journée, notamment au retour des détails |
| `/rendez-vous/nouveau` | Création avec recherche et sélection d’un patient existant |
| `/rendez-vous/nouveau?patientId=…` | Patient présélectionné depuis sa fiche administrative |
| `/rendez-vous/[id]` | Détails, fiche patient, modification et changement explicite de statut |
| `/rendez-vous/[id]/modifier` | Modification du patient et des informations de planification |

La semaine commence le lundi. Sur bureau, les événements sont positionnés selon l’heure et leur hauteur représente leur durée. Les chevauchements de tous les statuts occupent des colonnes distinctes. Le calendrier conserve une largeur lisible par colonne et permet le défilement dans sa propre région. Les noms longs sont abrégés visuellement dans la grille, avec leur texte complet dans le libellé accessible, le titre, les détails et la liste complète dépliable.

Sous 1280 px, l’agenda quotidien fournit les noms complets et les métadonnées sur des cartes lisibles. En vue semaine, une sélection de jour remplace les sept colonnes étroites. Les régions de calendrier, contrôles, liens et listes restent accessibles au clavier. Les statuts combinent un texte et une icône.

Les listes et la grille conservent les entrées annulées, absentes et terminées. Un identifiant absent affiche un état explicite avec retour à l’agenda. La résolution du dépôt mémoire est effectuée côté navigateur, comme pour les patients. Le futur endpoint devra fournir la réponse HTTP 404 appropriée.

## Données et temps local

`Appointment` conserve seulement `patientId` comme lien vers l’identité. Le nom, la référence et les téléphones sont dérivés du dépôt patients à travers une projection limitée aux données administratives nécessaires. Les rendez-vous ne copient pas les données médicales ou la CIN. La recherche réutilise la normalisation et le moteur de recherche patients de phase 3.

La date et l’heure de rendez-vous sont des chaînes locales `AAAA-MM-JJ` et `HH:mm`. Le modèle conserve la durée en minutes entières. La validation accepte les dates passées. Les fonctions de calcul de semaine emploient une date grégorienne auxiliaire à UTC pour effectuer l’arithmétique des jours. Elles ne convertissent jamais le rendez-vous local en instant UTC. Les horodatages techniques de création et de modification sont des chaînes ISO distinctes.

Le formulaire vérifie le patient existant, la date, l’heure, la durée, les longueurs de texte et l’inclusion complète dans une plage d’ouverture d’exemple. Traverser la pause est refusé. Le motif et les notes sont des informations administratives facultatives. Une recherche sans résultat conserve explicitement la sélection courante et permet de changer le filtre.

## Conflits et statuts

Deux créneaux se chevauchent lorsque leurs dates locales sont identiques et que leurs intervalles `[début, fin)` se coupent. La fin d’un rendez-vous peut donc coïncider exactement avec le début du suivant.

| Statut | Libellé | Bloque le créneau |
| --- | --- | --- |
| `EN_ATTENTE` | En attente | Oui |
| `CONFIRME` | Confirmé | Oui |
| `TERMINE` | Terminé | Oui |
| `ANNULE` | Annulé | Non |
| `ABSENT` | Absent | Non |

Le prototype permet une correction explicite de tout statut vers chacun des quatre autres. Le formulaire de statut exige le choix puis le bouton Appliquer le statut. Le chemin habituel peut aller de En attente à Confirmé puis Terminé. Annulé et Absent conservent l’entrée dans l’historique. Toute transition vers un statut bloquant revalide les horaires et les conflits. Réappliquer le statut courant conserve l’entrée sans modification.

`findAppointmentConflict` est une fonction pure. Elle exclut l’identifiant courant lors d’une modification et produit un conflit déterministe. Le dépôt revalide avant chaque écriture. Après la vérification asynchrone du patient, la détection de conflit et l’écriture utilisent l’état courant dans une opération JavaScript synchrone. Les appels concurrents d’une même instance mémoire sont ainsi vérifiés avant insertion.

Cette garantie est limitée à cette instance. Spring Boot devra effectuer une validation transactionnelle autoritaire pour les requêtes provenant de plusieurs ordinateurs. Les références séquentielles de démonstration devront aussi être remplacées par des identifiants pérennes définis côté serveur.

## Intégrations

La fiche administrative patient affiche uniquement les rendez-vous de son identifiant, regroupés en À venir ou en cours et Passés et historique. Le bouton Prendre rendez-vous présélectionne ce patient. L’indicateur d’annuaire utilise les identifiants distincts des patients ayant un rendez-vous à venir ou en cours dans l’agenda partagé.

Le tableau de bord garde sa composition et lit ses données de rendez-vous dans le dépôt partagé. Rendez-vous du jour compte les statuts bloquants de la date courante. À confirmer compte toutes les entrées En attente, quelle que soit leur date, pour garder les confirmations à régulariser visibles. La liste affiche jusqu’à quatre rendez-vous En attente ou Confirmé dont la fin est encore à venir. Les nombres sont recalculés après les mutations ou le chargement de la vue. Le prototype ne déclenche pas une actualisation périodique de l’horloge.

Le compteur patients utilise le dépôt patients. Le montant financier reste l’illustration statique de la phase 1, avec sa date d’exemple indiquée. Les rendez-vous et leurs catégories restent des objets administratifs. Les questions et réponses de santé restent dans les écrans dédiés de phase 3.

## Futur adaptateur Spring Boot

`AppointmentRepository` définit `list`, `getById`, `create`, `update` et `updateStatus`. L’adaptateur d’API pourra remplacer l’implémentation mémoire. Il devra valider les références patients, les horaires définis avec le cabinet, les statuts et les conflits sur chaque opération, et retourner des erreurs métier exploitables par les formulaires.

Les réponses de sélection et de détail des patients devront être limitées aux données administratives autorisées. Les sessions et rôles seront vérifiés côté serveur. Les données synthétiques présentes dans le bundle et la séparation des écrans du prototype ne constituent pas une autorisation de consulter des données réelles.

## Tests et fichiers concernés

Les tests Node et de rendu couvrent le schéma, le temps local, les durées, les semaines et années, les intervalles adjacents ou inclus, les statuts bloquants, l’exclusion sur modification, les écritures concurrentes, les références patients, les identifiants inconnus, les colonnes de chevauchement, les projections et les compteurs.

Les tests Chromium couvrent les parcours de création, modification, annulation et refus de réactivation conflictuelle, la sélection depuis une fiche, la recherche, les vues jour/semaine, le clavier, les tailles bureau et mobile et les mises à jour du tableau de bord. Le harnais partagé des tests démarre ses serveurs locaux sur 3100 et 3101 et les arrête en fin de vérification. `PATIENTS_TEST_BASE_URL` peut cibler un serveur existant. `APPOINTMENTS_TEST_SCREENSHOT_DIR` permet de conserver des captures de test.

```sh
cd frontend
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm test
pnpm test:browser
```

| Chemin | Contenu |
| --- | --- |
| `frontend/src/lib/appointments/` | Modèles, statuts, horaires, schéma, calculs locaux, conflits, dépôt et sélecteurs |
| `frontend/src/data/appointments.ts` | Fixtures de rendez-vous référencées par patientId |
| `frontend/src/components/appointments/` | Provider, requêtes, états, agenda, grille, formulaires, détails et section de fiche patient |
| `frontend/src/app/(cabinet)/rendez-vous/` | Routes calendrier, création, détails et modification |
| `frontend/src/components/dashboard/` | Données réactives et liste reliée à l’agenda, composition conservée |
| `frontend/src/components/patients/` | Section de rendez-vous et indicateur relié à l’agenda |
| `frontend/src/lib/patients/directory.ts` | Recherche générique réutilisée et indicateur patient partagé |
| `frontend/src/app/(cabinet)/layout.tsx` | Cycle de vie du provider partagé |
| `frontend/tests/appointments.test.mjs` et `appointment-components.test.mjs` | Tests de règles et de rendu |
| `frontend/tests/browser/` | Parcours rendez-vous et harnais navigateur commun |

La route générique des modules laisse désormais la place à `/rendez-vous`. Les libellés du shell, le README et les consignes des composants visuels reflètent la phase 4.

## Résultats de validation

`pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` et `pnpm test` passent. Les 42 tests de logique et de rendu comprennent les contrôles des phases précédentes. Les cinq parcours Chromium passent, dont les parcours patients et connexion existants. Les captures ont été inspectées à 1440, 1280, 768, 390 et 320 px, avec contrôle du défilement et de la visibilité de l’échelle horaire.

Les 17 valeurs canoniques de la palette et l’empreinte SHA-256 du logo sont conservées. Le nettoyage d’un cache Turbopack ayant mémorisé un refus de port dans le bac à sable a permis de terminer la compilation finale.
