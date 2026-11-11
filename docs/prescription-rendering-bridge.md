# Rendu privé des ordonnances — phase 8.5C.2B.1

> État après 8.5C.2B.2 : le [contrat de finalisation](prescription-finalization-contract.md) décrit désormais le stockage atomique et les téléchargements. Le présent document conserve les décisions et résultats historiques du pont privé 8.5C.2B.1.


## Décision d’architecture

Le contrat approuvé prévoit un processus Node local lancé par Java. L’examen du dépôt confirme que `backend/compose.yml` ne fournit que PostgreSQL de développement ; aucun script de déploiement applicatif n’existe. Next et Spring sont deux processus sur le poste hôte, et le second PC utilise uniquement le navigateur. Le moteur PDF accepte déjà des octets de ressources et ne dépend pas du navigateur ; seul son service de chargement utilise des fetchs relatifs.

| Critère | A — Endpoint privé Next | B — Service Node permanent | C — Worker invoqué par Java |
| --- | --- | --- | --- |
| Réemploi | Moteur existant | Moteur existant | Moteur existant, compilé avec TypeScript |
| Réseau et authentification | Next est prévu pour l’accès LAN ; une route « interne » partage ce serveur et exige isolation réseau et authentification supplémentaires | Listener local, authentification et supervision à créer | Pipes privés du processus enfant ; aucune route, port ou secret réseau |
| Deux PC et déploiement | Dépend de Next et de ses règles de routage | Troisième service à installer et surveiller sur l’hôte | Node et bundle locaux sur l’hôte Spring ; rien sur le PC d’accueil |
| Démarrage/arrêt | Couplé au cycle Next | Service à démarrer et arrêter séparément | Un processus par rendu, arrêt en finally et au timeout |
| Fiabilité/erreurs | Panne Next affecte le rendu, erreurs HTTP et redirections à contrôler | État durable et connexions à gérer | État jetable, sortie bornée, aucune reprise automatique |
| Performance | Processus chaud, requête réseau supplémentaire | Processus chaud | Coût de démarrage Node, acceptable pour un cabinet ; une génération simultanée |
| Maintenabilité/tests | Route server-only et tests réseau en plus du moteur | Nouveau service et protocole réseau | Adaptateur Java et worker testables séparément, même fonction de rendu |
| Compatibilité PDF | Adaptateur autour du moteur | Adaptateur autour du moteur | Adaptateur autour du moteur ; comparaison structurelle et visuelle |

**Choix C**, conforme aux décisions A–E approuvées. A et B ajoutent une surface réseau et un cycle de service sans besoin démontré. Le worker ne devient pas un microservice. La frontière de confiance est le code et les ressources locaux contrôlés par l’administrateur, exécutés par un chemin Node fixe avec environnement vidé et pipes privés. Le navigateur n’a aucun moyen d’appeler cet adaptateur.

Ce document sera complété avec le contrat exact, la configuration et les résultats réellement exécutés. Aucun rendu ne constitue une finalisation : aucun changement de statut, version, audit ou document persistant n’est autorisé par cette phase.

## Livraison et limites de phase

Le moteur `renderPrescriptionPdf` et ses règles de placement sont réutilisés. Le seul changement dans le moteur historique est un code typé ajouté aux erreurs déjà levées ; leurs messages et comportements restent identiques. L’adaptateur serveur remplace le sujet « Ordonnance de démonstration » par « Ordonnance » et fixe les dates de métadonnées à `createdAt`/`updatedAt`. Les flux de contenu, fonds, police, dimensions et positions ne changent pas.

Le composant Java `PrescriptionRenderingService.renderDraft(patientId, id, version, patientVersion)` est une méthode interne réservée au dentiste, sans contrôleur. Il lit les données via le service persistant existant, vérifie versions/archives, appelle le worker hors transaction, puis relit le dossier et le compte avant restitution. Un changement de version, un archivage ou une révocation pendant le rendu fait abandonner le résultat. La propagation `NEVER` interdit d’appeler cette orchestration avec une transaction existante. Aucune écriture métier ou d’audit n’est effectuée.

