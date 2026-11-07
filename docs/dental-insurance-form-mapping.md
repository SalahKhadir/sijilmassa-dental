# Préparation des feuilles de soins dentaires — phase 6

Cette analyse porte sur les deux pages de chacun des trois formulaires dentaires fournis. Les documents généraux CNSS et CNOPS sont des références secondaires distinctes. Les originaux sous `docs/references/pdf-templates/` sont conservés. Cette phase produit une cartographie documentaire et une section d’information dans Documents.

## Métadonnées mesurées

Les dimensions proviennent des boîtes PDF, mesurées avec Poppler. Les six pages dentaires ont été rendues et inspectées, avec agrandissement des trois schémas. Les cinq formulaires d’assurance sont des documents plats constitués d’images. `pdfimages -list` trouve une image principale par page, `pdffonts` ne trouve aucune police et l’extraction de texte est vide. `pdfinfo` indique `Form: none`. Aucun champ AcroForm interactif n’a été repéré.

| Source exacte | Priorité | Pages | Dimensions natives en points, chaque page | Dimensions en mm | Rotation / orientation affichée |
| --- | --- | --- | --- | --- | --- |
| `feuille_dentaire_CNSS.pdf` | Dentaire primaire | 2 | 728,40 × 1 031,76 | 256,96 × 363,98 | 270°, paysage affiché 1 031,76 × 728,40 pt |
| `feuille_dentaire_CNOPS.pdf` | Dentaire primaire | 2 | 799,44 × 574,08 | 282,02 × 202,52 | 0°, paysage |
| `feuille_dentaire_FAR.pdf` | Dentaire primaire | 2 | 842,25 × 595,50 | 297,13 × 210,08 | 0°, paysage, proche A4 |
| `cnss-feuille-de-soins-maladie.pdf` | Générale secondaire | 2 | 728,40 × 1 031,76 | 256,96 × 363,98 | 270°, paysage affiché |
| `cnops-feuille-de-soins-maladie.pdf` | Générale secondaire | 2 | 792,00 × 609,48 | 279,40 × 215,01 | 0°, paysage |

Le FAR possède un décalage vertical de boîte de 8,580014 pt. Son MediaBox et son CropBox vont de `(0 ; 8,580014)` à `(842,25 ; 604,08)`. Les boîtes des deux autres formulaires dentaires commencent à `(0 ; 0)`. Les pages recto/verso de chaque document partagent les dimensions indiquées. Les noms des fichiers ne déterminent pas leur format.

Les fichiers CNSS/CNOPS dentaires portent chacun un volet d’instructions et un volet administratif sur leur première page physique. La seconde contient des tableaux et un schéma dentaire. Le FAR rassemble également plusieurs volets sur chacune de ses deux pages physiques. Le numéro « Page 2 » imprimé dans son volet Ordonnance et la mention de « quatrième page » ne correspondent pas au nombre de pages du PDF fourni. La complétude du jeu papier et son pliage devront être confirmés avant une intégration.

## Lecture des inventaires

Les rectangles sont des repérages approximatifs, en points PDF natifs `(x0, y0, x1, y1)`, avec origine en bas à gauche. Ils ont été relevés sur les rendus, arrondis au dixième et transformés selon la rotation réelle. Ils définissent des zones à calibrer, pas un contrat de remplissage prêt à exécuter. Les marges internes et lignes de base devront être testées sur le PDF d’origine, puis sur une impression.

Pour la CNSS à rotation 270°, les repères visuels après rotation `(u, v)`, origine visuelle en bas à gauche, se convertissent en coordonnées natives par `x = v`, `y = 1031,76 - u`. Le texte devra aussi être orienté selon ce repère. Une cartographie CNOPS ou FAR ne peut pas être appliquée à cette page tournée.

L’exigence **N** signifie que le caractère obligatoire ou facultatif n’est pas précisé par le document. **O explicite** reprend une mention optionnelle imprimée. **C accident** reprend « En cas d’accident ». **R volet maladie*** reprend l’astérisque du volet FAR et sa note « Tous les champs sont à renseigner obligatoirement ». L’étendue de cette note aux volets médicaux et à leurs cas sans objet reste à confirmer. Les astérisques CNSS/CNOPS accompagnés de « Cocher la mention utile pour chaque case » n’établissent pas à eux seuls une obligation de remplir chaque rubrique.

Les classifications de provenance sont `AVAILABLE_FROM_PATIENT`, `AVAILABLE_FROM_CONSULTATION`, `AVAILABLE_FROM_TREATMENT`, `FUTURE_INSURANCE_DATA`, `FUTURE_PRACTITIONER_DATA`, `MANUAL_ONLY` et `UNKNOWN`. Une disponibilité signifie qu’un champ peut être proposé après vérification du rôle de la personne et de sa présence dans le dossier. Les identités d’assuré et de bénéficiaire restent distinctes. Les zones notées SIGNATURE ou CACHET exigent l’intervention du signataire ou de l’organisme concerné.

## CNSS dentaire

Source `feuille_dentaire_CNSS.pdf`. Le titre est « Feuille de soins dentaires ». Les rubriques dentaires utilisent le sigle imprimé INP. Le schéma et les actes occupent la partie droite de la page 2.

| Page | Libellé original et champ sémantique | Type / exigence | Source possible | Saisie et signature | Rectangle PDF approximatif |
| --- | --- | --- | --- | --- | --- |
| 1 | Entente préalable* / Exécution* · `documentPurpose` | cases / N | `FUTURE_INSURANCE_DATA` | Sélection explicite de la démarche | `[649.1, 176.0, 671.7, 345.0]` |
| 1 | Nom et prénom · assuré(e) · `insured.name` | texte / N | `FUTURE_INSURANCE_DATA` | Identité de l’assuré à recueillir, même si le bénéficiaire est un patient connu | `[615.6, 109.6, 627.8, 380.5]` |
| 1 | N° Immatriculation · `insured.registration` | identifiant / N | `FUTURE_INSURANCE_DATA` | À vérifier par le dentiste | `[596.9, 270.8, 609.8, 361.1]` |
| 1 | N° de la Carte d’Identité Nationale · assuré · `insured.cin` | identifiant / N | `FUTURE_INSURANCE_DATA` | À vérifier par le dentiste | `[582.7, 125.7, 596.3, 220.5]` |
| 1 | Lien de parenté du bénéficiaire avec l’assuré(e)* · Conjoint / Enfant / Lui même · `beneficiary.relationship` | cases / N | `FUTURE_INSURANCE_DATA` | Ne pas déduire du nom ou du sexe | `[551.8, 125.1, 568.5, 338.5]` |
| 1 | Adresse · assuré · `insured.address` | texte multiligne / N | `FUTURE_INSURANCE_DATA` | À vérifier par le dentiste | `[526.0, 74.8, 549.2, 401.7]` |
| 1 | Montant des frais · `claim.totalFees` | montant DH / N | `UNKNOWN` | Futur registre financier validé | `[507.3, 259.2, 522.8, 374.0]` |
| 1 | Nombre de pièces jointes · `claim.attachmentCount` | entier / N | `MANUAL_ONLY` | Inventaire effectif des pièces | `[493.1, 152.2, 508.6, 216.0]` |
| 1 | Nom et prénom · Bénéficiaire des soins · `beneficiary.name` | texte / N | `AVAILABLE_FROM_PATIENT` | Patient.identity, après confirmation de son rôle | `[448.6, 107.7, 462.2, 370.8]` |
| 1 | Date de naissance · `beneficiary.birthDate` | date / N | `AVAILABLE_FROM_PATIENT` | Patient.identity.dateOfBirth si renseignée | `[433.8, 169.0, 446.1, 261.2]` |
| 1 | N° de la Carte d’Identité Nationale · bénéficiaire · `beneficiary.cin` | identifiant / N | `AVAILABLE_FROM_PATIENT` | Patient.identity.cin, accès autorisé requis | `[413.2, 163.1, 426.1, 256.0]` |
| 1 | Sexe* · M / F · `beneficiary.sex` | cases / N | `AVAILABLE_FROM_PATIENT` | Conserver Non renseigné si absent | `[393.9, 125.1, 408.7, 209.6]` |
| 1 | N° INP · `dentist.inp` | identifiant / N | `FUTURE_PRACTITIONER_DATA` | Le libellé imprimé est INP, pas une valeur connue du praticien | `[358.4, 313.4, 372.6, 402.4]` |
| 1 | Soins* · `careType.600` | case / N | `MANUAL_ONLY` | Choix explicite du dentiste | `[328.7, 232.1, 341.6, 248.3]` |
| 1 | Prothèse* · `careType.626` | case / N | `MANUAL_ONLY` | Choix explicite du dentiste | `[312.0, 232.1, 324.9, 248.3]` |
| 1 | Orthodontie faciale* · `careType.650` | case / N | `MANUAL_ONLY` | Choix explicite du dentiste | `[296.5, 232.1, 309.4, 248.3]` |
| 1 | Autres* · `careType.675` | case / N | `MANUAL_ONLY` | Choix explicite du dentiste | `[280.4, 232.1, 293.3, 248.3]` |
| 1 | N° Entente préalable · `authorization.number` | identifiant / N | `FUTURE_INSURANCE_DATA` | À saisir depuis une autorisation réelle, si applicable | `[261.1, 176.7, 275.2, 270.8]` |
| 1 | Date d’accident · En cas d’accident précisez · `accident.date` | date / C accident | `FUTURE_INSURANCE_DATA` | Informations d’accident à recueillir | `[244.3, 174.1, 257.2, 267.6]` |
| 1 | Fait à · `insured.declarationPlace` | texte / N | `MANUAL_ONLY` | Lieu réel de déclaration | `[198.5, 293.4, 212.1, 386.9]` |
| 1 | Le · `insured.declarationDate` | date / N | `MANUAL_ONLY` | Date réelle de déclaration | `[182.4, 293.4, 195.3, 386.9]` |
| 1 | Fait à · `dentist.declarationPlace` | texte / N | `MANUAL_ONLY` | Lieu réel de déclaration | `[198.5, 77.4, 212.1, 193.5]` |
| 1 | Le · `dentist.declarationDate` | date / N | `MANUAL_ONLY` | Date réelle de déclaration | `[182.4, 77.4, 195.3, 193.5]` |
| 1 | Signature de l’assuré(e) · `insured.signature` | signature / N | `MANUAL_ONLY` | SIGNATURE · intervention de l’assuré | `[135.4, 236.0, 177.9, 443.7]` |
| 1 | Cachet et Signature du Chirurgien Dentiste · `dentist.signatureStamp` | signature/cachet / N | `MANUAL_ONLY` | SIGNATURE / CACHET · intervention du praticien | `[134.7, 38.7, 178.6, 229.6]` |
| 1 | Cachet et Signature de l’Agence · `agency.signatureStamp` | signature/cachet / N | `MANUAL_ONLY` | SIGNATURE / CACHET · organisme uniquement | `[122.5, 696.4, 212.1, 910.5]` |
| 1 | Identification de l’agent · `agency.agentId` | identifiant / N | `MANUAL_ONLY` | Organisme uniquement | `[106.4, 706.1, 119.3, 828.0]` |
| 1 | Date de dépôt de dossier · `agency.receivedDate` | date / N | `MANUAL_ONLY` | Organisme uniquement | `[91.5, 728.7, 103.8, 824.1]` |
| 1 | Réservé à la DAMO · Date d’arrivée · `damo.arrivalDate` | date / N | `MANUAL_ONLY` | Organisme uniquement | `[91.5, 540.4, 104.4, 633.2]` |
| 2 | Dents traitées · `dentalActs[].toothReferences` | colonne répétée / N | `UNKNOWN` | Actes structurés à recueillir, date du soin disponible si explicitement liée | `[442.8, 397.2, 660.7, 444.9]` |
| 2 | Code des actes · `dentalActs[].actCode` | colonne répétée / N | `UNKNOWN` | Actes structurés à recueillir, date du soin disponible si explicitement liée | `[442.8, 350.8, 660.7, 397.2]` |
| 2 | Dates des actes · `dentalActs[].treatmentDate` | colonne répétée / N | `AVAILABLE_FROM_TREATMENT` | Actes structurés à recueillir, date du soin disponible si explicitement liée | `[442.8, 296.6, 660.7, 350.8]` |
| 2 | Lettre clé + Cotation NGAP · `dentalActs[].ngap` | colonne répétée / N | `UNKNOWN` | Actes structurés à recueillir, date du soin disponible si explicitement liée | `[442.8, 246.3, 660.7, 296.6]` |
| 2 | Valeur Clé · `dentalActs[].keyValue` | colonne répétée / N | `UNKNOWN` | Actes structurés à recueillir, date du soin disponible si explicitement liée | `[442.8, 196.7, 660.7, 246.3]` |
| 2 | Montant facturé · `dentalActs[].billedAmount` | colonne répétée / N | `UNKNOWN` | Actes structurés à recueillir, date du soin disponible si explicitement liée | `[442.8, 149.6, 660.7, 196.7]` |
| 2 | Signature et Cachet du Chirurgien Dentiste · `dentalActs[].signatureStamp` | colonne répétée / N | `MANUAL_ONLY` | SIGNATURE / CACHET | `[442.8, 32.2, 660.7, 149.6]` |
| 2 | Schéma dentaire H / B / D / G · `dentalChart` | annotations / N | `MANUAL_ONLY` | Marquage manuel par le dentiste, voir convention ci-dessous | `[156.6, 164.4, 423.5, 332.1]` |
| 2 | Dates d’exécution · `dispensing[].executionDate` | colonne répétée / N | `MANUAL_ONLY` | Exécution effective à documenter, distincte de la date d’ordonnance | `[567.9, 837.7, 674.9, 909.2]` |
| 2 | Prix facturé · `dispensing[].price` | colonne répétée / N | `UNKNOWN` | Exécution effective à documenter, distincte de la date d’ordonnance | `[567.9, 757.1, 674.9, 837.7]` |
| 2 | Signature et Cachet du Pharmacien et/ou Fournisseurs des dispositifs médicaux · `dispensing[].signatureStamp` | colonne répétée / N | `MANUAL_ONLY` | SIGNATURE / CACHET du délivrant | `[567.9, 496.5, 674.9, 757.1]` |
| 2 | Biologie, Radiologie et Imagerie · Dates des actes · `Biologie, Radiologie et Imagerie.date` | colonne répétée / N | `AVAILABLE_FROM_TREATMENT` | Lien à un acte réel requis, données non déduites de la consultation | `[336.5, 849.9, 517.0, 909.2]` |
| 2 | Biologie, Radiologie et Imagerie · Code des actes · `Biologie, Radiologie et Imagerie.code` | colonne répétée / N | `UNKNOWN` | Lien à un acte réel requis, données non déduites de la consultation | `[336.5, 799.6, 517.0, 849.9]` |
| 2 | Biologie, Radiologie et Imagerie · Lettre clé + Cotation NGAP · `Biologie, Radiologie et Imagerie.ngap` | colonne répétée / N | `UNKNOWN` | Lien à un acte réel requis, données non déduites de la consultation | `[336.5, 748.0, 517.0, 799.6]` |
| 2 | Biologie, Radiologie et Imagerie · Valeur Clé · `Biologie, Radiologie et Imagerie.value` | colonne répétée / N | `UNKNOWN` | Lien à un acte réel requis, données non déduites de la consultation | `[336.5, 715.8, 517.0, 748.0]` |
| 2 | Biologie, Radiologie et Imagerie · Montant facturé · `Biologie, Radiologie et Imagerie.amount` | colonne répétée / N | `UNKNOWN` | Lien à un acte réel requis, données non déduites de la consultation | `[336.5, 623.6, 517.0, 715.8]` |
| 2 | Biologie, Radiologie et Imagerie · Signature et Cachet · `Biologie, Radiologie et Imagerie.signatureStamp` | colonne répétée / N | `MANUAL_ONLY` | SIGNATURE / CACHET du professionnel concerné | `[336.5, 496.5, 517.0, 623.6]` |
| 2 | Paramédicaux · Dates des actes · `Paramédicaux.date` | colonne répétée / N | `AVAILABLE_FROM_TREATMENT` | Lien à un acte réel requis, données non déduites de la consultation | `[89.0, 849.9, 282.3, 909.2]` |
| 2 | Paramédicaux · Code des actes · `Paramédicaux.code` | colonne répétée / N | `UNKNOWN` | Lien à un acte réel requis, données non déduites de la consultation | `[89.0, 799.6, 282.3, 849.9]` |
| 2 | Paramédicaux · Lettre clé + Cotation NGAP · `Paramédicaux.ngap` | colonne répétée / N | `UNKNOWN` | Lien à un acte réel requis, données non déduites de la consultation | `[89.0, 748.0, 282.3, 799.6]` |
| 2 | Paramédicaux · Valeur Clé · `Paramédicaux.value` | colonne répétée / N | `UNKNOWN` | Lien à un acte réel requis, données non déduites de la consultation | `[89.0, 715.8, 282.3, 748.0]` |
| 2 | Paramédicaux · Montant facturé · `Paramédicaux.amount` | colonne répétée / N | `UNKNOWN` | Lien à un acte réel requis, données non déduites de la consultation | `[89.0, 623.6, 282.3, 715.8]` |
| 2 | Paramédicaux · Signature et Cachet · `Paramédicaux.signatureStamp` | colonne répétée / N | `MANUAL_ONLY` | SIGNATURE / CACHET du professionnel concerné | `[89.0, 496.5, 282.3, 623.6]` |
| 2 | INP · `dispensingA.inp` | identifiant en cases / N | `FUTURE_PRACTITIONER_DATA` | Identité du professionnel de cette rubrique | `[623.3, 786.7, 636.2, 887.3]` |
| 2 | INP · `dispensingB.inp` | identifiant en cases / N | `FUTURE_PRACTITIONER_DATA` | Identité du professionnel de cette rubrique | `[571.1, 786.7, 584.0, 887.3]` |
| 2 | INP · `imagingA.inp` | identifiant en cases / N | `FUTURE_PRACTITIONER_DATA` | Identité du professionnel de cette rubrique | `[426.7, 786.7, 439.6, 887.3]` |
| 2 | INP · `imagingB.inp` | identifiant en cases / N | `FUTURE_PRACTITIONER_DATA` | Identité du professionnel de cette rubrique | `[339.1, 786.7, 352.0, 887.3]` |
| 2 | INP · `paramedicalA.inp` | identifiant en cases / N | `FUTURE_PRACTITIONER_DATA` | Identité du professionnel de cette rubrique | `[191.4, 786.7, 204.3, 887.3]` |
| 2 | INP · `paramedicalB.inp` | identifiant en cases / N | `FUTURE_PRACTITIONER_DATA` | Identité du professionnel de cette rubrique | `[91.5, 786.7, 104.4, 887.3]` |

