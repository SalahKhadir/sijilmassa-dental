# Espace clinique du dentiste — phase 5

## Référence du cabinet

Les deux pages de `/home/sakhadir/Downloads/Kaoutar/Dossier_Patient_Kaoutar_A5.pdf` ont été relues par extraction de texte et inspection visuelle. Il s’agit de la version sans suffixe numérique déjà utilisée en phase 3. Son empreinte SHA-256 est `f68cf8351f368bf2b0d52dd3c2aa0e421294442c729c114b169d4107f11e69b4`.

La première page porte les antécédents, allergies, questions de traitement médical et de grossesse, informations de santé supplémentaires et motif. La seconde porte le tableau Date, Traitement, Prix, Reçu et Reste. La phase 5 réutilise ces rubriques dans le questionnaire existant. Les champs de compte rendu et le cycle de consultation suivent la demande de phase 5.

La recherche a également trouvé `Dossier_Patient_Kaoutar_A4.pdf` dans le même répertoire. La référence retenue pour cette implémentation est le dossier A5 sans suffixe. Aucun détail n’est attribué aux variantes `(1)` ou `(2)`.

## Modèles et relations

`Patient` conserve l’identité et les réponses de santé dans le dépôt de phase 3. `Appointment` représente un créneau administratif de phase 4. `Consultation` représente une rencontre clinique avec un patient et peut référencer un rendez-vous de ce même patient. Une visite spontanée utilise un lien vide. La consultation n’est pas déduite du créneau.

| Modèle | Contenu |
| --- | --- |
| `ConsultationInput` | Patient, rendez-vous facultatif, date locale, motif, observations, évaluation, plan, notes et saisies de soins |
| `Consultation` | Entrée, identifiant, statut, horodatages techniques et soins enregistrés |
| `TreatmentInput` | Date locale du soin, description, référence dentaire facultative, notes facultatives |
| `TreatmentEntry` | Entrée, identifiant stable, consultationId et horodatages techniques |

L’identifiant patient des soins est dérivé de leur consultation. Les identités et questionnaires restent dans leur dépôt d’origine. Les soins cliniques conservent uniquement leur contenu clinique. Les horodatages sont des instants ISO, tandis que les dates de consultation et de soin restent des dates locales `AAAA-MM-JJ`.

Le motif est obligatoire et limité à 500 caractères. Chaque champ clinique complémentaire est facultatif et limité à 5 000 caractères. La description d’un soin est obligatoire et limitée à 1 000 caractères, ses notes à 2 000 et sa référence dentaire à 50. Le prototype accepte jusqu’à 50 soins par consultation. Ces limites sont des choix de développement. La référence dentaire accepte lettres, chiffres et séparateurs simples. Cette validation textuelle ne prétend pas valider une notation FDI complète. Les dates passées et futures valides sont acceptées pour permettre les saisies et corrections explicites du dentiste.

## Dépôt et durée de vie

`ConsultationRepository` définit `list`, `getById`, `create`, `update` et `complete`. Deux projections synchrones propres au prototype mémoire donnent l’identifiant d’une consultation liée et indiquent si un rendez-vous peut changer de patient. Le futur adaptateur API devra remplacer ces projections par des liens fournis par le serveur et des contrôles transactionnels.

`ConsultationProvider` est monté dans le layout du cabinet, à l’intérieur des providers patients et rendez-vous existants. Son dépôt reçoit ces mêmes instances. Les consultations contiennent des références et utilisent les identités actuelles, y compris celles des patients créés pendant la session.

Les données sont copiées profondément aux frontières du dépôt. Les identifiants des consultations et soins sont déterministes dans une instance. Les créations concurrentes obtiennent des identifiants distincts et l’unicité du rendez-vous lié est revérifiée juste avant l’écriture synchrone. Les liens en cours de validation réservent temporairement leur rendez-vous afin de refuser une réaffectation concurrente à un autre patient. La réservation est libérée en cas d’échec.

Les mutations incrémentent une révision et les vues relisent le dépôt. Les requêtes obsolètes sont ignorées avec le hook existant. Les opérations sont immédiates, avec des états de chargement et reprise sans délai artificiel. La navigation Next.js conserve l’état. Un rechargement, un autre onglet ou une sortie du layout vers la connexion recrée les fixtures. Les différentes machines ne partagent pas leurs écritures.

Le jeu initial comprend 20 consultations sur 15 des 20 patients fictifs existants, avec 7 brouillons et 13 consultations terminées. Les dates sont fixes entre octobre et novembre 2026. Trois consultations référencent des rendez-vous existants des mêmes patients. Les textes sont explicitement fictifs et ne constituent pas des diagnostics ou conseils.

## Routes et composants

| Route | Usage |
| --- | --- |
| `/consultations` | Annuaire clinique, compteurs, recherche d’identité, filtre de statut et tri par date |
| `/consultations?patientId=…` | Liste limitée à un patient existant |
| `/consultations/nouveau` | Création d’une consultation, avec recherche patient |
| `/consultations/nouveau?patientId=…` | Patient présélectionné après vérification |
| `/consultations/nouveau?patientId=…&appointmentId=…` | Vérification et présélection du lien de rendez-vous |
| `/consultations/[id]` | Compte rendu, soins chronologiques, métadonnées et clôture |
| `/consultations/[id]/modifier` | Modification d’un brouillon, état de lecture seule si terminé |
| `/patients/[id]/clinique` | Identification, questionnaire rapporté et historique clinique du patient |

