# Rendez-vous persistants — phase 8.4A

Le backend expose un agenda persistant unique pour le cabinet. Les écrans et dépôts de rendez-vous frontend restent synthétiques ; ils ne sont pas intégrés à cette API. Aucun lien persistant avec consultations, factures, prescriptions ou assurances n’est créé.

## Audit du domaine et décisions

| Source existante | Observation | Contrat backend |
| --- | --- | --- |
| `appointments/types.ts` | `id`, `patientId`, date, heure HH:mm, durée, catégorie, motif, notes, statut, métadonnées | UUID serveur, patient PostgreSQL, instants début/fin, catégorie, statut, version et métadonnées |
| Catégories | CONSULTATION, CONTROLE, DETARTRAGE, SOIN_DENTAIRE, EXTRACTION, AUTRE | Codes conservés ; libellés français existants réutilisables |
| Statuts | EN_ATTENTE, CONFIRME, TERMINE, ANNULE, ABSENT | Aucun nouveau statut ; création uniquement EN_ATTENTE |
| Durées du schéma | Entiers de 30 à 180 minutes, même journée ; fin 24:00 possible | Bornes conservées comme limites techniques initiales, durée réelle écoulée ; fin au plus à minuit local suivant |
| Horaires | `developmentSchedule` explicitement fictif, à confirmer | Aucun horaire d’ouverture ou pause imposé ; dimanche autorisé |
| Chevauchement | EN_ATTENTE/CONFIRME/TERMINE réservent le créneau ; ANNULE/ABSENT le libèrent | Sémantique conservée, contrainte d’exclusion PostgreSQL |
| Ressource | Aucun identifiant de dentiste ou fauteuil ; un dentiste dans le produit actuel | Un seul agenda global, aucune table de ressources ou prise en charge multi-dentiste |
| Temps | Date/heure civiles, calculs de calendrier par substitut UTC ; heure courante Casablanca | Instants explicites, règles IANA Africa/Casablanca, sans dépendance au fuseau machine |
| Patient | Identifiants `patient-demo-…`, sélection depuis le dépôt mémoire | UUID patient réel obligatoire ; aucune conversion de fixture ou création implicite |
| Permissions | Prototype autorise les corrections entre tous les statuts | Administration aux deux rôles ; achèvement réservé au dentiste et immuable ensuite |
| Dépendances | Consultations verrouillent la réaffectation du patient en mémoire ; facturation reste indirecte et synthétique | Aucun effet sur ces modules ; leur future intégration devra définir les règles de liaison |

Les champs libres `reason` (300 caractères) et `notes` (1 000) portent des étiquettes administratives dans le prototype, sans garantie sur leur contenu. Ils ne sont **pas acceptés, stockés ou renvoyés** par cette API. La catégorie constitue son libellé. Aucun diagnostic, constat médical, soin, réponse de questionnaire ou nom de patient n’entre dans les DTO agenda. La décision d’ouvrir un texte libre aux deux rôles devra être revue explicitement avant son intégration.

Le prototype permettait aussi de modifier un rendez-vous terminé et d’en corriger librement le statut. Cette API ferme ces écritures pour préserver l’historique : TERMINE est terminal. Une éventuelle correction historique exigera un futur flux dentiste explicite et audité. Les bornes de durée et les horaires réels restent à confirmer avec le cabinet ; aucun paramétrage d’exploitation n’est ajouté ici.

## Fichiers concernés

