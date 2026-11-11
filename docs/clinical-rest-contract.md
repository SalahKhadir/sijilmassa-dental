# API clinique — phase 8.5A.3

## Périmètre et sécurité

L’API `/api/v1/consultations` expose les opérations du [service clinique](clinical-service-contract.md). Elle ne change ni les règles de clôture, ni la persistance V1–V6, ni les projections administratives. Aucun frontend, proxy Next, PDF ou module financier n’est modifié.

Toutes les routes exigent une session valide et le rôle `DENTIST`, au niveau de l’allowlist HTTP puis du contrôleur et du service. `RECEPTIONIST` reçoit 403 avant l’exécution clinique. Les règles d’authentification, rôles, sessions et CSRF existantes sont conservées ; seules les entrées HTTP cliniques sont ajoutées. Les autres méthodes et chemins restent soumis au refus par défaut.

Le navigateur doit utiliser le cookie de session et le jeton obtenu via `GET /api/v1/auth/csrf`, envoyé dans `X-CSRF-TOKEN` sur chaque POST/PUT. Après login, récupérer un nouveau jeton selon le cycle existant. Une mutation sans jeton valide reçoit 403, même si la session n’est pas authentifiée ; une requête anonyme avec vérification CSRF satisfaite reçoit 401. Aucun jeton, cookie ou contenu clinique ne doit être journalisé.

Les réponses métier portent `Cache-Control: private, no-store`. Les erreurs utilisent également les en-têtes de non-cache de la chaîne de sécurité existante. Toutes les réponses sont destinées à un utilisateur clinique autorisé ; aucune identité administrative détaillée, entité JPA ou donnée d’implémentation SQL n’est retournée.

## Routes

Dans ce tableau, `C` désigne `/api/v1/consultations/{id}`. Tous les paramètres `{id}`, `{treatmentId}`, `patientId`, `appointmentId` et les identifiants de curseur sont des UUID. Le paramètre `patientId` est obligatoire sur toutes les routes sauf POST collection, où il figure dans le corps.

| Méthode et route | Corps / paramètres supplémentaires | Réponse réussie |
| --- | --- | --- |
| POST `/api/v1/consultations` | `Create` | 201 `Details`, avec `Location: C?patientId=…` |
| GET `/api/v1/consultations?patientId=…` | `beforeDate`, `beforeId` facultatifs, fournis ensemble | 200 `HistoryPage` |
| GET `C?patientId=…` | Aucun corps | 200 `Details` |
| PUT `C?patientId=…` | `Update` | 200 `Details` |
| POST `C/treatments?patientId=…` | `TreatmentMutation` | 200 `Details` de l’agrégat modifié |
| PUT `C/treatments/{treatmentId}?patientId=…` | `TreatmentMutation` | 200 `Details` |
| PUT `C/treatments/{treatmentId}/removal?patientId=…` | `ExpectedVersion` | 200 `Details` |
| PUT `C/finalization?patientId=…` | `ExpectedVersion` | 200 `Details` |
| GET `C/treatments/removed?patientId=…` | `afterDate`, `afterId` facultatifs, fournis ensemble | 200 `RemovedPage` |

Les paramètres inconnus, répétés ou les curseurs partiels/vides sont refusés. Les routes de détail et de mutation n’acceptent que `patientId`. POST collection n’accepte aucun paramètre de requête. Aucun texte clinique ou nom de patient ne doit être placé dans l’URL. Le serveur vérifie la propriété patient de la consultation ; fournir un autre patient ne déplace jamais un dossier.

## DTO et validation

`ConsultationDtos` définit les contrats HTTP, séparés des entités et des objets du service. Les propriétés JSON inconnues sont rejetées, y compris dans les contenus imbriqués. Les contraintes de présence, longueur et version utilisent Bean Validation. La validation clinique, les liens, les dates civiles de l’an 1 à 9999 et la syntaxe des références dentaires restent contrôlés par le service.

| DTO d’entrée | Champs |
| --- | --- |
| `Create` | `patientId`, `content: DraftContent` |
| `Update` | `version`, `content: DraftContent` |
| `TreatmentMutation` | `version`, `content: TreatmentContent` |
| `ExpectedVersion` | `version` |

`DraftContent` contient `appointmentId` nullable, `consultationDate`, `chiefComplaint` obligatoire et non blanc (500 caractères maximum), puis `clinicalObservations`, `assessment`, `treatmentPlan` et `notes` (5 000 chacun). Ces quatre textes doivent être présents ; une chaîne vide représente l’absence d’information.

`TreatmentContent` contient `treatmentDate`, `description` obligatoire et non blanche (1 000 caractères maximum), `toothReference` (50 maximum) et `notes` (2 000 maximum). Les deux derniers champs doivent être présents et peuvent être vides. Aucun contenu n’est tronqué. Les normalisations du service restent inchangées.

