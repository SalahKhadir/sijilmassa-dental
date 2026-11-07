# Gestion des feuilles de soins dentaires (CNSS, CNOPS, FAR) — Phases 9.1 à 9.3

Ce document formalise la fondation de données et la vérification des gabarits pour les feuilles de soins dentaires marocaines (CNSS, CNOPS, FAR) dans l’ERP de cabinet dentaire Sijilmassa Dental.

---

## 1. Contexte & principes fondamentaux

Dans un cabinet dentaire au Maroc (ex. Témara), les patients bénéficient de régimes d’assurance maladie obligatoires ou mutuelles spécifiques :
- **CNSS** : Caisse Nationale de Sécurité Sociale (AMO des salariés du secteur privé).
- **CNOPS** : Caisse Nationale des Organismes de Prévoyance Sociale (AMO du secteur public).
- **FAR** : Mutuelle des Forces Armées Royales (couverture des militaires et ayants droit).

### Séparation stricte entre faits cliniques et déclarations d’assurance
1. **Intégrité clinique** : Les dossiers patients, consultations médicales et historiques de soins restent la source clinique primaire et ne sont jamais altérés par les démarches d’assurance.
2. **Absence d’inférence automatique** : Le système ne déduit jamais arbitrairement un code NGAP (ex. `SC12`, `SPR50`), une lettre clé, un coefficient ou un numéro de dent à partir d’une note textuelle libre.
3. **Distinction assuré / bénéficiaire** : Le patient soigné n'est pas nécessairement l'assuré principal (cas du conjoint ou des enfants à charge). L’identité de l’assuré et son lien de parenté sont recueillis explicitement.
4. **Validation explicite par le praticien** : Chaque acte porté sur la feuille de soins dentaires est vérifié par le chirurgien-dentiste avant finalisation.

---

## 2. Modèle de données typé (TypeScript & Zod)

Les types de domaine sont définis dans `frontend/src/lib/insurance/types.ts` et validés par les schémas Zod dans `frontend/src/lib/insurance/schema.ts`.

### 2.1. Organismes d'assurance (`InsuranceProvider`)
```typescript
export const insuranceProviders = ["CNSS", "CNOPS", "FAR"] as const;
export type InsuranceProvider = (typeof insuranceProviders)[number];
```

### 2.2. Couverture d'assurance du patient (`PatientInsurancePolicy`)
Associe un patient à une police d'assurance active ou archivée :
- `patientId` : identifiant du patient bénéficiaire.
- `provider` : CNSS, CNOPS ou FAR.
- `registrationNumber` : N° d’immatriculation.
- `affiliationNumber` : N° d’affiliation (spécifique à la CNOPS).
- `militaryAccountNumber`, `militaryRank`, `militaryUnit` : N° de compte, grade et unité militaire (spécifiques aux FAR).
- `insuredPerson` :
  - `isPatient` : booléen indiquant si le patient est l'assuré principal.
  - `firstName`, `lastName`, `cin`, `phone`, `address`.
  - `relationship` : `LUI_MEME`, `CONJOINT`, `ENFANT`, `AUTRE`.
- `active` : état actif de la police.

### 2.3. Acte dentaire d'assurance (`DentalInsuranceAct`)
Représente une ligne d'acte sur le tableau officiel :
- `treatmentDate` : date du soin (format AAAA-MM-JJ).
- `toothReference` : numéro de dent (notation FDI, ex. `16`, `24`).
- `description` : désignation de l’acte dentaire.
- `actCode` : code de l’acte (ex. `SC12`, `SPR50`, `D10`).
- `ngapKeyLetter` : lettre clé de la nomenclature (ex. `SC`, `SPR`, `D`).
- `ngapCoefficient` : coefficient multiplicateur (ex. `12`, `50`).
- `amountMinor` : montant facturé en centimes d'entier (préservation de la précision monétaire sans virgule flottante binaire).
- `sourceTreatmentId` : lien optionnel de traçabilité vers le soin clinique d'origine.

