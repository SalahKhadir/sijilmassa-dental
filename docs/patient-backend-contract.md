# Patients persistants — contrat de phase 8.3A

## Mapping arrêté avant implémentation

Les références sont `frontend/src/lib/patients/{types,schema,repository,directory,privacy}.ts`, les formulaires patients et les références `patientId` des modèles agenda/assurance. Aucun champ email, médicament détaillé, diagnostic ou note administrative n’existe dans ce modèle : aucun n’est ajouté.

| Champ frontend | Colonne/relation prévue | Classe | Obligatoire et validation | Accès | Compatibilité |
| --- | --- | --- | --- | --- | --- |
| `id` | `patient.id` UUID | Administrative | Généré serveur | Deux rôles | Remplace `patient-demo-*` ; ne pas importer les fixtures |
| `reference` | `patient.reference` unique | Administrative | Générée par séquence, `PAT-000001` et suivantes | Deux rôles | Remplace `DEMO-PAT-*`, reste stable ; trous autorisés |
| `identity.firstName`, `lastName` | `first_name`, `last_name` | Administrative | Requis, 80 caractères chacun, espaces normalisés, alphabet libre | Deux rôles | Accents, arabe, apostrophes et tirets acceptés |
| `identity.sex` | `sex` | Administrative | Enum requise ; `unanswered`, `F`, `M` | Deux rôles | Aucun effet implicite sur le questionnaire |
| `identity.dateOfBirth` | `date_of_birth` | Administrative | Facultative, date ISO valide non future dans `Africa/Casablanca`, années 1–9999 | Deux rôles | `null` remplace la chaîne vide |
| `identity.gsm`, `landline` | `gsm`, `landline` | Administrative | Texte facultatif ≤40, 6–20 chiffres si renseigné, séparateurs usuels | Deux rôles | Les X réservés aux fixtures frontend ne sont pas acceptés en persistance |
| `identity.address` | `address` | Administrative | Texte facultatif ≤300 | Détail : deux rôles | Absente de l’annuaire et de la recherche |
| `identity.profession` | `profession` | Administrative | Texte facultatif ≤120 | Détail : deux rôles | Ne doit pas contenir de notes médicales |
| `identity.cin` | `cin` | Administrative sensible | Texte facultatif ≤30, sans unicité présumée | Détail : deux rôles selon le formulaire administratif existant | Jamais dans la liste ou la recherche ; masquage UI à conserver en 8.3B |
| `identity.medicalCoverage` | `medical_coverage` | Administrative | Texte facultatif ≤120, limité à l’organisme/régime déclaré | Détail : deux rôles | N’est ni une police d’assurance persistante, ni une note de santé |
| `status` | `status` | Administrative | `active`/`inactive`, requis | Deux rôles | `inactive` signifie archivage réversible ; pas de suppression |
| `createdAt`, `updatedAt` | `created_at`, `updated_at` | Métadonnées | Instants UTC générés serveur | Projection correspondante | ISO 8601 ; date civile distincte d’un instant |
| `medicalHistory.reportStatus` | `patient_medical_record.history_report_status` | Clinique | `unanswered`/`reported`, requis | Dentiste | Non renseigné distinct d’une rubrique renseignée vide |
| `medicalHistory.conditions` | `patient_history_condition` | Clinique | 0–8 catégories existantes, sans doublon | Dentiste | Libellés JSON français conservés, codes SQL enum explicites |
| `medicalHistory.otherDetails` | `history_other_details` | Clinique | Facultatif ≤1000 ; exige `reported` et catégorie `Autres` | Dentiste | Pas de nouvelle interprétation clinique |
| `allergies.reportStatus` | `allergy_report_status` | Clinique | `unanswered`/`reported`, requis | Dentiste | État de recueil conservé |
| `allergies.categories` | `patient_allergy_category` | Clinique | 0–5 catégories existantes, sans doublon | Dentiste | Catégories rapportées, pas des diagnostics |
| `allergies.clarification` | `allergy_clarification` | Clinique | Facultatif ≤1000 ; exige rubrique `reported` | Dentiste | Texte permis avec une rubrique renseignée vide, comme le frontend |
| `healthQuestionnaire.underMedicalTreatment`, `pregnant` | Colonnes typées du dossier médical | Clinique | `unanswered`/`yes`/`no`, requis | Dentiste | Réponses indépendantes du sexe et l’une de l’autre |
| `healthQuestionnaire.additionalInformation`, `reasonForConsultation` | `additional_information`, `reason_for_consultation` | Clinique | Facultatifs ≤2000 chacun | Dentiste | Tous les commentaires et motifs restent cliniques |
| `treatments`, `demoNextAppointmentDate` | Aucune table en 8.3A | Hors périmètre | Non acceptés dans les entrées API | Aucun endpoint ici | Historique de soins, agenda et facturation à traiter séparément |