Le mode interne `FINAL_LAYOUT_CHECK` valide la complétude et produit une page sans marqueur brouillon pour préparer les tests du rendu futur. Il ne finalise rien : le service de brouillon ne l’expose pas, aucun statut SQL n’est changé et aucune fonction d’émission n’est livrée. Le profil professionnel serveur et son approbation restent à fournir avant toute finalisation réelle.

## Construction du worker et ressources

Depuis `frontend/` :

```sh
node scripts/build-prescription-renderer.mjs
# Équivalent via le script de package : pnpm build:prescription-renderer
```

TypeScript, déjà installé et verrouillé, compile les trois modules serveur et leurs imports du moteur existant en CommonJS sous `.prescription-renderer/`. Le script copie seulement les ressources officielles et produit `manifest.json` : version de protocole, identifiant moteur et SHA-256 de chaque fichier généré. Il imprime l’empreinte du manifeste ; elle doit être explicitement épinglée dans la configuration serveur. Aucun bundler ni dépendance Node n’est ajouté. Le résultat est ignoré par Git/ESLint et n’est pas placé sous `public/`. La construction efface et reconstruit uniquement ce répertoire de sortie fixe, sans toucher aux PDF du cabinet.

Le modèle et la police sont ceux du [contrat de persistance](prescription-persistence-contract.md), vérifiés par leurs empreintes dans Java et Node. Un payload ne choisit jamais une ressource. Le bundle est placé à côté du `node_modules` de son frontend de construction ; ce voisinage est nécessaire à la résolution CommonJS. L’autorisation de lecture ne constitue pas un mécanisme de recherche de modules. Les dépendances installées sous `node_modules` restent celles du lockfile existant ; ce répertoire et le bundle doivent être protégés contre les modifications par des utilisateurs non autorisés. L’empreinte du manifeste couvre le code compilé et les assets, pas l’exécutable Node ni l’intégralité de l’arbre des dépendances installées. Ceux-ci appartiennent à la base logicielle de confiance du poste hôte.

## Contrat des pipes — version 1

Un processus lit **une seule valeur JSON UTF-8**, puis EOF, sur stdin et renvoie une seule réponse JSON sur stdout. Il n’existe ni token, session de navigateur, endpoint HTTP ni mécanisme de découverte de service. Les seuls chemins proviennent de la configuration administrateur et du code ; aucune URL ni sélection de modèle n’est acceptée.

```text
Request = {
  protocolVersion: 1, requestId: UUID,
  mode: "DRAFT" | "FINAL_LAYOUT_CHECK",
  record: {
    id: UUID, patientId: UUID, consultationId: UUID | null, version: SafeInteger,
    issuedDate: CivilDate,
    medications: [{ id: UUID, medicationName, dosage, frequency, duration, instructions }],
    generalInstructions: string, createdAt: UtcInstant, updatedAt: UtcInstant
  },
  patient: {
    id: UUID, reference: string, firstName: string, lastName: string,
    displayName: string, version: SafeInteger
  }
}
Success = {
  protocolVersion: 1, requestId: UUID, ok: true,
  pdfBase64: string, pdfBytes: integer, sha256: string,
  templateSha256: string, fontSha256: string, rendererId: "prescription-a5-v1"
}
Failure = {
  protocolVersion: 1, requestId: UUID | null, ok: false,
  code: "INVALID_INPUT" | "ASSET_INVALID" | "LAYOUT_OVERFLOW" |
        "UNSUPPORTED_CHARACTER" | "OUTPUT_INVALID"
}
```

Les propriétés inconnues sont refusées, y compris dans les lignes. Les UUID de patient doivent correspondre, les UUID de lignes sont distincts, le nom d’affichage doit correspondre au prénom et au nom transmis par le serveur, et les dates techniques sont cohérentes. `requestId` est un identifiant de corrélation aléatoire, **pas un secret d’authentification** ; Java exige sa correspondance dans la réponse. Une entrée non décodable ou sans requestId UUID valide renvoie une erreur avec identifiant nul ; elle n’est jamais considérée comme une réponse de succès.

