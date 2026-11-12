# Données du PDF de facture A5 — phase 8.7C.2A

## Référence dentaire

Le soin clinique stocke `clinical_treatment.tooth_reference` dans une colonne de 50 caractères. Le champ REST `toothReference` est requis dans la commande clinique et peut être vide. Le service supprime les espaces aux extrémités et accepte des lettres, des chiffres et des séparateurs simples. Le champ peut contenir plusieurs références, par exemple `17 / 18`. Le modèle conserve un texte et ne valide pas une liste FDI. Le registre V9 conserve l’UUID du soin dans `treatment_charge.treatment_id`. Ses projections de paiement ne contiennent pas la référence dentaire.

V11 ajoute `invoice_line.issued_tooth_reference`, nullable, avec la même longueur que le champ source. Le déclencheur d’émission V10 reste en place. Sa fonction relie chaque ligne à son soin par la charge et verrouille les soins en partage pendant la capture. Le texte est copié dans son ordre d’origine, séparateurs compris. Une chaîne clinique vide devient `null`. La position de la ligne dans la facture reste celle du brouillon.

Une ligne dont la source manque ou dont la capture échoue annule l’émission. La version, le numéro et l’audit restent dans la même transaction. Les contrôles d’immuabilité V10 protègent aussi la nouvelle colonne. Les prix, paiements, réservations et données cliniques suivent les mêmes règles qu’avant V11.

Les factures émises avant V11 gardent une valeur absente. La migration conserve leur snapshot et la référence clinique courante ne sert pas à les compléter. Un brouillon créé avant la migration peut recevoir la référence à sa première émission après V11. Une éventuelle correction ou réémission des anciens documents relève d’une politique future.

## REST et client

Le détail d’une facture émise ajoute `issuanceSnapshot.lines[].toothReference`, de type chaîne ou `null`. Le client Zod accepte aussi l’omission de la propriété pour les réponses de l’API antérieure. La valeur est accessible au dentiste et à l’accueil dans cette projection de facturation. Les identifiants cliniques, les diagnostics et les notes restent hors des réponses. Le champ reste absent des DTO de brouillon, d’historique et de sélection des charges.

## Montant français en lettres

`amountToFrenchWords` et `invoiceAmountSentence` acceptent un `bigint`, un entier JavaScript sûr ou une chaîne décimale canonique de centimes. La chaîne contient uniquement des chiffres ASCII, sans signe, espaces, séparateur décimal ni zéro initial, sauf pour `"0"`. Une entrée non entière, imprécise ou hors plage déclenche une erreur. Les calculs du montant, de la partie entière et du reste utilisent `BigInt`. Seuls les groupes de trois chiffres ou moins sont convertis en indices numériques pour appliquer les règles de graphie.

La borne inclusive est **2 251 799 813 685 247 750 centimes**, soit **22 517 998 136 852 477,50 MAD**. Elle découle de 250 positions de ligne distinctes par facture et de 9 007 199 254 740 991 centimes par ligne dans V10. Le formateur garde les usages du cabinet, dont « zéro dirham et un centime », « vingt et un » et « mille deux cents ». Les grands nombres sont exprimés en milliards et leur reste, avec « de » lorsque la quantité se termine par un nom d’échelle. [Accords de vingt, cent et mille](https://vitrinelinguistique.oqlf.gouv.qc.ca/21532/la-grammaire/les-determinants/determinants-numeraux/pluriel-de-vingt-de-cent-et-de-mille), [Écriture de million et de milliard](https://vitrinelinguistique.oqlf.gouv.qc.ca/21647/la-typographie/nombres/ecriture-de-million-et-de-milliard).

## Intégration du rendu à venir

Le fond officiel `docs/references/pdf-templates/facture_background.png` est le fond A5 de 1 410 × 2 000 pixels. La grille `DATE | DENTS | DESCRIPTION | PRIX` est tracée par le moteur prototype. Le rendu persistant devra adapter ce moteur à `issuanceSnapshot`, utiliser le formateur exact pour le total original et laisser la case DENTS vide en l’absence de référence. Il faudra vérifier que les références de 50 caractères et les montants maximaux en lettres restent lisibles, puis définir le comportement si une ligne ou la facture dépasse la zone imprimable. Les totaux du registre courant restent réservés aux vues de suivi.

## Vérification du 11 novembre 2026

Les tests backend utilisent PostgreSQL 17.11 jetable via Testcontainers. Les parcours navigateur utilisent le build Next.js de production, Chrome et le serveur Spring du harnais, avec validation de Flyway V1–V11. Les données sont synthétiques.

| Contrôle | Résultat |
| --- | --- |
| Maven ciblé, `InvoiceMigrationTest,InvoiceServiceTest,FinancialHttpIntegrationTest` | 65 réussis |
| Régressions Maven, registre, clinique, dossier PDF et ordonnances | 149 réussis |
| `./mvnw -B -ntp -o verify` | 340 réussis, JAR exécutable vérifié avec V11 |
| Frontend ciblé, `tests/invoices.test.mjs` et `tests/invoice-amount-to-words.test.mjs` | 12 réussis |
| `pnpm test` | 355 réussis |
| `pnpm exec tsc --noEmit --incremental false` et `pnpm lint` | Réussis |
| Build Next.js Webpack de production | Réussi dans une copie sans fichiers d’environnement du cabinet |
| Chrome, factures, registre, dossier et clinique | 17 réussis |
| Chrome, ordonnances persistantes avec le worker synthétique | 10 réussis |

La migration est testée sur une base V10 contenant une facture émise, un brouillon et un paiement. Les tests comparent les données et les checksums avant et après l’ajout. Deux soins de même libellé vérifient le lien par UUID, avec une référence de 50 caractères, une référence simple et une référence absente. Une modification du soin après émission laisse le snapshot intact. Un défaut de capture forcé en base vérifie le retour d’une erreur sûre, l’état du brouillon, l’audit et le compteur. Les tests du formateur vérifient la borne maximale, les centimes adjacents et les entrées invalides.

Les passages finaux ont terminé sans échec ni test ignoré. La vérification Maven complète a duré 7 min 52 s. `git diff --check` et `git status` ont été exécutés sur les fichiers finaux. Les empreintes des migrations V1–V10 et des deux copies du fond officiel correspondent au point de départ.
