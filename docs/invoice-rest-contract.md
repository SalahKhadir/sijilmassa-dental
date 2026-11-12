# API REST des factures persistantes — phase 8.7B

Cette API expose les factures V10 et rapproche leurs soldes des paiements V9. Le dentiste et l’accueil disposent des mêmes droits de facturation. L’identité exposée se limite à la référence administrative, au prénom et au nom. Les lignes exposent les références de charge, la date de traitement, le libellé et les montants de facturation. La ligne émise contient aussi la référence dentaire figée quand elle est disponible. Les identifiants de consultation et de traitement, les notes, les diagnostics, les allergies, les ordonnances et les réponses au questionnaire médical restent hors de cette projection.

## Routes

| Méthode et chemin | Paramètres et corps JSON | Succès |
| --- | --- | --- |
| `POST /api/v1/invoices` | `{patientId, chargeIds}` | `201`, détail du brouillon et en-tête `Location` relatif |
| `GET /api/v1/invoices/{invoiceId}` | Query `patientId` obligatoire | `200`, détail |
| `PUT /api/v1/invoices/{invoiceId}` | Query `patientId` obligatoire et corps `{expectedVersion, chargeIds}` | `200`, détail actualisé |
| `POST /api/v1/invoices/{invoiceId}/issue` | Query `patientId` obligatoire et corps `{expectedVersion}` | `200`, détail de la facture émise |
| `GET /api/v1/patients/{patientId}/invoices` | Curseur facultatif `afterCreatedAt` et `afterInvoiceId` | `200`, historique paginé |
| `GET /api/v1/patients/{patientId}/invoice-eligible-charges` | Curseur facultatif `afterDate` et `afterChargeId` | `200`, charges disponibles paginées |

Les routes exigent une session valide. Les écritures JSON exigent le jeton CSRF de la session dans `X-CSRF-TOKEN`. Les réponses de facturation utilisent `Cache-Control: no-store`. Le patient indiqué doit correspondre à la facture et à toutes les charges sélectionnées. Une écriture sans jeton valide peut recevoir `403` avant le contrôle de session.

Les identifiants utilisent la forme UUID textuelle avec tirets. Les corps d’écriture acceptent jusqu’à 16 Kio et doivent contenir un seul objet `application/json`. Les propriétés inconnues, répétées ou réservées à une autre commande sont refusées. Les versions sont des entiers JSON entre 0 et 9 007 199 254 740 991. Les tableaux contiennent de 0 à 250 UUID de charges distincts, dans l’ordre souhaité. Les paramètres d’URL inconnus, répétés ou incomplets sont refusés. Les commandes de facturation prennent leurs prix, dates, montants et numéros dans PostgreSQL.

## PDF de la facture émise

`GET /api/v1/invoices/{invoiceId}/pdf?patientId=…` télécharge le PDF A5 original pour le dentiste ou l’accueil. Le fichier utilise le numéro permanent et les données figées lors de l’émission. Un brouillon reçoit `409 INVOICE_NOT_ISSUED`. Un contenu trop long ou non pris en charge reçoit `422`. Le détail des réponses, des contrôles et du rendu figure dans le [contrat du PDF](invoice-pdf-integration.md).

## Préparer et émettre

Un brouillon `BROUILLON` commence à la version 0. Chaque remplacement complet de la sélection avance la version d’une unité. Il libère les charges retirées au commit. Une charge sélectionnée est réservée dès le brouillon et reste réservée après l’émission. La liste des charges disponibles complète le résumé V9, qui ignore les réservations de facture. Pour modifier un brouillon, charger sa sélection depuis `draft.lines` et les charges à ajouter depuis la liste des charges disponibles. Cette liste reflète les réservations au moment de la lecture. Chaque écriture vérifie de nouveau la propriété et la disponibilité de la sélection.

L’émission exige la version courante et au moins une charge. V10 attribue le numéro `AAAA-001` selon la date dans `Africa/Casablanca` et fige le document à la version suivante. La numérotation, la capture des données et l’audit sont validés dans la même transaction. La facture `EMISE` est immuable. Une tentative d’émission concurrente du même brouillon donne un seul succès. La contrainte d’unicité de V10 interdit à deux factures de réserver la même charge.

