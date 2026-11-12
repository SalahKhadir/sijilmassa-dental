# API REST des feuilles de soins dentaires — phase 9.2B

L’API expose les brouillons et les instantanés finalisés de V12 pour les fonds dentaires CNSS, CNOPS et FAR. Le [contrat de domaine](insurance-document-domain-contract.md) décrit les règles de complétude et le [relevé des originaux](insurance-template-field-mapping.md) précise les champs imprimés et les rubriques papier.

## Routes et accès

| Méthode et route | Entrée | Succès |
| --- | --- | --- |
| `POST /api/v1/insurance-documents` | Corps `CreateDraft`, query vide | `201 Detail` et `Location` du détail |
| `GET /api/v1/insurance-documents/{documentId}?patientId=…` | UUID du document et du patient | `200 Detail` |
| `PUT /api/v1/insurance-documents/{documentId}?patientId=…` | Corps `EditDraft` | `200 Detail` |
| `POST /api/v1/insurance-documents/{documentId}/finalize?patientId=…` | Corps `FinalizeDraft` | `200 Detail` |
| `GET /api/v1/insurance-documents/{documentId}/pdf?patientId=…` | UUID du document et du patient, document finalisé | `200 application/pdf` pour CNSS et CNOPS compatibles |
| `GET /api/v1/patients/{patientId}/insurance-documents` | Curseur facultatif `afterCreatedAt` et `afterDocumentId` | `200 HistoryPage` |

Les six routes sont réservées au rôle `DENTIST`. L’autorisation HTTP précède la lecture des données. Le service contrôle également le rôle actuel, l’activité du compte et la version de session. L’accueil reçoit le même `403` que le document ou le patient existe ou non. Une session absente, expirée ou révoquée reçoit `401` après le contrôle CSRF applicable. Une écriture sans jeton valide reçoit `403`, y compris avant l’authentification. Le client utilise les cookies de session et l’en-tête indiqué par `GET /api/v1/auth/csrf` après connexion.

Les réponses de succès utilisent `Cache-Control: private, no-store`. Les erreurs conservent les en-têtes de non-cache de la chaîne de sécurité. Les URLs contiennent uniquement les identifiants et, pour l’historique, le curseur. Un document demandé sous un autre patient reçoit le même `404 NOT_FOUND` qu’un UUID absent.

## Requêtes et validation

| DTO | Propriétés |
| --- | --- |
| `CreateDraft` | `patientId`, `documentType`, `templateVersion`, `purpose`, `draft` obligatoires. `consultationId` facultatif. |
| `EditDraft` | `expectedVersion`, `draft` obligatoires. |
| `FinalizeDraft` | `expectedVersion` et `expectedPatientVersion` obligatoires. `expectedConsultationVersion` obligatoire si une consultation est liée et absent ou nul sinon. |
| `Draft` | `fields` obligatoire, `acts` facultatif. Une liste absente ou nulle correspond à une liste vide. |
| `FormFields` | `insured`, `attachmentCount` et exactement un volet objet parmi `cnss`, `cnops`, `far`. Les deux autres volets peuvent être absents ou nuls. |
| `InsuredFields` | `relationship`, `firstName`, `lastName`, `cin`, `address`, `phone`. Quand le lien vaut `LUI_MEME`, les données d’identité viennent du patient. Le volet CNSS exclut le téléphone. |
| `DraftAct` | `treatmentId` et `chargeId` facultatifs, `fields` obligatoire. |
| `ActData` | `plannedDate`, `plannedDescription`, `plannedTooth`, `actCode`, `keyLetter`, `coefficient`, `keyValueMinor`, `quotedFeeMinor`. Les champs prévus et le devis manuel sont réservés à la prévision. Le volet FAR exclut le code, la lettre et la valeur de clé. |

