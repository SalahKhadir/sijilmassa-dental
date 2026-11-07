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

Le dessin porte H en haut, B en bas, D à gauche du lecteur et G à droite. Chaque quadrant de l’arcade externe affiche les nombres de 1 à 8 depuis la ligne médiane vers l’arrière. L’arcade interne affiche de 1 à 5 dans chaque quadrant. Ces nombres locaux et les repères H/B/D/G sont la convention effectivement imprimée. Le document ne présente pas ici une suite de références à deux chiffres. La mise en correspondance avec un futur modèle de dents devra préserver le quadrant et la dentition. Les détails des traits anatomiques ne sont pas des marques de soins déjà renseignées.

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

Le dessin porte H en haut, B en bas, D à gauche du lecteur et G à droite. L’arcade externe porte les nombres de 1 à 8 par quadrant depuis la médiane. Les petites arcades internes comportent des dents dessinées mais aucun chiffre interne lisible sur le fichier fourni, contrairement au schéma CNSS. Une future cartographie devra conserver cette différence et ne pas ajouter des numéros au modèle. Le dessin et sa position ne peuvent pas être repris des coordonnées CNSS.

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

La page 1 comporte les cases Soins/Prothèse à gauche, les cases Adhérent/Conjoint/Enfant et Maladie/Maternité/Accident à droite. Le tableau des travaux dentaires possède des lignes pointillées. Leur nombre et leur hauteur utilisable devront être recalibrés sur le fichier haute définition ou le papier avant toute saisie automatisée. La page 2 de droite distingue les bandes Médecin traitant ou chirurgien dentiste, Analyses du labo, Imagerie, Actes paramédicaux et Optique. Chaque bande reprend les colonnes date, nature et coefficients, honoraires, signature/cachet avec INPE. La zone inférieure restante est sans intitulé métier clairement lisible et doit rester `UNKNOWN`.

La notice de page 2 demande que l’identité du malade soit portée de la main du médecin traitant et indique que l’apposition de l’INPE est obligatoire. Cette prescription de saisie manuelle devra être examinée avec l’organisme avant de proposer une saisie numérique. La zone médicale réservée à la mutuelle et les signatures ne peuvent pas être alimentées par un simple profil applicatif.

### Tableau dentaire FAR, page 1

Les séquences imprimées se lisent de gauche à droite sur la feuille ainsi.

```text
    55 54 53 52 51      61 62 63 64 65
18 17 16 15 14 13 12 11  21 22 23 24 25 26 27 28
48 47 46 45 44 43 42 41  31 32 33 34 35 36 37 38
    85 84 83 82 81      71 72 73 74 75
```

Le document demande une croix sur la dent objet de la prothèse ou de l’extraction et un cercle sur la dent soignée ou couronnée. Il demande aussi de renseigner une quatrième page du document papier. Les séquences à deux chiffres et les gestes graphiques sont distincts des schémas à quadrant H/B/D/G de la CNSS et de la CNOPS. Le terme FDI n’est pas imprimé sur ce tableau. Les repères devront être modélisés et validés explicitement avant toute conversion de notation.

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