Les cases de type de soins sont centrées visuellement vers x = 1227 px sur le rendu de 1600 px de large, aux hauteurs 609, 635, 660 et 684 px. Les trois cases de lien de parenté sont distinctes. Le tableau dentaire présente trois grandes bandes séparées environ aux hauteurs 105, 220, 330 et 443 px. Les dates et numéros se répartissent dans des colonnes dédiées, avec des séparations verticales pointillées pour certaines cases. La position des occurrences doit être calibrée sur le scan. Les rubriques de délivrance, biologie/imagerie et paramédical possèdent chacune leurs zones INP et signature, indépendantes de celles du dentiste.

### Schéma CNSS, page 2

Le dessin porte H en haut, B en bas, D à gauche du lecteur et G à droite. Chaque quadrant de l’arcade externe affiche les nombres de 1 à 8 depuis la ligne médiane vers l’arrière. L’arcade interne affiche de 1 à 5 dans chaque quadrant. Ces nombres locaux et les repères H/B/D/G sont la convention effectivement imprimée. Le document ne présente pas ici une suite de références à deux chiffres. La correspondance FDI conserve le quadrant et la dentition ; sa calibration et sa confirmation sont décrites en phase 9.2A.1 ci-dessous. Les détails des traits anatomiques ne sont pas des marques de soins déjà renseignées.

## CNOPS dentaire

Source `feuille_dentaire_CNOPS.pdf`. Le titre est « Feuille de soins Dentaires ». L’identification du dentiste porte INPE en page 1, tandis que les rubriques de page 2 portent INP. Les libellés et ce changement de sigle sont conservés dans cet inventaire.