Les dates cliniques utilisent `AAAA-MM-JJ`, sans heure ni décalage. Les horodatages de réponse sont des instants ISO UTC. Les versions sont des entiers non négatifs représentables par un `Long` Java ; les fractions et débordements sont refusés. Le futur client JavaScript doit aussi contrôler leur représentation comme entiers sûrs avant de les manipuler.

## Réponses

`Details` contient `id`, `patientId`, `version`, `status`, `content: DraftContent`, `treatments`, `createdAt` et `updatedAt`. Les statuts restent `BROUILLON` et `TERMINEE`. Chaque soin actif contient `id`, `version`, `content: TreatmentContent`, `createdAt` et `updatedAt`.

`HistoryPage` contient `items` et `nextCursor`. Chaque résumé contient seulement `id`, `consultationDate`, `status` et `version`, sans charger les notes ou tous les soins. `RemovedPage` contient les mêmes champs de pagination ; chaque élément contient `treatment: TreatmentDetails` et `removedAt`. Cette dernière représentation est explicitement réservée au dentiste, comme le reste de l’API clinique.

## Versions, clôture et retrait

Chaque mutation d’une consultation existante doit envoyer la version parent reçue lors de sa dernière lecture, y compris l’ajout, la correction ou le retrait d’un soin. La version propre du soin est informative dans le contrat HTTP ; elle ne remplace pas la version de l’agrégat. La création initialise la version parent à 0.

Le service conserve son verrouillage patient puis consultation, son contrôle de version et son incrément parent pour chaque mutation acceptée. Un conflit renvoie 409 sans écrasement, rejeu ou renouvellement automatique de version. Après un timeout, vérifier l’état courant avant toute nouvelle tentative : la transaction peut avoir été validée malgré l’absence de réponse reçue.

Le seul changement de statut est `BROUILLON → TERMINEE`. Les consultations terminées et leurs soins ne peuvent être modifiés. Une seconde clôture est un conflit. Les patients archivés gardent leur historique lisible mais refusent toute écriture clinique, y compris la clôture.

Le retrait d’un soin renseigne `removed_at` sans effacer la ligne. Le soin disparaît des vues actives et de la validation de clôture, mais reste dans l’historique séparé. Il ne peut être modifié, retiré une seconde fois ou restauré implicitement. La limite de 50 soins s’applique aux soins actifs. Les événements d’audit restent atomiques avec les changements et ne contiennent aucun texte clinique.

## Pagination bornée

Les pages sont fixes : maximum 50 éléments. Aucun `page` ou `pageSize` n’est accepté. L’historique patient trie par date décroissante puis UUID décroissant. Pour poursuivre, transmettre `nextCursor.date` comme `beforeDate` et `nextCursor.id` comme `beforeId`.

L’historique retiré trie par date du soin puis UUID croissants ; transmettre son curseur comme `afterDate` et `afterId`. Les curseurs sont exclusifs. Lorsque la dernière page compte exactement 50 éléments, le curseur peut mener à une page vide. `nextCursor: null` termine la lecture. Ces pages successives ne constituent pas un snapshot global ; une correction concurrente de date peut déplacer une ligne.

## Erreurs RFC 9457

Les erreurs réutilisent `ApiProblems` et `GlobalExceptionHandler` : `Content-Type: application/problem+json`, `type: about:blank`, `title`, `status`, `detail`, `instance: urn:request:…`, `requestId` et en-tête `X-Request-ID`. Le corps ne recopie ni SQL, stack trace, valeurs rejetées, URL de requête ni contenu clinique. Bean Validation peut ajouter des noms de champs et le message générique « Valeur invalide. ».

| Situation | Statut |
| --- | --- |
| Corps malformé, validation, UUID/date invalide, requête ambiguë ou lien rendez-vous invalide | 400 |
| Session absente, expirée ou révoquée, après contrôle CSRF applicable | 401 |
| Rôle non autorisé, CSRF invalide ou route/méthode refusée par l’allowlist | 403 |
| Patient, consultation ou soin introuvable dans le périmètre demandé | 404 |
| Ancienne version, état clinique incompatible, patient archivé ou rendez-vous déjà lié | 409 |
| Format de corps non pris en charge | 415 |
| Panne inattendue, notamment échec technique de l’audit | 500 |

Le service distingue désormais `TREATMENT_NOT_FOUND` pour un identifiant absent ou étranger et `INVALID_STATE` pour un soin déjà retiré. `INVALID_TREATMENT` reste réservé aux contenus ou cardinalités invalides. Seules les catégories d’erreur sont précisées ; aucune opération auparavant interdite ne devient autorisée. Les contrats patients et rendez-vous restent inchangés.

## Exemples synthétiques

Les UUID ci-dessous sont fictifs ; aucun patient n’est préchargé par cet exemple. Utiliser uniquement un patient synthétique réellement créé dans une base de test.

