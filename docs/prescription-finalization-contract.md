# Ordonnances — finalisation atomique (8.5C.2B.2)

## Décisions retenues

Ce lot applique les [décisions de persistance](prescription-persistence-contract.md), le [contrat REST](prescription-rest-contract.md) et le [pont de rendu privé](prescription-rendering-bridge.md). Le statut reste `FINALISEE`, avec un UUID comme identité documentaire ; aucun numéro séquentiel, rectificatif, remplacement ou archivage après finalisation n’est ajouté.

Le PDF est un `bytea` PostgreSQL, conservé avec son instantané JSON versionné et son empreinte SHA-256. La limite de stockage est 2 Mio, égale au plafond du renderer. Un plafond de rendu inférieur reste possible. Aucun chemin fourni par le client, stockage externe ou microservice n’intervient. Le Node privé existant reste désactivé par défaut.

## Profil professionnel approuvé

Le contrat autorise un profil local versionné géré par le serveur. Il n’impose pas une table de praticiens. Le choix retenu est un fichier UTF-8 JSON privé, chargé une fois au démarrage et épinglé par SHA-256. Deux variables facultatives le désignent :

- `PRESCRIPTION_PRACTITIONER_FILE` : chemin absolu administré sur le serveur ;
- `PRESCRIPTION_PRACTITIONER_SHA256` : empreinte exacte des octets du fichier.

Ces valeurs ne contiennent pas de secret d’authentification. Le fichier professionnel doit rester hors Git, hors répertoires publics et inaccessible en écriture aux postes clients. Le compte du processus doit pouvoir le lire. La limite est 16 Kio ; les champs inconnus, JSON dupliqué ou données incomplètes sont refusés. Aucune donnée ni diagnostic de parsing n’est journalisé.

Le schéma `Profile` comprend `schemaVersion=1`, `profileId`, `revision`, `dentistUserId`, `approved=true`, `templateSha256`, `displayNameFr/Ar`, `professionalTitleFr/Ar`, `qualificationsFr/Ar`, `addressFr/Ar`, `phones` et `inpe`. Les textes FR/AR requis sont non vides et limités à 1 000 caractères ; les téléphones sont au nombre de 1 à 4, avec 40 caractères maximum chacun. `inpe` reste nullable, limité à 64 caractères si renseigné. Aucun identifiant professionnel n’est calculé, inventé ou rendu obligatoire par ce lot.

L’opérateur doit vérifier les informations auprès du dentiste, vérifier leur correspondance avec l’en-tête officiel statique du modèle, renseigner le véritable UUID de son compte puis approuver une révision. `templateSha256` doit correspondre au modèle déjà approuvé. La validation logicielle ne certifie pas les titres ni les obligations légales. Le profil ne dessine pas un second en-tête : les coordonnées professionnelles restent dans le modèle existant. L’instantané conserve la révision approuvée qui décrit cet en-tête. L’empreinte n’établit pas, à elle seule, l’exactitude des renseignements ; cette vérification reste une responsabilité explicite de l’opérateur.

Un fichier absent, trop grand, invalide, non approuvé, mal épinglé, lié à un autre modèle ou à un autre compte bloque la finalisation avec `503 PRACTITIONER_UNAVAILABLE`. Les brouillons et téléchargements historiques restent disponibles. Une modification du fichier n’affecte pas le processus déjà lancé : une nouvelle révision nécessite une empreinte mise à jour et un redémarrage. Aucun profil de production n’est livré dans le dépôt.

## Instantané de schéma 1

`PrescriptionSnapshot` conserve des DTO explicites, avec listes défensivement copiées :

- `prescription` : UUID, patient, consultation facultative, version source, date d’émission, lignes ordonnées avec UUID et instructions, instructions générales, dates de création et de dernière modification ;
- `patient` : UUID, référence, prénom, nom, nom d’affichage et version source ; aucune histoire médicale ou autre donnée administrative n’est copiée ;
- `practitioner` : profil professionnel approuvé décrit ci-dessus ;
- `capturedAt`, `finalizedAt`, `finalizedBy` ;
- `generation` : renderer, manifeste du worker, modèle et police avec empreintes, versions `pdf-lib` et `fontkit`, locale, fuseau, mode de rendu, plafond de taille et géométrie A5 attendue.

`capturedAt` est la date de capture cohérente des sources. `finalizedAt` est choisi dans la transaction d’écriture, après le rendu ; il est tronqué à la microseconde et strictement postérieur à la dernière modification. Il ne prétend pas être l’horodatage physique du commit PostgreSQL. Le PDF affiche la date d’émission déjà prévue par le modèle. Ses métadonnées de génération utilisent les dates source capturées, sans modifier la mise en page.