Les champs texte facultatifs restent des chaînes vides ; tous les objets, listes et états de recueil sont explicites. Les versions de concurrence et `questionnaireVersion=1` sont des métadonnées ajoutées au contrat serveur, pas de nouvelles réponses médicales.

La CIN reste accessible au détail administratif car le formulaire de modification administrative existant la saisit déjà. Elle est exclue des projections d’annuaire et des champs de recherche. Aucun champ de note libre n’est ajouté à la projection administrative.

## Schéma V3

V1 et V2 restent byte pour byte inchangées. V3 crée :

- `patient` : identité administrative, UUID, référence unique, statut, version optimiste et horodatages UTC. Les colonnes dérivées `search_name`, `gsm_digits` et `landline_digits` contiennent uniquement les noms et téléphones autorisés pour la recherche.
- `patient_medical_record` : une ligne par patient, avec le même UUID comme PK et FK, une version optimiste indépendante, le questionnaire version 1, les états de recueil et les textes cliniques bornés.
- `patient_history_condition` et `patient_allergy_category` : catégories typées, FK vers le dossier médical et PK composites empêchant les doublons.
- `patient_reference_seq` : allocation atomique des références ; ni `MAX+1`, ni identifiant venant du navigateur. Les UUID restent les identifiants des routes. La séquence n’est pas retournée séparément et les références ne sont pas réutilisées. Un rollback peut laisser un trou ; ce numéro n’est pas une numérotation comptable.

Les FK utilisent `ON DELETE RESTRICT`. Aucun endpoint DELETE, cascade de suppression, seed ou table d’agenda, de consultation, de facture ou d’assurance n’est ajouté. Les relations vers ces futurs modules devront être créées dans leurs propres migrations.

Les contraintes SQL couvrent PK, FK, référence unique et formatée, champs non nuls, longueurs, états autorisés, version positive ou nulle, ordre des horodatages, bornes de l’année de naissance et version de questionnaire. Les règles interchamps et de collections sont validées par le service avec Bean Validation avant toute écriture. Les index couvrent le tri par statut/noms et statut/date ; les PK des catégories indexent leur patient. La recherche contient des comparaisons partielles ; elle n’ajoute ni extension PostgreSQL ni index clinique.

V3 étend aussi `security_audit_event` avec `target_patient_id`, FK et index par cible/date. Les nouveaux types patients exigent une cible et un acteur, et n’utilisent pas `subject_user_id`. Les événements d’authentification existants restent compatibles.

## Endpoints et autorisations

| Méthode et route | Dentiste | Accueil | Entrée → réponse |
| --- | --- | --- | --- |
| `POST /api/v1/patients` | Oui | Oui | `AdministrativeCreate` → 201 `AdministrativeDetails` |
| `GET /api/v1/patients` | Oui | Oui | Requête paginée → 200 `DirectoryPage` |
| `GET /api/v1/patients/{id}` | Oui | Oui | UUID → 200 `AdministrativeDetails` |
| `PUT /api/v1/patients/{id}` | Oui | Oui | `AdministrativeUpdate` complet avec version → 200 |
| `POST /api/v1/patients/with-medical-record` | Oui | 403 | `ClinicalCreate` → 201 `ClinicalCreated`, atomique |
| `GET /api/v1/patients/{id}/medical-record` | Oui | 403 | UUID → 200 `MedicalDetails` |
| `PUT /api/v1/patients/{id}/medical-record` | Oui | 403 | `MedicalUpdate` complet avec version → 200 |
| DELETE, PATCH et routes non autorisées | Refusés | Refusés | Politique de refus par défaut conservée |

