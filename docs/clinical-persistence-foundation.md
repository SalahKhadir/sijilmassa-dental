# Persistance clinique — phase 8.5A.1

Les sections ci-dessous décrivent la fondation livrée en 8.5A.1. L’extension V6 et les règles désormais exécutées par le service sont décrites en fin de document et dans le [contrat de service clinique](clinical-service-contract.md).

## Périmètre et décisions

Cette phase ajoute V5, deux entités JPA et leurs dépôts internes. Elle ne fournit aucun contrôleur, DTO public, service clinique ou branchement frontend. Les consultations du prototype restent en mémoire ; aucune fixture n’est importée dans PostgreSQL.

Le modèle reprend `docs/clinical-workspace.md` et les types et schémas de `frontend/src/lib/consultations/`. Une consultation appartient à un patient réel, avec un rendez-vous facultatif du même patient. Une visite spontanée n’a pas de rendez-vous. Le lien est unique, y compris après clôture ; les statuts des deux domaines restent indépendants. Tous les statuts de rendez-vous sont acceptés pour permettre la documentation rétrospective.

Les dates cliniques sont des `LocalDate`, sans conversion en instant ni déduction automatique depuis le rendez-vous. Les horodatages techniques sont des `Instant`, stockés en `timestamptz`. Les dates passées et futures de l’an 1 à 9999 sont acceptées.

## Tables et relations

| Table | Contenu et relations |
| --- | --- |
| `clinical_consultation` | UUID, version, patient obligatoire, rendez-vous facultatif, date, statut, motif, observations cliniques, évaluation, plan de traitement, notes, création et modification |
| `clinical_treatment` | UUID stable, version, consultation obligatoire, date du soin, description, référence dentaire facultative, notes, création et modification |

Les soins n’ont pas de copie de l’identifiant patient : il est déterminé par la consultation. Les champs facultatifs de texte utilisent une chaîne vide, jamais `NULL`. Le rendez-vous absent utilise `NULL` au lieu de la chaîne vide du prototype.

`Consultation` référence `Patient` et `Appointment` par des relations `ManyToOne` paresseuses. `ClinicalTreatment` référence sa consultation de la même manière. Aucun cascade, `orphanRemoval`, collection implicite de soins ou suppression de patient n’est ajouté. Les jointures patient et consultation d’un soin ne sont pas modifiables par JPA après insertion. Les champs et constructeurs métier restent internes au package `ma.sijilmassa.clinical`, selon les conventions des domaines existants.

## Contraintes et index

- Clés primaires UUID ; versions non négatives ; dates et horodatages obligatoires ; modification au moins égale à la création.
- Statuts limités à `BROUILLON` et `TERMINEE`.
- Motif obligatoire et non blanc, limité à 500 caractères. Observations, évaluation, plan et notes : 5 000 caractères chacun.
- Description de soin obligatoire et non blanche, limitée à 1 000 caractères ; référence dentaire : 50 ; notes : 2 000.
- Clés étrangères avec `ON DELETE RESTRICT`, sans suppression en cascade.
- Unicité du rendez-vous lié. V5 ajoute la clé unique `(id, patient_id)` à `appointment`, puis une clé étrangère composite depuis la consultation. Elle refuse un rendez-vous d’un autre patient et bloque sa réaffectation à un autre patient tant que le lien existe. Aucun enregistrement existant n’est réécrit.
- Index `(patient_id, consultation_date DESC, id DESC)` pour l’historique ; `(consultation_id, treatment_date, id)` pour les soins ; l’unicité du rendez-vous crée son index.

V1–V4 et les contraintes d’audit existantes restent inchangées. V5 ne crée aucun compte ni aucune donnée clinique initiale.

## Brouillons, clôture et concurrence

Le constructeur initialise `BROUILLON`. Un brouillon peut avoir zéro soin et tous ses champs complémentaires vides. Le motif reste requis, comme pour l’enregistrement dans le prototype. Une référence dentaire vide est valide ; ce champ ne prétend pas être un numéro FDI strict.

Chaque entité possède son propre `@Version`. Une modification obsolète de consultation ou de soin est refusée par Hibernate. `createdAt` est fixé à la construction ; `@PreUpdate` avance `updatedAt` lors d’une modification JPA, sans changer la date de création. Les écritures SQL directes ne bénéficient pas de ces mécanismes JPA.

La version d’un soin ne fait pas avancer celle de sa consultation. La phase 8.5A.2 devra donc coordonner chaque modification de soin et la clôture dans une transaction, avec verrouillage ou incrément forcé de la version parent. Le stockage de `TERMINEE` est pris en charge, mais son immutabilité, la transition autorisée et l’interdiction de retirer un soin enregistré ne sont pas encore des règles exécutables. Aucun service ne permet actuellement ces opérations.

