# API du registre financier des soins — phases 8.6A.2 et 8.6B.1

L’API expose le [service financier des soins](treatment-financial-ledger-contract.md). Une charge correspond à un soin tarifé. Son prix, son libellé et sa date sont conservés. Les encaissements peuvent avoir lieu avant ou après la clôture de la consultation, sans modifier le dossier clinique.

## Routes et rôles

Toutes les routes commencent par `/api/v1/financial`. Le tableau indique les chemins relatifs.

| Méthode et chemin | Entrée | Succès | Rôles |
| --- | --- | --- | --- |
| GET `/consultations/{consultationId}/pricing?patientId=…` | UUID de consultation et de patient | 200 `ConsultationPricing` | `DENTIST` |
| POST `/charges` | `CreateCharge` | 201 `Charge`, avec `Location` vers le détail | `DENTIST` |
| GET `/charges/{chargeId}?patientId=…` | UUID de charge et de patient | 200 `Charge` | `DENTIST`, `RECEPTIONIST` |
| GET `/charges/{chargeId}/payments?patientId=…` | Curseur facultatif `afterPaidAt`, `afterPaymentId` | 200 `PaymentPage` | `DENTIST`, `RECEPTIONIST` |
| POST `/charges/{chargeId}/payments?patientId=…` | `RecordPayment` | 200 `Receipt`, y compris en cas de rejeu accepté | `DENTIST`, `RECEPTIONIST` |
| GET `/patients/{patientId}/summary` | Curseur facultatif `afterDate`, `afterChargeId` | 200 `Summary` | `DENTIST`, `RECEPTIONIST` |
| GET `/patients/{patientId}/verso` | Curseur facultatif `afterDate`, `afterChargeId` | 200 `VersoPage` | `DENTIST`, `RECEPTIONIST` |

Les rôles sont vérifiés par la chaîne Spring Security, le contrôleur et le service. Les deux POST exigent le cookie de session et `X-CSRF-TOKEN`. Après connexion, récupérer un nouveau jeton via `GET /api/v1/auth/csrf`. Une requête anonyme reçoit 401 après le contrôle CSRF applicable. Un jeton manquant ou invalide reçoit 403. Les autres routes et méthodes financières sont refusées par défaut.

Les réponses de succès portent `Cache-Control: no-store, private`. Les erreurs portent aussi des en-têtes de non-mise en cache. Un patient archivé conserve son historique lisible. L’attribution d’un prix, l’encaissement et le rejeu d’un encaissement sont alors refusés.

## Requêtes

| DTO | Champs obligatoires |
| --- | --- |
| `CreateCharge` | `patientId`, `consultationId`, `treatmentId`, `expectedConsultationVersion`, `priceMinor` |
| `RecordPayment` | `expectedChargeVersion`, `amountMinor`, `paidAt`, `method`, `operationId` |

Envoyer un objet `application/json` de 4 096 octets au maximum. Les champs inconnus, répétés ou nuls, les valeurs JSON supplémentaires et les paramètres de requête inattendus ou répétés sont refusés. Les UUID suivent la forme hexadécimale `8-4-4-4-12`. Fournir les deux champs d’un curseur ou les omettre tous les deux.

Le prix et les versions sont des entiers JSON de 0 à `9007199254740991`. Le paiement est un entier de 1 à cette même borne. Toutes les sommes sont en centimes MAD. Un prix de 300 DH s’envoie sous la forme `30000`. Les fractions, les nombres décimaux, la notation exponentielle et les chaînes numériques sont refusés. Un prix explicite de zéro donne une charge `SETTLED`.

`paidAt` est un instant UTC de l’an 1 à 9999, au format `AAAA-MM-JJTHH:mm:ss[.fraction]Z`, avec au plus six chiffres de fraction. Le client transmet l’heure effective du paiement. Le serveur fournit `recordedAt`. Les modes autorisés sont `ESPECES`, `CARTE`, `VIREMENT`, `CHEQUE` et `AUTRE`. La clé de rejeu `operationId` est un UUID fourni par le client.

## Réponses et pagination

| DTO | Champs |
| --- | --- |
| `Charge` | `chargeId`, `version`, `date`, `treatmentLabel`, `currency`, `priceMinor`, `receivedMinor`, `remainingMinor`, `settlement` |
| `Payment` | `id`, `amountMinor`, `paidAt`, `method`, `recordedAt` |
| `Receipt` | `payment: Payment`, `charge: Charge` |
| `PaymentPage` | `items: Payment[]`, `nextCursor: { paidAt, paymentId } \| null` |
| `Summary` | `items: Charge[]`, `nextCursor: { date, chargeId } \| null`, `totals: Totals` |
| `VersoPage` | `items: VersoRow[]`, `nextCursor: { date, chargeId } \| null`, `totals: Totals` |
| `VersoRow` | `date`, `treatmentLabel`, `priceMinor`, `receivedMinor`, `remainingMinor` |
| `Totals` | `currency`, `chargesMinor`, `receivedMinor`, `outstandingMinor` |

