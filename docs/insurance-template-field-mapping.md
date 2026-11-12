# Inventaire et champs des feuilles d’assurance

Les dix pages des cinq PDF ci-dessous ont été ouvertes avec Poppler et relues visuellement. Ce sont des fonds bilingues sans AcroForm. Les trois premiers correspondent aux prototypes dentaires. Les deux feuilles générales ont leurs propres champs et restent dans l’inventaire.

| Référence du dépôt | Titre et objet imprimés | Géométrie native | Périmètre V12 |
| --- | --- | --- | --- |
| [feuille_dentaire_CNSS.pdf](references/pdf-templates/feuille_dentaire_CNSS.pdf) | « Feuille de soins dentaires », « Entente préalable », « Exécution » | 2 pages, 728,40 × 1031,76 pt, rotation 270° | `CNSS_DENTAIRE`, version interne 1, 3 lignes |
| [feuille_dentaire_CNOPS.pdf](references/pdf-templates/feuille_dentaire_CNOPS.pdf) | « Feuille de Soins Dentaires », « Entente Préalable », « Exécution » | 2 pages, 799,44 × 574,08 pt, rotation 0° | `CNOPS_DENTAIRE`, version interne 1, 9 lignes |
| [feuille_dentaire_FAR.pdf](references/pdf-templates/feuille_dentaire_FAR.pdf) | « Feuille de maladie » avec volet « SOINS ET PROTHESE DENTAIRE (INPE) », « DEVIS ? - REÇUS ? » | 2 pages, 842,25 × 595,50 pt, rotation 0°, origine Y 8,58 pt | `FAR_DENTAIRE`, version interne 1, 5 lignes du volet dentaire |
| [cnss-feuille-de-soins-maladie.pdf](references/pdf-templates/cnss-feuille-de-soins-maladie.pdf) | « Feuille de Soins Maladie », « Entente préalable », « Exécution » | 2 pages, 728,40 × 1031,76 pt, rotation 270° | Inventaire uniquement |
| [cnops-feuille-de-soins-maladie.pdf](references/pdf-templates/cnops-feuille-de-soins-maladie.pdf) | « Feuille de soins Maladie » | 2 pages, 792 × 609,48 pt, rotation 0° | Inventaire uniquement |