Les limites par champ sont celles des [DTO prescriptions](prescription-rest-contract.md), avec au plus vingt lignes et des versions entières sûres. Les contrôles NUL, C0 et Unicode mal formé précèdent le rendu. L’année civile 0000 et les noms composés uniquement d’espaces sont refusés. Le mode brouillon accepte des lignes incomplètes ; `FINAL_LAYOUT_CHECK` exige 1–20 lignes et les quatre champs obligatoires sur chacune. Le lien de consultation nullable est traduit uniquement vers la chaîne vide attendue par le moteur historique ; aucune consultation ou donnée clinique n’est inventée.

Les données dynamiques arabes et les contrôles bidirectionnels sont refusés avec `UNSUPPORTED_CHARACTER` : la mise en forme droite-à-gauche n’a pas été validée dans cette police et ce moteur. L’arabe du fond officiel est intact. Les accents français restent pris en charge. Aucun remplacement de caractère, translittération, changement de police, troncature ou page supplémentaire n’est introduit. Les débordements réutilisent le contrôle existant de glyphes, largeur, nom sur deux lignes et dernière ligne autorisée en A5.

## Configuration et cycle de vie

Le rendu est désactivé par défaut. Les API de brouillons et les autres modules démarrent sans worker. Les variables suivantes sont des variables du **processus Spring** ; un `.env` destiné à Compose ne les injecte pas automatiquement dans Java.

| Variable | Valeur / règle |
| --- | --- |
| `PRESCRIPTION_RENDERING_ENABLED` | `false` par défaut ; activation explicite |
| `PRESCRIPTION_RENDERING_NODE_EXECUTABLE` | Chemin absolu d’un Node 24 testé, résolu vers son fichier réel |
| `PRESCRIPTION_RENDERING_WORKER_DIRECTORY` | Chemin absolu du répertoire `.prescription-renderer` construit |
| `PRESCRIPTION_RENDERING_MODULES_DIRECTORY` | Chemin absolu des `node_modules` installés et protégés |
| `PRESCRIPTION_RENDERING_MANIFEST_SHA256` | Empreinte exacte de `manifest.json`, 64 caractères hexadécimaux minuscules ; aucun apprentissage automatique |
| `PRESCRIPTION_RENDERING_TIMEOUT` | `5s` par défaut ; accepté de 50 ms à 5 s |
| `PRESCRIPTION_RENDERING_MAX_PDF_BYTES` | 2 097 152 par défaut ; configurable de 1 à 2 097 152 dans cette version |

Le serveur vérifie les chemins et le manifeste à la création du bean activé. Une configuration absente/invalide rend la capacité indisponible, sans empêcher les autres fonctions du backend de démarrer. Le contrôle est renouvelé avant chaque rendu : fichiers altérés, symlinks ou fichiers supplémentaires non inventoriés sont refusés. La réparation d’un échec détecté au démarrage nécessite un redémarrage avec configuration approuvée. Il n’y a pas de worker permanent à démarrer avant Spring.

Java utilise `ProcessBuilder` avec arguments séparés, jamais un shell : exécutable fixé, heap Node de 192 Mio, `--permission`, deux autorisations de lecture (bundle et dépendances) et chemin du worker fixé. L’environnement hérité est vidé ; seuls `LANG=C.UTF-8` et `TZ=UTC` sont fournis. `NODE_OPTIONS`, mots de passe DB, cookies et credentials ne sont pas transmis. Le répertoire de travail est celui du bundle, sans fichier temporaire contenant des données patient.

Une génération simultanée est admise, sans file d’attente. Un second appel reçoit `BUSY`. L’entrée UTF-8 est bornée à 1 Mio ; stdout à la taille base64 de 2 Mio plus 4 Kio de protocole (moins de 3 Mio). stderr va directement vers un puits et n’est ni stocké ni journalisé. Les pipes d’entrée/sortie sont traités séparément afin qu’un worker ne lisant pas stdin ou produisant trop de sortie ne puisse bloquer sans limite. Le délai couvre l’échange avec le processus ; un résultat arrivé après l’échéance est rejeté.

Le worker est détruit et ses flux fermés après succès, erreur, interruption ou timeout ; les descendants visibles sont également détruits. `@PreDestroy` détruit le processus actif et interdit de nouveaux rendus. Aucun retry automatique. Le contrôle `FINAL_LAYOUT_CHECK`, le rendu normal et les erreurs ne créent aucune donnée durable.