Les routes sont autorisées explicitement dans Spring Security ; contrôleur et service appliquent aussi `@PreAuthorize`. Une session absente reçoit 401 en lecture. CSRF reste obligatoire pour les mutations : sans jeton, le filtre peut répondre 403 avant l’authentification. Le compte désactivé ou la session révoquée sont refusés par le filtre existant. L’accueil reçoit 403 pour le dossier médical même si l’UUID demandé n’existe pas.

Les entités JPA ne sont jamais sérialisées. L’annuaire contient `id`, `reference`, `identity` limitée à nom, prénom, sexe, naissance, GSM et fixe, puis `status`, `createdAt` et `version`. Le détail administratif contient les dix champs d’identité et les métadonnées ; aucun questionnaire, antécédent, allergie, soin, champ de recherche interne ou champ de sécurité n’y figure. Les réponses portent `Cache-Control: no-store, private`.

## Recherche et pagination

`GET /api/v1/patients?q=amina&page=1&pageSize=20&status=active&sort=name`

- `q` : 160 caractères au maximum, réservé aux noms, références et téléphones. Normalisation des noms sans distinction de casse/accents ; les mots doivent chacun correspondre à un champ autorisé. Une recherche numérique utilise les chiffres des téléphones.
- `status` : `active` par défaut, `inactive` ou `all` sur demande explicite.
- `sort` : `name`, `newest` ou `oldest`. Les tris ont un départage stable par UUID. L’ordre alphabétique dépend de la collation PostgreSQL et ne prétend pas reproduire exactement `Intl.Collator` du navigateur.
- `page` : commence à 1, jusqu’à 100000 ; `pageSize` : 1 à 50, 20 par défaut. Une page au-delà des résultats est vide, sans la ramener silencieusement à la dernière page.
- Les paramètres non définis et les paramètres répétés sont refusés en 400. CIN, adresse, profession, couverture et données médicales ne sont pas des critères de recherche.

La réponse est `{ items, total, page, pageSize, pageCount }`. Une liste vide a `pageCount=1`, comme le prototype. Les jokers SQL `%` et `_` saisis dans la recherche sont traités littéralement. Les valeurs sont liées par JPA, sans concaténation de SQL utilisateur. Les critères de recherche ne sont jamais recopiés dans les réponses d’erreur.

## Exemples fictifs

Création administrative :

```json
{
  "identity": {
    "firstName": "Amina Démo",
    "lastName": "Exemple Démo",
    "sex": "unanswered",
    "dateOfBirth": null,
    "address": "",
    "gsm": "",
    "landline": "",
    "profession": "",
    "cin": "",
    "medicalCoverage": ""
  },
  "status": "active"
}
```