- `backend/src/main/java/ma/sijilmassa/appointment/` : DTO et enums, entité, dépôt, service, contrôleur, exception métier.
- `backend/src/main/resources/db/migration/V4__appointments_and_scheduling_integrity.sql` : schéma, contraintes, index et audit.
- `audit/AuditEventType.java`, `audit/SecurityAudit.java`, `audit/SecurityAuditEvent.java` : cible et événements rendez-vous transactionnels.
- `security/SecurityConfiguration.java`, `common/exception/GlobalExceptionHandler.java` : routes autorisées et erreurs sûres.
- `patient/Patient.java` : lecture interne du statut actif sous le verrou déjà fourni par le dépôt patient.
- `AppointmentIntegrationTest`, `AppointmentMigrationUpgradeTest` : nouveaux tests PostgreSQL réels ; tests patients/fondation et lanceur navigateur ajustés à V4.
- `frontend/tests/browser/run-real-integration.mjs` : attente de V4 uniquement dans l’infrastructure de test ; aucun code frontend opérationnel modifié.
- `backend/README.md`, `docs/backend-architecture.md` et le présent contrat : documentation.

## Schéma et protection native

V4 crée uniquement `appointment`, puis étend l’audit existant. V1/V2/V3 restent inchangées. Aucun rendez-vous n’est préchargé.

| Colonne | Type et règle |
| --- | --- |
| `id` | UUID PK généré côté serveur |
| `patient_id` | UUID NOT NULL, FK vers patient, ON DELETE RESTRICT |
| `version` | bigint ≥ 0, version optimiste JPA indépendante |
| `start_at`, `end_at` | timestamptz NOT NULL ; années supportées 1–9999 |
| `appointment_type` | varchar avec CHECK sur les six codes |
| `status` | varchar avec CHECK sur les cinq codes |
| `created_at`, `updated_at` | timestamptz, horodatage monotone, métadonnées serveur |

Les CHECK assurent une durée de 30 à 180 minutes et des instants alignés sur la minute ; une fin antérieure ou égale au début est donc impossible. La limite de journée locale est contrôlée au service avec la base de fuseaux du JDK. Le contrôle de début/fin utilise la durée écoulée, même lors d’un changement d’heure.

La contrainte PostgreSQL autoritaire est :

```sql
EXCLUDE USING gist (tstzrange(start_at, end_at, '[)') WITH &&)
WHERE (status IN ('EN_ATTENTE', 'CONFIRME', 'TERMINE'))
```

Elle couvre toutes les lignes de l’agenda unique, y compris deux insertions ou déplacements concurrents. `[a,b)` et `[b,c)` sont adjacents, sans conflit. Annulation et absence libèrent le créneau ; la réactivation doit le réserver à nouveau. TERMINE le conserve, comme le prototype, pour éviter la superposition d’activités historiques.

`tstzrange`, l’opérateur `&&`, GiST et l’exclusion sont spécifiques à PostgreSQL. Une seule dimension temporelle suffit : **aucune extension `btree_gist` n’est nécessaire**. Un second index GiST non partiel sert les lectures incluant les rendez-vous annulés/absents ; des index B-tree `(patient_id,start_at,id)` et `(start_at,id)` complètent les accès. Aucun verrou applicatif global ou simple contrôle optimiste ne remplace l’exclusion.

Le service vérifie aussi la disponibilité pour refuser tôt une demande incompatible. Un conflit découvert par ce contrôle ou par PostgreSQL reçoit le même 409 RFC 9457 générique, sans SQL, nom de contrainte ni détail du rendez-vous concurrent. Aucun rejeu automatique n’est effectué.

## API versionnée

Toutes les réponses utilisent des DTO explicites, sans sérialisation d’entité, avec `Cache-Control: no-store, private`.

| Méthode et route | Corps / résultat |
| --- | --- |
| POST `/api/v1/appointments` | `Create` → 201 `Details`, Location relative, statut initial EN_ATTENTE |
| GET `/api/v1/appointments/{id}` | 200 `Details` |
| GET `/api/v1/appointments` | `from`, `to` requis ; `patientId`, `page`, `pageSize` facultatifs → 200 `CalendarPage` |
| PUT `/api/v1/appointments/{id}` | Remplacement des champs de planification avec version → 200 `Details` |
| PUT `/api/v1/appointments/{id}/status` | Version et statut → 200 `Details` |