Les dépôts participent aux transactions appelantes ; leurs lectures sont `readOnly` et `save` ouvre une transaction d’écriture si nécessaire. Une future écriture clinique devra englober consultation, soins et audit dans une seule transaction. Le test de rollback vérifie déjà leur atomicité sous une transaction englobante.

## Contrats des dépôts

Les dépôts étendent `Repository`, sans exposer `findAll`, `delete` ou un historique sans limite.

| Lecture | Contrat |
| --- | --- |
| Consultation par identifiant | Identifiants consultation et patient requis |
| Première page d’historique | Patient requis, maximum 50 consultations, date décroissante puis UUID décroissant |
| `historyBefore` | Même patient, curseur exclusif `(date, UUID)` de la dernière ligne ; même ordre, maximum 50 |
| Soin par identifiant | Identifiants soin, consultation et patient requis |
| Première page de soins | Consultation et patient requis, maximum 50 soins, date croissante puis UUID croissant |
| `treatmentsAfter` | Même périmètre, curseur exclusif `(date, UUID)` ; même ordre, maximum 50 |

Une page de 50 éléments peut être suivie d’une autre : il faut poursuivre jusqu’à une page plus courte pour lire l’ensemble. L’ordre des UUID est celui de PostgreSQL, utilisé aussi par les comparaisons de curseur. Ces pages ne sont pas un snapshot entre transactions ; une correction de date pendant la lecture peut déplacer une ligne. Les appels qui nécessitent un ensemble cohérent devront définir leur transaction et leur isolation.

Le filtrage patient ne fournit aucune autorisation. Les futurs services doivent imposer `DENTIST` avant toute lecture ou écriture et vérifier les liens et versions. La sécurité HTTP, les rôles et les projections administratives existantes ne sont pas modifiés. Aucun dépôt clinique n’est exposé par REST.

## Écarts et limites

Le prototype accepte 50 soins par consultation et une syntaxe textuelle pour la référence dentaire. La base conserve les longueurs et la possibilité de n’avoir aucun soin ; la limite de cardinalité et la validation Unicode des références devront être imposées transactionnellement dans le futur service. Les tests dépassent volontairement 50 lignes pour vérifier que la pagination de stockage ne tronque pas les lectures.

Le prototype protège les brouillons, les soins enregistrés et les consultations terminées dans son dépôt mémoire. Cette phase n’en reproduit pas les workflows. Elle ne vérifie pas non plus l’activité du patient à la création. Ces règles, l’audit des changements et les corrections de dossiers terminés restent à définir avant toute utilisation clinique réelle.

Les conventions d’audit existantes sont conservées sans ajouter d’événement prématuré. Aucune écriture clinique n’est aujourd’hui auditée par ces seuls dépôts. La phase 8.5A.2 devra ajouter les types et cibles nécessaires par migration additive, sans contenu clinique libre dans les événements.

Le lanceur backend de tests navigateur connaît désormais V5 et les entités cliniques. Le harnais frontend `tests/browser/run-real-integration.mjs` attend encore explicitement V1–V4 : son assertion devra être adaptée à V5 avant le prochain parcours navigateur. Il n’est pas modifié ici conformément à l’interdiction de toucher au frontend. Aucun parcours navigateur n’est revendiqué pour cette phase.

## Validation

Les tests utilisent exclusivement des PostgreSQL 17.11 Testcontainers jetables, sans lecture des `.env` du cabinet ni accès à sa base. `ClinicalMigrationUpgradeTest` vérifie le passage V4 → V5, les checksums V1–V4, la conservation intégrale des patients, questionnaires, rendez-vous, comptes et événements existants, les index et l’absence de préchargement clinique. `ClinicalPersistenceTest` vérifie les deux entités, les liens paresseux, les contraintes, les conflits de versions, les pages chronologiques et le rollback.

Les anciens tests d’intégration patient/rendez-vous incluent les nouvelles tables dans leur nettoyage de base jetable. Le test historique V3 → V4 garde explicitement sa cible V4 ; le test de fondation attend aussi V5.

```sh
cd backend
# JDK 21 et Docker accessibles ; aucune configuration de la base du cabinet requise.
./mvnw -B -ntp -Dtest=ClinicalPersistenceTest,ClinicalMigrationUpgradeTest test
./mvnw -B -ntp verify
```

La suite ciblée exécutée le 10 novembre 2026 avec Temurin 21.0.13 et PostgreSQL 17.11 compte **10 tests réussis, 0 échec, 0 erreur, 0 ignoré**. Une première tentative était bloquée par l’accès Docker du sandbox ; le premier lancement avec Docker a aussi révélé l’absence de la migration de test `validation_probe` dans la configuration du nouveau test. Cette configuration est corrigée selon la convention existante.

