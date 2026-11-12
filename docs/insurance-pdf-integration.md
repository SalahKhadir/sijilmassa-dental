# Formulaires PDF d’assurance dentaire — phase 9.2D

## Fonds et décision de rendu

Les trois originaux sont des scans bilingues de deux pages, sans AcroForm. Les dimensions ci-dessous sont les dimensions natives en points, avant rotation. La version interne V12 est 1. Les empreintes correspondent aux octets d’origine et à l’empreinte inscrite dans les instantanés finalisés.

| Fond | SHA-256 | Géométrie sur les deux pages | Objets |
| --- | --- | --- | --- |
| `feuille_dentaire_CNSS.pdf` | `9f829b1a26545a979e5cc94075307822aac95295529d572bfee17a82e5d51609` | 728,40 × 1031,76, rotation 270°, origine (0, 0) | Entente préalable, exécution |
| `feuille_dentaire_CNOPS.pdf` | `255e712e12aa0642c79ee6789e8e03c587425c6d4186f58e8fe094985b45efef` | 799,44 × 574,08, rotation 0°, origine (0, 0) | Entente préalable, exécution |
| `feuille_dentaire_FAR.pdf` | `35278aba6d61ce76d8ac30e3ffba5c2f2f2d95cd5d60fabea3921bb55a239d43` | 842,25 × 595,50, rotation 0°, origine (0, 8,58) | Devis et reçus bloqués |

La recevabilité actuelle de ces éditions pour un dépôt officiel reste **non vérifiée**. CNSS et CNOPS sont des formulaires préremplis à compléter sur papier. Le bloc FAR indique que tous les champs sont obligatoires. Le sens du compte à renseigner et la source des frais engagés restent à valider pour les deux objets. La variante reçus demande en plus une règle sur la preuve de paiement. Aucun de ces trois éléments ne peut être déduit du solde du cabinet ou des prix convenus.

## Relevé des rubriques et sources figées

La colonne source désigne l’instantané V12. Les données manuelles ci-dessous sont déjà saisies dans le document et figées à la finalisation. Les mentions imprimées, instructions, en-têtes et logos sont conservés avec le fond. Aucun profil de praticien courant n’est lu.

| Rubrique imprimée | Source et comportement |
| --- | --- |
| CNSS/CNOPS · Entente préalable, Exécution | `purpose`, une seule case cochée. |
| CNSS/CNOPS · Nom et prénom, CIN, adresse de l’assuré | `insured.lastName/firstName` requis. `insured.cin` et `insured.address` facultatifs. Adresse sur deux lignes disponibles. |
| CNSS/CNOPS · Immatriculation et CNOPS · Affiliation | `fields.cnss.registrationNumber` ou `fields.cnops.registrationNumber`, et `fields.cnops.affiliationNumber` en CNOPS. Saisies distinctes et requises. |
| CNOPS · N° du Tél | `insured.phone` facultatif. Seul un numéro saisi dans le document est reporté. Le GSM administratif repris automatiquement reste à confirmer sur papier. |
| CNSS/CNOPS · Lien de parenté | `insured.relationship`, requis. Conjoint et Enfant sur les deux fonds. Lui-même sur CNSS. CNOPS ne comporte pas de case correspondante. |
| CNSS/CNOPS · Montant des frais, nombre de pièces jointes | Le montant déclaré reste vide. `fields.attachmentCount` facultatif, zéro compris. |
| CNSS/CNOPS · Bénéficiaire, naissance, CIN, sexe | `beneficiary.lastName/firstName` requis. `beneficiary.dateOfBirth/cin/sex` facultatifs. |
| CNSS · INP, CNOPS · INPE | `fields.cnss.practitionerInp` ou `fields.cnops.practitionerInpe`. Neuf chiffres manuels requis. |
| CNSS/CNOPS · Type de soins | `careTypes` du volet correspondant. Cases cochées selon les choix explicites, avec une case propre à chaque variante d’orthodontie. |
| CNSS/CNOPS · Entente et accident | `priorAuthorizationNumber` et `accidentDate`, facultatifs. `accidentCauses` facultatif en CNOPS. |
| CNSS/CNOPS · Fait à, Le, côté dentiste | `dentistDeclaration.place/date` facultatifs. Les lieux et dates côté assuré restent à renseigner sur papier. |
| CNSS/CNOPS · Dents traitées, code, date, lettre-clé et cotation, valeur de clé | `acts[].tooth/actCode/date/keyLetter/coefficient/keyValueMinor`, dans l’ordre figé. Valeur de clé exacte en DH, zéro compris. Les cellules facultatives absentes restent vides. |
| CNSS/CNOPS · Montant facturé | Cellules vides. Les prix convenus et les devis figés, y compris `knownCompleteFeeTotalMinor`, restent des données du dossier. |
| CNSS/CNOPS · Libellé des actes | `acts[].description` reste consultable dans le dossier. Aucun emplacement de libellé libre sur ces fonds. |
| CNOPS · CIM-10 | `fields.cnops.diagnosisCategory`, trois caractères saisis, facultatif. |
| CNSS/CNOPS · Schéma dentaire | `confirmedTeeth` du volet correspondant, facultatif. Carré de repérage aux centres FDI confirmés, sans qualification de l’acte. |
| CNSS/CNOPS · Déclarations, signatures, cachets, dépôt, agence, DAMO, mutuelle, pharmacie, biologie, radiologie, paramédical | Mentions préimprimées intactes. Les zones manuscrites et les cadres des tiers restent vides. |
| FAR · DEVIS/REÇUS, Soins/Prothèse, Maladie/Maternité/Accident | `purpose`, `far.care`, `far.context`, requis. Fond bloqué. |
| FAR · CIN, compte, téléphone, nom, grade, unité, adresse de l’adhérent | `insured.cin/phone/lastName/firstName/address` et `far.accountNumber/rank/unit`, requis. Compte manuel dont le sens imprimé reste à confirmer. |
| FAR · Bénéficiaire, naissance, Adhérent/Conjoint/Enfant, INPE | `beneficiary.lastName/firstName/dateOfBirth`, `insured.relationship` et `far.practitionerInpe`, requis. |
| FAR · Date, position dent, nature, coefficient et montant des honoraires | `acts[].date/tooth/description/coefficient/feeMinor`. Libellé et prix requis. Montant manuel du devis ou prix convenu V9 en reçus, sans preuve de paiement. |
| FAR · Schéma dentaire | `far.marks[].tooth/symbol`, facultatif. Cercle ou croix choisi explicitement. |
| FAR · Frais engagés, prospectus, pièces, Le | Frais sans source approuvée. `far.prospectusCount`, `fields.attachmentCount`, `far.insuredStatementDate` requis. |
| FAR · Déclarations, signatures, cachets, contrôle médical, correspondant mutuelle, ordonnance, autres praticiens, pharmacie, accident | Rubriques papier ou tiers, hors de l’instantané. Aucune attestation d’encaissement, signature ou preuve de remboursement. |