Les permissions Node limitent lectures, écritures, workers/addons et création de processus ; elles ne sont pas une sandbox contre un code serveur malveillant. Node 24 ne fournit pas ici une interdiction réseau générale : le code du worker n’a aucun appel réseau ni chargement de ressources externe. L’isolation contre un compte système compromis exige les protections du poste. Le plafond de heap ne limite pas à lui seul toute la mémoire native/RSS. Aucune infrastructure de déploiement ou règle pare-feu nouvelle n’est installée par ce lot.

Pour le futur poste hôte, prévoir Node, le bundle versionné, les dépendances installées et les ressources locales, avec droits de lecture pour Spring et écriture réservée à l’administrateur. Rien n’est requis sur le second PC. Si Java et Node sont ultérieurement séparés dans des conteneurs, l’invocation directe nécessite de les placer dans un même environnement d’exécution ; ne pas ouvrir un endpoint HTTP de substitution sans nouveau contrôle d’architecture et d’isolation. Aucun déploiement n’est effectué ici.

## Validation indépendante du résultat

Java vérifie la forme exacte de la réponse, sa version, sa corrélation, les identifiants/empreintes de ressources et moteur, la taille décodée et le SHA-256 recalculé. Il ne se fie pas aux dimensions déclarées par Node et n’accepte pas un succès portant un type ou champ inattendu.

