# Gestion des patients — phase 3

## Références du cabinet

Le dossier a été vérifié par extraction de texte et inspection visuelle des deux pages de `Dossier_Patient_Kaoutar_A5.pdf`, disponible dans `Downloads/Kaoutar`. La première page définit les informations personnelles, les groupes d’antécédents et d’allergies et le questionnaire de santé. La seconde fournit les colonnes Date, Traitement, Prix, Reçu et Reste.

`Ordonnance_Kaoutar_A5.pdf`, trouvé au même emplacement, a également été inspecté comme référence d’une phase future. Les noms exacts comportant `(1)` et `(2)` mentionnés dans la demande étaient absents du dépôt et des pièces jointes accessibles. La correspondance exacte entre ces variantes reste à confirmer. Les champs implémentés suivent les documents sans suffixes effectivement consultés et la liste explicite fournie dans la demande.

## Parcours

| Route | Usage du prototype |
| --- | --- |
| `/patients` | Annuaire administratif, recherche par nom, référence, GSM et fixe, filtre de statut, tri et pagination de 10 dossiers |
| `/patients/[id]` | Informations personnelles, CIN masquée et métadonnées administratives |
| `/patients/[id]/modifier` | Modification administrative en deux étapes avec vérification |
| `/patients/nouveau` | Création d’un dossier fictif en quatre étapes, orientée vers le prototype dentiste |
| `/patients/[id]/dossier` | Questionnaire et historique fictif, écran distinct destiné au dentiste |
| `/patients/[id]/dossier/modifier` | Modification complète du dossier fictif en quatre étapes |

Les sections du dossier sont reliées par une navigation de pages. La séparation entre vue administrative et questionnaire évite de placer les détails de santé dans l’annuaire ou dans la modification administrative. La navigation vers le dossier dentiste ouvre un écran de démonstration, accessible librement dans cette version.

Les libellés et options correspondent aux rubriques du papier. Le sexe propose F, M et un état de recueil non renseigné. Les réponses aux questions de traitement médical et de grossesse utilisent `unanswered`, `yes` et `no`. Le sexe ne remplit aucune réponse. Les groupes de cases possèdent un état de recueil distinct qui permet de différencier une rubrique non renseignée d’une rubrique renseignée sans catégorie cochée. Les catégories d’allergies sont des déclarations rapportées. Les précisions d’antécédents sont associées à la case Autres.

Le nom et le prénom sont obligatoires. Les autres champs peuvent rester vides. La validation limite les longueurs, refuse les dates invalides et futures, accepte les formats de téléphone locaux et internationaux et les X des exemples fictifs. Les champs facultatifs textuels vides utilisent une chaîne vide. La CIN est masquée dans le récapitulatif et les informations personnelles, exclue de la recherche et absente de la projection d’annuaire. Son champ de modification est masqué. Les coordonnées des fixtures sont volontairement inutilisables et les noms contiennent « Démo ».

## État temporaire et architecture

`PatientProvider` crée une instance de `PatientRepository` lors de son montage dans le layout `(cabinet)`. L’instance contient une Map privée à cette instance, des copies profondes des 20 fixtures et des méthodes asynchrones `list`, `getById`, `create` et `update`.

Les liens Next.js entre pages du cabinet conservent ce provider. Une création ou modification incrémente une révision pour recharger les données concernées. La fiche affiche une confirmation explicitement limitée à la mémoire de l’onglet. Les réponses asynchrones devenues obsolètes lors d’une navigation ou d’un nouvel essai sont ignorées.

Un rechargement, une nouvelle fenêtre ou une sortie du layout du cabinet vers `/login` recrée le jeu initial. Ouvrir une fiche nouvellement créée dans un autre onglet affiche donc Patient introuvable. Les dossiers fictifs sont indépendants entre navigateurs. Depuis la phase 4, le tableau de bord et l’indicateur de rendez-vous de l’annuaire utilisent le dépôt d’agenda partagé. L’illustration financière reste statique.

La génération séquentielle des références commence après la plus grande référence de la mémoire courante. Elle reste déterministe dans une instance et résiste aux appels de création concurrents du prototype. Le numéro peut être réutilisé après réinitialisation. Les dates des fixtures sont fixes. Les nouvelles opérations utilisent l’horloge courante et l’affichage utilise `Africa/Casablanca`.

Les identifiants inconnus donnent un état explicite avec retour vers l’annuaire. Cette résolution se fait côté navigateur pour respecter l’état temporaire. Le document HTTP initial de ces routes reste une page Next.js réussie, et le futur backend devra fournir le code 404 pour un identifiant absent.

## Historique fictif

`PatientTreatmentEntry` décrit les exemples de lecture seule. Les prix et reçus sont des entiers en centimes. Le tableau calcule la différence entière pour afficher le reste. Ce calcul illustre uniquement les lignes fictives fournies. La définition comptable finale devra être validée avec le cabinet.

