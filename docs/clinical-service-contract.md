# Services cliniques — phase 8.5A.2

Ce document décrit le service livré en 8.5A.2. Son exposition HTTP de phase 8.5A.3 est décrite dans le [contrat REST clinique](clinical-rest-contract.md). Les refus de soins introuvables et retirés y reçoivent des catégories distinctes, sans changement de cycle métier.

## Périmètre

`ConsultationService` fournit les opérations cliniques internes sur PostgreSQL. Aucun contrôleur, endpoint, branchement frontend, prescription ou calcul financier n’est ajouté. Les données de démonstration du frontend restent séparées. V1–V5 ne changent pas ; V6 complète la persistance décrite dans [la fondation clinique](clinical-persistence-foundation.md).

## Migration V6

`V6__clinical_lifecycle_support.sql` ajoute `clinical_treatment.removed_at`, nullable. Les soins existants restent actifs sans réécriture de contenu. La contrainte temporelle impose `created_at <= removed_at <= updated_at` lorsqu’un soin est retiré. Un index partiel `(consultation_id, treatment_date, id)` couvre les soins actifs. Les clés étrangères et la propriété patient/rendez-vous de V5 sont conservées.

L’audit existant reçoit `target_consultation_id`, avec une clé étrangère restrictive et un index par consultation et instant. Quatre types d’événements sont autorisés : `CONSULTATION_CREATED`, `CONSULTATION_DRAFT_UPDATED`, `CONSULTATION_TREATMENT_CHANGED` et `CONSULTATION_FINALIZED`. Ces événements exigent un acteur et une consultation ; les autres cibles restent nulles. Les événements antérieurs ne peuvent pas porter cette nouvelle cible. Aucun payload libre ou second journal n’est créé.

## Contrat du service

Les commandes et résultats sont des records détachés dans `ClinicalModels`. Les entités JPA ne quittent pas le service. Les textes sont normalisés avec `strip`, validés sans inclure leur contenu dans les exceptions, et leur `toString` masque le contenu clinique. Les listes de résultats sont immuables.

| Méthode | Entrée et résultat |
| --- | --- |
| `create` | Patient réel et `Draft` ; crée un brouillon sans soin, version 0 |
| `get` | Patient et consultation ; retourne le compte rendu et les soins actifs |
| `update` | Même périmètre, version parent et `Draft` ; remplace les champs du brouillon et son lien facultatif au rendez-vous |
| `addTreatment` | Périmètre, version parent et `Treatment` ; crée un soin actif avec un nouvel UUID |
| `editTreatment` | Périmètre, identifiant du soin, version parent et contenu ; conserve UUID et date de création du soin |
| `removeTreatment` | Périmètre, identifiant du soin et version parent ; marque le soin retiré sans le supprimer |
| `finalizeConsultation` | Périmètre et version parent ; valide le contenu actif puis passe à `TERMINEE` |
| `history` | Patient et curseur facultatif ; retourne au plus 50 résumés chronologiques |
| `removedTreatments` | Périmètre et curseur facultatif ; historique interne de 50 soins retirés au maximum |

`Draft` reprend rendez-vous facultatif, date de consultation, motif, observations, évaluation, plan et notes. `Treatment` reprend date, description, référence dentaire et notes. Les limites de longueur et les dates civiles de l’an 1 à 9999 restent celles du prototype et de V5. Les références dentaires acceptent lettres Unicode, chiffres, espaces et séparateurs simples ; elles ne sont pas une validation FDI stricte. Les valeurs nulles, dates hors plage, caractères NUL et textes obligatoires blancs sont refusés. Les champs facultatifs utilisent une chaîne vide.

## Autorisation, patients et rendez-vous

Le service porte `@PreAuthorize(RolePolicies.CLINICAL)` : chaque méthode publique exige `DENTIST`. L’accueil et les appels anonymes sont refusés par Spring Security avant l’exécution métier. Les écritures récupèrent l’acteur depuis `AccountPrincipal`, selon les conventions existantes. Le contexte de sécurité doit provenir des mécanismes d’authentification du projet ; le service ne crée pas de session.

Un patient archivé conserve son historique lisible par le dentiste. Toute écriture clinique, y compris la clôture et le retrait d’un soin, est refusée. Aucun appel ne réactive un patient. Une lecture clinique n’est pas ajoutée aux services administratifs.

Le patient ne figure pas dans les champs remplaçables. Chaque recherche de consultation est limitée au patient demandé. Le rendez-vous facultatif doit exister et appartenir à ce même patient. Tous ses statuts restent acceptés pour la documentation rétrospective ; les statuts administratif et clinique sont indépendants. L’unicité du lien est contrôlée avant l’écriture et garantie par PostgreSQL, même entre transactions concurrentes. La clé composite de V5 refuse aussi une réaffectation administrative incompatible.