Le détail JSON public expose seulement les métadonnées documentaires approuvées (`snapshotSchemaVersion`, `capturedAt`, `patientIdentity`, `practitionerDisplayName`, `templateId`, `templateSha256`, `rendererId`, `pdfSha256`, `pdfBytes`). Il ne renvoie ni le PDF encodé, ni le profil complet. Le patient courant peut changer ; `document.patientIdentity` reste l’identité historique. Les listes conservent leur projection courte et ajoutent la véritable date de finalisation.

## Frontières transactionnelles et concurrence

1. Une transaction de lecture `REPEATABLE_READ` (timeout 5 s) vérifie le rôle DENTIST, le compte actif et sa version de session, le patient propriétaire, les versions attendues, l’état BROUILLON non archivé et le profil. Au moins une ligne est nécessaire ; nom, dosage, fréquence et durée doivent être renseignés, y compris après prise en compte des espaces Unicode.
2. La transaction se ferme. L’appel Node ne conserve aucun verrou ni connexion transactionnelle. Le worker effectue son contrôle de mise en page finale, sans marqueur BROUILLON. Le validateur PDFBox est appelé de nouveau avant toute écriture : structure, page unique A5, dimensions/boîtes, absence d’éléments actifs et taille bornée.
3. Une nouvelle transaction d’écriture (timeout 10 s) verrouille le compte en lecture partagée, le patient en lecture partagée, la consultation éventuelle en lecture partagée puis l’ordonnance en écriture. Elle revérifie compte/session, versions, état et identité complète du contenu capturé, profil et configuration de génération. Une modification concurrente provoque un refus ; ses octets rendus sont abandonnés.
4. Cette transaction insère document/instantané/hash, passe à `FINALISEE`, avance une fois la version et les métadonnées, puis écrit `PRESCRIPTION_FINALIZED` avec l’acteur authentifié. Un échec de stockage ou d’audit annule tout. Les contraintes différées vérifient la cohérence au commit.

Un concurrent après le commit ou un réessai avec version périmée reçoit 409. Deux finalisations ayant passé la capture ne peuvent créer deux documents : la seconde retrouve une version modifiée sous verrou. Le worker existant garde sa capacité bornée à un rendu ; un appel simultané qui ne peut accéder au worker peut recevoir 503 avant cette étape. Aucun réessai automatique n’est ajouté. Après un timeout HTTP ambigu, relire le détail avant de décider d’un nouvel appel. Le client doit confirmer la version courante plutôt que réessayer aveuglément.

## Migration V8 et invariants SQL

`V8__immutable_prescription_documents.sql` ajoute `finalized_at/by`, la table `prescription_document`, ses bornes, l’empreinte calculée par PostgreSQL et l’événement d’audit. Le snapshot est limité à 256 Kio. La clé primaire documentaire est l’UUID d’ordonnance ; les clés étrangères sont restrictives. Les dates/acteur et identités de l’instantané doivent correspondre à l’agrégat. La version source est celle précédant l’incrément de finalisation.

Les triggers refusent toute modification/suppression d’un document, d’une ordonnance finalisée ou de ses lignes. Un agrégat finalisé sans document, ou un document associé à un brouillon, ne peut être committé. Les brouillons V7 existants restent inchangés ; aucune conversion ni donnée documentaire n’est créée automatiquement. Les migrations V1–V7 restent identiques.

Ces protections concernent le rôle applicatif ordinaire ; un superutilisateur PostgreSQL peut désactiver des triggers. Le système suppose donc aussi la protection du compte et des sauvegardes du serveur.

## API et confidentialité

- `PUT /api/v1/prescriptions/{id}/finalization?patientId=UUID` avec `{ "version": N, "patientVersion": P }` : session DENTIST, CSRF, versions entières sûres et champs stricts. Réponse 200 avec détail finalisé.
- `GET /api/v1/prescriptions/{id}/pdf?patientId=UUID&version=N&disposition=inline|attachment` : session DENTIST, version requise, `inline` par défaut. Réponse `application/pdf`, taille explicite, `nosniff`, `Cache-Control: no-store`, `Vary: Cookie`, nom `ordonnance-{UUID}.pdf`. Le prénom ou nom du patient n’entre jamais dans le nom de fichier.

Aucun endpoint de prévisualisation de brouillon, URL publique, proxy frontend, nouvelle règle de session ou mécanisme d’authentification n’est ajouté. Le contrôle DENTIST existe aussi aux frontières des services. Les requêtes patient/ordonnance sont toujours conjointement bornées ; un autre patient reçoit 404. Les paramètres inconnus, répétés et dispositions arbitraires sont refusés.

Le téléchargement lit les octets stockés et vérifie taille/hash. Il ne régénère pas le document, ne dépend pas du profil actuel ni du runtime Node et reste possible après archivage du patient. Une anomalie documentaire produit une erreur sûre, jamais une réparation silencieuse.