## Rendu et sécurité

`InsuranceDocumentService.finalizedSnapshot` valide le compte dentiste et charge l’instantané dans le périmètre patient. Le rendu utilise uniquement cet instantané et les ressources fixes incorporées au JAR. PDFBox ajoute un flux de texte et de repères à chaque page du fond. La position de chaque champ est mesurée sur son propre scan. Le rendu vérifie le schéma V12, l’empreinte du fond et de Liberation Sans Regular, les cinq boîtes, la rotation et le nombre de pages. Il rouvre le PDF produit avant de répondre. Les documents finalisés d’un patient archivé restent accessibles.

Le texte est composé à 8 points. Les cases et le tableau gardent leurs dimensions. Le code d’acte CNSS occupe les quatre compartiments imprimés. Les valeurs trop longues, y compris les montants, échouent sans troncature ni réduction du corps. L’adresse utilise les deux lignes du formulaire si nécessaire. Le texte latin et les accents pris en charge par la police sont incorporés. Un champ à imprimer qui nécessite un façonnage arabe ou contient un glyphe non pris en charge entraîne un refus. Les éléments arabes imprimés sur le fond restent intacts.

Le serveur autorise deux rendus simultanés. Les lectures de ressources et la sortie sont limitées à 8 Mio. La réponse n’est envoyée qu’une fois le PDF complet en mémoire. La génération se fait à la demande. Les données et fonds sont figés, et les tests comparent les valeurs imprimées avant et après modification du patient et encaissement. L’identité octet pour octet du fichier régénéré reste hors garantie.

`GET /api/v1/insurance-documents/{documentId}/pdf?patientId={patientId}` utilise la session existante. Le contrôle du rôle précède la lecture du document. Pour l’accueil, un UUID présent ou absent reçoit le même 403. Un UUID de patient erroné donne le même 404 qu’un document absent. La réponse réussie utilise `application/pdf`, `Cache-Control: no-store, private`, `nosniff` et le nom `formulaire-assurance-{documentId}.pdf`.

| Statut | Situation |
| --- | --- |
| 400 | UUID ou paramètres invalides. |
| 401 / 403 | Session absente ou accès refusé. |
| 404 | Document introuvable dans le périmètre patient. |
| 409 | `INSURANCE_PDF_NOT_FINALIZED`, `INSURANCE_PDF_FAR_UNAVAILABLE` ou `INSURANCE_PDF_TEMPLATE_UNSUPPORTED`. |
| 422 | `INSURANCE_PDF_LAYOUT_OVERFLOW` ou `INSURANCE_PDF_UNSUPPORTED_TEXT`. |
| 500 / 503 | Vérification d’intégrité, échec de rendu, capacité momentanément atteinte ou service indisponible. |