Après une perte de réponse à l’émission, relire le détail de la facture avec son UUID et son patient. Si le document est `EMISE`, utiliser le numéro et les données déjà enregistrés. S’il est toujours `BROUILLON`, vérifier la version et la sélection, puis demander une nouvelle confirmation avant toute tentative. V10 ne fournit pas de clé de rejeu pour cette commande. Après `VERSION_CONFLICT`, recharger la facture et demander confirmation sur l’état relu.

Les dossiers archivés restent consultables. Leur liste de charges disponibles est vide et leurs écritures reçoivent `ARCHIVED_PATIENT`. Les réservations déjà enregistrées sont conservées.

## Détail et montants

Le détail renvoie `invoiceId`, `patientId`, `lifecycle`, `version`, `currency` (`MAD`), `createdAt`, `updatedAt`, `draft`, `issuanceSnapshot` et `currentFinancialState`.

| Champ | Structure et disponibilité |
| --- | --- |
| `draft` | `billingIdentity` et `lines` pour un brouillon. `null` après émission. |
| `issuanceSnapshot` | `invoiceNumber`, `issueDate`, `issuedAt`, `billingIdentity`, `lines` et `balanceAtIssue` pour une facture émise. `null` pour un brouillon. |
| `billingIdentity` | `reference`, `firstName`, `lastName`. L’identité du brouillon est courante. L’identité émise est figée. |
| `lines[]` | `chargeId`, `treatmentDate`, `treatmentLabel` et `priceMinor`. Les lignes émises ajoutent `receivedAtIssueMinor` et `toothReference` (texte figé de 1 à 50 caractères, ou `null`). |
| `currentFinancialState` | `balance` et `settlement`. L’état vaut `null` pour un brouillon, puis `DUE`, `PARTIAL` ou `SETTLED` selon les paiements. Une facture émise à zéro est soldée. |
| `balanceAtIssue`, `balance` | `totalMinor`, `receivedMinor`, `remainingMinor`, sous forme de chaînes d’entiers décimaux en centimes. |

Les montants de ligne sont des entiers JSON sûrs. Les sommes peuvent dépasser la précision des entiers JavaScript. Les interpréter comme des entiers exacts, par exemple avec `BigInt`. Les dates civiles utilisent `YYYY-MM-DD` et les instants ISO 8601 en UTC.

Depuis V11, `issuanceSnapshot.lines[].toothReference` expose la référence dentaire enregistrée lors de l’émission. `null` signifie qu’aucune valeur historique n’est disponible. La référence reste hors des brouillons, de l’historique et de la liste des charges disponibles. Les identifiants cliniques et les notes restent hors du contrat.

Le solde courant provient des paiements V9 affectés aux charges de la facture, y compris ceux enregistrés avant l’émission. Un paiement ultérieur peut modifier le solde et l’état de règlement sans faire avancer la version du document. Le contenu de `issuanceSnapshot` reste identique après un paiement ou une modification de l’identité du patient.

## Pagination

Les deux listes renvoient `{currency, items, nextCursor}` avec au plus 50 éléments. Reprendre les deux valeurs de `nextCursor` dans la query suivante. Une valeur `null` marque la dernière page.

- Historique. Tri décroissant sur `(createdAt, invoiceId)`. Le curseur accepte un instant UTC en `Z` avec une précision maximale à la microseconde et un UUID. Chaque ligne contient `invoiceId`, `invoiceNumber`, `createdAt`, `issueDate`, `issuedAt`, `lifecycle` et `currentFinancialState`. Le numéro et les dates d’émission du brouillon valent `null`.
- Charges disponibles. Tri croissant sur `(treatmentDate, chargeId)`. Les lignes utilisent la même structure que `draft.lines[]`. Les charges de toute facture, brouillon ou émise, sont exclues.

Chaque page est lue dans un état cohérent de la base. Les demandes successives voient les changements validés depuis la page précédente. Pour retrouver une charge récemment libérée en amont du curseur ou pour afficher de nouvelles factures, recharger la première page. Le service de lecture ne propose aucun filtre supplémentaire.