Pas de DELETE, PATCH, route publique, endpoint de consultation, ou commande de facturation. Jour/semaine/mois utilisent la même lecture bornée. Les identifiants et métadonnées envoyés en plus des champs prévus, les textes libres et les champs cliniques sont refusés.

Exemple synthétique de création :

```json
{
  "patientId": "00000000-0000-4000-8000-000000000001",
  "startAt": "2027-01-10T11:00:00+01:00",
  "endAt": "2027-01-10T11:30:00+01:00",
  "type": "CONSULTATION"
}
```

L’UUID d’exemple doit être remplacé par celui d’un patient synthétique réellement créé. Réponse illustrative :

```json
{
  "id": "00000000-0000-4000-8000-000000000002",
  "patientId": "00000000-0000-4000-8000-000000000001",
  "startAt": "2027-01-10T10:00:00Z",
  "endAt": "2027-01-10T10:30:00Z",
  "type": "CONSULTATION",
  "status": "EN_ATTENTE",
  "createdAt": "2026-11-09T12:00:00Z",
  "updatedAt": "2026-11-09T12:00:00Z",
  "version": 0
}
```

Le PUT de planification reprend `patientId`, `startAt`, `endAt`, `type`, plus `version`. Il ne change pas le statut. Le PUT de statut contient seulement `{ "version": 0, "status": "CONFIRME" }`. Le backend ne renvoie aucun résumé de patient ; les informations administratives doivent être obtenues par l’API patient autorisée, sans dossier médical.

## Lecture du calendrier et fuseau

Les horodatages d’entrée sont ISO 8601 avec décalage obligatoire (`Z` ou `±HH:mm`). Les dates/heures sans décalage sont refusées. Toute représentation équivalente d’un instant est acceptée ; les réponses sont normalisées en UTC `Z`. Un décalage fourni est interprété comme tel, sans supposer qu’il correspond à l’heure locale marocaine.

Le service utilise explicitement `Africa/Casablanca`, jamais le fuseau par défaut du serveur ni un UTC+1 fixe. Le futur frontend devra résoudre ses dates/heures civiles avec les règles IANA, refuser une heure inexistante et demander le choix du décalage pour une heure répétée. Cette conversion ne doit pas utiliser `new Date(date + heure)` dans le fuseau arbitraire du navigateur.

Pour un jour local D : `from = D.atStartOfDay(Africa/Casablanca).toInstant()` et `to = D.plusDays(1).atStartOfDay(Africa/Casablanca).toInstant()`. Même principe pour les bornes civiles d’une semaine ou grille mensuelle. Une journée peut durer 23 ou 25 heures : ne pas calculer sa fin par ajout fixe de 24 heures. Le rendez-vous lui-même utilise une durée écoulée de 30–180 minutes.

Une lecture renvoie les rendez-vous qui **chevauchent** `[from,to)`, y compris ceux commençant avant `from` mais finissant après. Une fin exactement à `from` ou un début exactement à `to` est exclu. La fenêtre maximale est de **43 jours écoulés**, suffisante pour une grille de 42 dates locales traversant un changement d’heure. Tous les statuts sont inclus pour permettre leur affichage administratif.

`page` commence à 1 (maximum 100 000), `pageSize` vaut 50 par défaut (1–100). Réponse `{items,total,page,pageSize,pageCount}`, minimum pageCount=1. Tri stable par début puis UUID ; toutes les pages nécessaires doivent être lues, sans considérer la première comme un calendrier complet. Les paramètres inconnus ou répétés sont refusés. Le filtre patient utilise un UUID exact, sans recherche de nom ou texte sensible dans l’URL. Un filtre sur un UUID sans rendez-vous retourne une page vide.

## Patients, cycle de vie et autorisations