Les refus utilisent RFC 9457 et des messages génériques. Le proxy Next.js ajoute uniquement ce GET à sa liste d’assurance. Il vérifie le nom, le type, la longueur, la limite et la signature PDF avant de livrer le fichier. Le client utilise la même origine et vérifie à nouveau les métadonnées. Les actions **Télécharger le formulaire PDF** et **Imprimer le formulaire** apparaissent sur les CNSS et CNOPS finalisés dont le fond est reconnu. Le bouton d’impression ouvre le PDF dans le lecteur du navigateur. Les URL temporaires sont révoquées à la fermeture de l’aperçu et à la sortie de la vue. Le client annule ses lectures lors d’un changement de session.

## Inspection visuelle et papier

Les six pages des trois originaux ont été examinées. Cinq formulaires fictifs ont été générés pour l’inspection du résultat. CNSS à 1 et 3 actes, CNOPS à 1 et 9 actes, puis CNOPS avec une adresse longue sur deux lignes. Le test de rendu exporte ces fixtures si `SYNTHETIC_INSURANCE_PDF_DIR` désigne un répertoire existant. Les dix pages ont été comparées à 144 ppp avec les originaux. Aucun pixel n’a changé hors des zones de saisie mesurées. Les agrandissements ont permis de vérifier les cases, les cases d’identifiants, les décimales et zéros, les tableaux pleins, les repères FDI, les accents et les cadres de signature laissés vides. Les deux objets FAR sont couverts par des refus et aucun PDF FAR prérempli n’est produit.

L’impression physique reste à vérifier sur l’imprimante du cabinet. La taille affichée à 100 % est d’environ 364 × 257 mm pour CNSS et 282 × 203 mm pour CNOPS. Vérifier le papier et les marges utiles du pilote, l’absence de recadrage sur les deux pages, la lisibilité des cases et l’espace pour la signature et le cachet.

La MGPAP publie une feuille dentaire dont la référence diffère de celle du fond CNOPS du dépôt. La page des formulaires CNSS n’a pas pu être consultée pendant la vérification. Le Bulletin officiel consulté traite de la couverture FAR et ne valide aucune version du formulaire. La recevabilité des trois fonds préremplis demeure non vérifiée. [Feuille publiée par la MGPAP](https://www.mgpap.org.ma/attachments/article/55/dentaire.pdf) · [Bulletin officiel n° 6152](https://www.sgg.gov.ma/BO/bo_fr/2013/BO_6152_Fr.pdf)

## Fichiers de la phase

- Backend `insurance/InsurancePdfController.java`, `InsurancePdfRenderer.java`, `InsurancePdfLayout.java`, `InsurancePdfTeeth.java` et `InsurancePdfFailure.java`. Lecture dédiée dans `InsuranceDocumentService.java`, règle HTTP dans `SecurityConfiguration.java`, traitement des erreurs dans `GlobalExceptionHandler.java` et ressources dans `backend/pom.xml`.
- Frontend `insurance/persistent/pdf-actions.tsx` et `detail.tsx`, client et schémas `lib/insurance/api/`, proxy `lib/auth/backend-proxy.ts` et vérification binaire `lib/api/pdf-download.ts`.
- Tests `InsurancePdfRendererTest.java`, `InsuranceHttpIntegrationTest.java`, `frontend/tests/persistent-insurance.test.mjs` et `frontend/tests/browser/persistent-insurance.test.mjs`. La documentation REST référence la nouvelle route.

## Vérification du 12 novembre 2026

| Contrôle | Résultat |
| --- | --- |
| `./mvnw -o -B -ntp -Djava.awt.headless=true -Dtest=InsurancePdfRendererTest test` | 11 réussis, aucun échec ni ignoré. |
| `./mvnw -o -B -ntp verify` | 401 réussis, aucun échec ni ignoré. Comprend 27 tests HTTP assurance et les régressions PDF dossier, facture et ordonnance. Les empreintes des deux fonds embarqués dans le JAR correspondent aux originaux. |
| Tests frontend ciblés assurance, facture et dossier PDF | 15 réussis, aucun échec ni ignoré. |
| Suite frontend complète | 368 réussis, aucun échec ni ignoré. |
| TypeScript strict, ESLint et `next build` | Réussis. Build de production Turbopack dans une copie sans fichiers d’environnement du cabinet. |
| `node tests/browser/run-real-integration.mjs` avec les six suites persistantes | 36 réussis, aucun échec ni ignoré. Assurance 7, clinique 5, ordonnances 10, finances 5, factures 7, dossier 2. Le contrôle d’arrêt réel du backend a également réussi. |

Les essais HTTP et navigateur utilisent PostgreSQL 17.11 jetable sous Podman, des comptes fictifs et les migrations V1 à V12. Les vérifications navigateur comprennent le téléchargement CNSS et CNOPS, les deux pages et leur rotation, le lecteur PDF, le refus FAR, le dépassement de zone et la perte de session. Le délai intermittent de « Actualiser les finances » constaté en 9.2C reste au suivi de stabilisation. Le scénario a réussi pendant cette phase.

Le premier lot backend ciblé a démarré avant la construction du worker d’ordonnance. Les 39 cas concernés ont réussi pendant le passage Maven complet avec le worker construit. `git diff --check` et `git status` ont été exécutés.