## Cycle et retrait des soins

Le seul passage de statut est `BROUILLON → TERMINEE`. Un brouillon peut n’avoir aucun soin. La clôture requiert un motif valide et valide chaque soin actif ; elle n’impose pas d’observation, d’évaluation ou de soin supplémentaire absent du contrat existant.

Une consultation terminée refuse toute modification, ajout, correction, retrait ou nouvelle clôture. Aucun appel ne rouvre ou ne supprime une consultation. Un soin retiré refuse correction et second retrait ; aucune commande ne permet de le restaurer. Un ajout explicite crée toujours un autre UUID.

Les soins retirés restent stockés avec leur contenu, dates et version. Ils sont exclus des résultats actifs et de la validation de clôture. Leur contenu est accessible uniquement par la méthode interne `removedTreatments`, protégée comme les autres lectures cliniques. Il n’entre jamais dans les événements d’audit. La limite de 50 soins porte sur les soins actifs ; retirer un soin libère une place sans effacer la ligne.

## Transactions et concurrence

Chaque mutation prend d’abord le verrou partagé du patient utilisé par les services existants, puis un verrou pessimiste d’écriture sur la consultation. Le premier verrou coordonne l’opération avec l’archivage administratif. Le second sérialise les mutations de tout l’agrégat.

La version parent soumise est comparée après acquisition du verrou. Chaque mutation acceptée d’un brouillon existant, même avec un contenu identique, modifie le timestamp parent et fait avancer son `@Version` exactement une fois avant le retour du résultat. Les ajouts, corrections et retraits de soins suivent tous cette voie. Les versions des enfants restent également gérées par JPA, mais ne remplacent pas la version parent dans les commandes.

Un concurrent attend le commit ou rollback du premier, puis vérifie la version courante. Une ancienne saisie produit `CONCURRENCY_CONFLICT` ; elle n’est ni fusionnée ni rejouée. Cela couvre deux brouillons concurrents, des soins différents et les courses entre clôture et modification. Une seconde clôture avec l’ancienne version est un conflit ; avec la version courante d’un dossier déjà terminé, c’est un état invalide.

Les écritures de consultation, soins et audit partagent la transaction. Les flushs rendent les contraintes et versions effectives avant de construire le résultat. Un échec d’audit annule aussi le changement clinique et ses incréments de version. Une transaction englobante peut annuler l’ensemble. Aucun événement n’est écrit dans une transaction indépendante.

`get` et `removedTreatments` utilisent `REPEATABLE_READ` lorsqu’ils ouvrent leur transaction pour éviter un assemblage parent/soins provenant de deux états validés différents. Comme dans les autres services, une transaction englobante conserve ses propres paramètres d’isolation. Les timestamps cliniques sont alignés sur la précision microseconde PostgreSQL pour que la réponse d’une mutation corresponde à sa relecture.

## Lectures bornées

L’historique patient contient UUID, date, statut et version, sans charger tous les soins ni les notes. L’ordre est date décroissante puis UUID décroissant, avec curseur exclusif `(date, UUID)` et pages fixes de 50. `nextCursor` peut mener à une page vide lorsque le dernier lot contient exactement 50 éléments.

Les soins actifs sont triés par date puis UUID croissants. Une lecture limitée à 51 lignes détecte une cardinalité héritée supérieure à 50 et refuse un résultat partiel. L’historique des soins retirés suit le même ordre croissant, avec curseur exclusif et maximum 50 par appel. Le curseur de continuation est celui de la dernière ligne ; poursuivre jusqu’à une page plus courte. Les anciens accès de dépôt sans filtre `removed_at` restent des primitives internes de persistance, pas des vues actives ni des frontières d’autorisation.

Les pages d’historique successives ne constituent pas un snapshot global : une correction de date entre appels peut déplacer une ligne. Les comparaisons d’UUID sont celles de PostgreSQL.

## Audit et erreurs

Une création, une mise à jour de brouillon, chaque mutation de soin et une clôture réussie produisent chacune un événement. Le journal conserve uniquement UUID de l’événement, acteur, action, consultation et instant ; aucun motif, note, description de soin, cookie, mot de passe ou jeton n’est enregistré. Les lectures et les opérations refusées ne créent pas d’événement métier réussi.

`ClinicalFailure` ne contient qu’une catégorie et un message générique, sans payload ni statut HTTP. Les catégories sont `PATIENT_NOT_FOUND`, `CONSULTATION_NOT_FOUND`, `TREATMENT_NOT_FOUND`, `ARCHIVED_PATIENT`, `INVALID_STATE`, `INVALID_INPUT`, `INVALID_TREATMENT`, `CONCURRENCY_CONFLICT`, `INVALID_APPOINTMENT` et `DUPLICATE_APPOINTMENT`. En phase 8.5A.3, les soins absents ou étrangers deviennent `TREATMENT_NOT_FOUND` et les soins déjà retirés deviennent `INVALID_STATE` ; le contenu invalide reste `INVALID_TREATMENT`. Le refus de rôle utilise les exceptions Spring Security existantes. Les conflits de version JPA et les contraintes connues de lien rendez-vous sont traduits sans recopier les détails SQL. Les autres pannes de persistance restent des erreurs techniques transactionnelles.