| Page | Libellé original et champ sémantique | Type / exigence | Source possible | Saisie et signature | Rectangle PDF approximatif |
| --- | --- | --- | --- | --- | --- |
| 1 | Entente Préalable* / Exécution* · `documentPurpose` | cases / N | `FUTURE_INSURANCE_DATA` | Sélection explicite de la démarche | `[522.1, 518.1, 676.5, 530.6]` |
| 1 | N° du Tél (optionnel) · `contact.phone` | téléphone / O explicite | `AVAILABLE_FROM_PATIENT` | Patient.identity.gsm ou landline à confirmer | `[574.6, 501.6, 684.5, 510.1]` |
| 1 | Nom et prénom · assuré(e) · `insured.name` | texte / identifiant / N | `FUTURE_INSURANCE_DATA` | Identité et police de l’assuré à recueillir | `[514.6, 470.7, 694.5, 480.6]` |
| 1 | N° Affiliation · assuré(e) · `insured.affiliation` | texte / identifiant / N | `FUTURE_INSURANCE_DATA` | Identité et police de l’assuré à recueillir | `[514.6, 457.2, 694.5, 467.2]` |
| 1 | N° Immatriculation · assuré(e) · `insured.registration` | texte / identifiant / N | `FUTURE_INSURANCE_DATA` | Identité et police de l’assuré à recueillir | `[514.6, 443.2, 694.5, 453.2]` |
| 1 | N° CIN · assuré(e) · `insured.cin` | texte / identifiant / N | `FUTURE_INSURANCE_DATA` | Identité et police de l’assuré à recueillir | `[514.6, 429.7, 694.5, 439.7]` |
| 1 | Lien de parenté du bénéficiaire avec l’assuré(e)* · Conjoint / Enfant · `beneficiary.relationship` | cases / N | `FUTURE_INSURANCE_DATA` | Ne pas ajouter de case Lui-même absente du modèle | `[541.1, 406.7, 664.5, 422.2]` |
| 1 | Adresse · `insured.address` | texte multiligne / N | `FUTURE_INSURANCE_DATA` | À vérifier par le dentiste | `[477.2, 374.2, 712.0, 395.2]` |
| 1 | Montant des frais (Dhs) · `claim.totalFees` | montant / N | `UNKNOWN` | Futur registre financier validé | `[529.6, 357.7, 699.5, 369.7]` |
| 1 | Nombre de pièces jointes · `claim.attachmentCount` | entier / N | `MANUAL_ONLY` | Décompte réel des pièces | `[534.6, 342.7, 699.5, 352.7]` |
| 1 | Nom et prénom · Bénéficiaire des soins · `beneficiary.name` | texte / cases / N | `AVAILABLE_FROM_PATIENT` | Valeur patient si connue et confirmée | `[512.1, 300.3, 709.5, 310.3]` |
| 1 | Date de naissance · `beneficiary.birthDate` | texte / cases / N | `AVAILABLE_FROM_PATIENT` | Valeur patient si connue et confirmée | `[562.6, 286.3, 653.0, 296.8]` |
| 1 | N° CIN · bénéficiaire · `beneficiary.cin` | texte / cases / N | `AVAILABLE_FROM_PATIENT` | Valeur patient si connue et confirmée | `[567.6, 271.3, 652.0, 282.3]` |
| 1 | Sexe* · Masculin / Féminin · `beneficiary.sex` | texte / cases / N | `AVAILABLE_FROM_PATIENT` | Valeur patient si connue et confirmée | `[529.6, 257.8, 660.5, 269.3]` |
| 1 | N° de l’Identifiant National des Professionnels de santé et des Établissements de santé (INPE) · `practitioner.inpe` | texte / cases / N | `FUTURE_PRACTITIONER_DATA` | Profil praticien à recueillir | `[570.6, 224.3, 663.5, 237.3]` |
| 1 | Soins* · `careType.1023746` | case / N | `MANUAL_ONLY` | Choix explicite du dentiste | `[511.1, 189.4, 523.1, 201.4]` |
| 1 | Prothèse* · `careType.1370746` | case / N | `MANUAL_ONLY` | Choix explicite du dentiste | `[684.5, 189.4, 697.0, 201.4]` |
| 1 | Orthodontie et O.D.F* · `careType.1023776` | case / N | `MANUAL_ONLY` | Choix explicite du dentiste | `[511.1, 174.4, 523.1, 186.4]` |
| 1 | Autres* · `careType.1370776` | case / N | `MANUAL_ONLY` | Choix explicite du dentiste | `[684.5, 174.4, 697.0, 186.4]` |
| 1 | N° Entente Préalable · `authorization.number` | identifiant / N | `FUTURE_INSURANCE_DATA` | Autorisation réelle si applicable | `[572.1, 158.9, 654.5, 169.9]` |
| 1 | La date de l’accident · `accident.date` | date / C accident | `FUTURE_INSURANCE_DATA` | Informations à recueillir | `[569.6, 133.4, 655.5, 144.9]` |
| 1 | Les causes de l’accident · `accident.causes` | texte / C accident | `FUTURE_INSURANCE_DATA` | Informations à recueillir | `[529.6, 119.4, 744.5, 129.4]` |
| 1 | Fait à · `insured.declarationPlace` | texte / N | `MANUAL_ONLY` | Lieu réel | `[472.2, 102.4, 568.6, 111.9]` |
| 1 | Le · `insured.declarationDate` | date / N | `MANUAL_ONLY` | Date réelle de déclaration | `[472.2, 89.4, 568.6, 100.9]` |
| 1 | Fait à · `dentist.declarationPlace` | texte / N | `MANUAL_ONLY` | Lieu réel | `[654.5, 102.4, 770.0, 111.9]` |
| 1 | Le · `dentist.declarationDate` | date / N | `MANUAL_ONLY` | Date réelle de déclaration | `[654.5, 89.4, 770.0, 100.9]` |
| 1 | Signature de l’assuré(e) · `insured.signature` | signature / N | `MANUAL_ONLY` | SIGNATURE · assuré | `[432.7, 34.5, 524.6, 86.9]` |
| 1 | Cachet et Signature du Médecin traitant ou de l’Établissement de soins · `dentist.signatureStamp` | signature/cachet / N | `MANUAL_ONLY` | SIGNATURE / CACHET · professionnel | `[609.6, 34.5, 784.5, 86.4]` |
| 1 | Cachet et signature de la mutuelle · `agency.signatureStamp` | signature/cachet / N | `MANUAL_ONLY` | SIGNATURE / CACHET · organisme | `[70.0, 45.5, 309.8, 115.4]` |
| 1 | Identification de l’agent · `agency.agentId` | identifiant / N | `MANUAL_ONLY` | Organisme uniquement | `[144.9, 33.5, 287.3, 44.5]` |
| 1 | Date de dépôt de dossier · `agency.receivedDate` | date / N | `MANUAL_ONLY` | Organisme uniquement | `[164.9, 15.5, 284.8, 29.5]` |
| 2 | Dents traitées · `dentalActs[].toothReferences` | colonne répétée / N | `UNKNOWN` | Donnée structurée à vérifier, date du soin disponible si liée | `[422.2, 351.2, 466.7, 511.6]` |
| 2 | Code des actes · `dentalActs[].actCode` | colonne répétée / N | `UNKNOWN` | Donnée structurée à vérifier, date du soin disponible si liée | `[466.7, 351.2, 513.1, 511.6]` |
| 2 | Dates des actes · `dentalActs[].date` | colonne répétée / N | `AVAILABLE_FROM_TREATMENT` | Donnée structurée à vérifier, date du soin disponible si liée | `[513.1, 351.2, 561.1, 511.6]` |
| 2 | Lettre clé + Cotation NGAP · `dentalActs[].ngap` | colonne répétée / N | `UNKNOWN` | Donnée structurée à vérifier, date du soin disponible si liée | `[561.1, 351.2, 608.1, 511.6]` |
| 2 | Valeur Clé · `dentalActs[].keyValue` | colonne répétée / N | `UNKNOWN` | Donnée structurée à vérifier, date du soin disponible si liée | `[608.1, 351.2, 648.0, 511.6]` |
| 2 | Montant facturé · `dentalActs[].amount` | colonne répétée / N | `UNKNOWN` | Donnée structurée à vérifier, date du soin disponible si liée | `[648.0, 351.2, 694.5, 511.6]` |
| 2 | Signature et Cachet du Chirurgien Dentiste · `dentalActs[].signatureStamp` | colonne répétée / N | `MANUAL_ONLY` | SIGNATURE / CACHET | `[694.5, 351.2, 782.0, 511.6]` |
| 2 | CIM - 10 · `diagnosisCode` | code / N | `UNKNOWN` | Code à documenter explicitement, jamais déduit du texte clinique | `[579.6, 331.8, 637.1, 350.7]` |
| 2 | Schéma dentaire H / B / D / G · `dentalChart` | annotations / N | `MANUAL_ONLY` | Marquage manuel, convention propre à ce dessin | `[517.1, 64.5, 692.0, 310.8]` |
| 2 | Date d’exécution · `dispensing[].executionDate` | colonne répétée / N | `MANUAL_ONLY` | Exécution et montants réels à documenter | `[17.5, 379.7, 107.4, 511.6]` |
| 2 | Prix facturé · `dispensing[].price` | colonne répétée / N | `UNKNOWN` | Exécution et montants réels à documenter | `[107.4, 379.7, 203.4, 511.6]` |
| 2 | Signature et Cachet du Pharmacien et/ou Fournisseurs des dispositifs médicaux · `dispensing[].signatureStamp` | colonne répétée / N | `MANUAL_ONLY` | SIGNATURE / CACHET du délivrant | `[203.4, 379.7, 376.7, 511.6]` |
| 2 | Biologie, Radiologie et Imagerie · Date des actes · `Biologie, Radiologie et Imagerie.date` | colonne répétée / N | `AVAILABLE_FROM_TREATMENT` | Lien à un acte réel nécessaire | `[17.5, 187.9, 68.0, 321.8]` |
| 2 | Biologie, Radiologie et Imagerie · Code des actes · `Biologie, Radiologie et Imagerie.code` | colonne répétée / N | `UNKNOWN` | Lien à un acte réel nécessaire | `[68.0, 187.9, 116.9, 321.8]` |
| 2 | Biologie, Radiologie et Imagerie · Lettre clé + Cotation NGAP · `Biologie, Radiologie et Imagerie.ngap` | colonne répétée / N | `UNKNOWN` | Lien à un acte réel nécessaire | `[116.9, 187.9, 169.4, 321.8]` |
| 2 | Biologie, Radiologie et Imagerie · Valeur Clé · `Biologie, Radiologie et Imagerie.value` | colonne répétée / N | `UNKNOWN` | Lien à un acte réel nécessaire | `[169.4, 187.9, 209.4, 321.8]` |
| 2 | Biologie, Radiologie et Imagerie · Montant facturé · `Biologie, Radiologie et Imagerie.amount` | colonne répétée / N | `UNKNOWN` | Lien à un acte réel nécessaire | `[209.4, 187.9, 269.8, 321.8]` |
| 2 | Biologie, Radiologie et Imagerie · Signature et Cachet · `Biologie, Radiologie et Imagerie.signatureStamp` | colonne répétée / N | `MANUAL_ONLY` | SIGNATURE / CACHET du professionnel concerné | `[269.8, 187.9, 376.7, 321.8]` |
| 2 | Paramédicaux · Date des actes · `Paramédicaux.date` | colonne répétée / N | `AVAILABLE_FROM_TREATMENT` | Lien à un acte réel nécessaire | `[17.5, 13.0, 68.0, 135.4]` |
| 2 | Paramédicaux · Code des actes · `Paramédicaux.code` | colonne répétée / N | `UNKNOWN` | Lien à un acte réel nécessaire | `[68.0, 13.0, 116.9, 135.4]` |
| 2 | Paramédicaux · Lettre clé + Cotation NGAP · `Paramédicaux.ngap` | colonne répétée / N | `UNKNOWN` | Lien à un acte réel nécessaire | `[116.9, 13.0, 169.4, 135.4]` |
| 2 | Paramédicaux · Valeur Clé · `Paramédicaux.value` | colonne répétée / N | `UNKNOWN` | Lien à un acte réel nécessaire | `[169.4, 13.0, 209.4, 135.4]` |
| 2 | Paramédicaux · Montant facturé · `Paramédicaux.amount` | colonne répétée / N | `UNKNOWN` | Lien à un acte réel nécessaire | `[209.4, 13.0, 269.8, 135.4]` |
| 2 | Paramédicaux · Signature et Cachet · `Paramédicaux.signatureStamp` | colonne répétée / N | `MANUAL_ONLY` | SIGNATURE / CACHET du professionnel concerné | `[269.8, 13.0, 376.7, 135.4]` |
| 2 | INP · `dispensingA.inp` | identifiant en cases / N | `FUTURE_PRACTITIONER_DATA` | Le sigle imprimé en page 2 est INP | `[137.9, 449.7, 227.3, 459.2]` |
| 2 | INP · `dispensingB.inp` | identifiant en cases / N | `FUTURE_PRACTITIONER_DATA` | Le sigle imprimé en page 2 est INP | `[137.9, 384.2, 227.3, 393.7]` |
| 2 | INP · `imagingA.inp` | identifiant en cases / N | `FUTURE_PRACTITIONER_DATA` | Le sigle imprimé en page 2 est INP | `[137.9, 258.8, 227.3, 268.3]` |
| 2 | INP · `imagingB.inp` | identifiant en cases / N | `FUTURE_PRACTITIONER_DATA` | Le sigle imprimé en page 2 est INP | `[137.9, 193.9, 227.3, 203.4]` |
| 2 | INP · `paramedicalA.inp` | identifiant en cases / N | `FUTURE_PRACTITIONER_DATA` | Le sigle imprimé en page 2 est INP | `[137.9, 80.4, 227.3, 89.9]` |
| 2 | INP · `paramedicalB.inp` | identifiant en cases / N | `FUTURE_PRACTITIONER_DATA` | Le sigle imprimé en page 2 est INP | `[137.9, 14.0, 227.3, 23.5]` |

Les cases de soins sont disposées en deux colonnes. Sur le rendu 1600 px, leurs centres sont environ `(1035,758)`, `(1382,758)`, `(1035,787)` et `(1382,787)`. Les zones de saisie des dates et identifiants utilisent des cases individuelles. Le tableau dentaire a des séparations horizontales régulières, approximativement aux hauteurs 125, 156, 192, 228, 264, 301, 338, 374, 411 et 446 px. Les colonnes d’identité des actes et de montants restent distinctes. Le champ CIM - 10 est présent sous le tableau. La description clinique libre ne fournit pas ce code.

### Schéma CNOPS, page 2

Le dessin porte H en haut, B en bas, D à gauche du lecteur et G à droite. L’arcade externe porte les nombres de 1 à 8 par quadrant depuis la médiane. Les petites arcades internes comportent des dents dessinées mais aucun chiffre interne lisible sur le fichier fourni, contrairement au schéma CNSS. La cartographie de la phase 9.2B conserve cette différence : aucun numéro n’est ajouté au modèle, et les dents temporaires sont repérées par leur position depuis la médiane. Le dessin et sa position ne peuvent pas être repris des coordonnées CNSS.

## FAR dentaire

Source `feuille_dentaire_FAR.pdf`. Le volet droit de page 1 est une « Feuille de maladie (*) », avec renseignements militaires et déclaration du bénéficiaire. Le volet gauche est « SOINS ET PROTHESE DENTAIRE (INPE) », suivi de « DEVIS ? - REÇUS ? (Rayer la mention inutile) ». Le scan reste lisible dans ses libellés principaux mais présente du flou et une qualité d’environ 122 ppp. Les petites ponctuations et limites de lignes demandent une vérification papier.