### 2.4. Brouillon de feuille de soins (`InsuranceDocumentDraft`)
Document d'assurance en cours de constitution :
- `provider` : CNSS, CNOPS ou FAR.
- `documentPurpose` : `EXECUTION` (remboursement après soins) ou `ENTENTE_PREALABLE` (devis / demande d'accord).
- `status` : `BROUILLON` ou `VALIDE`.
- `acts` : tableau de `DentalInsuranceAct`.
- `cnssDetails` : types de soins (600, 626, 650, 675), accord préalable, date d'accident.
- `cnopsDetails` : types de soins (1023746, 1370746, 1023776, 1370776), code CIM-10, accord préalable, causes d'accident.
- `farDetails` : objet (Devis vs Reçus), nature des soins (Soins vs Prothèse), contexte (Maladie, Maternité, Accident).
- `manualFields` : décompte des pièces jointes, lieu et date de déclaration, total des frais calculé.

---

## 3. Architecture frontend & persistance en mémoire

Conformément à la directive du projet local-first :
1. **Dépôt en mémoire isolé** : `createInMemoryInsuranceRepository` gère les polices et brouillons avec clonage profond (`structuredClone`), isolation des mutations directes, et validation de l'existence des patients.
2. **Survie aux navigations client** : Le `InsuranceProvider` est monté dans `(cabinet)/layout.tsx` et conserve l'état pendant la session sans écriture dans le `localStorage` non autorisé.
3. **Fixtures synthétiques déterministes** : `frontend/src/data/insurance.ts` fournit des polices et brouillons d'exemple avec des données explicitement fictives.

---

## 4. Intégration dans l'interface utilisateur

### 4.1. Dossier Patient (`/patients/[id]`)
- Composant `PatientInsuranceSection` affiché dans l'onglet *Informations personnelles*.
- Présentation de la couverture active (organisme, immatriculation, affiliation, assuré principal).
- Dialogue accessible `InsurancePolicyDialog` pour créer ou modifier la police.
- Liste des feuilles de soins déjà préparées pour ce patient avec montant total, statut et actions rapides.

### 4.2. Centre de Documents (`/documents`)
- Composant `DocumentsInsuranceSection` présentant les trois régimes officiels (CNSS, CNOPS, FAR).
- Tableau récapitulatif des dossiers d'assurance préparés pour l'ensemble du cabinet.
- Bouton de création rapide menant au formulaire.

### 4.3. Formulaire complet de feuille de soins (`/documents/assurances/nouvelle` et `[id]`)
- Composant `InsuranceDraftForm` avec structure en colonnes :
  - **Volet administratif** : sélection du patient, détection automatique de la police, choix de l'objet (entente préalable vs exécution).
  - **Spécificités de l'organisme** : cases à cocher officielles de la CNSS/CNOPS/FAR, accord préalable, diagnostic CIM-10.
  - **Tableau des actes dentaires** : saisie en temps réel avec calcul automatique des honoraires totaux en DH.
  - **Importation clinique sécurisée** : panneau latéral permettant d'importer la date et la description d'un soin clinique réalisé sans jamais inventer de cotation.
  - **Mentions légales et praticien** : rappel de l'INP officiel (084209071) et des zones réservées au cachet et à la signature.

---

## 5. Perspectives : Phase 9.2 (Remplissage PDF par surcouche)

La Phase 9.1 a formellement validé les dimensions physiques et orientations des originaux :
- **CNSS** : 728,40 × 1 031,76 pt avec rotation 270°.
- **CNOPS** : 799,44 × 574,08 pt en paysage naturel.
- **FAR** : 842,25 × 595,50 pt avec décalage de boîte `y0 = 8,58 pt`.

Les générateurs de la **Phase 9.2** exploitent les coordonnées calibrées pour superposer le texte vectoriel et les coches sur les gabarits officiels à l'aide de `pdf-lib`, sans altérer les fichiers modèles sous `docs/references/pdf-templates/`.

## 6. Phase 9.2A — PDF CNSS

Le formulaire CNSS propose **Prévisualiser**, **Télécharger le PDF** et **Imprimer**. L’aperçu utilise le PDF officiel de deux pages avec une surcouche, à partir des valeurs actuelles du formulaire, y compris les modifications non enregistrées. Générer un PDF n’enregistre ni ne valide le brouillon. Les actions CNOPS et FAR sont décrites dans leurs sections 9.2B et 9.2C.

Le PDF reprend les identités distinctes de l’assuré et du patient, l’immatriculation, les CIN disponibles, l’adresse de l’assuré, la naissance et le sexe disponibles, le lien de parenté, l’objet, les types de soins sélectionnés, l’INP du dentiste, les informations manuelles d’accord/accident/déclaration et jusqu’à trois actes. Chaque acte reprend seulement les dents FDI explicites, les codes et cotations saisis, la date et les honoraires disponibles. Les signatures et cachets sont toujours à apposer manuellement. La mention précédente annonçant l’apposition automatique du cachet est remplacée dans l’interface.

Les champs facultatifs manquants sont signalés et restent vides. L’absence d’une police liée, de l’immatriculation ou des identités nécessaires, un lien non représentable, une date invalide, une incohérence financière ou un dépassement de zone bloque le PDF. Les cellules et limites de remplissage sont détaillées dans `dental-insurance-form-mapping.md`. Les rubriques non mappées restent à compléter manuellement ; le schéma accepte désormais les sélections FDI confirmées de la phase 9.2A.1 ; aucune codification clinique ni valeur de remboursement n’est inventée.

Les fichiers générés restent en mémoire dans un Blob navigateur. Chaque modification des données invalide l’aperçu et révoque son URL ; quitter le composant la révoque également. Aucun PDF patient n’est écrit dans le répertoire public, dans localStorage/IndexedDB ou envoyé à un service externe. Seuls le gabarit vierge et la police embarquée sont chargés depuis la même application. Le téléchargement demandé par l’utilisateur crée sa propre copie locale.

L’impression dépend du lecteur PDF du navigateur. Si elle échoue ou si le lecteur intégré n’est pas disponible, télécharger le fichier et l’ouvrir dans un lecteur PDF local. Le document conserve son format natif hors A4 et demande l’absence de mise à l’échelle ; les réglages du lecteur et de l’imprimante peuvent néanmoins prévaloir. Vérifier l’échelle, le papier et le retournement recto verso sur une feuille d’essai.

Les restrictions de rôle existantes restent celles d’un prototype frontend. Aucun contrôle d’accès serveur ni backend n’est ajouté dans cette phase.

La saisie conserve la différence entre un montant absent et un montant explicite de zéro. Les honoraires sont convertis en centimes par le parseur décimal exact existant. Les champs de déclaration et le nombre de pièces jointes absents restent vides ; aucun lieu ni date de déclaration n’est ajouté par défaut. Les types de soins CNSS absents ne sont pas sélectionnés automatiquement.

Vérifications de cette phase : tests ciblés du domaine et du PDF (`tests/insurance.test.mjs`, `tests/insurance-pdf.test.mjs`), scénario navigateur limité à la CNSS (`tests/browser/insurance.test.mjs`), TypeScript, ESLint et build Next.js. Les exemples PDF de contrôle sont produits uniquement dans le répertoire temporaire indiqué par `CNSS_PDF_QA_DIR`, jamais dans le répertoire public.


## 7. Phase 9.2A.1 — Schéma dentaire CNSS

La section **Schéma dentaire** affiche le dessin officiel de la page 2, les actes du brouillon et leurs références, puis les 52 dents FDI par dentition et quadrant. Le côté droit du patient correspond au repère D imprimé à gauche du lecteur ; le côté gauche correspond à G. Le détail des centres et de la calibration figure dans `dental-insurance-form-mapping.md`.

Chaque case cochée confirme une dent à marquer avec un petit carré évidé. La liste des numéros confirmés reste affichée dans l’interface. Aucune dent n’est précochée à partir d’un acte ou d’un code NGAP. Le praticien vérifie la concordance de ses sélections avec les actes ; la sélection peut être relue et corrigée avant génération du PDF. Les carrés n’ont aucune signification de procédure médicale.

Décocher une dent retire sa marque ; **Effacer les marques** retire toutes les sélections. **Enregistrer en brouillon** conserve `cnssDetails.confirmedTeeth` dans le dépôt en mémoire, au même titre que les autres champs. Les consultations, traitements, lignes d’actes et leurs codes ne sont pas modifiés par cette sélection. Un changement de patient ne transfère pas les marques.

Les marques confirmées sont reprises sur la page 2 du PDF. Toute modification de la sélection invalide l’aperçu précédent. Sans confirmation, le dessin reste vierge. Les deux pages, les dimensions, la rotation, les signatures et les cachets restent préservés. Les anciens brouillons restent compatibles sans migration.

Les contrôles restent ceux du prototype frontend ; cette confirmation manuelle ne constitue pas une autorisation serveur du rôle dentiste. Les symboles propres aux procédures et l’acceptation d’une convention de marquage par l’organisme nécessitent encore une validation métier. La phase 9.2A.1 ne couvrait que la CNSS ; les deux autres organismes sont décrits ci-dessous.

### Fichiers de la phase 9.2A.1

- `frontend/src/lib/insurance/pdf/cnss-chart-mapping.ts` : centres FDI, taille de marque et ordre des quadrants.
- `frontend/src/lib/insurance/pdf/cnss-renderer.ts` : rendu des seules marques confirmées sur la page 2.
- `frontend/src/lib/insurance/types.ts` et `frontend/src/lib/insurance/schema.ts` : sélection CNSS optionnelle et validation des références uniques.
- `frontend/src/components/insurance/cnss-dental-chart.tsx` : aperçu du fond officiel, cases FDI et effacement.
- `frontend/src/components/insurance/insurance-draft-form.tsx` : état de confirmation par patient, sauvegarde et invalidation de l’aperçu PDF.
- `frontend/src/components/insurance/insurance-draft-page.tsx` : remontage du formulaire par identifiant de brouillon.
- `frontend/public/images/cnss-dental-chart.png` : recadrage vierge du schéma officiel pour l’interface.
- `frontend/tests/insurance-chart.test.mjs` : cartographie, validation, dépôt, préservation PDF et comparaison raster.
- `frontend/tests/browser/insurance.test.mjs` : confirmation, retrait, effacement, sauvegarde et invalidation du PDF.
- `docs/dental-insurance-form-mapping.md` et `docs/dental-insurance-management.md` : calibration et workflow.


## 8. Phase 9.2B — PDF CNOPS

La feuille CNOPS dispose désormais de **Prévisualiser la feuille CNOPS**, **Télécharger le PDF** et **Imprimer**, à partir des valeurs actuelles du formulaire. L’aperçu est le PDF officiel de deux pages, avec ses dimensions et son orientation d’origine. Il reste temporaire en mémoire, sans écriture de PDF patient dans le répertoire public, localStorage ou IndexedDB, et sans envoi à un service externe. Les seules ressources chargées sont le gabarit vierge et la police depuis l’application locale.

Avant génération, renseigner la couverture CNOPS liée (identités, affiliation et immatriculation), le bénéficiaire et au moins un acte. Le nouvel **INPE du médecin dentiste** doit être saisi explicitement avec neuf chiffres ; l’INP du cabinet n’est pas copié. Cette entrée est conservée dans `cnopsDetails.practitionerInpe` lors de l’enregistrement du brouillon. Les INP de la page 2 correspondent aux autres professionnels et restent vierges.

Le CIM-10 est facultatif pour ce générateur : s’il est absent, un avertissement accompagne le champ vierge. Le modèle possède trois cellules ; une valeur détaillée telle que `K02.1` bloque le PDF au lieu d’être raccourcie. Le praticien vérifie la catégorie à porter sur ce modèle. Aucun diagnostic ni code de nomenclature n’est proposé à partir d’une description. Le tableau contient neuf actes au maximum ; les dépassements de capacité ou de largeur sont signalés et ne produisent aucun PDF tronqué.

Le **Schéma dentaire** reprend le dessin CNOPS et sa cartographie propre de 52 dents. Les permanentes sont numérotées localement 1–8 ; les cinq dents temporaires par quadrant n’ont pas de chiffres locaux lisibles. L’interface indique cette limite et affiche les références FDI pour la confirmation. Chaque coche est une sélection manuelle ; aucune dent n’est choisie à partir des actes. La liste `cnopsDetails.confirmedTeeth` est indépendante des confirmations CNSS. Décocher ou effacer retire les marques, et enregistrer conserve la sélection dans le dépôt en mémoire. Les actes et les dossiers cliniques ne sont pas modifiés.

Le carré évidé reste un repère provisoire sans signification clinique. Le dentiste doit confirmer sa convention d’usage et vérifier la lisibilité à l’impression. Toute modification des champs ou des sélections invalide l’aperçu et révoque son URL. Le téléchargement produit uniquement la copie locale demandée par l’utilisateur. L’impression dépend du lecteur PDF ; si elle est indisponible, télécharger et ouvrir le fichier dans un lecteur local. Vérifier le papier, l’échelle et le retournement recto verso sur une feuille d’essai.

Le remplissage n’est ni une transmission à l’assurance ni une approbation de remboursement. Les signatures, cachets et zones de validation restent vierges. Le rôle dentiste reste celui du prototype frontend, sans nouvelle autorisation serveur ni backend.

### Fichiers de la phase 9.2B

- `frontend/src/lib/insurance/pdf/cnops-mapping.ts`, `cnops-chart-mapping.ts`, `cnops-validation.ts`, `cnops-renderer.ts`, `cnops-service.ts` : coordonnées, validation et génération CNOPS.
- `frontend/src/lib/insurance/pdf/overlay.ts`, `assets.ts`, `errors.ts` : moteur, formats, ressources locales et erreurs partagés.
- `frontend/src/lib/insurance/pdf/cnss-renderer.ts`, `cnss-service.ts` : utilisation du moteur partagé, sans modification des coordonnées CNSS.
- `frontend/src/lib/insurance/tooth-reference.ts`, `types.ts`, `schema.ts` : domaine FDI commun et champs CNOPS optionnels.
- `frontend/src/components/insurance/insurance-dental-chart.tsx`, `insurance-pdf-actions.tsx` : confirmation et contrôles PDF partagés.
- `frontend/src/components/insurance/cnss-dental-chart.tsx`, `cnss-pdf-actions.tsx` : points d’entrée CNSS conservés.
- `frontend/src/components/insurance/insurance-draft-form.tsx` : saisie INPE, instantané CNOPS et sélection indépendante.
- `frontend/public/pdf-templates/feuille_dentaire_CNOPS.pdf` : copie vierge identique à la référence.
- `frontend/public/images/cnops-dental-chart.png` : recadrage vierge pour l’interface.
- `frontend/tests/cnops-pdf.test.mjs`, `frontend/tests/browser/cnops-insurance.test.mjs` : tests CNOPS ciblés.
- Les deux documents d’assurance : inventaire des champs, décisions de remplissage et limites.


## 9. Phase 9.2C — PDF FAR

Le brouillon FAR propose **Prévisualiser la feuille FAR**, **Télécharger le PDF** et **Imprimer**. Le générateur remplit une copie en mémoire des deux pages officielles, sans changer les dimensions, les boîtes, la rotation ou les volets imprimés. Le décalage vertical de 8,580014 pt est vérifié sur chaque page. Le détail des coordonnées figure dans `dental-insurance-form-mapping.md`.

Renseigner dans la couverture FAR l’identité de l’adhérent, sa CIN, son téléphone, son adresse, son N° de compte FAR, son grade et son unité. Le N° de compte est repris tel quel ; l’application ne suppose pas qu’il s’agit d’un compte bancaire et ne le remplace pas par l’immatriculation. Le bénéficiaire et sa date de naissance viennent de la fiche patient. La relation doit correspondre à l’une des cases imprimées Adhérent, Conjoint ou Enfant.

Dans le brouillon, choisir explicitement **Devis / Reçus**, **Soins / Prothèse** et **Maladie / Maternité / Accident**. Ces choix sont vides à l’ouverture d’un nouveau brouillon. Une absence ne coche aucune case et bloque la génération. Le choix Devis/Reçus barre la mention inutile, comme le demande l’original. Saisir l’INPE du médecin dentiste sur neuf chiffres ; l’INP du cabinet n’est pas utilisé. Saisir aussi les nombres de prospectus et de pièces ainsi que la date de déclaration. Zéro est une quantité explicite valide. Ces nouvelles données restent dans le brouillon en mémoire lors de l’enregistrement.

Le même ensemble d’un à cinq actes apparaît dans le tableau dentaire de page 1 et dans la bande médecin/chirurgien-dentiste de page 2. La limite vient de cette seconde bande. Chaque acte exige une date réelle saisie et des honoraires enregistrés. La référence de dent, le code manuel et le coefficient restent facultatifs, avec avertissement lorsqu’ils manquent. Aucun code ni coefficient n’est proposé à partir d’une description. Les montants sont calculés en centimes entiers ; la déclaration sépare les dirhams des deux centimes autour du séparateur imprimé. Un acte de trop ou un texte trop large bloque le PDF avec un message permettant de corriger la saisie.

### Dents et approbation des symboles

Le **Schéma dentaire** affiche le tableau FAR original, les actes et leurs références, puis les 52 dents FDI imprimées, permanentes et temporaires. Aucune dent n’est sélectionnée automatiquement. Cocher une dent l’ajoute à la liste ; choisir ensuite **Cercle** ou **Croix** pour cette dent. Le dessin et la liste affichent le résultat avant génération. Décocher retire la dent ; **Effacer les marques** vide la sélection.

La notice imprimée associe la croix à la prothèse ou à l’extraction, et le cercle à la dent soignée ou couronnée. Elle ne résout pas le recouvrement entre couronne et prothèse. Le dentiste doit donc choisir chaque symbole et approuver explicitement la sélection ; le logiciel ne déduit aucune procédure des codes ou des dents. Une sélection sans symbole ou sans approbation bloque le PDF marqué. Une sélection vide produit un schéma vierge.

Modifier un acte, une dent ou un symbole retire l’approbation et invalide le PDF temporaire. Le praticien doit relire la sélection avant de l’approuver à nouveau. **Enregistrer en brouillon** conserve `farDetails.toothMarks` et `farDetails.markingApproved` ; la réouverture restitue cette confirmation. Ces modifications ne changent aucune consultation ni aucun traitement. Les sélections CNSS et CNOPS restent indépendantes.

### Zones manuelles et limites

L’ordonnance de page 2 reste entièrement vierge : sa notice exige une rédaction manuscrite, y compris l’identité. Les signatures du dentiste, du patient et des autorités, les cachets, les rubriques d’autres professionnels et les zones de contrôle restent vierges. Le cachet de page 2 avec INPE doit être complété manuellement. Une référence d’accord préalable explicitement saisie reste dans le brouillon avec avertissement ; aucun emplacement suffisamment vérifié ne permet de l’imprimer sur ce modèle.

L’aperçu repose sur le PDF généré réel. Toute modification révoque son URL temporaire. Le téléchargement enregistre uniquement la copie demandée sur le poste ; aucun PDF patient n’est écrit dans `public/`, localStorage ou IndexedDB. Les seules ressources chargées sont le modèle vierge et la police locale, sans transmission externe. Si l’impression intégrée est indisponible, télécharger le fichier et l’ouvrir dans un lecteur local.

Les deux pages de trois exemples fictifs ont été rendues et inspectées, ainsi que les 52 marques et les positions des deux tableaux. Un essai papier reste nécessaire pour le format proche A4 paysage, les marges, l’échelle, le recto verso et le pliage évoqué par la notice. L’acceptation des symboles et la composition du dossier papier sont à confirmer auprès du dentiste et de la mutuelle. Le prototype n’apporte ni soumission à l’assurance, ni remboursement calculé, ni autorisation serveur, ni persistance backend.

### Fichiers de la phase 9.2C

Ajouts :

- `frontend/src/lib/insurance/pdf/far-mapping.ts`, `far-chart-mapping.ts`, `far-validation.ts`, `far-renderer.ts`, `far-service.ts` : coordonnées FAR, contrôle des données et génération.
- `frontend/src/components/insurance/far-dental-chart.tsx` : choix des symboles et approbation.
- `frontend/public/pdf-templates/feuille_dentaire_FAR.pdf` : copie vierge identique à la référence.
- `frontend/public/images/far-dental-chart.png` : recadrage officiel vierge.
- `frontend/tests/far-pdf.test.mjs`, `frontend/tests/browser/far-insurance.test.mjs` : tests ciblés et parcours navigateur.

Adaptations :

- `frontend/src/lib/insurance/pdf/overlay.ts`, `assets.ts`, `errors.ts` : origine vérifiée par page, traits et symboles FAR, chargement local et erreurs.
- `frontend/src/lib/insurance/types.ts`, `schema.ts`, `repository.ts` : champs FAR optionnels sans catégorie par défaut, symboles validés et invalidation de l’approbation après modification.
- `frontend/src/components/insurance/insurance-draft-form.tsx` : saisie des données FAR, état des marques, approbation et enregistrement.
- `frontend/src/components/insurance/insurance-dental-chart.tsx`, `insurance-pdf-actions.tsx` : aperçu large et symboles FAR, actions PDF partagées.
- `docs/dental-insurance-form-mapping.md`, `docs/dental-insurance-management.md` : inventaire et fonctionnement FAR.

Les coordonnées CNSS/CNOPS et les modules de facturation et d’ordonnance ne sont pas modifiés par cette phase. Aucun commit ni push automatique.


## 10. Phase 9.3 — Audit et stabilisation des trois organismes

### Matrice d’audit

Les constats ci-dessous portent sur le frontend et les modèles fournis. La sévérité décrit le risque avant correction ; elle ne constitue pas un incident sur des données réelles. Toutes les données de contrôle sont fictives.

| Organisme | Comportement vérifié | P0 corrigé | P1 corrigé | Couverture ajoutée | Confirmation du dentiste |
| --- | --- | --- | --- | --- | --- |
| CNSS | Immatriculation de l’assuré, liens de parenté, catégories explicites, trois actes, INP du cabinet, deux pages à 270°, 52 centres propres | Changer de patient conservait les actes et déclarations ; les écrans d’assuré distinct pouvaient recopier des données du bénéficiaire | Liens de dépôt insuffisamment vérifiés ; confirmations conservées après modification des actes ; dates impossibles et sommes excessives enregistrables ; tableau de catégories absent pouvant faire échouer le rendu | Isolation, sources, retrait des confirmations, montants, catégorie absente, parcours complet | Acceptation du carré neutre, INP du cabinet, contrôle papier |
| CNOPS | Assuré et bénéficiaire distincts, affiliation/immatriculation séparées, INPE neuf chiffres distinct de l’INP, CIM-10 sur trois cases, neuf actes, 52 centres indépendants | Mêmes risques de changement de patient et de copie d’identité | Mêmes liens, dates, limites monétaires et confirmations après modification d’actes | Même couverture ; régression INPE/CIM-10 et schéma conservée | Carré provisoire ; repérage des temporaires sans chiffres locaux lisibles |
| FAR | Compte, grade, unité, CIN et contact ; cinq actes sur deux volets ; total exact ; deux pages avec origine décalée ; 52 cellules ; cercle/croix approuvés | Mêmes risques d’isolation et d’identité ; la fixture FAR indiquait « lui-même » pour deux identités distinctes | Mêmes liens, dates et limites monétaires ; l’approbation pouvait redevenir active si un texte d’acte était modifié puis rétabli | Même couverture ; persistance, retrait d’approbation et absence de transmission vérifiés | Couronne/prothèse, nature du compte, composition du dossier papier et champs manuels |

### Constats et corrections

- **P0 — Isolation du bénéficiaire.** Le changement de patient d’un nouveau brouillon efface actes, imports, catégories, références d’accord, diagnostic, données de déclaration et marques. Les identifiants de praticien, propres au cabinet, restent disponibles. Les anciennes polices sont retirées immédiatement, et toute police affichée est filtrée par patient et organisme. Revenir au premier patient ne restaure pas le contenu effacé. Le patient d’un brouillon existant reste non modifiable.
- **P0 — Assuré distinct.** Passer du bénéficiaire à un autre assuré dans le dialogue vide son identité et ses coordonnées. Une valeur vide d’un assuré existant ne reprend plus celle du patient. La saisie rapide exige prénom et nom distincts, et ne recopie plus les coordonnées du bénéficiaire. La fixture FAR utilise désormais un conjoint explicitement distinct, sans modifier les deux identités.
- **P1 — Liens et imports.** Création et modification vérifient l’existence du patient, la cohérence patient/organisme de la police, l’appartenance de la consultation et des soins importés. Les deux sources déjà proposées par l’interface sont prises en charge : consultations et historique synthétique de la fiche patient. Les copies d’actes restent éditables sans changement de la source. Une source disparue bloque un nouvel enregistrement ; le brouillon existant reste lisible. Un même identifiant de source ne peut être importé deux fois dans le même brouillon. Supprimer la ligne importée permet de l’importer à nouveau. Aucun rapprochement approximatif entre deux sources différentes n’est inventé.
- **P1 — Entités liées.** Une police ne change pas de patient. Si elle est liée à un brouillon, son organisme ne peut pas changer et sa suppression est bloquée avec un message affiché. La délier permet sa suppression. L’archivage reste possible : il n’efface ni la police ni le brouillon. Une autre couverture du même organisme peut être choisie lorsqu’il en existe plusieurs. Le dépôt refuse aussi l’écrasement d’un brouillon par réutilisation de son identifiant.
- **P1 — Confirmation du schéma.** Ajouter, importer, modifier ou retirer un acte efface les confirmations CNSS/CNOPS et retire l’approbation FAR. Changer de police ou d’organisme retire également la confirmation. Revenir au texte précédent ne rétablit jamais l’approbation FAR. Les gardes du dépôt retirent les confirmations conservées implicitement ; une liste explicitement renvoyée constitue une nouvelle confirmation par l’appelant, sans authentifier son rôle. L’interface exige de cocher à nouveau les dents neutres ou d’approuver à nouveau les symboles FAR.
- **P1 — Dates et argent.** Les dates de soin, d’accident et de déclaration saisies sont des dates calendaires valides. Une date absente lors de l’import n’est plus remplacée par celle du jour. Les montants et quantités sont bornés aux entiers sûrs. Les sommes utilisent des entiers exacts ; un dépassement affiche une erreur et bloque l’enregistrement/génération au lieu de faire échouer l’écran. Lorsque tous les honoraires sont renseignés, un total manuel différent est refusé dès le schéma du brouillon. Le coefficient explicite zéro est préservé à l’enregistrement. Les limites physiques des cellules peuvent bloquer un grand montant pourtant valide mathématiquement.
- **P1 — Catégories CNSS.** Un objet de détails sans tableau de catégories produit les cases vides et un avertissement, sans exception. Les régressions de catégories explicites des trois organismes restent actives.
- **P2 — Données de démonstration et avertissements.** Le faux lien `demo-treatment-001-1`, absent du dossier clinique, est retiré de la fixture CNSS ; son acte reste une saisie manuelle fictive. Une référence de dent CNSS qui n’est pas une FDI unique est signalée explicitement et la cellule reste vide. Aucun numéro n’est deviné.

### Exigences du modèle et validation technique

| Organisme | Minimum technique de génération | Mentions imprimées à prendre en compte | Intervention manuelle / exigence non vérifiée |
| --- | --- | --- | --- |
| CNSS | Patient, identités, police CNSS liée, immatriculation, lien représentable, un à trois actes, dates et montants valides lorsqu’ils sont saisis | Cocher la mention utile ; la feuille demande l’identité du malade, les actes, les dates et les interventions des signataires | Données absentes signalées sans valeur inventée ; codes/cotations à vérifier ; cachets, signatures, remboursements et autres professionnels manuels. Aucune obligation générale de remplir toutes les rubriques n’est déduite des astérisques |
| CNOPS | Patient, identités, police liée, affiliation, immatriculation, lien représentable, INPE neuf chiffres, un à neuf actes ; CIM-10 absent ou catégorie explicite sur trois cases | Notice demandant feuille renseignée/signée, identifiant du praticien et dates ; téléphone explicitement optionnel | Les champs absents sont signalés avant impression ; cachets et signatures manuels. Aucun code détaillé n’est abrégé, aucun diagnostic n’est inventé |
| FAR | Patient, naissance, police liée, identité/CIN/contact/adresse de l’adhérent, compte, grade, unité, lien représentable, objet/nature/contexte explicites, INPE neuf chiffres, quantités, déclaration, un à cinq actes avec honoraires | Le volet maladie indique que tous les champs sont à renseigner ; les champs automatisables identifiés sont contrôlés, et les espaces réservés restent manuels | Signature adhérent, identité/signature du correspondant, contrôle médical, ordonnance manuscrite et cachets avec INPE à compléter selon leur destinataire. La portée de la note aux soins sans objet et la composition papier restent à confirmer |

Un avertissement n’est pas une validation de recevabilité. Les actions PDF présentent les éléments à vérifier avant impression. Le statut `VALIDE` reste celui du prototype : il ne certifie ni rôle dentiste, ni complétude administrative, ni autorisation de l’assureur. Une copie téléchargée ne peut pas être révoquée par les modifications ultérieures ; l’application révoque uniquement son URL d’aperçu temporaire.

### Confidentialité et préparation du backend

Le contrôle du code d’assurance et les parcours navigateur ne montrent ni journalisation des données, ni identifiant d’assurance dans les URL, ni appel externe, ni écriture localStorage/sessionStorage. Les PDF générés restent temporaires ; `public/` ne contient que les modèles vierges et les ressources statiques. Le téléchargement explicite crée la copie demandée sur le poste. Les fixtures sont synthétiques. Ces contrôles du prototype ne valent pas preuve de conformité juridique ou d’acceptation par un organisme.

Le backend devra assurer : authentification et sessions sécurisées ; autorisations serveur par rôle et patient sur chaque ressource ; cloisonnement des données cliniques du secrétariat ; contraintes de clés étrangères et de précision monétaire ; gestion transactionnelle et contrôle de concurrence des modifications ; version et empreinte des modèles ; instantané durable des identités, actes et confirmations au moment de la finalisation ; métadonnées et historique d’audit sans données médicales inutiles dans les journaux ; génération/téléchargement autorisés avec politique de cache adaptée ; rétention, suppression, sauvegardes et restauration testée. Les déclarations de confirmation du frontend ne sont pas une preuve d’identité ou d’habilitation. Aucune de ces fonctions serveur n’est implémentée dans cette phase.

### Contrôle physique avant utilisation

1. Utiliser une feuille fictive par organisme, vérifier les deux pages et le format natif ; ne pas forcer les trois modèles en A4.
2. Vérifier l’échelle, les marges, l’absence de rognage, la rotation CNSS, le décalage FAR et la lisibilité des petits champs.
3. Contrôler les identités, cases, codes, dates, centimes et total ; vérifier les dents permanentes/temporaires dans chaque quadrant.
4. Tester le retournement recto verso et le pliage FAR avec l’imprimante du cabinet.
5. Confirmer les symboles et les pièces attendues avec le dentiste ; compléter les zones manuscrites, signatures et cachets par les personnes concernées.

### Fichiers de la phase 9.3

- `frontend/src/components/insurance/insurance-draft-form.tsx` : isolation, choix de couverture, invalidation des confirmations, imports et sommes exactes.
- `frontend/src/components/insurance/insurance-policy-dialog.tsx`, `patient-insurance-section.tsx` : identité distincte et erreur de suppression liée.
- `frontend/src/lib/insurance/repository.ts`, `schema.ts` : validation des liens, dates, doublons, montants et confirmations.
- `frontend/src/lib/insurance/pdf/overlay.ts` : somme exacte et contrôle des montants.
- `frontend/src/lib/insurance/pdf/cnss-renderer.ts`, `cnops-validation.ts`, `far-validation.ts` : catégories absentes, avertissement FDI et erreurs de total.
- `frontend/src/data/insurance.ts` : correction des liens et de la relation des fixtures uniquement.
- `frontend/tests/insurance-audit.test.mjs`, `frontend/tests/browser/insurance-audit.test.mjs` : nouveaux contrôles transversaux et parcours complets.
- `frontend/tests/insurance-chart.test.mjs`, `cnops-pdf.test.mjs`, `far-pdf.test.mjs` : dépôts de test avec leurs polices liées et identifiant neuf lors d’une création.
- Les deux documents d’assurance : constats, exigences, résultats et limites.

Les modèles officiels, coordonnées dentaires, facturation et PDF d’ordonnance restent inchangés. Aucun backend, dépendance, commit ou push n’est ajouté.


### Résultats de validation de la phase 9.3

- **56 tests d’assurance réussis**, dont dix nouveaux tests transversaux. Commande depuis `frontend/` : `INSURANCE_AUDIT_QA_DIR=/tmp/insurance-audit node --import tsx --test --experimental-test-isolation=none tests/insurance-audit.test.mjs tests/insurance.test.mjs tests/insurance-pdf.test.mjs tests/insurance-chart.test.mjs tests/cnops-pdf.test.mjs tests/far-pdf.test.mjs`.
- **Huit scénarios navigateur réussis** : quatre régressions existantes, trois nouveaux parcours complets, puis un test ciblé de bascule entre deux couvertures du même patient et de récupération après dépassement de total. Les sept premiers tournent ensemble ; le dernier est lancé seul avec `--test-name-pattern='switching same-patient policies'`. Seule la suite d’assurance est exécutée, sans relancer toute la suite navigateur du dépôt.
- `pnpm exec tsc --noEmit`, `pnpm lint` et build de production (`node node_modules/next/dist/bin/next build`) réussis. `git diff --check` ne signale aucune erreur d’espacement.
- Un PDF fictif marqué par organisme, soit **six pages rendues et inspectées**, avec vérification complémentaire des modèles octet par octet et de leurs empreintes SHA-256. Les résultats visuels détaillés figurent dans le document de cartographie.

Les constats vérifiés P0/P1 décrits ci-dessus sont corrigés dans le périmètre frontend testé. Les conventions cliniques, l’essai papier, l’acceptation administrative et les protections serveur restent les validations distinctes décrites plus haut.