`currency` vaut `MAD`. Les trois montants de `Totals` sont des chaînes d’entiers décimaux pour préserver les sommes au-delà de la précision de JavaScript. Ils couvrent toutes les charges du patient, y compris celles de consultations en brouillon, quelle que soit la page demandée. Un soin sans charge est exclu. Le solde est calculé à partir des charges et des encaissements.

Le verso associe exactement `date | treatmentLabel | priceMinor | receivedMinor | remainingMinor` aux colonnes **DATE | TRAITEMENT | PRIX | REÇU | RESTE**. Chaque ligne correspond à une seule charge. `receivedMinor` cumule les paiements de ce soin et `remainingMinor` est la différence entre le prix et le reçu. `settlement` vaut `DUE`, `PARTIAL` ou `SETTLED` selon les montants.

Chaque page contient au plus 50 lignes. Le résumé et le verso sont triés par date civile du soin puis UUID de charge, par ordre croissant. Les paiements sont triés par instant de paiement puis UUID de paiement, par ordre croissant. Le curseur est exclusif. Pour la page suivante, transmettre les valeurs de `nextCursor` dans les paramètres `after…` correspondants. Une page pleine peut être suivie d’une page vide. Les lignes et les totaux d’une réponse proviennent du même snapshot PostgreSQL. Des requêtes successives peuvent observer de nouveaux encaissements ou de nouvelles charges.

Le libellé du soin est le seul texte de traitement affiché. Le dentiste doit utiliser une désignation adaptée à l’encaissement. Les projections omettent les notes, diagnostics, données d’ordonnance, identifiants d’acteurs et clés de rejeu.

## Tarification d’une consultation

Le GET `/consultations/{consultationId}/pricing?patientId=…` est réservé au dentiste. Le seul paramètre de requête accepté est `patientId`, obligatoire. Une consultation absente ou rattachée à un autre patient donne 404. Un identifiant invalide ou un paramètre inattendu donne 400. L’accueil reçoit 403 et une requête anonyme reçoit 401.

| DTO | Champs |
| --- | --- |
| `ConsultationPricing` | `patientId`, `consultationId`, `consultationVersion`, `items: TreatmentPricing[]` |
| `TreatmentPricing` | `treatmentId`, `state`, `chargeId`, `priceMinor` |

La réponse contient une ligne par soin actif, ordonnée par date du soin puis UUID. Chaque ligne `PRICED` fournit l’UUID de la charge et le prix en centimes MAD, y compris zéro. Chaque ligne `UNPRICED` porte `chargeId: null` et `priceMinor: null`. Une consultation sans soin actif retourne une liste vide. La projection est limitée à 50 soins, comme l’éditeur clinique. Si les données dépassent cette limite, le serveur renvoie 500 avec le problème générique, sans résultat partiel.

La version et les lignes sont lues dans le même snapshot PostgreSQL. Le client les compare avec la version et les UUID actifs de sa consultation avant d’afficher un prix ou une action. Une consultation finalisée ou un patient archivé conserve sa tarification lisible. Les UUID de soins restent réservés à cette projection. Les DTO d’encaissement, du résumé et du verso gardent leur forme. La projection de tarification contient uniquement les identifiants, la version, l’état et les montants.

## Versions et rejeu

Pour attribuer un prix, transmettre la version courante de la consultation. Le soin doit appartenir au patient et à la consultation, être actif et se trouver dans un brouillon. L’attribution d’un prix est unique. La création retourne une charge de version 0 sans incrémenter la version clinique.

Pour un nouvel encaissement, transmettre la version courante de la charge et générer un nouvel `operationId`. Le service vérifie sous verrou la version et le reste dû. Chaque nouvel encaissement accepté incrémente la version de la charge d’une unité. Deux opérations distinctes avec la même version attendue ne peuvent pas réussir toutes les deux.

En cas de réponse perdue, renvoyer explicitement le même corps avec la même clé sur la même charge. Le service examine la clé sous verrou avant de comparer la version. Si le montant, l’instant et le mode correspondent, le serveur renvoie le paiement original et l’état courant de la charge, même si la version soumise a depuis changé. Un contenu différent pour cette clé reçoit `OPERATION_CONFLICT`. Le rejeu accepté ne crée aucun paiement ni événement d’audit supplémentaire. La clé est propre à la charge. Après un conflit de version, relire la charge et faire confirmer l’encaissement avant toute nouvelle soumission.

## Erreurs

Les erreurs utilisent le format RFC 9457 `application/problem+json` du projet. `requestId` correspond à `X-Request-ID`, et `instance` utilise `urn:request:<requestId>`. Les erreurs Bean Validation peuvent inclure les noms de champs et des messages génériques. Les valeurs rejetées, détails SQL et traces d’exception sont omis.

| Statut | Cas |
| --- | --- |
| 400 | Corps invalide ou trop grand, champ manquant, UUID invalide, paramètre ou curseur invalide |
| 401 | Session absente, expirée ou révoquée, après vérification CSRF applicable |
| 403 | Rôle insuffisant, jeton CSRF invalide ou route/méthode hors liste |
| 404 | Patient, consultation, soin ou charge introuvable dans le périmètre demandé |
| 409 | `VERSION_CONFLICT`, `OVERPAYMENT`, `OPERATION_CONFLICT`, `DUPLICATE_CHARGE`, `ARCHIVED_PATIENT`, `CONSULTATION_FINALIZED` ou `INELIGIBLE_TREATMENT` |
| 415 | Type de contenu non pris en charge |
| 500 | Erreur interne avec réponse générique |