Les corps sont des objets `application/json` de 128 Kio au maximum, y compris lors d’un envoi sans `Content-Length`. Le parseur refuse les propriétés inconnues ou répétées, les valeurs JSON supplémentaires et la coercition de types. Les UUID suivent la forme hexadécimale `8-4-4-4-12`. Les dates civiles suivent `AAAA-MM-JJ` de l’an 1 à 9999. Les dates invalides, heures ajoutées et dates sous forme de tableaux sont refusées. Les paramètres inconnus et répétés sont rejetés. La query des routes de détail, de modification, de finalisation et de PDF n’accepte que `patientId`.

Les versions et les centimes par ligne utilisent des entiers JSON entre 0 et `9007199254740991`. Les chaînes numériques, fractions et exposants sont refusés pour ces entiers. Les coefficients utilisent des décimaux exacts, de 0 à 999999 avec au plus quatre décimales. Un montant nul indique une absence. Zéro représente une valeur saisie ou enregistrée. Les comptages acceptent les entiers de 0 à 9999. Bean Validation contrôle les champs obligatoires, les limites de tableaux et les nombres. V12 contrôle la longueur des textes après normalisation, les variantes et la cohérence des associations. Aucun texte n’est tronqué.

Les limites de texte après normalisation sont les suivantes.

| Limite | Champs |
| ---: | --- |
| 1000 | `plannedDescription` |
| 300 | `address` |
| 250 | `accidentCauses` |
| 100 | `firstName`, `lastName`, `rank`, `unit`, `dentistDeclaration.place` |
| 50 | `phone`, `registrationNumber`, `affiliationNumber`, `priorAuthorizationNumber`, `accountNumber`, `plannedTooth`, `actCode` |
| 30 | `cin` |
| 10 | `keyLetter` |
| 9 et 3 | INP/INPE et catégorie CIM-10, respectivement |

| Type et objets | Volet, champs et capacité |
| --- | --- |
| `CNSS_DENTAIRE`, `ENTENTE_PREALABLE` ou `EXECUTION` | `cnss` contient `registrationNumber`, `practitionerInp`, `careTypes`, `priorAuthorizationNumber`, `accidentDate`, `confirmedTeeth`, `dentistDeclaration`. Jusqu’à 3 actes. |
| `CNOPS_DENTAIRE`, `ENTENTE_PREALABLE` ou `EXECUTION` | `cnops` contient `registrationNumber`, `affiliationNumber`, `practitionerInpe`, `careTypes`, `priorAuthorizationNumber`, `accidentDate`, `accidentCauses`, `diagnosisCategory`, `confirmedTeeth`, `dentistDeclaration`. Jusqu’à 9 actes. |
| `FAR_DENTAIRE`, `DEVIS` ou `RECUS` | `far` contient `accountNumber`, `rank`, `unit`, `practitionerInpe`, `care`, `context`, `prospectusCount`, `insuredStatementDate`, `marks`. Jusqu’à 5 actes. |

La version interne prise en charge vaut `1` pour les trois types. `dentistDeclaration` contient `place` et `date`. `confirmedTeeth` accepte jusqu’à 52 références FDI distinctes. `marks` accepte jusqu’à 52 couples `{tooth, symbol}` avec dent unique. `symbol` vaut `CERCLE` ou `CROIX`. Un symbole peut manquer en brouillon. La catégorie CIM-10 CNOPS est facultative et suit `[A-Z][0-9]{2}`. Les champs INP et INPE comportent neuf chiffres lorsqu’ils sont renseignés.

Les liens d’assuré autorisés sont `LUI_MEME`, `CONJOINT` et `ENFANT`. Les soins CNSS acceptent `SOINS`, `PROTHESE`, `ORTHODONTIE_FACIALE`, `AUTRES`. Les soins CNOPS utilisent `ORTHODONTIE_ODF` à la place de `ORTHODONTIE_FACIALE`. Les listes de soins acceptent jusqu’à quatre sélections distinctes. FAR accepte `SOINS` ou `PROTHESE` et le contexte `MALADIE`, `MATERNITE` ou `ACCIDENT`.