## Validation

Les tests utilisent uniquement PostgreSQL 17.11 Testcontainers et des comptes synthétiques, sans lire les `.env` du cabinet. `ClinicalLifecycleMigrationTest` vérifie V5 → V6, les checksums antérieurs, la conservation des lignes et les contraintes d’audit. `ConsultationServiceTest` couvre les opérations, les refus, les limites, l’historique retiré, la confidentialité et le rollback. Les courses attendent un vrai verrou PostgreSQL entre transactions indépendantes ; la collision de rendez-vous force le passage par la contrainte unique, sans s’appuyer seulement sur le précontrôle.

```sh
cd backend
# JDK 21 et Docker accessibles.
./mvnw -B -ntp -Dtest=ClinicalLifecycleMigrationTest,ConsultationServiceTest,ClinicalPersistenceTest,ClinicalMigrationUpgradeTest test
./mvnw -B -ntp verify
```

Validation exécutée le 10 novembre 2026 avec Temurin 21.0.13 et PostgreSQL 17.11 :

| Contrôle | Résultat exécuté |
| --- | --- |
| Suite clinique ciblée, quatre classes ci-dessus | **36 réussis**, 0 échec, 0 erreur, 0 ignoré |
| Collision de rendez-vous renforcée pour forcer la contrainte SQL, exécutée séparément | **1 réussi**, 0 échec, 0 erreur, 0 ignoré |
| `./mvnw -B -ntp verify`, suite backend complète sur les sources finales | **116 réussis**, 0 échec, 0 erreur, 0 ignoré ; JAR construit et reconditionné, 2 min 11 s |
| SHA-256 V1–V5 | Identiques aux fichiers présents avant cette phase |
| `git diff --check` | Réussite |

Les premières exécutions ciblées ont corrigé l’ordre d’initialisation de la nouvelle fixture Testcontainers puis la précision temporelle des entités cliniques. Les courses et règles de service sont confirmées par la suite finale. Unslop a décliné l’analyse automatique du français ; la documentation a été relue manuellement. Aucun test frontend ou navigateur n’est exécuté pour cette phase, et aucun compte ou volume réel n’est utilisé.

## Fichiers de cette phase

- `backend/src/main/resources/db/migration/V6__clinical_lifecycle_support.sql`
- `backend/src/main/java/ma/sijilmassa/clinical/{ClinicalFailure,ClinicalModels,ConsultationService}.java` : nouveaux contrats et service.
- `backend/src/main/java/ma/sijilmassa/clinical/{Consultation,ClinicalTreatment}.java` : précision temporelle et marqueur de retrait.
- `backend/src/main/java/ma/sijilmassa/clinical/{ConsultationRepository,ClinicalTreatmentRepository}.java` : verrou, contrôle de lien et lectures actives/retirées bornées.
- `backend/src/main/java/ma/sijilmassa/appointment/AppointmentRepository.java` : lecture limitée au patient.
- `backend/src/main/java/ma/sijilmassa/audit/{AuditEventType,SecurityAudit,SecurityAuditEvent}.java` : événements et cible clinique.
- `backend/src/test/java/ma/sijilmassa/ClinicalLifecycleMigrationTest.java` et `clinical/ConsultationServiceTest.java` : nouveaux tests.
- `backend/src/test/java/ma/sijilmassa/{ClinicalMigrationUpgradeTest,PostgresFoundationTest,PatientIntegrationTest,AppointmentIntegrationTest,BrowserIntegrationEnvironment}.java` : cible historique V5 conservée et attentes V6.
- `docs/clinical-persistence-foundation.md` et ce document.

## Limites et phase 8.5A.3

Les règles du service ne sont pas des triggers interdisant les écritures SQL directes ou les usages internes des dépôts. Les corrections après clôture, la restauration des soins et un historique complet des anciennes versions du contenu ne sont pas proposés. L’audit ne remplace pas cet historique de contenu. Aucune conformité réglementaire ou possibilité d’usage clinique réel n’est déduite de cette phase.

La phase 8.5A.3 devra définir les DTO et contrôleurs REST, leurs validations de transport, la traduction RFC 9457, les routes autorisées, CSRF et tests HTTP des deux rôles. Le frontend et son harnais navigateur, qui attend encore V1–V4, restent inchangés ; les assertions de migration devront être adaptées avant leur prochaine validation. Aucun endpoint clinique ni travail de phase 8.5A.3 n’est commencé ici.
