# Factures persistantes — phase 8.7A

## Modèle et cycle de vie

V10 ajoute `invoice`, `invoice_line` et `invoice_number_sequence`. Une facture appartient à un patient et suit le cycle `BROUILLON → EMISE`. Le brouillon peut être vide. Il porte une version et une sélection ordonnée d’au plus 250 charges V9. Le patient est fixé à la création. Le dentiste ou l’accueil peut remplacer cette sélection tant que le patient est actif et que la facture est en brouillon. L’émission exige au moins une charge.

Les lignes portent exactement une charge existante du patient. Le prix, le libellé et la date proviennent de la charge convenue, y compris lorsque la consultation source est encore en brouillon. La commande sélectionne des UUID de charges. Une charge absente ou appartenant à un autre patient produit `CHARGE_NOT_FOUND`. Les UUID répétés sont refusés et une contrainte unique sur `invoice_line.charge_id` réserve chaque charge pour une seule facture, dès le brouillon. Les FK empêchent la suppression en cascade. Le retrait d’une ligne de brouillon libère la charge au commit, y compris si la sélection devient vide. Une réservation émise est permanente.

## Contrat des services

| Opération interne | Contrat |
| --- | --- |
| `createDraft(patientId, chargeIds)` | Crée un brouillon version 0 avec la sélection fournie |
| `replaceDraftCharges(patientId, invoiceId, expectedVersion, chargeIds)` | Remplace la sélection et avance la version |
| `issue(patientId, invoiceId, expectedVersion)` | Émet une facture numérotée avec l’identité et les lignes figées |
| `get(patientId, invoiceId)` | Retourne le détail, les soldes et l’état de règlement |

Les versions attendues sont obligatoires à la modification et à l’émission. Une version dépassée reçoit `VERSION_CONFLICT`. Un second appel à l’émission d’une facture déjà émise reçoit `INVOICE_ISSUED`. En cas de réponse perdue, relire la facture par son UUID pour retrouver son numéro. La lecture d’un dossier archivé reste autorisée. La création, le remplacement des lignes et l’émission sont refusés pendant l’archivage. Les réservations existantes restent alors en place.

## Numéro et données d’émission

Le serveur fixe l’instant de la demande d’émission après avoir verrouillé le brouillon. La date de facture est la date de cet instant dans `Africa/Casablanca`. Le numéro suit la forme `AAAA-001`, avec au moins trois chiffres et une séquence indépendante par année. PostgreSQL alloue la valeur sous verrou en mettant à jour le compteur de l’année. Les brouillons ne consomment aucun numéro. Une transaction annulée ne consomme pas le numéro non publié. Une facture émise conserve définitivement son numéro, même après une modification de l’identité courante du patient.

Le snapshot fige la référence administrative, le nom et le prénom, l’acteur, l’instant et la date d’émission. Chaque ligne conserve la date, le libellé, le prix et le cumul reçu à l’émission, avec sa référence de charge et sa position. Des gardes PostgreSQL protègent le document, ses lignes et leurs identifiants contre les modifications et suppressions ordinaires après émission. Le brouillon reste conservé et peut être vidé.

Depuis V11, l’émission fige aussi la référence dentaire facultative du soin source dans `invoice_line.issued_tooth_reference`. La capture suit l’UUID du soin via la charge V9 et conserve le texte enregistré. La référence reste absente pour les factures émises sous V10 et pour les soins sans référence. Si une ligne ne peut pas être capturée, la transaction d’émission échoue. Voir [la préparation des données du PDF](invoice-pdf-data-readiness.md).

## Encaissements et soldes

Les paiements restent sur leurs charges V9. La projection `issuance.balanceAtIssue` additionne les valeurs figées des lignes. `currentBalance` lit les paiements V9 des mêmes charges. Les totaux utilisent `BigInteger` en centimes MAD. Le reste est la différence entre le total et le reçu, calculée sans champ de solde éditable.

Une charge de 500 DH avec 200 DH déjà reçus produit à l’émission un prix de 500 DH, un reçu de 200 DH et un reste de 300 DH. Après un autre paiement de 100 DH, le reçu courant passe à 300 DH et le reste à 200 DH. Les valeurs d’émission restent consultables. Deux factures distinctes ne partagent aucune charge et ne comptent donc pas le même paiement.

`BROUILLON` et `EMISE` décrivent le document. Les états courants `DUE`, `PARTIAL` et `SETTLED` décrivent le règlement d’une facture émise. Une facture émise à zéro est soldée. Un futur PDF d’origine devra utiliser l’identité, les lignes et les soldes à l’émission. Un relevé des règlements courants devra identifier séparément les montants actualisés.

## Transactions, autorisation et audit