La validité actuelle de chacun de ces exemplaires pour un dépôt officiel reste **non vérifiée**. Les sources publiques consultées donnent un contexte général et ne confirment pas l’acceptation de ces versions précises. Les références imprimées et la version interne du logiciel ont des usages distincts. Les instructions imprimées ne sont pas transcrites en règles de délai, d’éligibilité ou de prise en charge. [Formulaires MGPAP](https://www.mgpap.org.ma/index.php/fr/mgpap/formulaires) · [Bulletin officiel concernant la mutuelle FAR](https://www.sgg.gov.ma/BO/bo_fr/2013/BO_6152_Fr.pdf)

Dans les tableaux suivants, **requis** désigne la règle de finalisation interne. **Facultatif** préserve une valeur absente. **Manuel** indique une saisie explicite par le dentiste. **Papier** identifie une rubrique à traiter hors du service. Les champs institutionnels restent à la charge de l’organisme. Aucun texte de déclaration n’est créé ni signé par le logiciel.

## CNSS dentaire

| Libellé imprimé | Source et décision V12 |
| --- | --- |
| « Entente préalable », « Exécution » | Choix manuel à la création, requis. Une entente décrit les actes prévus. Une exécution prend ses actes dans une consultation terminée. |
| « Partie réservée à l’assuré(e) », « Nom et prénom », « N° de la Carte d’Identité Nationale », « Adresse » | Si « Lui même » est confirmé, identité administrative du patient. Pour « Conjoint » ou « Enfant », identité distincte saisie dans le document. Nom et prénom requis. CIN et adresse facultatives. |
| « N° Immatriculation », « Lien de parenté du bénéficiaire avec l’assuré(e) » | Immatriculation manuelle requise. Choix explicite Conjoint, Enfant ou Lui même. Le dossier patient ne fournit aucun de ces identifiants ou liens. |
| « Montant des frais », « Nombre de pièces jointes » | Les lignes peuvent conserver le prix convenu V9 ou un montant de devis saisi, selon l’objet. Le montant de frais à déclarer sur le papier reste à confirmer. Le nombre de pièces est manuel et facultatif. Aucune pièce jointe n’est stockée. |
| « Bénéficiaire des soins », « Nom et prénom », « Date de naissance », « N° de la Carte d’Identité Nationale », « Sexe » | Dossier patient administratif. Nom et prénom requis. Date de naissance, CIN et sexe facultatifs. Les valeurs non renseignées restent absentes. |
| « N° INP », « Type de soins » avec « Soins », « Prothèse », « Orthodontie faciale », « Autres » | INP manuel de neuf chiffres, requis. Types de soins facultatifs et explicitement choisis. Le backend ne reprend pas l’identifiant configuré dans le prototype. |
| « N° Entente préalable », « Date d’accident » | Saisie manuelle facultative. Aucun accord ou accident n’est inféré. |
| « Fait à », « Le », signatures et cachets | Lieu et date facultatifs du volet dentiste. Déclaration de l’assuré, ses lieu/date, signatures, cachets et zones agence/DAMO à compléter sur papier. Aucun engagement juridique dans le snapshot. |
| « Dents traitées », « Code des actes », « Dates des actes », « Lettre clé + Cotation NGAP », « Valeur Clé », « Montant facturé » | En exécution, date, désignation clinique de référence et dent éventuelle du soin persistant. En entente, description manuelle requise, date prévue et dent facultatives. Code, lettre, coefficient et valeur de clé manuels et facultatifs. Le prix V9 éventuel reste un prix convenu. Aucune cotation ni valeur de clé n’est calculée. |
| Schéma dentaire page 2 | Dents FDI sélectionnées explicitement et facultatives. Aucun symbole officiel attribué par le backend. |
| « Description des ordonnances », « Actes de Biologie, Radiologie et Imagerie », « Actes Paramédicaux » | Volets tiers, dates, prix, codes, INP et signatures laissés hors périmètre. Les ordonnances de l’ERP ne sont pas importées. |

## CNOPS dentaire

| Libellé imprimé | Source et décision V12 |
| --- | --- |
| « Entente Préalable », « Exécution » | Choix manuel requis. Même distinction clinique entre prévu et exécuté que sur la feuille dentaire CNSS. |
| « N° du Tél (optionnel) », « Nom et prénom », « N° Affiliation », « N° Immatriculation », « N° CIN », « Adresse » | Affiliation et immatriculation distinctes, saisies et requises pour le sous-ensemble pris en charge. Nom et prénom requis. CIN, adresse et téléphone facultatifs. Identité de l’assuré issue du dossier si confirmé comme patient, sinon saisie distincte. Confirmer le téléphone à reporter lors de la future intégration. Le cas étudiant mentionné dans les instructions reste à spécifier. |
| « Lien de parenté du bénéficiaire avec l’assuré(e) » avec « Conjoint », « Enfant » | Lien requis pour le dossier interne. Pour l’assuré lui-même, l’état interne `LUI_MEME` ne correspond à aucune case imprimée. |
| « Bénéficiaire de soins », « Nom et prénom », « Date de naissance », « N° CIN », « Sexe » | Projection administrative du patient. Nom et prénom requis. Autres valeurs facultatives. |
| « Montant des frais (Dhs) », « Nombre de pièces jointes » | Prix convenus V9 ou devis manuels comme données financières distinctes. Montant à déclarer sur papier à confirmer. Nombre de pièces facultatif et manuel. |
| « N° de l’Identifiant National des Professionnels et des Établissements de santé (INPE) », « Type de soins » avec « Soins », « Prothèse », « Orthodontie et O.D.F. », « Autres » | INPE manuel de neuf chiffres requis, conservé dans le volet CNOPS. Choix de soins facultatifs. |
| « N° Entente Préalable », « La date de l’accident », « Les causes de l’accident » | Champs manuels facultatifs propres à la déclaration du document. |
| « Dents traitées », « Code des actes », « Dates des actes », « Lettre clé + Cotation NGAP », « Valeur Clé », « Montant facturé » | Même séparation des sources que le tableau CNSS. Jusqu’à neuf lignes. Aucune reprise de notes ou de cotations depuis une consultation. |
| « CIM - 10 » | Catégorie facultative de trois caractères saisie par le dentiste. Une sous-catégorie telle que `K02.1` est refusée, sans troncature. Le format ne valide pas la pertinence clinique du code. |
| Schéma dentaire page 2 | Confirmations FDI facultatives, indépendantes de CNSS. Les numéros locaux des temporaires ne sont pas lisibles sur le fond. Le futur rendu devra conserver cette distinction. |
| « Fait à », « Le », signatures, cachets et cadres tiers | Lieu et date facultatifs du volet dentiste. Déclaration de l’assuré, signatures, cachets et blocs mutuelle, pharmacie, biologie/radiologie et paramédical sur papier. |

## FAR, feuille de maladie avec volet dentaire

| Libellé imprimé | Source et décision V12 |
| --- | --- |
| « DEVIS ? - REÇUS ? (Rayer la mention inutile) », « Soins ? », « Prothèse ? » | Objet requis à la création. Nature des soins sélectionnée manuellement et requise. « Reçus » est l’objet du dossier interne, sans attestation numérique d’encaissement. |
| « N° Carte Nationale d’Identité », « N° de Compte », « N° de Téléphone », « Nom et Prénom », « Grade », « Unité », « Adresse » | Tous requis pour l’instantané interne de cette variante. Nom, prénom, CIN, GSM et adresse du patient si l’adhérent est confirmé comme patient. Sinon, saisie du titulaire dans le document. Compte, grade et unité toujours manuels. Le libellé arabe de la référence de compte mentionne le compte bancaire. La nature exacte de la référence attendue doit être confirmée avec la mutuelle. |
| « Partie réservée au bénéficiaire », « Nom et Prénom », « Date de Naissance », « Adhérent », « Conjoint », « Enfant » | Identité et date de naissance du dossier patient requises. Lien choisi explicitement. Aucun autre lien n’est imprimé. |
| « Maladie », « Maternité », « Accident », « N° INPE » | Contexte manuel et requis. INPE manuel de neuf chiffres requis. Aucun contexte déduit du dossier médical. |
| « Date », « Position dent », « Nature des travaux », « Coefficient », « Montant honoraires » | En mode Reçus, les actes viennent d’une consultation terminée et chaque ligne référence une charge V9. Le devis contient des travaux et montants saisis, sans faux soin exécuté. Date prévue, position et coefficient restent facultatifs dans le domaine interne. FAR n’utilise pas les champs NGAP des deux autres variantes. |
| « Frais engagés », « Nombre prospectus », « Nombre pièces », « Le » | Le total exact des prix convenus ou estimés peut être relu. La déclaration de frais engagés et la preuve de paiement restent à confirmer séparément. Comptages et date du volet adhérent manuels et requis. Zéro est une saisie valide. |
| Schéma numéroté et instructions sous le tableau | Chaque marque facultative associe une dent FDI et un symbole explicite. Le fond indique une croix pour la dent objet de la prothèse ou de l’extraction, un cercle pour la dent soignée ou couronnée. Une marque sans symbole reste un brouillon. Aucun symbole déduit d’un traitement. |
| « Signature Adhérent », « Identité et signature du correspondant de la Mutuelle », « Cadre réservé au Contrôle Médical de la Mutuelle des F.A.R. » | Champs papier. Le fond porte une mention d’obligation et des instructions manuscrites. Les gardes de V12 décrivent la partie numérique interne. |
| « ORDONNANCE », « Réservé au corps de santé » et rubrique d’accident | Zones externes à V12. Les prix unitaires, quantités, montant global, cachets, interventions de tiers et rapport d’accident ne sont ni générés ni transcrits. La future intégration doit distinguer la ligne dentiste des autres professionnels. |

## Feuilles générales inventoriées

Ces deux fonds couvrent des déclarations et prestations que le prototype dentaire ne spécifie pas. Les identités administratives pourraient être relues depuis le patient lorsque le rôle de bénéficiaire est confirmé. Les pièces, dates, statuts, diagnostics et identifiants propres à ces feuilles nécessitent un contrat métier séparé.

| Fond | Libellés et rubriques spécifiques observés | Source possible et éléments hors périmètre |
| --- | --- | --- |
| CNSS maladie | « N° Dossier », « Partie réservée à l’assuré(e) », « N° Immatriculation », « N° CIN », « Conjoint », « Enfant », « Adresse », « Montant des frais », « Nombre de pièces jointes », « Bénéficiaire de soins », naissance et sexe. « INPE et code à barres » avec zones « Médecin traitant » et « Etablissement de soins ». « Hospitalisation », « Maternité », « Accident », « Maladie ». Au verso, « Description des actes effectués », « CIM-10 », biologie, paramédical, ordonnances et dispositifs médicaux, « Prestations et services non pris en charge par l’Organisme Gestionnaire ». | Patient pour identité confirmée. Identité et références d’assuré, établissement et praticiens, codes à barres, catégories, quantité, montant, payeur et prestations hors prise en charge à spécifier. Mentions, signatures, cachets et agence/DAMO restent papier. Le tableau dentaire et son schéma sont absents. |
| CNOPS maladie | « N° Bordereau », « N° Dossier », affiliation, immatriculation, CIN, « Conjoint », « Enfant », bénéficiaire, naissance, sexe, frais, pièces et « N° INP ». « Maladie », « Maternité », « Hospitalisation », « Accident », « Pli confidentiel remis » Oui/Non, « Date de grossesse », « Date prévue d’accouchement », « Date d’hospitalisation », « Date d’accident », « Causes ». Au verso, actes et « CIM - 10 », ordonnances et dispositifs, biologie et paramédical. | Patient pour identité confirmée. Bordereau, dossier, identifiants d’assuré, catégories et détails cliniques nécessitent une saisie et une politique de confidentialité distinctes. Déclarations des deux parties, signatures, cachets, professionnel externe et cadre mutuelle restent papier. Le questionnaire médical ne doit pas être recopié dans le pli. |

## Contraintes de rendu pour une phase ultérieure

Conserver les deux pages, les boîtes, l’orientation, la rotation et les polices locales compatibles avec le texte saisi. Calibrer les positions par original. Respecter la capacité des cellules et des tableaux, sans troncature ni réduction silencieuse du contenu. Contrôler le recto verso et l’échelle physique sur l’imprimante. Consulter les coordonnées et les limites de chaque prototype dans la [cartographie de rendu existante](dental-insurance-form-mapping.md). Vérifier que le SHA-256 du fond chargé correspond à celui de l’instantané finalisé. Laisser les rubriques papier et institutionnelles à leurs auteurs.
