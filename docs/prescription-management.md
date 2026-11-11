# Gestion des ordonnances — phase 6

> État actuel : ce document décrit le prototype synthétique et son PDF. Le [contrat de persistance 8.5C.1](prescription-persistence-contract.md), son [API proposée](prescription-rest-contract.md) et son [plan de tests et de phase 8.5C.2](prescription-acceptance-plan.md) décrivent la cible ; la fondation backend des brouillons est livrée en 8.5C.2A, sans intégration frontend. La [finalisation atomique et le PDF persistant](prescription-finalization-contract.md) sont livrés côté backend en 8.5C.2B.2. Le [pont de rendu privé 8.5C.2B.1](prescription-rendering-bridge.md) réutilise désormais ce même moteur côté serveur, sans modifier le comportement du prototype. Les patients, rendez-vous et consultations réels sont déjà intégrés ; les mentions historiques ci-dessous ne décrivent pas leurs autorisations actuelles.

## Périmètre et parcours

La page Documents rassemble les ordonnances et une section d’information sur les feuilles de soins dentaires CNSS, CNOPS et FAR. Le dentiste peut créer un brouillon, le relire, le modifier et le finaliser explicitement. Il peut aussi ouvrir le modèle vierge pour une saisie manuscrite. Les médicaments et leurs instructions sont saisis par le dentiste.

| Route | Usage |
| --- | --- |
| `/documents` | Ordonnances récentes, recherche patient, filtre de statut et de dates, tri, accès aux deux parcours |
| `/documents?patientId=…` | Historique limité à un patient existant |
| `/documents/ordonnance-vierge` | Aperçu du modèle officiel, téléchargement et demande d’impression |
| `/documents/ordonnances/nouvelle` | Création d’un brouillon |
| `/documents/ordonnances/nouvelle?patientId=…&consultationId=…` | Présélection après vérification des références |
| `/documents/ordonnances/[id]` | Relecture, statut, finalisation, aperçu PDF réel, téléchargement et impression |
| `/documents/ordonnances/[id]/modifier` | Modification du brouillon, état explicite de lecture seule pour une ordonnance finalisée |

Les identifiants absents et les liens patient/consultation incompatibles affichent une erreur avec retour aux documents. Comme dans les phases précédentes, les identifiants mémoire sont résolus côté navigateur. Le serveur de production devra fournir les codes HTTP appropriés.

## Modèles et dépôt partagé

`PrescriptionInput` contient patientId, consultationId facultatif sous forme de chaîne vide, issuedDate, medications et generalInstructions. `Prescription` ajoute un identifiant stable, BROUILLON ou FINALISEE, les horodatages de création et modification, et finalizedAt après finalisation. Chaque `PrescriptionMedication` contient un identifiant stable, medicationName, dosage, frequency, duration et instructions.

Les réponses de santé et les notes cliniques restent dans les dépôts existants. L’identité du patient et la date de sa consultation sont dérivées de leurs références. Les sélecteurs ne reçoivent que le nom, la référence et les téléphones du patient, ainsi que l’identifiant, le patient et la date des consultations.

`PrescriptionRepository` définit list, getById, create, updateDraft et finalize. Le provider est monté à l’intérieur des providers patients et consultations dans le layout du cabinet. Il crée une instance mémoire privée avec copies profondes. Les huit exemples déterministes contiennent quatre brouillons et quatre ordonnances finalisées. Leurs produits et instructions sont explicitement fictifs. Ils ne constituent pas un catalogue de médicaments ou une recommandation.

Les créations et modifications restent visibles pendant la navigation Next.js. Le rechargement ou la sortie du layout recrée les exemples initiaux. Les identifiants de lignes sont conservés lors du tri et des modifications. Un compteur privé évite de réutiliser l’identifiant d’une ligne retirée pendant la session. La création concurrente de plusieurs ordonnances conserve des identifiants distincts.