| Statut actuel | Transitions vers un autre statut |
| --- | --- |
| EN_ATTENTE | CONFIRME, ANNULE, ABSENT pour les deux rôles ; TERMINE pour le dentiste |
| CONFIRME | EN_ATTENTE, ANNULE, ABSENT pour les deux rôles ; TERMINE pour le dentiste |
| ANNULE | EN_ATTENTE, CONFIRME, ABSENT pour les deux rôles ; TERMINE pour le dentiste |
| ABSENT | EN_ATTENTE, CONFIRME, ANNULE pour les deux rôles ; TERMINE pour le dentiste |
| TERMINE | Aucune transition ou modification de planification |

Une confirmation dentiste explicite est nécessaire avant d’envoyer TERMINE : ce statut atteste une activité clinique achevée, sans créer un soin ou une consultation. Le dentiste peut corriger un ancien statut non terminal en TERMINE ; la réservation et l’état du patient sont revérifiés. Aucun changement automatique selon l’heure, aucune règle fictive sur le passé/futur n’est imposée. Une demande du statut déjà courant ne modifie rien, mais exige sa version actuelle ; l’accueil ne peut jamais demander TERMINE, même comme no-op.

| Opération | Dentiste | Accueil |
| --- | --- | --- |
| Lire/lister, créer, déplacer, réaffecter un patient actif, modifier une catégorie | Oui | Oui |
| EN_ATTENTE, CONFIRME, ANNULE, ABSENT selon la matrice | Oui | Oui |
| Passer à TERMINE | Oui | 403 |
| Modifier ou rouvrir TERMINE | 409 | Refus |
| Accès sans session | 401 | 401 |

Les filtres HTTP et les autorisations de contrôleur/service appliquent ces limites. Le statut clinique est également contrôlé dans le service ; cacher une action n’accorde aucun droit. Cookies de session, révocation serveur, CSRF sur chaque mutation et refus par défaut restent inchangés. Sans CSRF, un appel peut recevoir 403 avant l’évaluation de la session.

Patient inconnu : 404. Patient inactif : 409 pour création, déplacement/réaffectation ou transition vers un statut occupant un créneau, y compris TERMINE. Le verrou partagé sur sa ligne coordonne ces contrôles avec l’archivage administratif. Un archivage postérieur à une réservation validée n’annule pas ses rendez-vous et ne supprime aucun historique. Les rendez-vous restent lisibles ; leur annulation ou passage en ABSENT restent possibles. Restaurer le patient permet une nouvelle réservation. Aucun identifiant `patient-demo-…` ou `appointment-demo-…` n’est accepté comme UUID.

## Transactions, versions et audit

Le remplacement de planification, la mutation de statut et leur audit sont chacun atomiques. Les versions JPA détectent deux écritures d’un même rendez-vous ; l’exclusion détecte les collisions entre lignes différentes. Une version absente/fractionnaire/négative reçoit 400, une version obsolète 409. Aucun écrasement silencieux ou retry d’écriture n’est ajouté.

L’audit conserve seulement acteur UUID, cible rendez-vous UUID, type et instant :

- APPOINTMENT_CREATED à la création ;
- APPOINTMENT_UPDATED à chaque PUT de planification accepté ;
- APPOINTMENT_RESCHEDULED en plus si début ou fin change ;
- APPOINTMENT_CANCELLED lors du passage à ANNULE ;
- APPOINTMENT_STATUS_CHANGED pour les autres changements de statut.

`target_appointment_id` référence le rendez-vous et son CHECK impose acteur présent, absence de sujet utilisateur et de cible patient. Les événements d’authentification et patients conservent leurs contraintes. Le service d’audit exige la transaction existante. Un échec d’audit annule toute l’écriture métier ; aucune annulation physique ou historisation du contenu des créneaux n’est ajoutée.

## Vérification et limites

Vérification finale exécutée le 9 novembre 2026 avec Java Temurin 21.0.13, Docker 29.9.3 et PostgreSQL 17.11 :