## Erreurs

Les refus utilisent RFC 9457 et le type `application/problem+json`. Le champ `type` vaut `about:blank`. Le champ `instance` reprend `requestId` sous la forme `urn:request:<id>`. Le même identifiant figure dans `X-Request-ID`. Les messages sont génériques et les erreurs de validation de champs utilisent les noms du DTO. Les détails SQL, les valeurs rejetées et les données de soin ne sont pas inclus.

| Statut | Cas |
| --- | --- |
| `400` | Corps, UUID, sélection, version ou curseur invalide |
| `401` | Session absente ou expirée |
| `403` | Accès refusé, méthode hors autorisation ou CSRF absent ou invalide |
| `404` | Facture, patient ou charge introuvable dans le périmètre demandé |
| `409` | `VERSION_CONFLICT`, `CHARGE_RESERVED`, `INVOICE_ISSUED`, `EMPTY_DRAFT` ou `ARCHIVED_PATIENT`. Les conflits de stockage traités par le gestionnaire commun peuvent omettre `code`. |
| `415` | Type de contenu non pris en charge |
| `500` | Erreur interne imprévue |

## Intégration à venir

L’intégration Next.js devra autoriser explicitement ces six routes dans le proxy même origine, conserver la session et le CSRF, valider les DTO à l’exécution, et recharger le détail et l’historique après les écritures. Pour désactiver les actions d’écriture sur un dossier archivé, lire le statut dans le dossier administratif du patient. Une liste de charges disponibles vide ne distingue pas un patient archivé d’un patient actif dont toutes les charges sont réservées. Un paiement reste une opération de la charge V9. Après encaissement, relire le solde courant de la facture concernée. Le PDF d’origine devra utiliser exclusivement `issuanceSnapshot` pour l’identité, les lignes et les soldes d’émission. Un document portant sur les règlements actualisés devra identifier séparément ces montants. Les écrans persistants et le téléchargement PDF sont décrits dans les contrats associés. Les opérations de correction restent hors périmètre.

## Vérification du 11 novembre 2026

Les essais HTTP utilisent le vrai serveur Spring, ses cookies de session, le contrôle CSRF et PostgreSQL 17.11 sous Testcontainers. Les patients, consultations, charges et paiements sont synthétiques. Maven compile pour Java 21 et les tests de rendu s’exécutent en mode AWT headless.

```sh
cd backend
export JAVA_TOOL_OPTIONS=-Djava.awt.headless=true
./mvnw -B -ntp -o -Dtest=FinancialHttpIntegrationTest test
./mvnw -B -ntp -o -Dtest=InvoiceMigrationTest,InvoiceServiceTest,TreatmentFinancialServiceTest,TreatmentFinancialMigrationTest,ConsultationServiceTest,ClinicalHttpIntegrationTest,PrescriptionHttpIntegrationTest,PrescriptionFinalizationIntegrationTest,PrescriptionRenderingIntegrationTest,DossierPdfRendererTest test
./mvnw -B -ntp -o verify
```

| Contrôle | Réussis | Échecs | Erreurs | Ignorés |
| --- | ---: | ---: | ---: | ---: |
| HTTP ciblé, dont 15 nouveaux cas de facturation et 31 cas existants du registre et du dossier | 46 | 0 | 0 | 0 |
| Services et migrations de facturation, registre V9, clinique, dossier PDF et ordonnances | 165 | 0 | 0 | 0 |
| Vérification Maven complète et création du JAR Spring Boot | 337 | 0 | 0 | 0 |

La vérification complète a duré 7 min 01 s. Le JAR exécutable `backend/target/sijilmassa-backend-0.1.0-SNAPSHOT.jar` contient le contrôleur de facturation, les DTO et la migration V10. Les empreintes SHA-256 de V1 à V10 et des deux copies du fond de facture correspondent à l’état de départ. Cette phase ne modifie aucun fichier frontend et les suites frontend et navigateur n’ont pas été relancées.