Réponse 201, avec un en-tête `Location` contenant uniquement le chemin et l’UUID :

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "reference": "PAT-000001",
  "identity": {
    "firstName": "Amina Démo",
    "lastName": "Exemple Démo",
    "sex": "unanswered",
    "dateOfBirth": null,
    "address": "",
    "gsm": "",
    "landline": "",
    "profession": "",
    "cin": "",
    "medicalCoverage": ""
  },
  "status": "active",
  "createdAt": "2026-11-08T12:00:00Z",
  "updatedAt": "2026-11-08T12:00:00Z",
  "version": 0
}
```

Mise à jour du dossier médical par le dentiste :

```json
{
  "version": 0,
  "record": {
    "questionnaireVersion": 1,
    "medicalHistory": {
      "reportStatus": "reported",
      "conditions": [],
      "otherDetails": ""
    },
    "allergies": {
      "reportStatus": "unanswered",
      "categories": [],
      "clarification": ""
    },
    "healthQuestionnaire": {
      "underMedicalTreatment": "unanswered",
      "pregnant": "unanswered",
      "additionalInformation": "",
      "reasonForConsultation": ""
    }
  }
}
```

La réponse médicale est `{ patientId, version, createdAt, updatedAt, record }` : le contenu `record` reprend cette structure. Pour créer le patient et son dossier renseigné ensemble, envoyer à `/with-medical-record` l’objet administratif dans `patient` et le contenu `record` dans `medicalRecord`, sans versions initiales. La réponse est `{ patient: AdministrativeDetails, medicalRecord: MedicalDetails }`. L’endpoint administratif refuse tout champ clinique ajouté ; il ne constitue pas un raccourci vers la création clinique.

## Questionnaire et validation

Les identifiants de questions restent `underMedicalTreatment`, `pregnant`, `additionalInformation` et `reasonForConsultation`. Le questionnaire est fixe et typé, sans JSON libre. Une nouvelle version devra avoir une migration et une adaptation explicites ; toute version autre que 1 est actuellement refusée.

Les réponses JSON restent `unanswered`, `yes`, `no` et les états de recueil `unanswered`/`reported`. SQL utilise leurs codes enum en majuscules. Les conditions gardent leurs libellés JSON exacts : Cardiaque, Ostéoporose, Chirurgie, Maladie du sang, Diabète, Sinusite, Autres et Appareil gastrique. Les allergies gardent Aspirine, Antibiotique, Anesthésie, Aliment et Autres. Les codes SQL correspondants sont les constantes de `PatientValues` ; aucune catégorie supplémentaire n’est déduite du texte.

Une rubrique non renseignée ne peut contenir de catégorie ou commentaire. La précision d’antécédent exige `Autres`. Une rubrique renseignée avec une liste vide reste distincte d’une rubrique non renseignée. Les doublons, catégories inconnues, objets manquants, réponses inconnues et textes trop longs sont refusés. Aucune réponse ne dépend du sexe, et aucun diagnostic ou médicament n’est inventé.

Les noms sont requis, normalisés sans règle restrictive d’alphabet et limités à 80 caractères. Les textes facultatifs sont bornés selon le mapping. Les téléphones renseignés acceptent 6 à 20 chiffres avec `+`, espaces, parenthèses, point, tiret ou `#`. Une naissance doit être une date civile valide, non future pour le jour du cabinet en `Africa/Casablanca`. La date civile reste un `LocalDate` ; les horodatages techniques sont des `Instant` UTC.

Les DTO sont des listes explicites de champs acceptés, avec validation Bean Validation sur les objets imbriqués et les collections. Des champs comme `medicalHistory`, `id`, `reference` ou `treatments` ajoutés à la création administrative sont rejetés en 400. Ni entité JPA, ni objet frontend `Patient` complet ne doit servir de corps de requête.

Les erreurs utilisent le contrat RFC 9457 existant : 400 invalide, 401 session absente/révoquée, 403 accès ou CSRF refusé, 404 ressource absente et 409 version obsolète ou conflit d’intégrité. Les valeurs rejetées, messages SQL, noms de contraintes et contenus médicaux ne sont pas renvoyés. L’instance d’erreur est une URN de requête, sans critère de recherche ni identité du patient.

## Transactions et concurrence

Chaque mutation est une transaction de service, incluant l’audit requis. La création administrative enregistre patient et dossier médical initial « non renseigné » ensemble. La création clinique enregistre aussi les catégories et réponses dans cette transaction. Un échec de validation ou d’audit ne laisse pas de création partielle.

Les deux ressources possèdent chacune leur `@Version`. Les valeurs de version doivent être entières : la conversion Jackson des nombres fractionnaires vers des entiers est désactivée, y compris pour `questionnaireVersion`. Les PUT exigent la version lue ; une requête obsolète reçoit 409. La comparaison initiale est complétée par la clause de version Hibernate lors du flush, ce qui couvre deux requêtes ayant lu simultanément la même version. Une mise à jour administrative et une mise à jour clinique peuvent réussir ensemble sans écraser leurs champs respectifs.