La dépendance [Apache PDFBox 3.0.8](https://pdfbox.apache.org/download.cgi) est ajoutée uniquement pour cette inspection indépendante : parsing strict sans réparation tolérante, signature/enveloppe PDF, une page non chiffrée avec contenu, rotation nulle, unité 1, MediaBox et CropBox d’origine `(0 ; 8,580014)` et dimensions 419,25 × 595,499986 pt (tolérance 0,01 pt). Les annotations, formulaires, actions et dictionnaires de noms ne font pas partie du document attendu et sont refusés. Le parseur utilise un buffer mémoire, sans cache disque ni génération d’un second PDF. Les logs PDFBox sont désactivés pour éviter que des diagnostics de parsing ne contiennent des fragments du document.

Ce validateur inspecte exclusivement la sortie bornée du worker épinglé. Il ne constitue pas un service d’analyse de PDF arbitraires fournis par le public. Le parsing JVM n’est pas une sous-JVM isolée avec son propre quota CPU/mémoire ; il reste dans la base de confiance de l’application. La compatibilité sémantique du contenu et des fonds est assurée par le moteur et ses ressources épinglés, puis les tests de régression ; le parsing structurel ne remplace pas cette preuve.

## Erreurs et garantie de non-écriture

Les catégories Java sont `INVALID_INPUT`, `LAYOUT_OVERFLOW`, `UNSUPPORTED_CHARACTER`, `UNAVAILABLE`, `UNTRUSTED_WORKER`, `BUSY`, `TIMEOUT`, `INVALID_OUTPUT` et `PDF_TOO_LARGE`. Elles ne conservent jamais message Node, commande, chemin, stdout, contenu clinique ou cause technique. Aucun diagnostic patient n’est écrit par l’adaptateur. Les objets de transport et le résultat masquent leur contenu dans `toString()` ; les bytes retournés sont copiés défensivement.

Les versions, archives et refus de rôle restent les erreurs du contrat existant. Ces erreurs de rendu n’ont pas de nouveau mapping HTTP dans cette phase : il n’existe aucun contrôleur de rendu, finalisation ou téléchargement. Une future API devra mapper explicitement les catégories et garder les erreurs RFC 9457 sans contenu clinique.

Une réussite de rendu ne prouve pas qu’une version est toujours actuelle après sa restitution. La future finalisation devra encore relire et verrouiller patient, ordonnance et identité professionnelle, puis valider snapshot/PDF/audit dans sa propre transaction. Ce lot ne remplace aucune étape de cette transaction future et ne crée pas de document prétendument finalisé.

## Validation réellement exécutée

Le 10 novembre 2026, avec Node 24.20.0, JDK installé 25.0.4.1 et compilation Maven `release 21`. PostgreSQL 17.11 Testcontainers utilise un socket Podman rootless privé. Les comptes, données, PDF, ports et captures sont exclusivement synthétiques ; aucun `.env` du cabinet n’est utilisé.

Commandes de vérification Node, depuis `frontend/` :

```sh
node scripts/build-prescription-renderer.mjs
node --import tsx --test --experimental-test-isolation=none tests/prescription-renderer.test.mjs tests/prescription-pdf.test.mjs
node --import tsx --test --experimental-test-isolation=none tests/prescriptions.test.mjs tests/prescription-components.test.mjs
pnpm exec tsc --noEmit --incremental false
pnpm lint
```

Commande backend, depuis `backend/`, avec `JAVA_HOME=/usr/lib/jvm/java-25-openjdk`, `DOCKER_HOST=unix:///tmp/sijilmassa-85c2b1-runtime/podman.sock` et `TESTCONTAINERS_RYUK_DISABLED=true` :

```sh
./mvnw -B -ntp -Dtest=LocalPrescriptionRendererTest,PrescriptionPdfValidatorTest,PrescriptionRenderingServiceTest,PrescriptionRenderingIntegrationTest,PrescriptionHttpIntegrationTest verify
```

Le frontend est compilé dans une copie temporaire sans `.env`, avec les dépendances déjà installées :

```sh
BACKEND_INTERNAL_URL=http://127.0.0.1:9 node node_modules/next/dist/bin/next build --webpack
BROWSER_TEST_FILE=prescriptions.test.mjs node tests/browser/run-real-integration.mjs
```

La commande navigateur utilise le même JDK/socket de test et `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/google/chrome/chrome`. Le provisionneur crée son backend et sa base synthétiques ; aucune donnée patient enregistrée n’est partagée avec la copie. Le changement du harnais consiste uniquement à attendre V1–V7 au lieu de V1–V6, en accord avec le provisionneur Java déjà livré en 8.5C.2A.

| Contrôle | Résultat de cette phase |
| --- | --- |
| Worker Node + régression PDF existante | 17 réussis, 0 échec/ignoré : 9 nouveaux scénarios et 8 tests PDF historiques |
| Logique et composants du prototype ordonnances | 13 réussis, 0 échec/ignoré ; total Node/frontend ciblé : 30 tests distincts |
| Adaptateur Java/processus | 12 réussis : rendu réel, déterminisme, erreurs typées, indisponibilité, intégrité, limites, timeout, sortie malformée, capacité et arrêt |
| Inspection PDF indépendante | 5 réussis : structure, vide/tronqué, taille, nombre de pages, dimensions et rotation |
| Orchestration Java | 6 réussis : mapping serveur, relecture, révocation, versions, absence de retry ou appel d’écriture |
| Intégration Spring/PostgreSQL/worker réels | 4 réussis : résultat valide et erreurs sans mutation, rôles/archives, patient et confidentialité des logs |
| Régression HTTP prescriptions 8.5C.2A | 24 réussis, y compris sessions/CSRF et refus des routes non implémentées |
| Lot Maven ciblé ci-dessus | 51 réussis, 0 échec/erreur/ignoré ; JAR construit et reconditionné, code 0 |
| Navigateur, compilation de production | 3 parcours historiques réussis, 0 échec/ignoré : modèle vierge, preview/download/print, édition et finalisation **du prototype mémoire existant**, filtres, mobile et clavier |
| Contrôles supplémentaires du harnais | V1–V7/JPA et arrêt réel du backend ; 503 patients/rendez-vous/clinique non mis en cache, contenu retiré, stockages vides et absence des marqueurs sensibles dans les logs : réussis |
| Compatibilité visuelle | 3 paires de pages original/serveur, rendues par Poppler à 1 400 px : pixels pleine page identiques pour brouillon, contrôle final et instructions longues. Captures inspectées : en-tête FR/AR, police, accents, placement, marqueur et dégagement du pied conservés |
| Déterminisme | Même entrée/assets, processus distincts séparés de plus d’une seconde : mêmes bytes et SHA-256. La corrélation aléatoire n’entre pas dans le PDF |
| Types, lint et build frontend | TypeScript strict et ESLint sans avertissement réussis ; build Webpack de production réussi en copie temporaire |
| Authentification du renderer | HTTP/token : sans objet pour l’option C. Intégrité du worker/manifeste et refus de l’accueil/révocation testés ; aucun secret de service ajouté |

Les tentatives initiales ne sont pas masquées : le sandbox interdisait les sous-processus de test (`EPERM`), puis les tests ont été exécutés dans l’environnement autorisé. La première comparaison de `pdftotext -bbox` incluait aussi des métadonnées intentionnellement différentes ; la comparaison porte désormais sur le corps des pages, avec contrôle séparé des dates. Les getters PDFBox qui créent une structure à la lecture ont été remplacés par l’inspection directe du dictionnaire. Les entrées JSON non décodables sont classées explicitement en `INVALID_INPUT`. Aucun échec restant n’est ignoré.

ESLint ignorait déjà `.next` et ignore désormais aussi la sortie CommonJS générée, sans désactiver les règles sur le code source. Le wrapper pnpm a tenté une installation dans la copie à `node_modules` symbolique ; le build utilise donc le CLI Next existant directement. Le premier parcours navigateur manquait d’un PDF de référence dans cette copie ; l’ajout de la référence inchangée à l’environnement de test a permis les trois parcours complets. Ces corrections concernent le harnais ou les nouvelles validations, sans modification de la mise en page ni du workflow existant.

Les suites globales frontend/backend et les 40 anciens parcours navigateur ne sont pas présentés comme relancés. Leurs checkpoints restent historiques. Le périmètre exécuté couvre le nouveau pont et les régressions prescriptions affectées ; aucun module de facturation ou d’assurance ne change. La cible Java reste 21, sans revendication d’exécution de ce lot sur un JDK 21 installé.

## Fichiers et préparation de 8.5C.2B.2

Nouveaux fichiers :

- `frontend/src/server/prescription-renderer/{protocol,render,worker}.ts`, `frontend/scripts/build-prescription-renderer.mjs`, `frontend/tsconfig.prescription-renderer.json`, `frontend/tests/prescription-renderer.test.mjs`.
- `backend/src/main/java/ma/sijilmassa/prescription/rendering/{RenderingFailure,RenderingProperties,RenderingRequest,RenderedPdf,PrescriptionPdfValidator,LocalPrescriptionRenderer,PrescriptionRenderingService}.java`.
- `backend/src/test/java/ma/sijilmassa/prescription/rendering/{RenderingFixtures,LocalPrescriptionRendererTest,PrescriptionPdfValidatorTest,PrescriptionRenderingServiceTest,PrescriptionRenderingIntegrationTest}.java` et ce document.

Fichiers adaptés : erreurs typées dans `frontend/src/lib/prescriptions/pdf/{layout,renderer}.ts`, script de package/ignore ESLint/Git, attente V7 du harnais navigateur, dépendance PDFBox dans `backend/pom.xml`, variables d’exemple backend et niveau de logs PDFBox. Les contrats domaine/REST, plan d’acceptation, notice du prototype et architecture backend renvoient vers cette livraison. Aucun composant React, écran, endpoint public ou règle de session n’est modifié.

Pour 8.5C.2B.2 restent notamment : profil professionnel serveur approuvé, capture documentaire immuable, politique de taille coordonnée entre rendu et stockage, transaction de finalisation avec contrôle de versions et revalidation des acteurs, stockage `bytea`/hash/métadonnées et audit atomique. Les téléchargements authentifiés, corrections et intégration UI nécessitent leur périmètre explicite. Aucun de ces workflows n’est commencé ici. Les migrations V1–V7, tables et statut BROUILLON restent inchangés.

Contrôle final : 19 fichiers créés et 14 fichiers préexistants adaptés dans ce lot ; les autres changements non committés sont conservés. Les 33 liens locaux des documents concernés, les deux exemples JSON, les tableaux/blocs Markdown et `git diff --check` (nouveaux fichiers inclus) sont vérifiés. Unslop décline le français ; relecture manuelle effectuée. Les empreintes V1–V7, assets, service PDF navigateur, service de persistance et configuration d’authentification restent inchangées. Aucun conteneur de test ne reste ; le socket/service Podman privé est arrêté, la copie de production et les PDF/captures synthétiques temporaires sont supprimés. Aucun commit, push, déploiement ou démarrage de 8.5C.2B.2 n’est effectué.