## Brouillon, finalisation et récupération

Un brouillon de version 0 peut être incomplet. Chaque modification remplace le brouillon entier et avance sa version. Le patient, la consultation, le type, la version de fond et l’objet sont fixés à la création. Une consultation liée doit appartenir au patient. Chaque soin associé doit être actif et relever de cette consultation. Chaque charge associée doit correspondre à ce soin, à cette consultation et à ce patient. V12 vérifie de nouveau ces règles pendant la transaction. Un dossier archivé reste lisible et refuse toute écriture.

Relire le détail et les sources autorisées avant de confirmer. Transmettre la version du document depuis `version`, celle du patient depuis `beneficiary.version` et celle de la consultation depuis `consultation.version` lorsque celle-ci existe. Les modes `EXECUTION` et `RECUS` exigent une consultation terminée. Le service contrôle les champs nécessaires selon la variante et fige l’instantané avec l’audit dans la même transaction. Un autre acteur qui modifie le brouillon ou l’une des sources entre la relecture et la confirmation déclenche un conflit. Une seconde finalisation ou une modification d’un document finalisé reçoit `READ_ONLY` tant que le dossier est actif.

Après une réponse perdue, demander le détail avec le même UUID et le même patient. Si le document est `FINALISE`, utiliser l’instantané retourné. S’il est encore `BROUILLON`, relire la version et les sources et obtenir une nouvelle confirmation avant de soumettre. La finalisation ne fournit pas de clé de rejeu. Le client doit désactiver les nouvelles tentatives automatiques d’écriture. La même relecture est requise après `VERSION_CONFLICT`.

La finalisation conserve uniquement les données préparées au cabinet. La soumission, l’approbation, les signatures et les cachets relèvent d’autres étapes. Les montants proviennent d’un prix convenu V9 ou d’un devis manuel selon l’objet. Les règlements, la facture et les frais déclarés gardent des sens distincts. La référence de compte FAR, les justificatifs de paiement et l’usage des montants imprimés restent à confirmer.

## Réponses

`Detail` expose `documentId`, `patientId`, `consultationId`, `documentType`, `templateVersion`, `purpose`, `lifecycle`, `version`, `currency` (`MAD`), `createdAt`, `updatedAt`, `finalizedAt`, `beneficiary`, `consultation`, `draft` et `snapshot`. Le bénéficiaire contient son UUID, sa version, le prénom, le nom, la CIN, la naissance et le sexe disponibles. La consultation contient son UUID, sa version, sa date et l’indicateur `finalized`. Ces deux projections sont courantes pour un brouillon et figées après finalisation. Aucune observation, note ou donnée de questionnaire n’est renvoyée.

`draft` utilise le format d’entrée. `snapshot` vaut `null` en brouillon. Après finalisation, `draft` vaut `null` et `snapshot` expose `schemaVersion`, `templateSha256`, `insured` avec sa provenance `PATIENT` ou `DOCUMENT_INPUT`, `fields`, `acts` et `knownCompleteFeeTotalMinor`. Chaque acte résolu contient `treatmentId`, `chargeId`, `date`, `description`, `tooth`, `actCode`, `keyLetter`, `coefficient`, `keyValueMinor`, `feeSource` et `feeMinor`. Les références et montants absents restent nuls. `feeSource` vaut `V9_AGREED_PRICE` ou `MANUAL_QUOTE` lorsqu’un montant existe. Le total exact est une chaîne d’entier décimal quand toutes les lignes ont un prix, ou `null`. La lecture d’un document finalisé ne reflète ni un paiement ultérieur ni une nouvelle identité du patient.

## Historique