## Échecs et exploitation

Les réponses suivent RFC 9457 sans données cliniques, chemins, commandes, SQL ni causes techniques. Les erreurs de validation sont 400 (`INCOMPLETE_PRESCRIPTION`, `PDF_LAYOUT_OVERFLOW`, `PDF_UNSUPPORTED_CHARACTER` selon le cas), les conflits d’état/version sont 409, les refus de session/rôle ou CSRF restent 401/403. Un renderer désactivé, manquant, occupé, non fiable ou expiré donne `503 RENDERER_UNAVAILABLE`. Un PDF invalide, stockage indisponible ou document corrompu donne `500 DOCUMENT_UNAVAILABLE`. Un PDF au-delà du plafond de rendu est classé indisponibilité de rendu.

Les limites et l’arrêt du worker restent ceux du pont privé : délai configuré, sortie bornée, processus tué/récolté, aucune communication HTTP interne. Les textes cliniques dynamiques arabes restent explicitement refusés. Les caractères arabes de l’en-tête statique sont conservés. Aucune instruction n’est tronquée.

Aucun déploiement ni migration d’une base cabinet n’a été effectué. Avant exploitation, sauvegarder et vérifier la restauration avant d’autoriser V8. Une sauvegarde PostgreSQL cohérente doit inclure ordonnance, lignes, documents `bytea`/JSON, comptes et audit ensemble ; protéger ces sauvegardes comme données de santé. Conserver également les versions approuvées des profils, le worker et ses assets pour la traçabilité, même si la restitution des PDF stockés n’en dépend pas. Ce lot ne démontre aucune conformité légale.

## Validation exécutée

Validation du 11 novembre 2026, avec PostgreSQL 17.11/Testcontainers, Node 24.20.0 et JDK 25.0.4.1 compilant la cible Java 21. Aucun JDK 21 n’étant installé dans cet environnement, ce lot ne revendique pas une exécution sur JDK 21.

| Commande / périmètre | Résultat exécuté |
| --- | --- |
| Nouveaux tests de finalisation HTTP | 27/27, dont A5 réel, instantané/ordre/profil/hash, téléchargement exact, rôles/CSRF, conflits, deux finalisations concurrentes, modifications de brouillon/patient et révocation pendant le rendu, absence de transaction pendant Node, stockage/audit défaillants et immutabilité SQL |
| Nouvelle migration V7→V8 et profil professionnel | 2/2 migrations et 2/2 validations de profil ; données/checksums historiques conservés, absence de profil et substitution refusées |
| Dernier lot ciblé finalisation + rendu sans persistance | 31/31 Java (27 + 4) |
| Régressions ciblées supplémentaires | 26/26 rendez-vous, 24/24 API brouillons, 3/3 migration V6→V7, 12/12 worker, 5/5 validation PDFBox, 6/6 façade de rendu et 2/2 nouvelle migration + 2/2 profil ; tous également réexécutés dans le verify final |
| `./mvnw -B -ntp verify`, une seule exécution globale | **231/231**, 0 échec, 0 erreur, 0 ignoré ; JAR Spring Boot de production créé et reconditionné |
| Node `--import tsx --test --experimental-test-isolation=none tests/prescription-renderer.test.mjs` | **9/9** ; mapping français, dimensions, contenu/positions/fond/boîtes comparés à l’ancien moteur, final sans marqueur, déterminisme, refus arabe/overflow, limites et permissions |
| Harnais navigateur | Attentes V8 alignées des deux côtés ; `node --check` et ESLint ciblé avec `--max-warnings=0` réussis. Pas de nouvelle exécution Playwright dans ce lot |
| Build frontend / TypeScript | Non relancés : aucune application, bibliothèque ou configuration TypeScript frontend modifiée ; seul le contrôle de schéma du harnais MJS change |

Les premiers essais ont révélé trois problèmes corrigés : les dates SQL réelles du compte de test étaient postérieures à l’horloge synthétique, une entrée JSON dupliquée était acceptée et un ancien test attendait l’absence de table documentaire. Les fixtures utilisent maintenant la même horloge ; le parsing prescriptions refuse doublons et contenu JSON supplémentaire ; le test du pont vérifie que la table V8 reste vide pendant un rendu. Le lancement Node initial sans le loader TypeScript de la commande du projet a échoué avant les tests ; la commande correcte ci-dessus a ensuite passé les neuf tests. Le premier appel ESLint depuis la racine affichait un avertissement de chemin Next ; l’appel depuis `frontend` réussit sans avertissement.