| Page | Libellé original et champ sémantique | Type / exigence | Source possible | Saisie et signature | Rectangle PDF approximatif |
| --- | --- | --- | --- | --- | --- |
| 1 | N° Carte Nationale d’Identité · `insured.cin` | texte / cases / R volet maladie* | `FUTURE_INSURANCE_DATA` | À recueillir explicitement | `[580.6, 430.0, 699.1, 444.7]` |
| 1 | N° de Compte (nature à confirmer) · `insured.account` | texte / cases / R volet maladie* | `FUTURE_INSURANCE_DATA` | À recueillir explicitement | `[539.0, 410.5, 703.8, 425.2]` |
| 1 | N° de Téléphone · `insured.phone` | texte / cases / R volet maladie* | `FUTURE_INSURANCE_DATA` | À recueillir explicitement | `[549.0, 391.6, 726.4, 405.8]` |
| 1 | Nom et Prénom · adhérent · `insured.name` | texte / cases / R volet maladie* | `FUTURE_INSURANCE_DATA` | À recueillir explicitement | `[525.4, 362.1, 718.5, 376.3]` |
| 1 | Grade · `insured.rank` | texte / cases / R volet maladie* | `FUTURE_INSURANCE_DATA` | À recueillir explicitement | `[476.4, 344.7, 715.9, 358.9]` |
| 1 | Unité · `insured.unit` | texte / cases / R volet maladie* | `FUTURE_INSURANCE_DATA` | À recueillir explicitement | `[476.9, 328.4, 715.9, 342.1]` |
| 1 | Adresse · `insured.address` | texte / cases / R volet maladie* | `FUTURE_INSURANCE_DATA` | À recueillir explicitement | `[488.5, 312.6, 732.8, 326.3]` |
| 1 | Nom et Prénom · bénéficiaire · `beneficiary.name` | texte / cases / R volet maladie* | `AVAILABLE_FROM_PATIENT` | Patient confirmé pour le bénéficiaire | `[536.9, 267.4, 718.0, 282.1]` |
| 1 | Date de Naissance · `beneficiary.birthDate` | texte / cases / R volet maladie* | `AVAILABLE_FROM_PATIENT` | Patient confirmé pour le bénéficiaire | `[541.7, 249.5, 715.9, 264.8]` |
| 1 | Adhérent / Conjoint / Enfant · `beneficiary.relationship` | texte / cases / R volet maladie* | `FUTURE_INSURANCE_DATA` | À recueillir explicitement | `[504.3, 227.4, 761.7, 246.4]` |
| 1 | Maladie / Maternité / Accident · `care.context` | texte / cases / R volet maladie* | `FUTURE_INSURANCE_DATA` | À recueillir explicitement | `[460.6, 200.6, 764.9, 219.5]` |
| 1 | N° INPE · Identification du médecin traitant · `practitioner.inpe` | texte / cases / R volet maladie* | `FUTURE_PRACTITIONER_DATA` | À recueillir explicitement | `[539.6, 162.7, 731.7, 176.4]` |
| 1 | Frais engagés · `claim.totalFees` | texte / cases / R volet maladie* | `UNKNOWN` | À recueillir explicitement | `[446.4, 109.1, 521.7, 121.7]` |
| 1 | Nombre prospectus · `claim.prospectusCount` | texte / cases / R volet maladie* | `MANUAL_ONLY` | À recueillir explicitement | `[639.6, 135.9, 698.0, 154.3]` |
| 1 | Nombre pièces · `claim.attachmentCount` | texte / cases / R volet maladie* | `MANUAL_ONLY` | À recueillir explicitement | `[639.6, 110.6, 698.0, 132.7]` |
| 1 | Le · `claim.declarationDate` | texte / cases / R volet maladie* | `MANUAL_ONLY` | À recueillir explicitement | `[491.1, 87.5, 640.1, 105.9]` |
| 1 | Signature Adhérent · `insured.signature` | signature / R volet maladie* | `MANUAL_ONLY` | SIGNATURE · adhérent | `[701.7, 50.7, 814.4, 154.3]` |
| 1 | Identité et signature du correspondant de la Mutuelle · `agency.correspondent` | texte et signature / R volet maladie* | `MANUAL_ONLY` | SIGNATURE · organisme | `[445.3, 52.8, 695.4, 81.2]` |
| 1 | DEVIS ? - REÇUS ? (Rayer la mention inutile) · `dental.documentPurpose` | mention à rayer / N | `MANUAL_ONLY` | Choix explicite, conserver la mention utile | `[132.1, 549.9, 373.7, 565.7]` |
| 1 | Date · `dentalWork[].date` | colonne répétée / N | `AVAILABLE_FROM_TREATMENT` | Date ou description du soin si lien explicite, coefficients et honoraires à recueillir | `[36.8, 418.4, 105.3, 517.8]` |
| 1 | Position dent · `dentalWork[].toothReference` | colonne répétée / N | `UNKNOWN` | Date ou description du soin si lien explicite, coefficients et honoraires à recueillir | `[105.3, 418.4, 151.1, 517.8]` |
| 1 | Nature des travaux · `dentalWork[].description` | colonne répétée / N | `AVAILABLE_FROM_TREATMENT` | Date ou description du soin si lien explicite, coefficients et honoraires à recueillir | `[151.1, 418.4, 294.8, 517.8]` |
| 1 | Coefficient · `dentalWork[].coefficient` | colonne répétée / N | `UNKNOWN` | Date ou description du soin si lien explicite, coefficients et honoraires à recueillir | `[294.8, 418.4, 337.4, 517.8]` |
| 1 | Montant honoraires · `dentalWork[].fees` | colonne répétée / N | `UNKNOWN` | Date ou description du soin si lien explicite, coefficients et honoraires à recueillir | `[337.4, 418.4, 406.9, 517.8]` |
| 1 | Soins ? / Prothèse ? · `dental.type` | cases / N | `MANUAL_ONLY` | Choix explicite du dentiste | `[132.7, 390.5, 305.3, 411.5]` |
| 1 | Tableau des positions dentaires · `dental.toothChart` | marquage / N | `MANUAL_ONLY` | Croix / cercle selon les consignes imprimées, voir notation ci-dessous | `[58.4, 281.1, 384.8, 336.3]` |
| 1 | Cadre réservé au Contrôle Médical de la Mutuelle des F.A.R. · `agency.medicalControl` | zone réservée / N | `MANUAL_ONLY` | Organisme uniquement | `[35.8, 43.8, 402.7, 251.1]` |
| 2 | Nom et prénom du malade · `prescription.patientName` | texte / N | `AVAILABLE_FROM_PATIENT` | La notice demande l’identité de la main du médecin traitant, conserver cette intervention manuelle | `[143.7, 489.4, 394.8, 509.9]` |
| 2 | ORDONNANCE · zone de rédaction · `prescription.contents` | texte / N | `MANUAL_ONLY` | Prescription à établir et valider par le praticien, pas de copie automatique | `[143.7, 80.7, 405.3, 485.7]` |
| 2 | P.U · `dispensing[].unitPrice` | colonne / N | `UNKNOWN` | Prix et délivrance effectifs, futur rapprochement financier | `[26.8, 62.2, 65.3, 543.6]` |
| 2 | Nbr · `dispensing[].quantity` | colonne / N | `UNKNOWN` | Prix et délivrance effectifs, futur rapprochement financier | `[65.3, 62.2, 97.4, 543.6]` |
| 2 | Prix total · `dispensing[].total` | colonne / N | `UNKNOWN` | Prix et délivrance effectifs, futur rapprochement financier | `[97.4, 62.2, 139.0, 543.6]` |
| 2 | À …, Le … · `prescription.placeDate` | lieu/date / N | `MANUAL_ONLY` | Lieu et date effectifs | `[144.2, 60.1, 324.8, 79.6]` |
| 2 | Cachet du Médecin avec INPE · `practitioner.stamp` | cachet / N | `MANUAL_ONLY` | CACHET · praticien | `[344.8, 64.3, 403.2, 125.9]` |
| 2 | Montant Global · `dispensing.globalAmount` | montant / N | `UNKNOWN` | Montant effectif de délivrance | `[93.2, 31.7, 153.2, 59.1]` |
| 2 | Cachet et signature du Pharmacien : Avec INPE · `pharmacist.signatureStamp` | signature/cachet / N | `MANUAL_ONLY` | SIGNATURE / CACHET · pharmacien | `[155.8, 30.7, 403.8, 59.6]` |
| 2 | PRATICIEN · `medicalActs[].practitioner` | colonne répétée / N | `FUTURE_PRACTITIONER_DATA` | Acte réel et professionnel à identifier | `[436.9, 191.1, 506.9, 495.2]` |
| 2 | Date des actes · `medicalActs[].date` | colonne répétée / N | `AVAILABLE_FROM_TREATMENT` | Acte réel et professionnel à identifier | `[506.9, 191.1, 560.6, 495.2]` |
| 2 | Natures des actes & coefficients · `medicalActs[].descriptionCoefficient` | colonne répétée / N | `UNKNOWN` | Acte réel et professionnel à identifier | `[560.6, 191.1, 672.2, 495.2]` |
| 2 | Montants des Honoraires · `medicalActs[].fees` | colonne répétée / N | `UNKNOWN` | Acte réel et professionnel à identifier | `[672.2, 191.1, 720.7, 495.2]` |
| 2 | Signature & Cachet du praticien avec INPE · `medicalActs[].signatureStamp` | colonne répétée / N | `MANUAL_ONLY` | SIGNATURE / CACHET et INPE | `[720.7, 191.1, 807.5, 495.2]` |

La page 1 comporte les cases Soins/Prothèse à gauche, les cases Adhérent/Conjoint/Enfant et Maladie/Maternité/Accident à droite. Le tableau des travaux dentaires possède des lignes pointillées. La capacité commune et les positions mesurées sur le PDF fourni sont documentées en phase 9.2C ci-dessous ; la calibration sur papier reste à faire. La page 2 de droite distingue les bandes Médecin traitant ou chirurgien dentiste, Analyses du labo, Imagerie, Actes paramédicaux et Optique. Chaque bande reprend les colonnes date, nature et coefficients, honoraires, signature/cachet avec INPE. La zone inférieure restante est sans intitulé métier clairement lisible et doit rester `UNKNOWN`.

La notice de page 2 demande que l’identité du malade soit portée de la main du médecin traitant et indique que l’apposition de l’INPE est obligatoire. Cette prescription de saisie manuelle devra être examinée avec l’organisme avant de proposer une saisie numérique. La zone médicale réservée à la mutuelle et les signatures ne peuvent pas être alimentées par un simple profil applicatif.

### Tableau dentaire FAR, page 1

Les séquences imprimées se lisent de gauche à droite sur la feuille ainsi.

```text
    55 54 53 52 51      61 62 63 64 65
18 17 16 15 14 13 12 11  21 22 23 24 25 26 27 28
48 47 46 45 44 43 42 41  31 32 33 34 35 36 37 38
    85 84 83 82 81      71 72 73 74 75
```

Le document demande une croix sur la dent objet de la prothèse ou de l’extraction et un cercle sur la dent soignée ou couronnée. Il demande aussi de renseigner une quatrième page du document papier. Les séquences à deux chiffres et les gestes graphiques sont distincts des schémas à quadrant H/B/D/G de la CNSS et de la CNOPS. Le terme FDI n’est pas imprimé sur ce tableau. La correspondance explicite avec le domaine FDI et sa calibration figurent en phase 9.2C ci-dessous.

## Données disponibles et données à recueillir

| Classe | Données actuelles ou manquantes |
| --- | --- |
| `AVAILABLE_FROM_PATIENT` | Prénom, nom, date de naissance, sexe déclaré, adresse, GSM/fixe, CIN si connue et autorisée. Le texte `medicalCoverage` reste une information libre. |
| `AVAILABLE_FROM_CONSULTATION` | Identifiant patient, date de rencontre et références de consultation. La date de rencontre ne remplace pas automatiquement la date d’un acte exécuté. Aucune zone des formulaires n’est alimentée de façon certaine par le seul texte du compte rendu. |
| `AVAILABLE_FROM_TREATMENT` | Date et description d’un soin enregistré, seulement après lien explicite avec l’acte déclaré. Le champ `toothReference` est libre et ne garantit pas une notation exploitable par ces schémas. |
| `FUTURE_INSURANCE_DATA` | Organisme, police, affiliation, immatriculation, identité de l’assuré, compte FAR, grade/unité, lien bénéficiaire/assuré, autorisations et informations d’accident. |
| `FUTURE_PRACTITIONER_DATA` | Profil professionnel vérifié, INP/INPE, identité et coordonnées du praticien ou du professionnel concerné par chaque section. |
| `MANUAL_ONLY` | Signatures, cachets, déclarations, interventions de l’organisme, faits de délivrance et de dépôt, marquages dentaires prescrits et identités exigées manuscrites par la notice FAR. |
| `UNKNOWN` | Codes et coefficients NGAP, valeurs clés, nomenclatures, CIM-10 non saisi, honoraires et frais réels. Ils nécessitent des sources structurées et une validation métier. |

Les soins actuels ne contiennent ni catalogue d’actes validé, ni code NGAP, ni coefficient tarifaire, ni position dentaire structurée. Les tables financières fictives des phases précédentes ne constituent pas un registre comptable utilisable. Les champs vides devront être signalés, et les cas sans objet ou inconnus distingués d’une valeur numérique nulle.