`HistoryPage` contient `items` et `nextCursor`. Chaque élément expose seulement `documentId`, `consultationId`, `documentType`, `templateVersion`, `lifecycle`, `createdAt` et `finalizedAt`. Le résultat est borné à 50 éléments et ordonné par date de création puis UUID, décroissants. Le curseur est exclusif. Envoyer ensemble `afterCreatedAt` (instant UTC en `Z`, au plus six décimales) et `afterDocumentId`, repris de `nextCursor`. La dernière page a un curseur nul. Une page est cohérente dans sa transaction. Pour voir les nouvelles créations en tête, recharger la première page. Un patient connu sans document reçoit une page vide.

## Erreurs RFC 9457

Les refus utilisent `application/problem+json`. `requestId` correspond à `X-Request-ID` et `instance` vaut `urn:request:<requestId>`. Les réponses peuvent inclure des noms de champs Bean Validation et des messages génériques. Les valeurs rejetées, données cliniques, détails SQL et traces sont omis.

| Statut | Codes et situations |
| --- | --- |
| `400` | `INVALID_INPUT`, `UNSUPPORTED_TEMPLATE`, `INVALID_TREATMENT`, `INVALID_CHARGE`. Les erreurs de liaison ou de validation du framework peuvent se limiter au statut et aux noms des champs. |
| `401` | Session absente, expirée ou révoquée après les contrôles applicables. |
| `403` | Rôle, CSRF ou route/méthode refusée. |
| `404` | `NOT_FOUND` pour un patient ou document absent dans le périmètre demandé. |
| `409` | `VERSION_CONFLICT`, `INVALID_CONSULTATION` (absente, étrangère ou état incompatible), `ARCHIVED_PATIENT`, `READ_ONLY`, `INCOMPLETE_DOCUMENT`. Un conflit technique du gestionnaire commun peut omettre `code`. |
| `415` | Type de contenu incompatible. |
| `500` | `STORAGE_FAILURE` ou panne technique générique, par exemple un rejet de l’audit. La transaction est annulée. |

## Intégrations suivantes

L’[intégration frontend](insurance-document-frontend-integration.md) couvre les trois volets et expose les versions de confirmation. La [route PDF](insurance-pdf-integration.md) lit l’instantané, vérifie l’empreinte du fond et préserve les interventions papier. La recevabilité des fonds, la référence FAR, les frais à déclarer et la preuve de paiement restent des décisions ouvertes. Les feuilles générales et une éventuelle projection pour l’accueil nécessitent chacune leur contrat.

## Vérification du 12 novembre 2026

Les essais HTTP utilisent le serveur Spring Boot, de vraies sessions et un PostgreSQL 17.11 jetable sous Testcontainers avec Podman rootless. Les patients et dossiers sont fictifs.

| Contrôle | Réussis | Échecs | Erreurs | Ignorés |
| --- | ---: | ---: | ---: | ---: |
| `./mvnw -o -B -ntp -Dtest=InsuranceHttpIntegrationTest test` | 23 | 0 | 0 | 0 |
| Régressions ciblées clinique, finances et factures, dossier PDF, ordonnances et domaine V12 | 145 | 0 | 0 | 0 |
| `./mvnw -o -B -ntp verify` | 386 | 0 | 0 | 0 |

La sélection des régressions comprend `ClinicalHttpIntegrationTest`, `FinancialHttpIntegrationTest`, `PrescriptionHttpIntegrationTest`, `PrescriptionFinalizationIntegrationTest`, `DossierPdfRendererTest`, `InsuranceDocumentServiceTest` et `InsuranceMigrationTest`. La première exécution HTTP a rencontré la limite de connexion du fixture. La suite finale utilise l’horloge de test commune pour espacer les connexions, avec la protection réelle activée.

Les rapports Surefire du passage complet et l’archive exécutable confirment les résultats. Le JAR contient le contrôleur assurance et V12. `git diff --check` et `git status` ont été exécutés. Aucune suite frontend ou navigateur n’a été relancée.
