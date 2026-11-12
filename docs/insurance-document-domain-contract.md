# Persistance des feuilles de soins dentaires — phase 9.2A

Le module interne prend en charge les fonds dentaires CNSS, CNOPS et FAR, version interne 1. Le [relevé des originaux](insurance-template-field-mapping.md) décrit les champs visibles et les deux feuilles générales laissées hors périmètre. La finalisation confirme un instantané de préparation au cabinet. La signature papier, le dépôt auprès d’un organisme et sa décision restent des étapes distinctes.

## Données et relations

- `insurance_document` possède un UUID serveur, un patient obligatoire, une consultation facultative, un type, un objet, une version de gabarit, un état, une version optimiste, des horodatages et des acteurs. Patient, consultation, type, objet et version de gabarit sont définis à la création. Une erreur de sélection demande un nouveau brouillon.
- `insurance_act` conserve l’ordre des lignes, leur saisie typée et, pour une exécution, des références éventuelles au soin et à la charge V9. Une charge doit correspondre au même soin, à la même consultation et au même patient. Un soin et une charge ne figurent qu’une fois dans un document. Des documents distincts peuvent relire la même charge. Ils ne la réservent pas.
- Les types Java séparent les trois volets, les objets et les valeurs sélectionnées. Le JSONB contient des enregistrements bornés `Fields`, `ActFields` et `Snapshot`. L’application valide le type exact, les listes distinctes et bornées, les dates calendaires, les formats INP/INPE, les références FDI, les centimes et les champs autorisés par variante. Une lecture interne JSON avec champ inconnu, valeur d’énumération numérique ou données supplémentaires échoue. Les contraintes SQL contrôlent l’enveloppe et les références. La validation détaillée des champs demeure dans le service.
- Le bénéficiaire est le patient. Le titulaire peut être le patient confirmé, ou une identité saisie spécifiquement pour cette feuille. La provenance `PATIENT` ou `DOCUMENT_INPUT` est figée. L’immatriculation, l’affiliation, la référence de compte et les informations professionnelles sont saisies explicitement. La couverture administrative existante du patient conserve son rôle. V12 ne crée pas de registre indépendant d’assurés ni de contrats de couverture réutilisables.
- La sélection clinique contient uniquement l’identifiant, la date, la désignation et la référence dentaire du soin. Les observations, le motif, les notes, le questionnaire et les prescriptions ne sont pas copiés. Un soin retiré est refusé. Les confirmations de dents et les champs de nomenclature sont saisis par le dentiste et n’altèrent aucune donnée clinique.

## Service et finalisation

| Opération interne | Effet |
| --- | --- |
| `createDraft(CreateInput)` | Crée un brouillon de version 0. La saisie peut être incomplète. Les références déjà fournies doivent être valides. |
| `replaceDraft(patientId, id, expectedVersion, draft)` | Remplace les champs et lignes du brouillon sous verrou et incrémente la version. |
| `get(patientId, id)` | Lit le document dans le périmètre du patient. Le brouillon expose les versions du patient et de la consultation à relire. Une lecture finalisée restitue l’identité et la consultation figées. |
| `finalizeDocument(patientId, id, FinalizeInput)` | Compare les versions du document, du patient et de la consultation liée. Valide la complétude de la variante puis passe de `BROUILLON` à `FINALISE`. |

Pour `EXECUTION` ou `RECUS`, la finalisation requiert une consultation terminée appartenant au patient et des soins actifs de cette consultation. Un brouillon peut être préparé pendant la consultation. Le service ne la termine jamais. Pour `ENTENTE_PREALABLE` ou `DEVIS`, le dentiste décrit des travaux prévus et peut relier une consultation du même patient. Une date prévue absente reste absente. Les lignes de prévision n’utilisent pas un soin exécuté comme substitut.

L’instantané de schéma 1 contient le type, l’objet, la version et le SHA-256 du fond, l’identité et la version du patient, la consultation et sa version le cas échéant, la provenance de l’assuré, les champs relus et les actes résolus. Les métadonnées relationnelles indiquent l’acteur et l’instant de finalisation. La lecture ne recalcule ni le contenu ni les montants à partir des données courantes. Aucun parcours de modification, suppression, réouverture ou seconde finalisation n’est disponible. Les triggers protègent la ligne et ses actes contre la modification ou la suppression après finalisation.

Le dentiste peut relire un document connu pour un patient archivé. L’API de phase 9.2B ajoute un historique patient paginé et limité aux métadonnées. L’archivage interdit toute écriture et n’altère aucun instantané. Un conflit de version demande une nouvelle lecture et une confirmation explicite. Une consultation étrangère, une charge étrangère ou un document demandé sous un autre patient sont refusés.

## Autorisation, audit et concurrence

Le module utilise `RolePolicies.CLINICAL` et contrôle aussi le compte actif, son rôle actuel et la version de session de l’`AccountPrincipal`. Le rôle accueil ne possède ni lecture complète ni projection administrative de ces documents. Les références vers la facturation ne confèrent aucun droit supplémentaire. Un accès administratif limité exigera une projection et une décision d’autorisation propres.

