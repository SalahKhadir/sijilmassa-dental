# Gestion des feuilles de soins dentaires (CNSS, CNOPS, FAR) — Phase 9.1

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

La future **Phase 9.2** exploitera ces coordonnées calibrées pour superposer le texte vectoriel et les coches sur les gabarits officiels à l'aide de `pdf-lib`, sans altérer les fichiers modèles sous `docs/references/pdf-templates/`.

## 6. Phase 9.2A — PDF CNSS

Le formulaire CNSS propose **Prévisualiser**, **Télécharger le PDF** et **Imprimer**. L’aperçu utilise le PDF officiel de deux pages avec une surcouche, à partir des valeurs actuelles du formulaire, y compris les modifications non enregistrées. Générer un PDF n’enregistre ni ne valide le brouillon. CNOPS et FAR ne proposent pas ces actions.

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

Les contrôles restent ceux du prototype frontend ; cette confirmation manuelle ne constitue pas une autorisation serveur du rôle dentiste. Les symboles propres aux procédures et l’acceptation d’une convention de marquage par l’organisme nécessitent encore une validation métier. Aucun support CNOPS/FAR n’est ajouté.

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