Les créations démarrent avec un historique vide. La mise à jour d’un dossier conserve ses entrées, son identifiant, sa référence et sa date d’inscription. Les méthodes d’écriture valident à nouveau les données avec Zod et retournent des copies profondes.

## Autorisations à intégrer côté Spring Boot

| Ressource | Autorisation future |
| --- | --- |
| Annuaire et informations administratives | DENTIST et RECEPTIONIST, avec un DTO limité aux champs utiles |
| CIN | Lecture et modification explicites selon les besoins administratifs et les règles de confidentialité du cabinet |
| Antécédents, allergies, questionnaire, motif de consultation | DENTIST |
| Historique clinique et libellés des traitements | DENTIST |
| Données de facturation destinées à l’accueil | Endpoint et projection distincts à définir dans la phase de facturation |

Les fixtures complètes sont présentes dans le bundle du prototype et restent accessibles aux outils du navigateur. Les projections et la séparation des écrans sont des choix de présentation. L’API devra vérifier les sessions, les rôles et les droits sur chaque ressource et opération avant de renvoyer des données. Les routes d’aperçu et le prototype de connexion gardent le comportement des phases précédentes.

L’intégration remplacera l’implémentation de `PatientRepository` par un adaptateur d’API et des DTO séparés pour les informations administratives et de santé. Les contrôles serveur devront reprendre la validation et définir les transactions, références uniques, conflits de modification et erreurs 404. Les exigences de stockage, traçabilité et confidentialité seront traitées dans cette intégration.

## Tests

Le runner Node `node:test` est conservé. `tsx` permet d’importer les modules TypeScript et de tester le rendu des composants React. Playwright sert uniquement à automatiser Chromium en développement. Les binaires précompilés d’esbuild sont utilisés avec son script d’installation désactivé dans la configuration pnpm.

```sh
cd frontend
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
```

`pnpm test:browser` démarre et arrête sa propre instance locale de la compilation sur le port 3100. `PATIENTS_TEST_BASE_URL` permet de cibler un serveur existant. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` permet d’utiliser un Chromium déjà installé. Les tests génèrent uniquement des valeurs fictives.

Les tests de logique couvrent le schéma, les dates, les téléphones, les cases, les réponses non renseignées, la recherche, les tris, les filtres, la pagination, les indicateurs, les références et l’isolation des écritures. Les tests de rendu couvrent les états chargé, vide, sans résultat, chargement, erreur récupérable, identifiant inconnu, masquage de la CIN, projection administrative et tableau de traitements.

Les parcours navigateur couvrent la création et la modification, la conservation du questionnaire pendant une modification administrative, le clavier, les formats bureau et mobile, la réduction des mouvements, les routes existantes et la réinitialisation au rechargement. Le dépôt mémoire immédiat fournit les données sans délai artificiel. Les états de chargement et d’erreur sont également exercés séparément par les tests de rendu.

## Fichiers concernés

- `frontend/src/app/(cabinet)/patients/` contient les routes d’annuaire, de création, de fiche et de modification, ainsi que les vues dédiées au dossier de santé.
- `frontend/src/components/patients/` contient le provider mémoire, les requêtes avec reprise, les états, le tableau et les cartes, les indicateurs, le formulaire à étapes, les résumés masqués et la lecture des rubriques médicales.
- `frontend/src/lib/patients/` contient les modèles, le schéma, les dates, le dépôt, la recherche, les tris, la pagination et la projection administrative.
- `frontend/src/data/patients.ts` fournit les 20 dossiers synthétiques.
- `frontend/src/components/ui/select.tsx` et `textarea.tsx` étendent les contrôles natifs du design system.
- Le layout du cabinet monte le provider. La route générique des modules réserve maintenant `/patients` à ses propres pages. La barre supérieure reconnaît les sous-routes patients et les libellés du shell décrivent l’état temporaire de la phase 3.
- `frontend/tests/patients.test.mjs`, `patient-components.test.mjs` et `browser/patients.test.mjs` ajoutent les vérifications de logique, de rendu et de parcours.
- `frontend/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` et `tsconfig.json` configurent les outils de test et les imports TypeScript. Le README et les consignes des composants visuels sont complétés.

## Résultats de validation

Les commandes `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` et `pnpm test` passent. Les 20 tests de logique et de rendu incluent les tests d’authentification existants. Les trois parcours Chromium couvrent le cycle patients, les formats 1440/1280/768/390/320 px et la non-régression du prototype de connexion. Les captures de l’annuaire et du dossier ont été inspectées visuellement. Les dépendances sont compatibles selon `pnpm peers check` et l’installation avec `--frozen-lockfile` a été vérifiée.

Les 17 valeurs canoniques de couleur sont conservées. Les associations de texte déjà utilisées ont été contrôlées à 4,5:1 ou davantage. Le logo fourni conserve son empreinte SHA-256. Le fichier du dossier papier consulté porte l’empreinte `f68cf8351f368bf2b0d52dd3c2aa0e421294442c729c114b169d4107f11e69b4`.