Le dentiste et l’accueil peuvent lire, préparer et émettre. La vérification de session contrôle le compte courant, son activité, son rôle et sa version. Les deux rôles sélectionnent des prix convenus par le dentiste dans V9. La projection renvoie l’identité de facturation, les données du registre et la référence dentaire figée sur les lignes émises. Les notes, questionnaires, diagnostics, ordonnances et identifiants cliniques ne font pas partie du contrat.

Une écriture verrouille le compte et le patient en partage, puis le brouillon pour les modifications et l’émission. Le service vérifie la version, la propriété des charges et les réservations. La contrainte d’unicité tranche une collision entre sélections concurrentes. Les insertions de réservations suivent un ordre déterministe. L’émission verrouille les charges sélectionnées dans l’ordre des UUID, avec le même verrou qu’un encaissement V9. Un paiement déjà en cours peut terminer avant la capture. Le paiement qui attend derrière l’émission n’entre que dans le solde courant. La lecture du détail utilise `REPEATABLE_READ` pour réunir l’en-tête et les lignes dans le même état validé.

La numérotation, la transition, le snapshot et l’audit sont dans la même transaction. V10 ajoute `target_invoice_id` au journal existant. `INVOICE_CREATED`, `INVOICE_DRAFT_UPDATED` et `INVOICE_ISSUED` enregistrent l’action, l’acteur, la facture et l’instant. Un échec d’audit annule aussi les modifications de lignes et l’allocation du numéro.

## Migration et décisions restantes

`V10__invoice_persistence.sql` ajoute les tables, clés restrictives, index et gardes, et étend les catégories d’audit. Les charges, paiements et données antérieurs sont conservés. Le prototype frontend reste un historique de démonstration et ses numéros ne sont pas importés.

Les corrections d’une facture émise, annulations, avoirs, remboursements, transferts et traitements fiscaux restent à définir. Les règles de reprise d’une éventuelle numérotation papier devront être validées avec le cabinet avant usage. Les contrats [REST](invoice-rest-contract.md) et [frontend](invoice-frontend-integration.md) décrivent les phases suivantes. Le rendu du PDF de facture reste à intégrer.

## Vérification du 11 novembre 2026

Les essais utilisent des bases jetables PostgreSQL 17.11 Testcontainers, un socket Podman privé et le JDK 25.0.4.1 avec compilation Java 21. Les tests du renderer existant s’exécutent en mode AWT headless. Toutes les données sont synthétiques.

```sh
cd backend
export JAVA_TOOL_OPTIONS=-Djava.awt.headless=true
./mvnw -B -ntp -o -Dtest=InvoiceMigrationTest,InvoiceServiceTest test
./mvnw -B -ntp -o -Dtest=TreatmentFinancialServiceTest,FinancialHttpIntegrationTest,TreatmentFinancialMigrationTest,ConsultationServiceTest,ClinicalHttpIntegrationTest,PrescriptionHttpIntegrationTest,PrescriptionFinalizationIntegrationTest,PrescriptionRenderingIntegrationTest,DossierPdfRendererTest test
./mvnw -B -ntp -o -Dtest=AppointmentIntegrationTest,PatientIntegrationTest,AuthenticationIntegrationTest test
./mvnw -B -ntp -o verify
```

| Contrôle | Tests réussis | Échecs | Erreurs | Ignorés |
| --- | ---: | ---: | ---: | ---: |
| Facturation ciblée, dont 2 tests de migration et 14 tests de service | 16 | 0 | 0 | 0 |
| Régressions du registre financier, de la clinique, des ordonnances et du dossier PDF | 180 | 0 | 0 | 0 |
| Reprise des fixtures rendez-vous, patients et authentification | 65 | 0 | 0 | 0 |

Le test de migration applique V10 sur une base V9 contenant déjà une charge et un paiement, puis compare les données et les checksums. Les tests de concurrence vérifient deux émissions indépendantes, deux tentatives sur le même brouillon et deux tentatives sur la même charge. Un test attend le verrou PostgreSQL d’un paiement en cours et vérifie que le reçu validé entre dans le snapshot. Un rejet réel du journal d’audit confirme l’annulation du numéro, des données d’émission et des modifications de brouillon.

Le premier passage global a exécuté 322 tests et signalé 65 erreurs de préparation. Les listes de nettoyage de trois fixtures jetables omettaient les tables de facturation référencées par V10. Les 65 tests concernés ont réussi après leur mise à jour.

Le harnais navigateur attend désormais V1–V10. Sa syntaxe est vérifiée avec `node --check`. La vérification de cette phase porte sur les suites backend. Le scanner Unslop étant limité à l’anglais, le texte français a été relu manuellement.

Le passage complet sur les fixtures stabilisées a réussi **322 tests**, avec zéro échec, erreur ou test ignoré, en 6 min 36 s. Le JAR exécutable contient V10 et le service de facturation. Les empreintes de V1 à V9 et du fond officiel de facture correspondent à l’état initial. `git diff --check` et `git status` ont été exécutés sur les fichiers finaux.