L’écriture clinique verrouille en lecture la ligne administrative pendant le contrôle du statut et la transaction. Une écriture d’archivage doit donc attendre sa fin, ou la précéder ; la mise à jour clinique ne peut pas se fonder sur un statut actif lu avant un archivage déjà terminé. Le contenu médical garde sa propre protection optimiste.

Après 409, relire et proposer une résolution à l’utilisateur. Ne pas renvoyer automatiquement un ancien formulaire avec une nouvelle version. La création n’a pas de clé d’idempotence ; après un timeout, ne pas la rejouer automatiquement au risque de créer un doublon de personne. Les noms, téléphones et CIN ne sont pas supposés uniques.

## Cycle de vie

`inactive` conserve l’UUID, la référence et tout le dossier médical. Les patients inactifs sont exclus de la liste par défaut, mais leur détail administratif reste accessible aux deux rôles et leur dossier médical reste lisible par le dentiste. Les données administratives restent corrigeables ; l’écriture médicale reçoit 409 tant que le dossier n’est pas réactivé. Les deux rôles peuvent modifier le statut conformément au formulaire administratif existant.

Les changements de statut passent par le même PUT versionné. Les transitions génèrent des événements d’archivage/restauration. Aucun effacement irréversible ni politique de durée de conservation légale n’est implémenté.

## Audit et confidentialité

Les événements sont `PATIENT_CREATED`, `PATIENT_ADMIN_UPDATED`, `PATIENT_MEDICAL_UPDATED`, `PATIENT_ARCHIVED` et `PATIENT_RESTORED`. Ils portent l’UUID de l’acteur authentifié, l’UUID cible, le type et l’instant UTC. Ils ne contiennent ni noms, ni CIN, ni description médicale, ni réponse au questionnaire. Une mise à jour administrative avec changement de statut produit l’événement de mise à jour et celui de transition. Le dossier initial non renseigné n’est pas présenté comme une modification médicale.

`SecurityAudit.recordPatient` exige une transaction existante (`MANDATORY`) ; les événements sont persistés dans la transaction du changement. Un refus de l’audit annule donc les données et les versions associées. Aucun endpoint public de consultation ou d’écriture d’audit n’est ajouté. Les lectures de dossiers ne génèrent pas d’événement patient dans cette phase.