```http
POST /api/v1/consultations
Content-Type: application/json
X-CSRF-TOKEN: <jeton de la session de test>
```

```json
{
  "patientId": "00000000-0000-4000-8000-000000000001",
  "content": {
    "appointmentId": null,
    "consultationDate": "2026-11-10",
    "chiefComplaint": "Motif synthétique de démonstration",
    "clinicalObservations": "",
    "assessment": "",
    "treatmentPlan": "",
    "notes": "Données fictives uniquement"
  }
}
```

Pour ajouter un soin au brouillon retourné : POST `/api/v1/consultations/{id}/treatments?patientId={patientId}` avec le cookie, CSRF et le corps suivant, en remplaçant `version` par la version parent courante :

```json
{
  "version": 0,
  "content": {
    "treatmentDate": "2026-11-10",
    "description": "Soin synthétique de démonstration",
    "toothReference": "16",
    "notes": ""
  }
}
```

La réponse retourne l’agrégat avec sa nouvelle version. Pour clôturer, utiliser PUT `C/finalization?patientId=…` avec `{"version": 1}` seulement si 1 est toujours la version lue.

## Validation et fichiers

`ClinicalHttpIntegrationTest` utilise un serveur HTTP réel, le vrai login, cookies, CSRF et PostgreSQL 17.11 Testcontainers. Ses comptes et patients sont synthétiques ; aucune configuration `.env`, base ou compte du cabinet n’est utilisé. Les courses HTTP utilisent deux sessions authentifiées distinctes. Les tests de service existants vérifient en complément les attentes de verrous PostgreSQL.

```sh
cd backend
# JDK 21 et Docker accessibles.
./mvnw -B -ntp -Dtest=ClinicalHttpIntegrationTest test
./mvnw -B -ntp -Dtest=ConsultationServiceTest,PatientIntegrationTest,AppointmentIntegrationTest test
./mvnw -B -ntp verify
```

Validation exécutée le 10 novembre 2026 avec Temurin 21.0.13 et PostgreSQL 17.11 :

| Contrôle | Résultat exécuté |
| --- | --- |
| `ClinicalHttpIntegrationTest` | **25 réussis**, 0 échec, 0 erreur, 0 ignoré |
| Régressions ciblées services cliniques, patients et rendez-vous | **76 réussis**, 0 échec, 0 erreur, 0 ignoré |
| `./mvnw -B -ntp verify`, suite complète exécutée une fois | **141 réussis**, 0 échec, 0 erreur, 0 ignoré ; JAR construit et reconditionné |
| SHA-256 V1–V6 | Identiques aux fichiers présents avant cette phase |
| `git diff --check` | Réussite |

La suite HTTP vérifie notamment les deux rôles, les sessions anonymes et révoquées, CSRF sur chaque mutation, les validations, la clôture, les retraits, les conflits concurrents, les projections administratives et le rollback réel après rejet de l’audit. Les comptes et données de test restent dans des conteneurs jetables. Unslop a décliné l’analyse automatique du français ; le document a été relu manuellement. Aucun parcours navigateur ou E2E frontend n’est revendiqué.

Fichiers de cette phase :

- `backend/src/main/java/ma/sijilmassa/clinical/ConsultationController.java` et `ConsultationDtos.java` : nouveaux contrats HTTP.
- `backend/src/main/java/ma/sijilmassa/clinical/ClinicalFailure.java` et `ConsultationService.java` : catégories de refus précises pour les soins.
- `backend/src/main/java/ma/sijilmassa/common/exception/GlobalExceptionHandler.java` : traduction des seules erreurs cliniques.
- `backend/src/main/java/ma/sijilmassa/security/SecurityConfiguration.java` : allowlist DENTIST des nouvelles méthodes/routes.
- `backend/src/test/java/ma/sijilmassa/ClinicalHttpIntegrationTest.java` : nouveaux tests HTTP réels.
- `backend/src/test/java/ma/sijilmassa/clinical/ConsultationServiceTest.java` : assertions adaptées aux catégories d’erreur affinées.
- `docs/clinical-service-contract.md` et ce document.

## Intégration future — phase 8.5B

Ajouter explicitement ces seules routes et méthodes au proxy Next avec cookies, CSRF, limites de corps et absence de cache. Créer un client à DTO stricts et un espace clinique DENTIST utilisant exclusivement les UUID persistants, distinct du prototype. Conserver les saisies lors d’un 409 et proposer une relecture explicite sans rejeu silencieux. Un 401 doit invalider la vue authentifiée ; une panne ne doit jamais charger des fixtures.

Adapter les attentes du harnais navigateur à V1–V6, puis vérifier les parcours PostgreSQL réels, la séparation des rôles et les vues actives/retirées. Aucun de ces changements frontend n’est commencé ici. Il reste aussi à valider les workflows avec le cabinet avant tout usage clinique réel.