Les fichiers PDF sont générés à la demande dans le navigateur. Le dépôt conserve les données de saisie uniquement. Les objets Blob et leurs URL restent liés à l’aperçu et leurs URL sont révoquées lors du remplacement ou du démontage du composant. Les téléchargements sont déclenchés explicitement par l’utilisateur.

## Validation et cycle de vie

Le patient existant et une date valide sont requis pour enregistrer un brouillon. Les lignes peuvent rester incomplètes. La date initiale est la date courante à Casablanca, y compris depuis une consultation ancienne. Si le dentiste choisit une date passée, le formulaire le signale. La confirmation de finalisation reprend toujours la date choisie.

Les limites de développement sont de 20 lignes, 200 caractères pour le nom, 300 pour la posologie, 200 pour la fréquence et la durée, 1 500 pour les instructions d’une ligne et 2 000 pour les instructions générales. Elles encadrent la saisie et ne garantissent pas que le texte tienne sur la page A5. La vérification de mise en page utilise ensuite la police réelle.

BROUILLON permet l’ajout, la modification, le retrait confirmé et le déplacement des lignes avec des boutons accessibles au clavier. Le patient est conservé après création. Une consultation facultative peut être choisie parmi celles de ce patient. Une consultation peut recevoir plusieurs ordonnances.

La finalisation exige au moins une ligne et impose le nom, la posologie, la fréquence et la durée sur chaque ligne. Le dépôt revalide les références, exécute un contrôle de génération PDF puis relit le brouillon avant l’écriture. Un changement concurrent du contenu pendant ce contrôle entraîne un refus et une demande de relecture. Une erreur de mise en page conserve le brouillon.

FINALISEE enregistre finalizedAt et verrouille le contenu. Les écritures et nouvelles finalisations sont refusées par le dépôt mémoire. L’interface affiche la date de finalisation et retire la commande de modification. Les corrections, annulations, signatures et leur audit nécessiteront un parcours serveur dédié. La finalisation du prototype ne constitue pas une signature électronique.

## Modèle PDF officiel

La source est `docs/references/pdf-templates/ordonnance-a5.pdf`, titre interne `Ordonnance_Kaoutar_A5`, une page, rotation 0°. Son empreinte SHA-256 est `9b988a24085101a888a9feac3271dd7e76e310dfff264abb7f1ce27d8a8d0bdd`. La copie statique sous `frontend/public/pdf-templates/ordonnance-a5.pdf` porte la même empreinte.

La page mesure 419,25 × 595,499986 points, soit 147,9021 × 210,0792 mm. Le fichier diffère donc légèrement de 148 × 210 mm. Les dimensions mesurées sont conservées, avec cet écart d’arrondi d’export indiqué dans l’interface. Le MediaBox et le CropBox commencent à `(0 ; 8,580014)` et se terminent à `(419,25 ; 604,08)`. Cet offset vertical est pris en compte pour les ajouts.

Le modèle porte déjà la marque, les coordonnées, l’en-tête bilingue, le titre ORDONNANCE, le champ Date, le filigrane et le pied de page. Ces éléments restent dans les flux d’origine. La génération numérique charge le PDF fourni et ajoute du texte en surcouche. Le document vierge est retourné octet pour octet après vérification de ses dimensions et de son nombre de pages. Il ne crée aucune entrée patient ou ordonnance.

## Police et bibliothèque

La génération utilise `pdf-lib` 1.17.1 et `@pdf-lib/fontkit` 1.1.1. Le service est chargé à la demande pour l’aperçu ou la vérification avant finalisation. La police Liberation Sans Regular fournie localement est incorporée en sous-ensemble dans les ordonnances numériques. Elle couvre les caractères français testés, notamment é, è, à, ç et œ. Sa licence SIL Open Font License 1.1 est conservée dans `frontend/public/fonts/LiberationSans-LICENSE.txt`.

La police provient du fichier système `LiberationSans-Regular.ttf` fourni par le paquet `liberation-sans-fonts`. Elle sert uniquement aux PDF. La typographie système de l’application reste celle du design system. La génération refuse un caractère absent de cette police avec une erreur explicite. La prise en charge de toutes les écritures, notamment une mise en page arabe avec bidirectionnalité, nécessitera une validation dédiée.