| Contrôle | Résultat |
| --- | --- |
| `./mvnw -B -ntp verify` | **80 tests réussis**, 0 échec, 0 erreur, 0 ignoré ; JAR exécutable produit |
| `AppointmentIntegrationTest` | 26 tests sur serveur HTTP réel et PostgreSQL Testcontainers |
| `AppointmentMigrationUpgradeTest` | 1 test V3→V4, identité, dossier médical, catégories, compte, audit et checksums conservés ; aucun rendez-vous préchargé |
| Régressions antérieures | 53 tests patients, authentification, sécurité et fondation réussis |
| Contraintes/JPA | Chaîne V1→V4, CHECK/FK, index, exclusion GiST et `ddl-auto=validate` vérifiés |
| Ressources préservées | V1/V2/V3 identiques ; 248 fichiers frontend opérationnels, ressources et références PDF identiques |

Les tests ne simulent ni session ni réservation en mémoire. Deux requêtes HTTP concurrentes sur des créations chevauchantes n’obtiennent qu’une réservation ; deux déplacements concurrents vers le même créneau n’ont qu’un succès. Même résultat pour une réactivation face à une création. Les mises à jour d’un même rendez-vous détectent la version obsolète.

Un test PostgreSQL direct utilise deux connexions et transactions distinctes, synchronisées après que chacune a observé le créneau vide : une seule insertion est validée, l’autre reçoit la violation d’exclusion SQLSTATE 23P01. Ce test ne dépend pas du contrôle applicatif. Un autre test conserve le verrou d’un archivage patient, observe le blocage réel de la réservation, puis vérifie son refus 409 après validation de l’archivage.

Les tests couvrent également les bornes adjacentes, l’annulation/absence et la réutilisation du créneau, le refus d’un patient inactif, les changements d’heure marocains dans les deux directions, les lectures bornées/paginées, les erreurs sûres, le refus clinique de l’accueil, CSRF et la révocation de session. Un trigger de test refusant l’audit provoque le rollback de la création, du déplacement et de l’annulation, sans modification de version ou d’audit.

La première exécution ciblée avait une attente incorrecte à minuit : elle supposait UTC+1 en janvier 2027, contrairement aux règles IANA du JDK utilisé. Le test calcule désormais ses bornes par Africa/Casablanca. La dernière exécution complète ci-dessus est réussie, sans contournement du contrôle ni test ignoré.

Aucun test navigateur ou build frontend n’est revendiqué pour cette phase backend. Le script d’infrastructure navigateur reconnaît V4 et le lanceur backend connaît la nouvelle entité ; le calendrier, ses dépôts, l’authentification frontend, les modèles PDF et les mappings restent inchangés.

Limites assumées : agenda unique, horaires réels non configurés, catégories codées sans texte libre, durée technique 30–180 minutes à confirmer, rendez-vous terminés immuables, pas de lien persistant vers les autres modules. L’audit décrit les opérations sans conserver les anciennes heures ou un historique médical.

## Préparation de la phase 8.4B

1. Étendre explicitement le proxy Next pour ces seules routes, cookies/CSRF et absence de cache, sans ouvrir de passerelle arbitraire.
2. Créer des DTO/types distincts et un client asynchrone ; utiliser les UUID patient persistants et ne jamais importer les fixtures ou générer des références locales.
3. Convertir date/heure civiles par Africa/Casablanca, avec gestion des heures répétées/inexistantes, puis afficher les réponses UTC dans ce même fuseau.
4. Lire toutes les pages de chaque intervalle du calendrier et traiter les bornes `[from,to)` sans addition arbitraire de 24 heures.
5. Retirer les champs motif/notes du formulaire persistant ou faire valider un contrat de confidentialité avant de les ajouter ; ne pas les perdre silencieusement.
6. Appliquer la matrice d’actions, conserver les versions et proposer un rechargement confirmé après 409, sans retry automatique. Ne pas présenter le prototype de corrections libres comme le comportement de cette API.
7. Garder les consultations, factures et autres activités synthétiques isolées. Définir leurs migrations et règles de liaison avant d’autoriser des associations persistantes.

Aucune intégration frontend de rendez-vous n’est réalisée en phase 8.4A.