## Références générales secondaires

`cnss-feuille-de-soins-maladie.pdf` porte le titre « Feuille de Soins Maladie ». Sa première page distingue assuré et bénéficiaire, immatriculation, CIN, lien conjoint/enfant, adresse, frais, pièces jointes, INPE et type Hospitalisation/Maternité/Accident/Maladie, signatures et cadre agence/DAMO. Sa seconde page contient les actes, CIM-10, biologie/imagerie, paramédical, ordonnances exécutées/dispositifs et prestations non prises en charge. Elle ne remplace pas la feuille dentaire et son schéma.

`cnops-feuille-de-soins-maladie.pdf` porte également le titre « Feuille de Soins Maladie ». Il distingue affiliation et immatriculation, CIN, assuré/bénéficiaire, INP, type de soins, pli confidentiel, dates de grossesse/accouchement/hospitalisation/accident, causes, signatures et mutuelle. La seconde page comporte actes, CIM-10, ordonnances exécutées/dispositifs, biologie/imagerie et paramédical. Le dessin et les rubriques de la version dentaire sont différents. Les délais, pièces et notices sont à conserver comme texte du document fourni, à faire valider dans une phase dédiée.

## Proposition d’architecture future

`InsuranceProvider` identifiera l’organisme. `PatientInsurancePolicy` reliera un patient à une police et à un `InsuredPerson` distinct, avec un `BeneficiaryRelationship` explicitement recueilli. Ces données devront être datées et vérifiées. `PractitionerProfile` contiendra les identifiants professionnels vérifiés, séparés des images de signatures et cachets.

Un `DentalAct` devra décrire l’acte réellement effectué, sa date, ses `DentalActCode` selon une nomenclature versionnée et ses `DentalToothReference` structurées, incluant dentition, quadrant, position et convention source. Les montants dépendront du futur registre de facturation validé. Les coefficients, honoraires et remboursements ne seront pas déduits des descriptions libres.

`InsuranceDocumentTemplate` devra identifier un organisme, un modèle, sa version, son empreinte SHA-256, ses dimensions, ses boîtes et rotations. Chaque version aura son `InsuranceFormMapper` propre. Un `InsuranceDocument` reliera les sources autorisées, le modèle et l’état de validation. Avant génération, un rapport listant chaque donnée manquante, ambiguë, sans objet ou devant rester manuelle sera présenté au dentiste. Les zones de signature/cachet et de l’organisme seront préservées.

Les originaux devront rester en lecture seule. Le moteur travaillera sur une copie en mémoire avec une surcouche, un aperçu du PDF réel et des contrôles de débordement et de position. Le changement d’un modèle devra invalider sa cartographie jusqu’à nouvelle vérification. Les futurs tests devront couvrir chaque page et chaque tableau, la rotation CNSS, le décalage FAR, les annotations de dents, l’absence d’identifiants requis et une inspection d’impression. Spring Boot devra ensuite autoriser les ressources, tracer les modifications et protéger les documents.

Ces concepts restent des propositions documentaires. La phase 6 ne crée aucun modèle métier d’assurance exécutable ni moteur de demande de remboursement.

## Incertitudes à lever avant le remplissage

- Confirmer les versions acceptées par chaque organisme et la composition papier FAR malgré ses numéros de volets internes.
- Confirmer les sigles INP/INPE et les formats d’identifiants attendus pour chaque professionnel.
- Valider les règles de sélection Entente préalable/Exécution et les situations sans objet.
- Obtenir des sources plus nettes pour les petites cases FAR et vérifier chaque ligne de tableau sur papier.
- Définir les nomenclatures et une correspondance dentaire explicite pour chaque diagramme.
- Faire valider les exigences manuscrites, de signature et de cachet avant toute numérisation de ces gestes.

## Empreintes des références

| Source | SHA-256 |
| --- | --- |
| `cnops-feuille-de-soins-maladie.pdf` | `439e5cb82c3520984b4602f9d9204dc010bc60b60a53645e2d55d24e4cc862e4` |
| `cnss-feuille-de-soins-maladie.pdf` | `c29307581210720e97d4413e7bfa6c0734c2b1aacfbc15591d33f6515f286907` |
| `dossier-patient.pdf` | `f68cf8351f368bf2b0d52dd3c2aa0e421294442c729c114b169d4107f11e69b4` |
| `feuille_dentaire_CNOPS.pdf` | `255e712e12aa0642c79ee6789e8e03c587425c6d4186f58e8fe094985b45efef` |
| `feuille_dentaire_CNSS.pdf` | `9f829b1a26545a979e5cc94075307822aac95295529d572bfee17a82e5d51609` |
| `feuille_dentaire_FAR.pdf` | `35278aba6d61ce76d8ac30e3ffba5c2f2f2d95cd5d60fabea3921bb55a239d43` |
| `ordonnance-a5.pdf` | `9b988a24085101a888a9feac3271dd7e76e310dfff264abb7f1ce27d8a8d0bdd` |


## Vérification et confirmation des gabarits — Phase 9.1

Dans le cadre de la Phase 9.1, les gabarits PDF officiels ont été réinspectés et leurs propriétés physiques ont été formellement validées par analyse binaire et extraction Poppler/pdf-lib :

1. **`feuille_dentaire_CNSS.pdf`** :
   - Exactement 2 pages.
   - Dimensions natives : 728,40 × 1 031,76 pt (256,96 × 363,98 mm).
   - Rotation de page : 270° (affichage visuel paysage 1 031,76 × 728,40 pt).
   - MediaBox / CropBox : `[0, 0, 728.40, 1031.76]`.
   - AcroForms : aucun (raster plat, 0 formulaire interactif).
   - Particularités : types de soins 600, 626, 650, 675 ; schéma dentaire H/B/D/G avec numérotation permanente (1-8) et temporaire (1-5).

2. **`feuille_dentaire_CNOPS.pdf`** :
   - Exactement 2 pages.
   - Dimensions natives : 799,44 × 574,08 pt (282,02 × 202,52 mm).
   - Rotation : 0° (paysage naturel).
   - MediaBox / CropBox : `[0, 0, 799.44, 574.08]`.
   - AcroForms : aucun (raster plat, 0 formulaire interactif).
   - Particularités : types de soins 1023746, 1370746, 1023776, 1370776 ; lien de parenté imprimé sans case « Lui-même » (l'absence de coche conjoint/enfant désigne l'assuré) ; INPE en page 1 et INP en page 2 ; code diagnostic CIM-10 présent.

3. **`feuille_dentaire_FAR.pdf`** :
   - Exactement 2 pages.
   - Dimensions natives : 842,25 × 595,50 pt (297,13 × 210,08 mm, standard A4 paysage).
   - Rotation : 0°.
   - MediaBox / CropBox : `[0, 8.58, 842.25, 604.08]` avec décalage d'origine verticale `y0 = 8,58 pt`.
   - AcroForms : aucun (raster plat, 0 formulaire interactif).
   - Particularités : deux volets distincts par page (volet soins dentaires INPE à gauche, feuille de maladie à droite) ; mention « DEVIS ? - REÇUS ? » ; champs militaires spécifiques (N° de Compte, Grade, Unité) ; diagramme dentaire FDI à deux chiffres avec cercles et croix ; exigence manuscrite pour le nom du patient sur l'ordonnance en page 2.

Ces constats confirment l'implémentation du modèle de données typé de la Phase 9.1 (`InsuranceProvider`, `PatientInsurancePolicy`, `InsuranceDocumentDraft`, `DentalInsuranceAct`) et préparent le moteur d'overlay PDF de la Phase 9.2.

## Phase 9.2A — Surcouche CNSS calibrée

Seul le modèle `feuille_dentaire_CNSS.pdf` est rempli. Les métadonnées ont été revérifiées avec `pdfinfo -box` : deux pages, MediaBox et CropBox `(0, 0, 728.40, 1031.76)`, rotation 270°, aucun AcroForm. La copie servie depuis `frontend/public/pdf-templates/` est identique à l’original ; le test compare leurs octets.

### Repère et rotation

La cartographie exécutable est dans `frontend/src/lib/insurance/pdf/cnss-mapping.ts`. Chaque champ porte page, libellé, source, x/y, taille, alignement, largeur maximale et format. Les coordonnées sont en points **visuels**, origine en haut à gauche du CropBox, y sur la ligne de base du texte. Pour 270°, la conversion est `xPDF = crop.x + crop.width - yVisuel`, `yPDF = crop.y + crop.height - xVisuel`. Le texte est lui aussi tourné de 270°. Le module `coordinates.ts` couvre les quatre rotations orthogonales et les décalages de boîte ; le renderer refuse une géométrie différente du CNSS calibré.

### Champs de page 1

Alignement gauche, taille 8 pt, sauf le montant aligné à droite. Les identifiants en cases ont des positions de caractères espacées de 10 pt ; les dates `JJMMAAAA` utilisent les décalages `[0, 10, 24, 34, 48, 58, 68, 78]` pour respecter les groupes imprimés. La largeur d’un caractère est contrôlée sur 8 pt.

| Libellé / source | x | y | Largeur | Format |
| --- | ---: | ---: | ---: | --- |
| Assuré : nom + prénom / policy.insuredPerson | 650 | 108 | 273 | texte |
| Immatriculation / policy.registrationNumber | 671 | 127 | 89 | 9 cases |
| CIN assuré / policy.insuredPerson.cin | 814 | 142 | 89 | 9 cases |
| Adresse / policy.insuredPerson.address | 629 | 187 puis 199 | 322 | deux lignes mesurées |
| Montant des frais / manualFields.totalFeesMinor ou somme complète des actes | 659 | 215 | 90 | DH, deux décimales, sans suffixe ajouté |
| Pièces jointes / manualFields.attachmentCount | 819 | 230 | 53 | entier |
| Bénéficiaire : nom + prénom / patient.identity | 650 | 274 | 272 | texte |
| Naissance / patient.identity.dateOfBirth | 773 | 290 | 90 | date en cases |
| CIN bénéficiaire / patient.identity.cin | 780 | 311 | 89 | 9 cases |
| INP du dentiste / valeur fournie dans le handoff | 628 | 367 | 90 | 084209071 en cases |
| Entente préalable / cnssDetails.priorAuthorizationNumber | 762 | 464 | 90 | 9 cases |
| Accident / cnssDetails.accidentDate | 767 | 482 | 90 | date en cases |
| Lieu assuré / manualFields.declarationPlace | 647 | 528 | 86 | texte |
| Date assuré / manualFields.declarationDate | 646 | 543 | 90 | date en cases |
| Lieu dentiste / manualFields.declarationPlace | 863 | 528 | 86 | texte |
| Date dentiste / manualFields.declarationDate | 857 | 543 | 90 | date en cases |

Cases : `X`, taille 8 pt, largeur 6 pt, alignement gauche. Objet entente `(757,72)` ou exécution `(845,72)` ; lien conjoint `(732,172)`, enfant `(799,172)`, lui-même `(873,172)` ; sexe M `(840,330)`, F `(895,330)` ; soins `(788,397)`, prothèse `(788,413)`, ODF `(788,429)`, autres `(788,445)`. Les valeurs proviennent exclusivement des sélections du brouillon, de la police ou du dossier patient. Le lien `AUTRE` bloque le PDF : aucune case correspondante n’est imprimée.

### Tableau de page 2

Trois lignes officielles, y = `88`, `162`, `233`. Chaque cellule est centrée, taille 7 pt. Les colonnes sont : dent FDI explicite `(x=588, largeur=44)`, code manuel `(637,40)`, date `JJ/MM/AAAA` `(683,48)`, lettre clé et coefficient manuels `(738,43)`, honoraires en DH `(837,44)`. Les sources sont les champs de `acts[index]` ; aucune cotation n’est déduite d’une description. Le formulaire n’a pas de colonne de description libre.

### Zones non remplies et limites

La phase 9.2A initiale conservait le schéma dentaire H/B/D/G sans marquage. La phase 9.2A.1 ajoute les sélections FDI confirmées décrites ci-dessous. Une référence explicite unique FDI (11–48 ou 51–85, selon les plages valides) est reprise dans la colonne des dents ; toute autre notation est omise avec avertissement. Les valeurs clés, remboursements, volets pharmacie/radiologie/paramédical, zones organisme, signatures et cachets restent vierges.