Les routes restent des Server Components. Les composants interactifs lisent le dépôt mémoire dans le navigateur. Les identifiants absents produisent un état explicite avec retour. Comme en phases 3 et 4, le document HTTP initial est une page réussie du prototype. L’API devra fournir les codes HTTP appropriés.

La liste générale affiche identité, date, statut et nombre de soins. Le motif apparaît dans l’historique du patient et le compte rendu détaillé. Dans l’historique clinique, un volet natif permet aussi de lire les descriptions des soins par date. La recherche de consultations porte sur le nom et la référence patient. Les observations et notes ne servent pas de champs de recherche.

La vue clinique réutilise `PatientClinicalSections` avec un affichage factuel par catégorie. Les réponses distinguent Oui, Non et Non renseigné selon l’état de recueil existant. Les allergies rapportées sont signalées dans une surface bordeaux claire avec leur libellé. Cette présentation reprend une déclaration du questionnaire. Elle ne produit pas de score de risque ou d’aptitude au soin.

Les cartes, boutons, champs et sélections du design system sont réutilisés. Les confirmations utilisent le dialogue Radix déjà installé, avec titre, description, piège de focus et retour clavier. Les soins utilisent React Hook Form et `useFieldArray`. Les champs et messages d’erreur sont associés. Les mises en page deviennent monocolonnes sur mobile. Les couleurs canoniques et la règle globale de réduction des mouvements sont réutilisées.

## Cycle de consultation et soins

La création produit toujours `BROUILLON`. Le motif, les champs complémentaires et les soins restent modifiables à ce stade. Le patient est conservé après création pour éviter de déplacer silencieusement un compte rendu vers un autre dossier. Le lien facultatif au rendez-vous peut être ajusté parmi les créneaux du patient qui ne sont pas déjà liés.

Un soin non enregistré peut être retiré du formulaire après confirmation. Les soins enregistrés restent présents et sont modifiables tant que le compte rendu est en brouillon. Le dépôt refuse les identifiants étrangers, les doublons et le retrait d’un soin enregistré. Les identifiants et dates de création sont conservés lors des corrections. L’affichage chronologique trie les soins par date puis identifiant stable.

Le bouton Terminer la consultation ouvre une confirmation explicite. Après confirmation, `TERMINEE` verrouille les champs et soins au niveau du dépôt mémoire comme dans l’interface. Les accès directs à la route de modification affichent la lecture seule. Le prototype propose uniquement ce passage vers l’état terminé. Les corrections de dossiers terminés, leur justification, leur historique et les conflits d’écriture devront faire l’objet d’un parcours serveur audité.

## Intégration patients et agenda

La fiche administrative et le dossier de questionnaire proposent un lien identifié Espace clinique · Dentiste. La vue clinique propose Nouvelle consultation, Voir les consultations et Retour au dossier patient. Elle lit le questionnaire actuel via le dépôt patients existant.

Les détails d’un rendez-vous proposent Créer une consultation. L’action vérifie l’existence et l’appartenance du rendez-vous, présélectionne le patient et reprend sa date comme date initiale. Les rendez-vous historiques de tous statuts peuvent être liés pour permettre la documentation rétrospective. Une consultation peut aussi rester sans rendez-vous.

Un rendez-vous déjà lié affiche Ouvrir la consultation liée. Le formulaire et le dépôt refusent un second lien, y compris en cas de soumissions concurrentes dans la même instance. Une consultation terminée conserve également ce lien. Un rendez-vous lié conserve son patient, avec un message explicite si une réaffectation est tentée. Les autres informations administratives peuvent encore être modifiées selon les règles de phase 4.

Les statuts des deux modèles se gèrent séparément. Créer ou terminer une consultation conserve le créneau et son statut. La fiche de rendez-vous utilise seulement une projection d’identifiant pour son entrée clinique. Elle ne lit pas le contenu du compte rendu.

## Historique papier et future facturation

Le tableau fictif de phase 3 avec Date, Traitement, Prix, Reçu et Reste reste en lecture seule dans le dossier papier. Les nouveaux soins cliniques apparaissent dans les consultations. Les exemples historiques restent distincts pour éviter de créer un rapprochement financier artificiel.

Une intégration future pourra relier un soin clinique à un ou plusieurs postes de facturation par identifiants explicites. Une facture portera ses postes et montants exacts. Les paiements et leur affectation formeront un registre financier distinct. Les descriptions de soins ne permettront pas de calculer des montants ou paiements. Les règles comptables et la reprise des lignes papier devront être validées avec le cabinet.

## Confidentialité et futur backend

Les écrans administratifs de l’annuaire patients, le tableau de bord et les résumés de rendez-vous conservent leurs projections existantes. Les notes cliniques restent dans les écrans dédiés. Les liens vers l’espace dentiste constituent une séparation de présentation. Les fixtures cliniques présentes dans le bundle et les routes libres du prototype sont accessibles aux outils du navigateur.