Aucun échec intermittent de rendez-vous n’a été observé dans les deux passages de ce lot. Les erreurs internes présentes dans certains logs correspondent aux injections de panne attendues et ne sont pas des échecs de suite. Les marqueurs cliniques et mots de passe sont vérifiés absents des logs par les tests concernés. Les contrôles de whitespace portent sur les 38 fichiers du lot, nouveaux fichiers compris ; `git diff --check`, les liens documentaires locaux et le statut Git final sont vérifiés. Les empreintes V1–V7 et du frontend (hors attente V8 du harnais) sont conservées. Aucun conteneur de test ne reste ; le service/socket Podman privé est arrêté. Aucun commit, push ou déploiement n’a été effectué.

Les anciens checkpoints restent historiques ; aucune réussite frontend globale, Playwright globale ou comparaison visuelle supplémentaire n’est annoncée ici. Les preuves de compatibilité structurelle Node sont nouvelles et les empreintes des assets restent identiques.

## Périmètre restant

L’intégration frontend persistée reste un lot distinct : transport same-origin des deux routes, écrans et confirmation explicite, état de conflit, chargement/erreur/503, affichage d’identité historique et téléchargement des octets immuables. Les attentes de schéma du harnais navigateur sont adaptées à V8, sans nouvelle route proxy ni parcours de finalisation frontend. Les composants React, le générateur navigateur, les modèles, polices et assets n’ont pas changé dans ce lot. Aucun workflow de rectification, remplacement, assurance ou facturation n’est ajouté.


## Fichiers de ce lot

Inventaire par rapport à l’état de travail récupéré au début de 8.5C.2B.2, y compris ses fichiers déjà non suivis. Les autres modifications préexistantes sont conservées.

Créations (11) :

- `backend/src/main/java/ma/sijilmassa/prescription/PractitionerProfiles.java`
- `backend/src/main/java/ma/sijilmassa/prescription/PrescriptionDocumentRepository.java`
- `backend/src/main/java/ma/sijilmassa/prescription/PrescriptionFinalizationService.java`
- `backend/src/main/java/ma/sijilmassa/prescription/PrescriptionFinalizationTransactions.java`
- `backend/src/main/java/ma/sijilmassa/prescription/PrescriptionPdfService.java`
- `backend/src/main/java/ma/sijilmassa/prescription/PrescriptionSnapshot.java`
- `backend/src/main/resources/db/migration/V8__immutable_prescription_documents.sql`
- `backend/src/test/java/ma/sijilmassa/PrescriptionFinalizationIntegrationTest.java`
- `backend/src/test/java/ma/sijilmassa/PrescriptionFinalizationMigrationTest.java`
- `backend/src/test/java/ma/sijilmassa/prescription/PractitionerProfilesTest.java`
- `docs/prescription-finalization-contract.md`

Adaptations (27) :

- `backend/.env.example`
- `backend/src/main/java/ma/sijilmassa/audit/AuditEventType.java`
- `backend/src/main/java/ma/sijilmassa/clinical/ConsultationRepository.java`
- `backend/src/main/java/ma/sijilmassa/common/exception/GlobalExceptionHandler.java`
- `backend/src/main/java/ma/sijilmassa/prescription/Prescription.java`
- `backend/src/main/java/ma/sijilmassa/prescription/PrescriptionController.java`
- `backend/src/main/java/ma/sijilmassa/prescription/PrescriptionDtos.java`
- `backend/src/main/java/ma/sijilmassa/prescription/PrescriptionFailure.java`
- `backend/src/main/java/ma/sijilmassa/prescription/PrescriptionRequestAdvice.java`
- `backend/src/main/java/ma/sijilmassa/prescription/PrescriptionService.java`
- `backend/src/main/java/ma/sijilmassa/prescription/rendering/LocalPrescriptionRenderer.java`
- `backend/src/main/java/ma/sijilmassa/security/SecurityConfiguration.java`
- `backend/src/main/java/ma/sijilmassa/security/UserAccountRepository.java`
- `backend/src/test/java/ma/sijilmassa/AppointmentIntegrationTest.java`
- `backend/src/test/java/ma/sijilmassa/AuthenticationIntegrationTest.java`
- `backend/src/test/java/ma/sijilmassa/BrowserIntegrationEnvironment.java`
- `backend/src/test/java/ma/sijilmassa/PatientIntegrationTest.java`
- `backend/src/test/java/ma/sijilmassa/PostgresFoundationTest.java`
- `backend/src/test/java/ma/sijilmassa/PrescriptionHttpIntegrationTest.java`
- `backend/src/test/java/ma/sijilmassa/PrescriptionMigrationUpgradeTest.java`
- `backend/src/test/java/ma/sijilmassa/prescription/rendering/PrescriptionRenderingIntegrationTest.java`
- `docs/prescription-acceptance-plan.md`
- `docs/prescription-management.md`
- `docs/prescription-persistence-contract.md`
- `docs/prescription-rendering-bridge.md`
- `docs/prescription-rest-contract.md`
- `frontend/tests/browser/run-real-integration.mjs`