Le pilote PostgreSQL reçoit `logServerErrorDetail=false` pour éviter de propager les détails de lignes rejetées dans les exceptions et journaux applicatifs ; les logs SQL, paramètres et erreurs JDBC Hibernate sont désactivés. Les réponses restent génériques. Référence : [options du pilote pgJDBC](https://jdbc.postgresql.org/documentation/use/).

Cette protection ne configure pas les journaux d’un service PostgreSQL natif : avant toute utilisation réelle, restreindre leur accès et configurer la verbosité, les instructions et paramètres journalisés pour ne pas y enregistrer de données sensibles. L’accès administrateur au poste et à la base reste à protéger. Le stockage local ne constitue ni une sauvegarde ni une preuve de conformité CNDP/Loi 09-08.

Le dossier conserve son état courant, avec version et audit des mutations ; il ne conserve pas des copies historiques de chaque réponse médicale. Les règles de rectification, d’historisation, de sauvegarde/restauration et de rétention restent à valider avant exploitation réelle.

## Exigences exactes pour la phase 8.3B

Aucun fichier frontend ou PDF n’est modifié en 8.3A. Le proxy Next.js reste limité à l’authentification ; il faudra autoriser explicitement les méthodes et routes patients nécessaires, en conservant même origine, cookies, CSRF et absence de cache. Prévoir une limite de corps propre aux DTO patients et à leur taille UTF-8 : la limite de 4 Kio du proxy d’authentification ne suffit pas aux textes cliniques maximaux.

1. Remplacer le dépôt mémoire par des contrats séparés `AdministrativeDetails`, `DirectoryPage` et `MedicalDetails`. Ne pas reconstruire un faux objet `Patient` complet pour l’accueil et ne pas charger le dossier médical pour alimenter l’annuaire.
2. Adapter `list(): Promise<Patient[]>` en requête paginée serveur. Les compteurs globaux et filtres ne doivent pas être calculés à partir de la seule page chargée. Le sort et la taille de page doivent respecter le contrat serveur.
3. Utiliser les UUID et références retournés par l’API. Abandonner les identifiants `patient-demo-*` et la génération `MAX+1` du dépôt mémoire pour les écritures persistantes. Ne pas importer automatiquement les fixtures ni les utiliser comme des patients réels.
4. Pour l’accueil, créer/modifier uniquement l’identité administrative et le statut. Pour le dentiste, utiliser la création combinée atomique pour le formulaire initial complet ; les éditions suivantes utilisent les endpoints et versions distincts.
5. Transformer la naissance vide en `null`, conserver les états « non renseigné » et envoyer `questionnaireVersion=1`. Ne pas remplacer les téléphones fictifs avec X par des numéros inventés : utiliser une valeur valide saisie ou un champ vide.
6. Envoyer des PUT complets avec la version courante. Prévoir 400, 401, 403, 404 et 409, sans retry aveugle des créations ni écrasement après conflit.
7. Ouvrir les vues administratives à l’accueil seulement après retrait des composants cliniques, liens et chargements non autorisés. La CIN reste masquée dans les vues générales et absente de la recherche. Spring reste l’autorité de contrôle pour chaque ressource et opération.
8. Ne pas envoyer `treatments`, `demoNextAppointmentDate`, références, horodatages ou versions internes de session dans les DTO d’écriture. Les modules mémoire agenda/soins/facturation/assurance devront gérer explicitement leurs liens avec les UUID persistants ; aucune FK de ces futurs modules n’existe encore.

## Vérification exécutée

`./mvnw verify`, Java 21.0.13 et PostgreSQL 17 Testcontainers : **53 tests réussis**, dont **25 tests patients**, aucun échec, aucune erreur et aucun test ignoré. Le JAR exécutable est produit.

Les tests patients utilisent un vrai serveur HTTP, les comptes fictifs créés par le bootstrap et de vraies sessions avec CSRF. Ils couvrent les migrations V1/V2/V3, validation JPA, contraintes, données Unicode, date du cabinet, annuaire borné, archivage, séparation JSON, refus de l’accueil, champs inconnus, questionnaire, versions obsolètes, créations concurrentes, deux écritures concurrentes de chaque type et écritures administratives/cliniques indépendantes. Les tests de rollback provoquent un refus d’audit dans la base éphémère et vérifient qu’aucune donnée partielle ne reste.

Les tests existants d’authentification, révocation, cookies et santé passent. Le contrôle de confidentialité vérifie que les sentinelles médicales n’apparaissent ni dans les erreurs, ni dans l’audit, ni dans le journal applicatif. V1/V2 et les fichiers frontend/PDF ont aussi été contrôlés par empreinte.

Un test de migration supplémentaire part d’une base V2 contenant un compte et un événement d’authentification. Le passage à V3 conserve ces lignes, le hash du mot de passe et les checksums V1/V2, sans créer de patient. La validation Compose avec variables synthétiques et `git diff --check` réussissent également.


## Adaptateur Next.js — phase 8.3B

Le client et les écrans `/patients` utilisent désormais ces projections séparées, sans convertir le modèle synthétique `Patient`. La création complète dentiste utilise le POST atomique prévu, l’accueil utilise le POST administratif et les éditions renvoient leur version indépendante. Les versions non représentables comme entier sûr JavaScript sont refusées. Les modules non migrés restent sous la frontière `/demo/patients`, sans relations avec ces UUID.

Voir [l’intégration frontend](patient-frontend-integration.md) pour le proxy, les limites de corps, les contrôles de rôles et la validation restante en environnement PostgreSQL réel. Le contrat backend et les migrations ne sont pas modifiés par cette intégration.