L’approche de chargement du document et d’incorporation des polices suit les exemples du projet pdf-lib. Les ressources sont chargées depuis la même application, et les données d’ordonnance restent dans le navigateur. [Documentation pdf-lib](https://github.com/Hopding/pdf-lib/blob/master/README.md), [fontkit pour pdf-lib](https://github.com/Hopding/fontkit).

## Coordonnées et débordement

`src/lib/prescriptions/pdf/layout.ts` centralise les positions. Elles sont exprimées depuis le bas à gauche du CropBox visible, en points. Le moteur ajoute ensuite l’origine réelle du CropBox pour obtenir les coordonnées PDF absolues.

| Élément | Position ou limite |
| --- | --- |
| Date | x = 60, ligne de base y = 437, corps 8,5 pt, au-dessus des points préimprimés |
| Patient | x = 28, ligne de base y = 388, corps 10 pt, largeur 363 pt, au plus deux lignes |
| Indicateur BROUILLON - À VALIDER | x = 28, ligne de base y = 370, corps 10 pt |
| Corps de l’ordonnance | x = 28 à 391, première ligne de base y = 348, corps 10 pt |
| Interligne et espacement | 14 pt entre lignes, 5 pt entre paragraphes |
| Dernière ligne de base autorisée | y = 86, au-dessus du pied de page qui commence vers y = 67 |

Un nom sur deux lignes décale le marqueur et le corps de 13 pt vers le bas. Le nom dépassant deux lignes est refusé. Les retours à la ligne sont conservés, les mots longs sont répartis sur plusieurs lignes et tous les caractères doivent être pris en charge. Le moteur calcule la position de toutes les lignes avant leur dessin.

La stratégie de cette phase est une seule page. Un dépassement affiche une erreur et bloque la génération ainsi que la finalisation. Aucun texte d’instruction n’est tronqué. Une stratégie de continuation avec répétition du modèle, repérage patient et pagination demandera une validation ultérieure du cabinet. Le nombre de médicaments effectivement imprimable dépend de la longueur du texte saisi.

L’indicateur BROUILLON est un ajout bien visible dans la zone d’écriture. Il ne remplace pas le filigrane graphique d’origine. Les coordonnées réservées au corps sont identiques entre brouillon et document finalisé.

## Aperçu, téléchargement et impression

`PdfPreview` génère les octets, crée une URL Blob et affiche le PDF réel dans un iframe titré, à travers le lecteur du navigateur. Il propose le téléchargement, la demande d’impression et l’ouverture dans un nouvel onglet. Une erreur de ressource ou de génération peut être réessayée. Un lien de téléchargement reste disponible quand le navigateur ne sait pas afficher le lecteur intégré.

Le bouton Imprimer appelle la commande d’impression de la fenêtre PDF. La présence d’un iframe chargé ne garantit pas que tous les navigateurs ouvrent leur fenêtre d’impression. Le lien d’ouverture fournit un second chemin vers les commandes du lecteur.

Les instructions demandent A5 et 100 % ou Taille réelle. Le PDF conserve son format et indique au lecteur de ne pas appliquer une mise à l’échelle automatique. Les formats physiques disponibles et l’impression finale dépendent du navigateur, du pilote et de l’imprimante. Les tests automatisés vérifient le déclenchement de la demande d’impression, avec un espion remplaçant la commande native. La sortie sur une imprimante physique reste à valider au cabinet.

## Intégrations et confidentialité

La vue clinique patient et le dossier de questionnaire proposent l’historique des ordonnances, leur statut, leurs liens de consultation et un accès à l’aperçu/téléchargement. La création présélectionne le patient. La fiche administrative conserve son entrée vers l’espace dentiste.

Les détails d’une consultation présentent ses ordonnances et l’action Créer une ordonnance. Le patient et la consultation sont présélectionnés après vérification. Le contenu clinique et le plan de traitement ne remplissent aucune ligne de médicament. Les statuts de consultation et d’ordonnance évoluent séparément.

Les listes d’historique présentent des métadonnées et des liens. Les médicaments restent dans les écrans de détail, de saisie et de PDF. Les résumés de rendez-vous, l’annuaire administratif et le tableau de bord conservent leurs données administratives.

Ces routes sont des écrans libres de prototype. Les projections ne fournissent aucune autorisation. Les fixtures sont dans le bundle. Le futur backend devra vérifier les sessions et le rôle DENTIST pour l’édition et la finalisation, limiter les données accessibles à RECEPTIONIST, revalider les relations et les champs, tracer les corrections et sécuriser les téléchargements, le stockage et les sauvegardes.

L’identité imprimée est dérivée du dossier patient au moment de la génération. Une modification ultérieure de l’identité peut donc changer son affichage lors d’une nouvelle génération, même pour une ordonnance finalisée. Le backend devra définir un instantané documentaire autorisé et une politique de régénération avec historique. Les instructions et médicaments de la prescription finalisée restent verrouillés dans le prototype.

## Feuilles de soins dentaires

Les formulaires dentaires CNSS, CNOPS et FAR font l’objet de [la cartographie dédiée](dental-insurance-form-mapping.md). Elle précise les dimensions natives, les rotations, les champs, leurs sources, les zones de signature/cachet et les conventions dentaires. Les coordonnées sont des repères documentaires à calibrer avant une future phase de remplissage.

Les formulaires généraux CNSS/CNOPS restent des références secondaires. La rubrique Feuilles de soins dentaires de Documents est informative. Les notices et instructions françaises de l’interface ont été relues manuellement selon les principes Unslop. Les libellés officiels et les instructions médicales saisies restent préservés.

## Fichiers créés ou modifiés

| Chemin | Contenu |
| --- | --- |
| `frontend/src/lib/prescriptions/` | Modèles, schémas, dépôt, projections, filtres et tris |
| `frontend/src/lib/prescriptions/pdf/` | Chargeur local, service, positions et rendu du PDF officiel |
| `frontend/src/data/prescriptions.ts` | Huit ordonnances fictives déterministes |
| `frontend/src/components/prescriptions/` | Provider, requêtes, états, annuaire Documents, formulaire et lignes, détails, aperçu et historique lié |
| `frontend/src/app/(cabinet)/documents/` | Routes de liste, saisie, détail, modification et modèle vierge |
| `frontend/public/pdf-templates/ordonnance-a5.pdf` | Copie binaire du modèle officiel vierge |
| `frontend/public/fonts/` | Police PDF locale et licence |
| `frontend/src/app/(cabinet)/layout.tsx` | Provider partagé d’ordonnances |
| `frontend/src/app/(cabinet)/[module]/page.tsx` | Réservation du module Documents |
| `frontend/src/components/consultations/consultation-details.tsx` | Historique et création depuis une consultation |
| `frontend/src/components/consultations/patient-clinical-overview.tsx` et `components/patients/patient-profile.tsx` | Historique dans les écrans dentiste du dossier patient |
| `frontend/src/lib/navigation.ts`, `components/shell/` | Description Documents et indication de phase 6 |
| `frontend/package.json`, `frontend/pnpm-lock.yaml` | pdf-lib et fontkit |
| `.gitignore` | Exception pour les fixtures synthétiques de `frontend/src/data/` |
| `frontend/tests/prescriptions.test.mjs` | Règles de domaine, relations, cycle et concurrence |
| `frontend/tests/prescription-components.test.mjs` | Rendu des statuts, historique, états et parcours vierge |
| `frontend/tests/prescription-pdf.test.mjs` | Dimensions, copie vierge, rendu, accents, contenu, placement et débordement |
| `frontend/tests/browser/prescriptions.test.mjs` | Parcours Chromium d’ordonnances |
| `frontend/tests/browser/browser-harness.mjs` | Exclusion des ressources internes du lecteur PDF Chrome du contrôle des requêtes externes |
| `docs/prescription-management.md`, `docs/dental-insurance-form-mapping.md`, `docs/ui-component-guidelines.md`, `README.md` | Architecture, cartographie et validation |

Les trois nouveaux PDF dentaires fournis par l’utilisateur restent des références originales, avec les empreintes documentées. Ils n’ont pas été modifiés.

## Vérification

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm test
pnpm test:browser
```

Les tests PDF utilisent pdf-lib pour vérifier les documents et Poppler quand il est disponible pour extraire le texte et vérifier les positions. Les binaires Poppler sont requis pour ces contrôles d’extraction supplémentaires. `PRESCRIPTION_PDF_QA_DIR=/tmp/sijilmassa-phase6/generated pnpm test` permet de conserver les cinq exemples fictifs destinés à l’inspection. En usage normal et sans cette option, les seuls fichiers temporaires d’extraction sont supprimés après le test.

Le fichier de tests navigateur démarre et arrête son serveur sur le port 3103. Le harnais accepte un navigateur déjà installé via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` et un serveur existant via `PATIENTS_TEST_BASE_URL`. `PRESCRIPTION_SCREENSHOT_DIR` choisit le répertoire des captures, sinon `/tmp/sijilmassa-prescriptions-phase6` est utilisé.

### Résultats de validation

Les commandes exécutées avec succès sont `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` et `pnpm test`. Les 81 tests passent, dont les 60 tests des phases précédentes. Les vérifications PDF couvrent la copie vierge identique, les dimensions et le nombre de pages, les accents français, le contenu, les brouillons, la finalisation, l’enroulement du texte, les positions de date/patient avec le décalage du CropBox et le refus de débordement ou de caractères non couverts.

La commande navigateur exécutée est `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/home/sakhadir/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome pnpm test:browser`. Les dix parcours passent. Ils comprennent les sept parcours antérieurs et trois parcours d’ordonnances. Les nouveaux parcours vérifient la création depuis une consultation, la présélection patient, la saisie incomplète, la modification, le déplacement et le retrait de lignes, la confirmation au clavier, la lecture seule, le PDF réel, le téléchargement, l’appel à l’impression, les filtres, les identifiants absents et la réinitialisation au rechargement. Les contrôles ne détectent aucune requête réseau externe ni erreur JavaScript dans ces parcours. Les ressources internes `chrome:` et `chrome-extension:` du lecteur PDF sont distinguées des requêtes de l’application.

Les cinq exemples vierge, brouillon, finalisé, à plusieurs médicaments et à texte long ont été rendus avec Poppler puis inspectés visuellement. Une comparaison d’images confirme des pixels identiques dans les régions d’en-tête et de pied de page retenues sur les quatre rendus numériques comparés au modèle vierge, au même facteur de rendu. Cette vérification porte sur ces régions et ces exemples. Le filigrane, les accents, les retours à la ligne, le marqueur de brouillon et le dégagement du pied de page ont été inspectés. `pdffonts` confirme les polices incorporées dans le document produit.

L’annuaire Documents a été vérifié à 1440, 1280, 768, 390 et 320 px. Les captures de l’annuaire, du formulaire mobile et du lecteur PDF ont été inspectées. Les 16 jetons canoniques, l’empreinte du logo et les sept empreintes PDF de référence sont conservés. La copie publique du modèle vierge est identique à la source.

Le scanner Unslop installé a indiqué `non_english: true` sur la documentation française. La vérification éditoriale a donc été menée manuellement. Les données cliniques et les libellés officiels restent préservés.

Les limites restantes sont la mémoire par onglet, l’identité patient dérivée lors d’une régénération, les écritures non couvertes par la police PDF, une seule page par ordonnance et la validation d’impression physique à effectuer au cabinet. Les cartographies d’assurance sont des relevés documentaires approximatifs à calibrer avant une future implémentation.