Les dates réelles sont contrôlées. Patient, police CNSS liée, identité de l’assuré, immatriculation, lien représentable et 1 à 3 actes sont requis pour générer. Ce minimum technique ne constitue pas une validation administrative de recevabilité. Les données facultatives absentes restent vides avec avertissements. Aucun total n’est déduit de montants incomplets ; un total explicitement saisi reste possible, et un total différent d’une somme complète bloque la génération. Les montants utilisent des centimes entiers sûrs.

Aucun texte n’est tronqué ni réduit automatiquement. Le dépassement d’une cellule, d’un identifiant ou des deux lignes d’adresse bloque le PDF avec le nom du champ à corriger. Au-delà de trois actes, répartir manuellement les actes sur plusieurs feuilles ; aucune page ni annexe n’est ajoutée au modèle.

Validation visuelle : exemples fictifs à un et à plusieurs actes, deux pages chacun, rendus avec Poppler et inspectés. Les textes et coches restent dans leurs zones ; les signatures, cachets et schémas sont préservés. Une impression papier reste nécessaire pour valider le format hors A4, l’échelle et le retournement recto verso avec l’imprimante du cabinet.


## Phase 9.2A.1 — Sélection dentaire CNSS confirmée

La cartographie `frontend/src/lib/insurance/pdf/cnss-chart-mapping.ts` contient les 52 centres des dents du dessin CNSS. Le repérage s’appuie sur **H** (haut), **B** (bas), **D** (droite du patient, à gauche du lecteur) et **G** (gauche du patient, à droite du lecteur), réellement imprimés. Les correspondances anatomiques FDI/ISO ont été contrôlées avec le [tableau ISO de l’ADA](https://www.ada.org/-/media/project/ada-organization/ada/ada-org/files/publications/cdt/universal_tooth_designation_system_valueset_2.pdf?hash=4C41BD09B3D776E69F6CDB3854C052F9&rev=5938db8b7a72425a912cc09fff3ea8f0), rubriques ISO des dents permanentes et temporaires.

| Arcade / côté du patient | Repères imprimés | Permanente, externe | Temporaire, interne |
| --- | --- | --- | --- |
| Supérieure droite | H/D | 11–18 | 51–55 |
| Supérieure gauche | H/G | 21–28 | 61–65 |
| Inférieure gauche | B/G | 31–38 | 71–75 |
| Inférieure droite | B/D | 41–48 | 81–85 |

Chaque centre a été relevé dans son quadrant sur le rendu Poppler de la page 2, largeur affichée 4000 px. Aucune réflexion géométrique automatique n’est utilisée. Le recadrage de contrôle est `(2650,1150,800,1100)` px. Les coordonnées du recadrage se convertissent par `xVisuel=(2650+xLocal)*1031.76/4000`, `yVisuel=(1150+yLocal)*1031.76/4000`. Le PNG vierge correspondant est `frontend/public/images/cnss-dental-chart.png` ; il sert seulement de fond à la prévisualisation du schéma dans le formulaire. Le PDF reste basé sur l’original intact.

Les centres ci-dessous sont en points visuels, origine en haut à gauche de la page affichée. Les décimales servent au stockage ; elles ne représentent pas une précision anatomique au millième de point sur ce scan.

| FDI | x | y |
| --- | ---: | ---: |
| 11 | 772.788 | 351.572 |
| 12 | 763.760 | 354.668 |
| 13 | 756.280 | 361.374 |
| 14 | 751.895 | 371.176 |
| 15 | 745.189 | 382.783 |
| 16 | 741.835 | 397.228 |
| 17 | 738.482 | 411.930 |
| 18 | 735.645 | 428.438 |
| 21 | 782.590 | 351.572 |
| 22 | 792.650 | 355.183 |
| 23 | 799.872 | 361.632 |
| 24 | 803.483 | 371.692 |
| 25 | 809.674 | 383.815 |
| 26 | 813.027 | 397.743 |
| 27 | 816.896 | 412.446 |
| 28 | 819.217 | 428.696 |
| 31 | 781.816 | 529.035 |
| 32 | 789.554 | 526.456 |
| 33 | 796.003 | 521.039 |
| 34 | 801.935 | 513.559 |
| 35 | 806.578 | 503.241 |
| 36 | 812.253 | 491.376 |
| 37 | 816.380 | 476.157 |
| 38 | 820.249 | 458.101 |
| 41 | 773.046 | 528.777 |
| 42 | 764.018 | 526.198 |
| 43 | 757.054 | 521.297 |
| 44 | 751.379 | 513.816 |
| 45 | 745.962 | 504.015 |
| 46 | 740.804 | 491.634 |
| 47 | 737.450 | 476.157 |
| 48 | 734.097 | 458.359 |
| 51 | 774.852 | 375.045 |
| 52 | 769.951 | 377.366 |
| 53 | 766.082 | 380.977 |
| 54 | 762.471 | 386.136 |
| 55 | 759.633 | 393.616 |
| 61 | 781.300 | 375.045 |
| 62 | 785.427 | 377.366 |
| 63 | 790.070 | 380.977 |
| 64 | 793.165 | 386.136 |
| 65 | 796.519 | 393.616 |
| 71 | 781.300 | 508.916 |
| 72 | 785.943 | 507.110 |
| 73 | 790.328 | 503.499 |
| 74 | 792.908 | 498.082 |
| 75 | 796.519 | 491.376 |
| 81 | 774.078 | 508.658 |
| 82 | 769.177 | 506.852 |
| 83 | 765.050 | 503.241 |
| 84 | 761.439 | 498.082 |
| 85 | 757.828 | 491.892 |

### Marque et conversion PDF

La seule marque proposée est un **carré bourgogne évidé de 2,4 pt**, trait de 0,6 pt, centré dans la dent. Elle n’ajoute aucun caractère sur les numéros imprimés ni sur les repères directionnels. Elle ne représente ni une extraction, ni une couronne, ni une autre procédure. Aucune convention clinique officielle n’est revendiquée pour ce carré.

La page 2 conserve sa rotation 270°. Le centre est converti par le même `visualToPdf` que les autres surcouches : `xPDF=crop.x+crop.width-yVisuel`, `yPDF=crop.y+crop.height-xVisuel`. Un carré étant invariant sous une rotation orthogonale, le renderer place son coin natif à `(xPDF-1.2, yPDF-1.2)` sans rotation supplémentaire. Les zones administratives et les lignes d’actes ne changent pas.

### Confirmation et conservation

`cnssDetails.confirmedTeeth` est une liste optionnelle de références FDI uniques. Les anciens brouillons sans cette liste ne produisent aucune marque. Le schéma affiche les actes et les références saisies, mais **aucune dent n’est sélectionnée automatiquement**. Chaque case cochée confirme explicitement une dent ; la liste des numéros confirmés et le fond officiel permettent de relire la sélection. Le dentiste peut choisir toute dent cartographiée, y compris une dent ajoutée manuellement à cette sélection ; il doit vérifier sa concordance avec les actes. La sélection n’est pas une déduction du champ libre `toothReference` et ne modifie aucun acte clinique.

Décocher retire uniquement la dent choisie ; « Effacer les marques » vide la liste. L’enregistrement du brouillon conserve la liste dans le dépôt en mémoire existant. Modifier la sélection invalide le PDF temporaire et révoque son URL. Changer de patient ne reporte aucune marque sur le nouveau bénéficiaire. Chaque formulaire est remonté lors du passage à un autre identifiant de brouillon.

### Vérification et limites

Les exemples fictifs « 16 et 11 », « huit quadrants » (16,26,36,46,55,65,75,85) et « toutes les dents » ont été rendus avec Poppler. Les huit quadrants et les dents temporaires centrales ont été inspectés séparément ; les carrés restent à l’intérieur des dents et les chiffres restent lisibles. Le test de différence raster à 144 dpi vérifie l’absence de changement hors des empreintes des dents sélectionnées, ainsi que l’identité visuelle de la page 1. Il couvre aussi l’absence de changement des dents voisines, du tableau et des signatures/cachets.

Le dentiste doit encore valider l’usage de cette marque neutre dans sa pratique et la lisibilité sur l’imprimante du cabinet. Les conventions de symboles selon la procédure et leur acceptation administrative ne sont pas implémentées. CNOPS et FAR ne sont pas concernés.


## Phase 9.2B — Surcouche CNOPS

Le modèle dentaire CNOPS a été revérifié avec `pdfinfo -box` et `pdffonts` : **deux pages, 799,44 × 574,08 pt chacune, rotation 0°, MediaBox/CropBox/TrimBox/BleedBox/ArtBox à l’origine (0,0), aucun AcroForm ni police incorporée dans l’original**. Le titre des métadonnées est `feuille_dentaire_CNOPS`. Les images originales sont conservées ; la copie publique vierge est testée octet pour octet contre la référence.

### Coordonnées et moteur partagé

La cartographie CNOPS est indépendante des modules CNSS. Le repère est visuel, origine en haut à gauche ; y est la ligne de base du texte. Pour cette rotation 0°, `visualToPdf` donne `xPDF=crop.x+xVisuel`, `yPDF=crop.y+crop.height-yVisuel`. Le moteur `overlay.ts`, extrait du renderer CNSS, charge les deux pages, vérifie leurs boîtes/rotation, incorpore Liberation Sans, mesure chaque texte puis dessine la surcouche. Les coordonnées CNSS restent inchangées. Les fonctions de dates, montants, coches et débordement sont partagées, ainsi que les contrôles de prévisualisation, téléchargement, impression et confirmation FDI.

### Champs calibrés

Les identités de l’assuré et du bénéficiaire restent distinctes. L’assuré fournit aussi le téléphone optionnel et l’adresse. Affiliation et immatriculation ne sont pas interchangées. Les identités, la couverture liée, ces deux numéros et l’INPE sont les minimums techniques de génération. Ce contrôle ne garantit pas la recevabilité administrative du dossier.

Les champs facultatifs absents restent vides avec avertissement. Toutes les dates présentes doivent être calendaires et sont écrites `JJ/MM/AAAA`, ou `JJMMAAAA` dans les cases. Un dépassement mesuré bloque le PDF avec le libellé du champ ; aucune réduction de police ni troncature automatique n’est appliquée.

| Page | Libellé imprimé / champ | Source | x | y | Largeur | Taille | Alignement | Format / contrôle |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| 1 | N° du Tél (optionnel) | `policy.insuredPerson.phone` | 579 | 69.5 | 100 | 8 | left | text ; facultatif |
| 1 | Nom et prénom - assuré | `policy.insuredPerson` | 515 | 101.5 | 179 | 8 | left | text ; requis |
| 1 | N° Affiliation | `policy.affiliationNumber` | 515 | 115.5 | 179 | 8 | left | text ; requis |
| 1 | N° Immatriculation | `policy.registrationNumber` | 515 | 129.5 | 179 | 8 | left | text ; requis |
| 1 | N° CIN - assuré | `policy.insuredPerson.cin` | 515 | 143.5 | 179 | 8 | left | text ; facultatif |
| 1 | Adresse (ligne 1) | `policy.insuredPerson.address` | 478 | 191.5 | 233 | 8 | left | text ; facultatif |
| 1 | Adresse (ligne 2) | `policy.insuredPerson.address` | 478 | 203 | 233 | 8 | left | text ; facultatif |
| 1 | Montant des frais (Dhs) | `manualFields.totalFeesMinor / sum(acts.amountMinor)` | 530 | 214 | 165 | 8 | right | amount ; facultatif |
| 1 | Nombre de pièces jointes | `manualFields.attachmentCount` | 535 | 228.4 | 160 | 8 | left | text ; facultatif |
| 1 | Nom et prénom - bénéficiaire | `patient.identity` | 513 | 271.5 | 196 | 8 | left | text ; requis |
| 1 | Date de naissance | `patient.identity.dateOfBirth` | 565 | 285.7 | 90 | 8 | left | date ; 8 cases ; facultatif |
| 1 | N° CIN - bénéficiaire | `patient.identity.cin` | 570 | 299.5 | 83 | 8 | left | slots ; 8 cases ; facultatif |
| 1 | INPE du médecin dentiste | `cnopsDetails.practitionerInpe` | 574 | 346 | 90 | 8 | left | slots ; 9 cases ; requis |
| 1 | N° Entente Préalable | `cnopsDetails.priorAuthorizationNumber` | 575 | 413.8 | 83 | 8 | left | slots ; 8 cases ; facultatif |
| 1 | La date de l’accident | `cnopsDetails.accidentDate` | 570 | 438.5 | 90 | 8 | left | date ; 8 cases ; facultatif |
| 1 | Les causes de l’accident | `cnopsDetails.accidentCauses` | 531 | 450.8 | 212 | 8 | left | text ; facultatif |
| 1 | Fait à - assuré | `manualFields.declarationPlace` | 474 | 468 | 92 | 8 | left | text ; facultatif |
| 1 | Le - assuré | `manualFields.declarationDate` | 482 | 479.8 | 90 | 8 | left | date ; 8 cases ; facultatif |
| 1 | Fait à - dentiste | `manualFields.declarationPlace` | 656 | 468 | 112 | 8 | left | text ; facultatif |
| 1 | Le - dentiste | `manualFields.declarationDate` | 663 | 479.8 | 90 | 8 | left | date ; 8 cases ; facultatif |
| 2 | CIM - 10 | `cnopsDetails.diagnosisCodeCIM10` | 581 | 236.5 | 54 | 8 | left | slots ; 3 cases ; facultatif |

Les cases de naissance et d’accident utilisent les décalages `[0,9.8,23.4,33.2,47,56.8,66.6,76.4]` pt. Les dates de déclaration ont un groupement plus serré, mesuré séparément : `[0,9.8,21.6,31.4,43.2,53,62.8,72.6]` pt. Un test de placement extrait les huit chiffres et vérifie leurs limites contre les cases du rendu officiel. Les identifiants sont espacés de 9,8 pt, avec une largeur utile de caractère de 8 pt. Le CIN bénéficiaire et l’accord préalable disposent de huit cases ; une valeur plus longue bloque la génération sans être raccourcie. Les deux lignes d’adresse sont mesurées séparément. Le CIM-10 utilise trois cellules de 18,5 pt, largeur utile de 16 pt.

### Coches propres à la CNOPS

Chaque coche est un `X` de 7 pt, aligné à gauche dans une largeur de 7 pt. La sélection vient exclusivement du brouillon, de la police ou de l’identité patient.

| Page | Libellé | Source | x | y |
| --- | --- | --- | ---: | ---: |
| 1 | Entente Préalable | `documentPurpose` | 607.4 | 52.9 |
| 1 | Exécution | `documentPurpose` | 666.7 | 52.9 |
| 1 | Conjoint | `policy.insuredPerson.relationship` | 581.8 | 164 |
| 1 | Enfant | `policy.insuredPerson.relationship` | 651.7 | 164 |
| 1 | Masculin | `patient.identity.sex` | 570.5 | 312 |
| 1 | Féminin | `patient.identity.sex` | 651 | 312 |
| 1 | Soins | `cnopsDetails.careTypes` | 513.7 | 381.2 |
| 1 | Prothèse | `cnopsDetails.careTypes` | 686.8 | 381.2 |
| 1 | Orthodontie et O.D.F | `cnopsDetails.careTypes` | 513.7 | 395.7 |
| 1 | Autres | `cnopsDetails.careTypes` | 686.8 | 395.7 |

Il n’existe pas de case « Lui-même ». Pour un assuré qui est le bénéficiaire, Conjoint et Enfant restent vides et cette représentation est rappelée dans les avertissements. Un lien AUTRE ou une contradiction avec `insuredPerson.isPatient` bloque le PDF.

### INPE et CIM-10

Le champ de page 1 porte le libellé développé **Identifiant National des Professionnels de santé et des Établissements de santé (INPE)** et neuf cases. Le format à neuf chiffres est confirmé par le [communiqué ANAM sur l’INPE](https://anam.ma/anam/wp-content/uploads/2024/02/CP-INPE-AR-ET-FR_230509_211409.pdf). La valeur vient exclusivement de `cnopsDetails.practitionerInpe`, saisie et vérifiée par le praticien ; aucun préremplissage depuis l’INP 084209071 du cabinet n’est effectué. Le format est contrôlé, sans prétendre authentifier l’identifiant auprès de l’ANAM. Un brouillon peut être enregistré sans INPE ; la génération du PDF demande ses neuf chiffres.

Les champs **INP de page 2** se trouvent dans les volets pharmacie/fournisseurs, biologie/radiologie et paramédical. Ils ne sont pas des champs du dentiste et restent vides. Les autres volets, valeurs clés et remboursements ne sont pas remplis par les actes dentaires.

Le **CIM-10 de page 2 comporte trois cellules**. La surcouche reprend seulement un code explicitement saisi sous la forme une majuscule et deux chiffres. Un code détaillé tel que `K02.1` est conservé dans le brouillon mais bloque le PDF : le praticien doit vérifier la valeur attendue sur le formulaire. Aucune catégorie n’est déduite ou tronquée à partir d’un code détaillé. L’absence de code laisse le champ vierge avec avertissement. Le contrôle de forme n’est pas une validation clinique du diagnostic.

### Tableau des actes

Le tableau comporte **neuf lignes**. Les lignes de base calibrées sont `73, 90.5, 108.5, 126.7, 145.2, 163.2, 180.5, 199, 216.5` pt. Tous les champs sont centrés, taille 6,5 pt. Les dates sont validées, les codes/cotations doivent être saisis explicitement et les montants restent en centimes entiers sûrs, affichés en DH avec deux décimales. Le total est la somme seulement si tous les honoraires sont connus, ou une valeur explicite du brouillon ; une contradiction avec une somme complète bloque la génération.

| Colonne imprimée | Source par acte | x | Largeur | Format |
| --- | --- | ---: | ---: | --- |
| Dents traitées | `acts[index].toothReference` | 425 | 38 | text |
| Code des actes | `acts[index].actCode` | 469 | 41 | text |
| Dates des actes | `acts[index].treatmentDate` | 516 | 42 | date |
| Lettre clé + Cotation NGAP | `acts[index].ngap` | 564 | 41 | text |
| Montant facturé | `acts[index].amountMinor` | 651 | 40 | amount |

La source `ngap` est la concaténation des seuls `ngapKeyLetter` et `ngapCoefficient` explicitement présents. Il n’existe pas de colonne de description clinique libre : la description reste dans le brouillon et n’est pas substituée au code. La référence de dent explicite est reprise telle que saisie dans la cellule, sous réserve de sa largeur ; elle ne sélectionne jamais une dent du schéma. Plus de neuf actes ou tout dépassement d’une cellule bloque le PDF, sans ajout de pages ni annexe.

### Schéma dentaire CNOPS

Le dessin montre H au-dessus, B au-dessous, D à gauche du lecteur et G à droite. Les permanentes portent les indices locaux 1–8. Les petites arcades internes comportent chacune cinq dents par quadrant, sans numéros locaux lisibles : le repérage FDI part de la médiane et suit les dents observées jusqu’à l’arrière. Le schéma ne porte pas directement une série FDI à deux chiffres. La correspondance est présentée au dentiste pour confirmation, sans ajouter de chiffres sur l’original.

Les quadrants FDI 1/5 sont H/D, 2/6 H/G, 3/7 B/G et 4/8 B/D. Les 52 centres ci-dessous sont **mesurés sur le modèle CNOPS**, indépendamment de la CNSS, depuis un rendu Poppler de 4000 px de large. Le recadrage de contrôle est `(2550,1300,1000,1260)` px. Conversion : `xVisuel=(2550+xLocal)*799.44/4000`, `yVisuel=(1300+yLocal)*799.44/4000`. Les décimales sont un format de stockage, pas une précision anatomique au millième de point.

| FDI | x | y |
| --- | ---: | ---: |
| 11 | 595.783 | 305.586 |
| 12 | 586.589 | 308.584 |
| 13 | 579.194 | 314.18 |
| 14 | 574.398 | 323.773 |
| 15 | 567.802 | 334.766 |
| 16 | 564.804 | 347.157 |
| 17 | 560.407 | 360.747 |
| 18 | 558.209 | 375.337 |
| 21 | 606.175 | 305.586 |
| 22 | 616.568 | 308.584 |
| 23 | 623.963 | 314.38 |
| 24 | 627.76 | 323.573 |
| 25 | 634.556 | 334.366 |
| 26 | 637.953 | 347.157 |
| 27 | 641.95 | 360.547 |
| 28 | 644.548 | 375.337 |
| 31 | 606.175 | 467.073 |
| 32 | 614.37 | 465.474 |
| 33 | 622.564 | 461.277 |
| 34 | 626.961 | 452.483 |
| 35 | 632.357 | 443.09 |
| 36 | 637.553 | 432.497 |
| 37 | 640.751 | 417.707 |
| 38 | 644.948 | 402.118 |
| 41 | 595.983 | 467.273 |
| 42 | 586.589 | 465.074 |
| 43 | 578.595 | 461.277 |
| 44 | 573.198 | 452.083 |
| 45 | 567.602 | 442.89 |
| 46 | 562.406 | 432.497 |
| 47 | 559.008 | 417.707 |
| 48 | 554.611 | 402.118 |
| 51 | 598.381 | 327.171 |
| 52 | 592.785 | 328.97 |
| 53 | 588.388 | 332.367 |
| 54 | 585.99 | 337.564 |
| 55 | 582.392 | 343.959 |
| 61 | 603.777 | 327.171 |
| 62 | 609.373 | 328.97 |
| 63 | 613.97 | 332.767 |
| 64 | 616.768 | 337.763 |
| 65 | 620.166 | 343.959 |
| 71 | 603.977 | 447.886 |
| 72 | 609.573 | 446.487 |
| 73 | 614.17 | 443.689 |
| 74 | 617.567 | 439.692 |
| 75 | 620.565 | 432.897 |
| 81 | 598.181 | 447.886 |
| 82 | 592.585 | 446.487 |
| 83 | 587.588 | 443.889 |
| 84 | 584.191 | 439.692 |
| 85 | 581.393 | 432.897 |

Seules les références uniques de `cnopsDetails.confirmedTeeth` sont marquées ; la sélection CNSS est indépendante. La même interface de confirmation affiche les actes et les numéros FDI, permet de décocher et d’effacer, puis conserve la liste dans le dépôt en mémoire lors de l’enregistrement. Chaque changement invalide le PDF temporaire. Sans confirmation, aucune marque n’est dessinée.

La marque provisoire est le même carré bourgogne évidé de 2,4 pt, trait 0,6 pt, centré dans la dent. Aucune procédure n’est déduite du numéro FDI, du diagnostic ou du code d’acte. La convention reste à valider par le dentiste ; elle ne représente pas une instruction clinique officielle.

### Validation visuelle et impression

Les deux pages des exemples fictifs simple, multi-actes et marqué ont été rendues avec Poppler et inspectées, ainsi qu’un agrandissement des 52 centres. Les textes, coches, dates, colonnes, marques et espaces de signature sont vérifiés sur les images. Les tests comparent aussi les images originales incorporées, les cinq boîtes de chaque page et les pixels avant/après marquage : aucun changement n’est attendu hors des empreintes des dents sélectionnées.

Le format natif est légèrement différent de l’A4 paysage. Le lecteur reçoit une préférence d’absence de mise à l’échelle, mais le pilote peut la remplacer. L’ajustement au papier peut agrandir ou réduire le formulaire. Vérifier format, échelle, marges, lisibilité des petits carrés et retournement recto verso sur l’imprimante du cabinet. Les signatures, cachets et approbations restent vierges. La phase 9.2B ne couvre que la CNOPS ; la FAR est décrite ci-dessous.


## Phase 9.2C — Générateur FAR

### Modèle et transformation vérifiés

L’original `docs/references/pdf-templates/feuille_dentaire_FAR.pdf` est conservé, et sa copie publique est identique octet par octet. Il contient deux pages paysage sans champ AcroForm, avec un fond raster. Sur **chacune** des pages, MediaBox, CropBox, BleedBox, TrimBox et ArtBox ont l’origine `(0 ; 8,580014)` et les dimensions `842,25 × 595,499986 pt`, soit un bord supérieur à `604,08`. La rotation est 0°. Le moteur vérifie séparément les origines des deux pages, conserve les boîtes et ajoute seulement une surcouche.

Toutes les coordonnées ci-dessous sont en points visuels, depuis le coin supérieur gauche de la page affichée. La transformation partagée donne ici `xPDF=xVisuel` et `yPDF=8,580014+595,499986-yVisuel`. Les positions de texte indiquent la ligne de base ; les chiffres de naissance ont des emplacements distincts. Le décalage n’est ni appliqué deux fois ni emprunté à la rotation CNSS.

### Inventaire par page et volet

Page 1 : volet dentaire à gauche, adhérent militaire puis bénéficiaire et déclaration à droite. Page 2 : ordonnance à gauche, prestations par profession à droite. Seule la première bande médecin/chirurgien-dentiste de ce dernier volet reçoit les actes. L’ordonnance entière reste vierge, car sa notice demande une rédaction manuscrite du médecin. Les autres professions, zones de pharmacie, contrôle, signatures et cachets restent vierges.

Les champs de page 1 sont en corps 8 pt, alignés à gauche sauf les dirhams alignés à droite. Les largeurs sont des limites contrôlées, sans troncature.

| Volet | Libellé | Source | x | y | Largeur |
| --- | --- | --- | ---: | ---: | ---: |
| ADHERENT | N° Carte Nationale d’Identité | `policy.insuredPerson.cin` | 585 | 169 | 110 |
| ADHERENT | N° de Compte | `policy.militaryAccountNumber` | 539 | 189 | 164 |
| ADHERENT | N° de Téléphone | `policy.insuredPerson.phone` | 549 | 208 | 177 |
| ADHERENT | Nom et Prénom - adhérent | `policy.insuredPerson` | 525 | 237 | 190 |
| ADHERENT | Grade | `policy.militaryRank` | 480 | 254 | 234 |
| ADHERENT | Unité | `policy.militaryUnit` | 480 | 271 | 234 |
| ADHERENT | Adresse | `policy.insuredPerson.address` | 490 | 287 | 240 |
| BENEFICIAIRE | Nom et Prénom - bénéficiaire | `patient.identity` | 537 | 333 | 180 |
| BENEFICIAIRE | Date de Naissance | `patient.identity.dateOfBirth` | 542 | 348 | 171 |
| DECLARATION | N° INPE | `farDetails.practitionerInpe` | 548 | 437 | 114 |
| DECLARATION | Frais engagés | `manualFields.totalFeesMinor / sum(acts.amountMinor)` | 447 | 495 | 28 |
| DECLARATION | Frais engagés - centimes | `manualFields.totalFeesMinor / sum(acts.amountMinor)` | 484 | 495 | 18 |
| DECLARATION | Nombre prospectus | `farDetails.prospectusCount` | 616 | 466 | 22 |
| DECLARATION | Nombre pièces | `manualFields.attachmentCount` | 616 | 489 | 22 |
| DECLARATION | Le | `manualFields.declarationDate` | 493 | 513 | 140 |

La naissance utilise les décalages x `[17,23,62,68,116,122,128,134]` depuis x=542 pour les huit chiffres JJ MM AAAA. Les dates restent celles saisies, sans date du jour implicite. Le total reprend le total manuel explicite ou la somme exacte des honoraires ; les dirhams et les deux centimes sont séparés par division entière, de part et d’autre du séparateur imprimé. Les quantités de prospectus et de pièces acceptent zéro explicitement saisi et restent dans leurs espaces libres, avant les libellés arabes.

Le N° de compte vient exclusivement de `militaryAccountNumber`, sans substitution de l’immatriculation. Sa nature bancaire ou d’adhésion n’est pas déduite. Aucun emplacement distinct d’immatriculation, de CIN du bénéficiaire ou de référence d’accord préalable n’est vérifié dans ces volets : ces valeurs ne sont pas reportées ailleurs par défaut. L’INPE de neuf chiffres vient de la saisie FAR, jamais de l’INP du cabinet. Le cachet avec INPE de page 2 reste à compléter à la main.

| Case page 1 | Source explicite | x | y |
| --- | --- | ---: | ---: |
| Adhérent | `policy.insuredPerson.relationship = LUI_MEME` | 558 | 373 |
| Conjoint | `policy.insuredPerson.relationship = CONJOINT` | 657 | 373 |
| Enfant | `policy.insuredPerson.relationship = ENFANT` | 745 | 373 |
| Maladie | `farDetails.context = MALADIE` | 507 | 397 |
| Maternité | `farDetails.context = MATERNITE` | 632 | 397 |
| Accident | `farDetails.context = ACCIDENT` | 752 | 397 |
| Soins | `farDetails.careType = SOINS` | 184 | 206 |
| Prothèse | `farDetails.careType = PROTHESE` | 293 | 206 |

Les coches sont des X de 9 pt dans une largeur de 8 pt. Une seule valeur explicite choisit une case dans chaque groupe ; une valeur absente ne signifie jamais vrai. Les champs FAR objet, soins/prothèse et contexte restent sans valeur initiale. Leur absence bloque la génération. La relation AUTRE ne possède pas de case correspondante et bloque également. Le choix DEVIS barre REÇUS à `(177–221 ; 45,3)` ; le choix REÇUS barre DEVIS à `(126–166 ; 45,3)`. Le texte imprimé n’est pas remplacé.

### Actes et capacité

Le tableau dentaire de page 1 offre six lignes pointillées, mais la bande médecin/dentiste de page 2 n’en offre que cinq utilisables. Le générateur accepte donc **un à cinq actes** communs aux deux volets. Un sixième acte bloque avec un message demandant de réduire le brouillon. Il n’ajoute ni page ni annexe.

| Page / volet | Colonne | Source par acte | x | Largeur | Corps |
| --- | --- | --- | ---: | ---: | ---: |
| 1 / dentaire | Date | `treatmentDate` | 39 | 63 | 7 |
| 1 / dentaire | Position dent | `toothReference` | 108 | 40 | 7 |
| 1 / dentaire | Nature des travaux | `description` | 154 | 137 | 7 |
| 1 / dentaire | Coefficient | `coefficient` | 298 | 36 | 7 |
| 1 / dentaire | Montant honoraires | `amountMinor` | 341 | 62 | 7 |
| 2 / médecin-dentiste | Date des actes | `treatmentDate` | 509 | 49 | 6.5 |
| 2 / médecin-dentiste | Natures des actes & coefficients | `description` | 564 | 105 | 6.5 |
| 2 / médecin-dentiste | Montants des Honoraires | `amountMinor` | 675 | 43 | 6.5 |

Lignes de base page 1 : `[94,110.2,126.3,142.5,158.7]`. Page 2 : `[115.5,128.5,140,151.8,163]`. Les cellules sont centrées. La page 1 porte la description et, s’il existe, le code manuel entre parenthèses. La page 2 porte le code manuel ou, à défaut, la description, suivi du coefficient uniquement s’il est saisi. Aucun code, lettre-clé ni coefficient n’est calculé à partir de la description. Une dent ou une cotation facultative absente reste vide avec avertissement. Chaque date et chaque honoraire doivent être renseignés ; zéro DH explicite est accepté. Les centimes restent des entiers exacts ; aucun remboursement n’est calculé.

### Schéma FAR : 52 références imprimées

Le tableau imprime directement les références à deux chiffres. Les rangées, de haut en bas, sont `55…51 / 61…65`, `18…11 / 21…28`, `48…41 / 31…38`, puis `85…81 / 71…75`. Les quadrants 1/5 et 4/8 occupent donc le côté droit du patient, à gauche du lecteur. Les quadrants 2/6 et 3/7 occupent le côté gauche du patient, à droite du lecteur. Les deux dentitions et les huit quadrants ont été vérifiés indépendamment sur les chiffres du modèle FAR.

Les centres viennent d’un rendu Poppler de 4000 px de large, recadré à `(250,1240,1650,330)` px. La conversion est `x=(250+xLocal)*842.25/4000`, `y=(1240+yLocal)*842.25/4000`. Le recadrage vierge est celui de l’interface. Les décimales suivantes décrivent les centres de cellules, sans prétention à une précision anatomique au millième de point.

| FDI | x | y |
| --- | ---: | ---: |
| 11 | 206.562 | 290.155 |
| 12 | 186.769 | 290.155 |
| 13 | 167.292 | 290.155 |
| 14 | 147.815 | 290.155 |
| 15 | 128.338 | 290.155 |
| 16 | 109.387 | 290.155 |
| 17 | 89.91 | 290.155 |
| 18 | 70.328 | 290.155 |
| 21 | 234.146 | 290.155 |
| 22 | 253.833 | 290.155 |
| 23 | 273.31 | 290.155 |
| 24 | 292.577 | 290.155 |
| 25 | 312.054 | 290.155 |
| 26 | 331.636 | 290.155 |
| 27 | 351.113 | 290.155 |
| 28 | 370.801 | 290.155 |
| 31 | 234.146 | 303.947 |
| 32 | 253.833 | 303.947 |
| 33 | 273.31 | 303.947 |
| 34 | 292.577 | 303.947 |
| 35 | 312.054 | 303.947 |
| 36 | 331.636 | 303.947 |
| 37 | 351.113 | 303.947 |
| 38 | 370.801 | 303.947 |
| 41 | 206.562 | 303.947 |
| 42 | 186.769 | 303.947 |
| 43 | 167.292 | 303.947 |
| 44 | 147.815 | 303.947 |
| 45 | 128.338 | 303.947 |
| 46 | 109.387 | 303.947 |
| 47 | 89.91 | 303.947 |
| 48 | 70.328 | 303.947 |
| 51 | 206.562 | 276.89 |
| 52 | 186.769 | 276.89 |
| 53 | 167.292 | 276.89 |
| 54 | 147.815 | 276.89 |
| 55 | 128.338 | 276.89 |
| 61 | 234.146 | 276.89 |
| 62 | 253.833 | 276.89 |
| 63 | 273.31 | 276.89 |
| 64 | 292.577 | 276.89 |
| 65 | 312.054 | 276.89 |
| 71 | 234.146 | 317.528 |
| 72 | 253.833 | 317.528 |
| 73 | 273.31 | 317.528 |
| 74 | 292.577 | 317.528 |
| 75 | 312.054 | 317.528 |
| 81 | 206.562 | 317.528 |
| 82 | 186.769 | 317.528 |
| 83 | 167.292 | 317.528 |
| 84 | 147.815 | 317.528 |
| 85 | 128.338 | 317.528 |

La légende imprimée demande une croix pour prothèse/extraction et un cercle pour dent soignée/couronnée. Le recouvrement possible entre couronne et prothèse reste une ambiguïté clinique : le logiciel n’arbitre pas. Pour chaque dent choisie, le dentiste sélectionne **Cercle** ou **Croix**, puis approuve explicitement les dents et symboles. Sans symbole ou sans cette approbation, le PDF marqué est bloqué ; sans sélection, aucun marquage n’est ajouté. Aucun geste n’est déduit des actes, codes ou numéros de dents.

Les cercles sont des ellipses de demi-axes 8,6 × 5,8 pt ; les croix ont des demi-axes 7,2 × 4,6 pt. Le trait bourgogne de 0,55 pt, partiellement transparent, conserve la lecture des chiffres. Les marques restent dans les cellules correspondantes, sans toucher aux cellules voisines. Toute modification des actes, dents ou symboles retire l’approbation et invalide l’aperçu. Les sélections et l’approbation renouvelée restent dans `farDetails.toothMarks` et `farDetails.markingApproved` au seul enregistrement du brouillon en mémoire.

### Validation, vérification et limites

Le générateur exige les identités cohérentes avec la couverture FAR, la naissance du bénéficiaire, la CIN, le téléphone, l’adresse, le compte, le grade et l’unité de l’adhérent, une relation représentable, les trois choix explicites, l’INPE, les deux quantités et la date de déclaration. La portée exacte de l’astérisque de la feuille de maladie reste une question administrative ; ces contrôles couvrent ses champs identifiés. Les dépassements de cellule ou de capacité bloquent le fichier avec un message, sans écrasement des libellés ni réduction automatique du texte.

Trois exemples fictifs (simple, multi-actes, marqué) ont été produits, leurs deux pages rendues avec Poppler et inspectées : identité militaire, deux tableaux, coches, comptages, total, limites de pages et espaces vierges. Un rendu supplémentaire des 52 marques vérifie toutes les cellules et l’absence de miroir. Les tests contrôlent aussi les images originales incorporées, les cinq boîtes, le décalage propre à chaque page, les catégories explicites de chaque organisme et les différences de pixels limitées aux dents choisies.

Le scan est proche d’A4 paysage, à environ 122 ppp. Le lecteur reçoit une préférence sans redimensionnement ; le pilote peut la remplacer. Vérifier sur l’imprimante du cabinet le papier, l’échelle, les marges, le pliage, le recto verso et la lisibilité des petits caractères. La composition papier évoquant une quatrième page, l’acceptation des symboles et les références attendues par la mutuelle demandent une validation du dentiste/organisme. Aucune signature, cachet, autorisation, transmission ou approbation d’assurance n’est généré.