Les écritures partagent les verrous du compte, du patient et de la consultation avec les services existants, puis verrouillent le document avant ses lignes. Les soins lus pour capture sont verrouillés en partage. Le prix V9 est immuable et sa lecture ne dépend pas de la version d’encaissement. Le journal `security_audit_event` enregistre `INSURANCE_DOCUMENT_CREATED`, `INSURANCE_DRAFT_UPDATED` et `INSURANCE_DOCUMENT_FINALIZED`, avec acteur, patient, document et instant. L’audit est écrit et flushé dans la transaction métier. Un rejet annule aussi les lignes, le snapshot et le changement de version. Les messages métier sont génériques et le journal ne reçoit aucun contenu d’assurance ou clinique.

## Prix et comptabilité

Une ligne d’exécution peut référencer un prix convenu V9, conservé en centimes avec la provenance `V9_AGREED_PRICE`. Une ligne de devis peut contenir un prix manuel avec la provenance `MANUAL_QUOTE`. Le volet FAR exige les prix de ses lignes à la finalisation. CNSS et CNOPS gardent l’absence d’un prix distincte de zéro. Le total est une somme entière exacte disponible seulement si toutes les lignes ont une valeur. La valeur de clé, quand le fonds la comporte, est une saisie séparée.

Le service ne lit pas les règlements pour déterminer les frais engagés ou facturés à déclarer. Il ne crée aucun traitement, charge, paiement, facture, reçu comptable ou créance assureur. Les prix convenus, encaissements, totaux de facture et remboursements gardent chacun leur source. Un futur rendu devra obtenir une décision explicite avant de reporter le total des prix dans une rubrique de frais engagés.

## Migration et intégration suivante

[`V12__insurance_documents.sql`](../backend/src/main/resources/db/migration/V12__insurance_documents.sql) ajoute les deux tables, clés restrictives, contraintes de type, gardes de transition, index et cible d’audit. Elle ne réécrit aucune ligne V1–V11. Les tests de migration partent de V11 avec une facture émise, une charge et un paiement et comparent les données et checksums après V12. Le harnais de test des phases antérieures reconnaît désormais V12.

La [phase REST 9.2B](insurance-document-rest-contract.md) expose ce service au dentiste et ajoute l’historique patient paginé. Le contrat REST définit les DTO, les erreurs, la relecture avant finalisation et le transport exact des montants. La phase de rendu doit lire l’instantané, contrôler l’empreinte de l’original et préserver les rubriques papier. Le prototype actuel ne constitue pas une source d’authentification, de données réelles ou de règles de tarification.

Restent à décider avec le cabinet et les organismes concernés la version recevable de chaque fond, la référence de compte FAR, les cas hors variantes prises en charge, la déclaration des frais et la preuve de paiement, les conventions graphiques, l’accès administratif éventuel et la correction d’un document finalisé. Les deux feuilles générales demandent leur propre spécification.

## Vérification exécutée

Les tests utilisent PostgreSQL 17.11 sous Testcontainers avec Podman rootless 5.8.9. Les comptes et dossiers sont fictifs. Maven tourne avec OpenJDK 25.0.4.1 et compile avec la cible Java 21.

| Commande ou sélection | Réussis | Échecs | Erreurs | Ignorés |
| --- | ---: | ---: | ---: | ---: |
| `./mvnw -o -B -ntp -Dtest=InsuranceDocumentServiceTest,InsuranceMigrationTest test` | 16 | 0 | 0 | 0 |
| Sélection ciblée de six classes, avec assurance, clinique, finances, factures et finalisation des ordonnances | 118 | 0 | 0 | 0 |
| `./mvnw -o -B -ntp verify`, le 11 novembre 2026 UTC | 363 | 0 | 0 | 0 |

La sélection de six classes ajoute `ConsultationServiceTest` (25), `TreatmentFinancialServiceTest` (35), `InvoiceServiceTest` (15) et `PrescriptionFinalizationIntegrationTest` (27). L’assertion de schéma du test d’audit clinique inclut la colonne V12 et vérifie qu’elle reste vide sur les événements cliniques. Les listes de nettoyage des fixtures jetables incluent les deux tables V12.

Les suites assurance couvrent l’évolution V11, la correspondance SHA-256 des trois fonds, les liens et les refus, la concurrence, la capture des prix, l’immutabilité SQL, le rollback et la confidentialité. `git diff --check` et les empreintes de V1–V11 et des fonds de référence ont été vérifiés. La phase ne modifie aucun fichier frontend et n’exécute pas de suite frontend ou navigateur.

La vérification complète a pris 7 min 50 s. Elle a construit et reconditionné le JAR Spring Boot `backend/target/sijilmassa-backend-0.1.0-SNAPSHOT.jar`. L’archive contient V12 et les classes du module assurance. Aucun fichier d’origine ni checksum de V1–V11 n’a changé.