Spring Boot devra vérifier les sessions et autoriser DENTIST sur chaque lecture et écriture clinique. RECEPTIONIST devra recevoir uniquement les ressources administratives autorisées et des DTO limités. Le serveur devra assurer validation des liens et des champs, unicité du lien de rendez-vous, transactions, contrôle de concurrence, stockage sécurisé et journalisation d’audit des changements. Les corrections de dossiers terminés devront être explicites, justifiées et traçables. L’hébergement local ne suffit pas à établir une conformité réglementaire.

## Fichiers concernés

| Chemin | Changement |
| --- | --- |
| `frontend/src/lib/consultations/` | Modèles, schéma, dépôt mémoire, erreurs, filtres et tris |
| `frontend/src/data/consultations.ts` | 20 rencontres cliniques fictives déterministes |
| `frontend/src/components/consultations/` | Provider, lecture partagée, annuaire, formulaire, soins, détails, confirmation et vue patient |
| `frontend/src/app/(cabinet)/consultations/` | Routes de liste, création, détail et modification |
| `frontend/src/app/(cabinet)/patients/[id]/clinique/` | Route de vue clinique patient |
| `frontend/src/app/(cabinet)/layout.tsx` | Provider clinique dans le cycle de vie partagé |
| `frontend/src/app/(cabinet)/[module]/page.tsx` | Réservation de la route consultations au module fonctionnel |
| `frontend/src/components/patients/patient-profile.tsx` | Entrée clinique identifiée |
| `frontend/src/components/patients/patient-clinical-sections.tsx` | Réutilisation du questionnaire, réponses explicites et allergies rapportées |
| `frontend/src/components/appointments/appointment-details.tsx` | Entrée vers la consultation liée ou sa création |
| `frontend/src/components/appointments/appointment-provider.tsx` | Garde de cohérence des liens lors d’une réaffectation patient |
| `frontend/src/lib/appointments/repository.ts` | Vérification de la garde et erreur métier associée |
| `frontend/src/components/page-heading.tsx` | Contraste du surtitre partagé avec le jeton bordeaux |
| `frontend/src/lib/navigation.ts` et `components/shell/` | Description du module clinique et libellé de phase 5 |
| `frontend/tests/consultations.test.mjs` | Schéma, règles, cycle, relations, concurrence et isolation |
| `frontend/tests/clinical-components.test.mjs` | Rendu, questionnaire, confidentialité des listes et états |
| `frontend/tests/browser/clinical.test.mjs` | Parcours cliniques Chromium et captures responsive |
| `README.md`, `docs/ui-component-guidelines.md`, présent document | Périmètre, architecture et vérification |

Les dépendances installées des phases précédentes suffisent à cette phase.

## Vérification

```sh
cd frontend
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm test
pnpm test:browser
```

Le harnais navigateur existant démarre et arrête ses serveurs. Le fichier clinique utilise le port 3102. `PATIENTS_TEST_BASE_URL` peut cibler un serveur existant et `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` un Chromium déjà installé. `CLINICAL_TEST_SCREENSHOT_DIR` permet de choisir le répertoire des captures, sinon `/tmp/sijilmassa-clinical-phase5` est utilisé.

### Résultats de validation

Les commandes `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` et `pnpm test` passent. Les 60 tests de logique et rendu comprennent les tests des phases précédentes, les règles cliniques, les erreurs, le questionnaire et les écritures concurrentes.

Les sept parcours Chromium passent. Les parcours cliniques couvrent la création depuis un rendez-vous, les visites spontanées, la validation et le focus d’erreur, plusieurs soins, leur retrait confirmé avant enregistrement, leur modification en brouillon, l’annulation au clavier de la clôture, la clôture explicite, les liens uniques, les identifiants absents, la lecture seule, les filtres, les tris et la réinitialisation au rechargement. Les pages administratives vérifiées conservent leur séparation de présentation. Les tests contrôlent également l’absence de requêtes externes, de stockage navigateur et d’erreurs JavaScript dans ces parcours.

Les vues cliniques ont été vérifiées à 1440, 1280, 768, 390 et 320 px, avec inspection des captures bureau/mobile et contrôle du débordement horizontal. Le formulaire mobile, la vue clinique du patient et le compte rendu terminé ont été inspectés. La réduction des mouvements est testée avec l’émulation Chromium. Les 16 couleurs canoniques et l’empreinte du logo officiel sont conservées.

L’environnement possède un Chromium déjà installé différent de la révision attendue par Playwright. Les parcours ont utilisé l’option prévue par le harnais existant, avec `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/home/sakhadir/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome pnpm test:browser`. Sur une autre machine, `pnpm exec playwright install chromium` installe la révision attendue.

Le contrôle de contraste a relevé 4,43:1 pour le petit surtitre teal sur le fond chaud. Le surtitre partagé utilise désormais le jeton bordeaux existant, avec un contraste supérieur à 4,5:1. Les textes bordeaux sur teinte bordeaux, principaux sur teinte teal et secondaires sur blanc ont également été contrôlés.