Les conflits financiers typés portent un champ `code`. Les erreurs 404 utilisent la même réponse pour une ressource absente et une ressource rattachée à un autre patient.

## Intégration frontend

- Autoriser les sept couples méthode/route dans le proxy Next. Transmettre le cookie, le jeton CSRF et les paramètres de pagination. Conserver les statuts, `Location`, `X-Request-ID` et les règles de non-mise en cache.
- Dans le parcours dentiste, utiliser les UUID et la version persistante de la consultation. Relire la projection de tarification après rechargement et après attribution. Confirmer le prix définitif avant l’envoi. Traduire les refus des gardes V9 si le parcours permet encore de demander le retrait ou la modification d’un soin tarifé.
- Dans le parcours d’encaissement, lire les charges et leur version dans le résumé. Convertir les DH en centimes sans calcul en virgule flottante. Lire les totaux comme chaînes ou avec `BigInt`. Conserver la clé et le corps d’une opération jusqu’à réception d’une réponse confirmée.
- Sur 409, relire l’état courant avant de demander une nouvelle confirmation. Sur 401, appliquer le parcours de reconnexion. Le harnais navigateur valide les migrations V1–V9.

## Vérification initiale 8.6A.2 du 11 novembre 2026

Les tests utilisent un serveur HTTP réel et PostgreSQL 17.11 sous Testcontainers, sur un socket Podman privé avec `TESTCONTAINERS_RYUK_DISABLED=true`. Le runtime est OpenJDK 25.0.4.1, avec compilation `--release 21`. Le worker de rendu des régressions utilise Node 24.20.0. Les comptes et dossiers sont synthétiques et les bases sont jetables.

```sh
cd backend
./mvnw -B -ntp -o -Dtest=FinancialHttpIntegrationTest test
./mvnw -B -ntp -o -Dtest=TreatmentFinancialServiceTest,TreatmentFinancialMigrationTest,ConsultationServiceTest,ClinicalHttpIntegrationTest,PrescriptionHttpIntegrationTest,PrescriptionFinalizationIntegrationTest,AppointmentIntegrationTest,PatientIntegrationTest,AuthenticationIntegrationTest,PostgresFoundationTest test
./mvnw -B -ntp -o verify
```

| Vérification | Tests réussis | Échecs | Erreurs | Ignorés |
| --- | ---: | ---: | ---: | ---: |
| HTTP financier ciblé | 23 | 0 | 0 | 0 |
| Régressions backend ciblées | 209 | 0 | 0 | 0 |
| Suite backend complète, un passage de `verify` | 294 | 0 | 0 | 0 |

Les tests HTTP financiers vérifient que deux demandes concurrentes avec des clés distinctes et la même version produisent un seul paiement, que deux demandes identiques renvoient le même reçu, et qu’un échec d’audit annule le paiement et l’incrément de version. Les tests vérifient aussi la pagination sur 51 éléments, les totaux au-delà de la précision des entiers JavaScript et l’absence des champs cliniques confidentiels.

`verify` a construit le JAR exécutable `backend/target/sijilmassa-backend-0.1.0-SNAPSHOT.jar` en 4 min 47 s. Le manifeste Spring Boot, les classes HTTP financières et la migration V9 sont présents dans l’archive. Les empreintes SHA-256 de V1 à V9 correspondent à l’état initial et `git diff --check` réussit.

Le contrat a été relu manuellement en français. Le scanner Unslop est limité à l’anglais.

## Vérification 8.6B.1 du 11 novembre 2026

Les tests HTTP financiers vérifient le rapprochement par UUID de deux soins de même libellé et de même date, le prix explicite de zéro, l’exclusion des soins retirés, la lecture après finalisation et archivage, le refus de l’accueil et l’échec de lecture sans projection partielle. Ils vérifient aussi que le résumé de l’accueil ne contient aucun UUID de soin. Les tests utilisent PostgreSQL 17.11 Testcontainers et des données synthétiques.

```sh
cd backend
./mvnw -B -ntp -o -Dtest=FinancialHttpIntegrationTest,TreatmentFinancialServiceTest,TreatmentFinancialMigrationTest,ConsultationServiceTest,ClinicalHttpIntegrationTest,PrescriptionHttpIntegrationTest,PrescriptionFinalizationIntegrationTest test
./mvnw -B -ntp -o verify
```

La suite ciblée a réussi 168 tests, dont 27 tests HTTP financiers, avec zéro échec, erreur ou test ignoré.

L’unique passage complet de `verify` a réussi 298 tests, avec zéro échec, erreur ou test ignoré, en 4 min 41 s. Le JAR exécutable contient les deux DTO de tarification. Les empreintes SHA-256 de V1 à V9 correspondent à l’état de référence et `git diff --check` réussit.