La validation finale `./mvnw -B -ntp verify` compte **90 tests réussis, 0 échec, 0 erreur, 0 ignoré**, avec construction et reconditionnement du JAR réussis, en 2 min 04 s. La première exécution complète avait 89 réussites et un échec : le test rendez-vous attendait encore cinq index. V5 en ajoute un sixième pour la clé composite ; l’assertion est adaptée et la suite complète relancée avec succès. Aucun frontend ni parcours navigateur n’est exécuté.

Le contrôle SHA-256 confirme V1–V4 identiques à leur état avant cette phase. `git diff --check` ne signale aucune erreur. Le scanner Unslop a décliné le français ; le document a été relu manuellement.

## Fichiers de cette phase

| Chemin | Modification |
| --- | --- |
| `backend/src/main/resources/db/migration/V5__clinical_consultations.sql` | Nouvelle migration additive |
| `backend/src/main/java/ma/sijilmassa/clinical/Consultation.java` | Nouvelle entité consultation |
| `backend/src/main/java/ma/sijilmassa/clinical/ClinicalTreatment.java` | Nouvelle entité soin |
| `backend/src/main/java/ma/sijilmassa/clinical/ConsultationRepository.java` | Nouveau dépôt consultation |
| `backend/src/main/java/ma/sijilmassa/clinical/ClinicalTreatmentRepository.java` | Nouveau dépôt soin |
| `backend/src/test/java/ma/sijilmassa/clinical/ClinicalPersistenceTest.java` | Neuf nouveaux tests de persistance |
| `backend/src/test/java/ma/sijilmassa/ClinicalMigrationUpgradeTest.java` | Nouveau test V4 → V5 |
| `backend/src/test/java/ma/sijilmassa/AppointmentMigrationUpgradeTest.java` | Cible V4 explicite du test historique |
| `backend/src/test/java/ma/sijilmassa/AppointmentIntegrationTest.java` | Nettoyage des nouvelles tables, attente V5 et sixième index |
| `backend/src/test/java/ma/sijilmassa/PatientIntegrationTest.java` | Nettoyage des nouvelles tables et attente V5 |
| `backend/src/test/java/ma/sijilmassa/PostgresFoundationTest.java` | Attente de V5 |
| `backend/src/test/java/ma/sijilmassa/BrowserIntegrationEnvironment.java` | Baseline V5 et scan des entités cliniques |
| `docs/clinical-persistence-foundation.md` | Contrat, limites et validation |

Les changements non commités des phases précédentes sont conservés. Aucun fichier frontend, template PDF, configuration de sécurité ou code d’audit n’est modifié par cette phase.

## Préparation historique de la phase 8.5A.2

Définir les services transactionnels réservés au dentiste : validation, création et correction de brouillons, gestion des identifiants stables des soins, clôture concurrente et audit atomique. Fixer les règles concernant les patients archivés et les corrections après clôture. Cette phase ne commence aucun de ces travaux.

## Extension livrée — V6 et phase 8.5A.2

V6 ajoute un timestamp nullable `removed_at` aux soins. Les lignes existantes restent actives ; un retrait conserve physiquement le contenu et exclut la ligne des vues actives et de la clôture. Le service ne permet ni correction d’un soin retiré ni restauration. L’historique interne des retraits reste réservé au dentiste et borné à 50 lignes par page.

Le journal existant reçoit une cible consultation et quatre types d’actions cliniques, avec acteur obligatoire et sans payload clinique. L’audit est écrit dans la même transaction que l’opération et son échec annule les changements. V1–V5, leurs clés étrangères et leurs données ne sont pas réécrits.

`ConsultationService` impose DENTIST sur toutes ses opérations. Les patients archivés restent lisibles mais ne peuvent recevoir aucune écriture clinique. Le patient d’une consultation est conservé, les rendez-vous doivent appartenir à ce patient et leur unicité reste garantie par V5.

Toutes les mutations prennent les verrous patient puis consultation, vérifient la version parent et la font avancer, y compris lors d’un changement de soin. Les dossiers terminés sont immuables. Les dates et limites cliniques de V5 restent en vigueur ; la limite de 50 soins porte sur les soins actifs. Les timestamps JPA cliniques utilisent la précision microseconde de PostgreSQL.

Les dépôts restent internes et ne fournissent aucune autorisation par eux-mêmes. Les DTO détachés, requêtes bornées, erreurs, courses entre transactions et limites d’isolation sont détaillés dans le [contrat de service](clinical-service-contract.md). Le lanceur backend de tests navigateur attend V6 ; son homologue frontend reste inchangé. Aucune route REST, intégration frontend ou modification de PDF n’est livrée.

Validation du 10 novembre 2026 : **36 tests cliniques ciblés réussis**, puis une vérification isolée de la collision SQL renforcée réussie ; **116 tests backend réussis** dans la suite complète finale, aucun échec, erreur ou test ignoré. Le JAR est construit avec Java 21, V1–V5 gardent leurs empreintes et `git diff --check` réussit. Voir le contrat de service pour les commandes et l’inventaire des fichiers de 8.5A.2.
