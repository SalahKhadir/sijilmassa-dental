# Patients persistants — phase 8.3B

**Validation réelle de phase 8.3B.1 réussie : 53 tests backend, 206 tests unitaires frontend et 30 parcours navigateur, sans échec ni test ignoré.** Le build de production Webpack réussit ; Turbopack reste bloqué dans le sandbox. Les résultats de la première livraison sont conservés plus bas comme historique.

La route `/patients` utilise exclusivement Spring Boot et PostgreSQL. Une panne affiche une erreur ; aucun dossier fictif ne remplace les données indisponibles. Les modules métier non migrés conservent leurs propres patients synthétiques sous `/demo/patients`.

## Audit des dépendances

| Élément | Avant intégration | Adaptation |
| --- | --- | --- |
| Identifiants | `patient-demo-001`, références générées en mémoire | UUID et référence `PAT-…` retournés par Spring, sans correspondance avec les anciens identifiants |
| Administration | `Patient.identity`, statut, dates | DTO administratif explicite ; naissance vide convertie en `null`, date civile conservée |
| Clinique | Antécédents, allergies, questions dans `Patient` | DTO médical indépendant, version propre, chargé seulement dans un composant dentiste |
| Dépôt | `PatientRepository.list/getById/create/update`, promesses sur mémoire | Dépôt conservé pour les prototypes ; client HTTP distinct pour les patients persistants |
| Écrans | Annuaire, formulaire, fiche et dossier mixtes | Nouveaux écrans persistants réutilisant les champs, cartes, couleurs et résumés existants |
| Agenda et consultations | Référencent les anciens identifiants et lisent le dépôt partagé | Dépôt synthétique inchangé, liens patients dirigés vers `/demo/patients` |
| Ordonnances, factures et assurances | Identité, soins, couverture et snapshots fictifs | Aucun accès au client persistant ; aucun PDF généré depuis un patient persistant |
| Tableau de bord | Compteurs des dépôts mémoire | Reste synthétique, notice visible ; aucun faux total calculé depuis une page persistante |

Les principales incompatibilités étaient le modèle `Patient` contenant des données cliniques, les identifiants non UUID, les formulaires de création mixtes, les téléphones avec X, la pagination côté client et les restrictions provisoires du rôle accueil. Aucune conversion automatique de fixtures ou de relation n’est effectuée.

## Fichiers concernés

- `frontend/src/lib/patients/api/client.ts` : contrats, validation des réponses, opérations HTTP, erreurs et CSRF.
- `frontend/src/components/patients/persistent/{directory,record,form,shared}.tsx` : annuaire, fiche, formulaires, chargement, erreurs et protection des saisies.
- `frontend/src/app/(cabinet)/patients/**/page.tsx` : branchement des écrans persistants.
- `frontend/src/app/(cabinet)/demo/patients/**` : conservation explicite des écrans synthétiques.
- `frontend/src/lib/auth/{backend-proxy,permissions}.ts` : routes proxy et droits de présentation.
- `frontend/src/components/patients/patient-form-fields.tsx` : aide de saisie adaptée au mode persistant ; autres composants patients historiques : liens vers la démonstration.
- Composants `appointment-details`, `consultation-details`, `consultation-directory`, `patient-clinical-overview`, `invoice-details`, `insurance-draft-form`, `prescription-details` : liens synthétiques redirigés vers `/demo/patients`.
- `frontend/src/components/shell/prototype-notice.tsx` et layout du cabinet : notice sur les modules mémoire.
- `frontend/tests/patient-api.test.mjs`, `auth-proxy.test.mjs`, `patient-components.test.mjs` et tests navigateur : contrats, sécurité et parcours persistants/synthétiques.
- `README.md`, `docs/frontend-authentication.md`, `docs/patient-backend-contract.md` et le présent document : périmètre et validation.

Les modifications backend de phase 8.3A déjà présentes dans le répertoire de travail sont conservées ; aucun fichier source backend n’est modifié pour cette phase.

## Architecture et contrats

Navigateur → `/api/v1/…` Next.js → origine serveur `BACKEND_INTERNAL_URL` → Spring Security → services patients → PostgreSQL.

Le transport existant autorise en plus de l’authentification :

| Chemin après `/api/v1/` | Méthodes |
| --- | --- |
| `patients` | GET, POST |
| `patients/with-medical-record` | POST |
| `patients/{UUID}` | GET, PUT |
| `patients/{UUID}/medical-record` | GET, PUT |

Les autres chemins et méthodes sont refusés. Les paramètres de liste passent à Spring, qui contrôle leurs noms, valeurs et répétitions. L’origine interne ne provient jamais d’un paramètre client. Cookies JSESSIONID, CSRF et en-têtes Set-Cookie multiples suivent le transport existant. Les mutations contrôlent Origin, les réponses sont privées et non mises en cache, les redirections sont refusées. Le délai proxy est de 8 secondes, celui du client de 10 secondes. Les corps patients sont limités à 64 Kio, l’authentification reste à 4 Kio. Aucun corps, secret ou dossier n’est journalisé.

`frontend/src/lib/patients/api/client.ts` fournit liste, recherche/pagination, détail, création administrative, création complète atomique, mises à jour administrative et médicale, archivage/restauration par PUT existant. Il valide les réponses avec Zod. Il ne crée aucun numéro patient et refuse les identifiants synthétiques avant le réseau.

- Annuaire : projection limitée, sans CIN ni dossier médical. Recherche nom/prénom/référence/téléphone, 20 résultats par page ; total et nombre de pages proviennent du serveur. Recherche conservée dans l’état du composant, sans URL.
- Détail administratif : identité complète, statut, métadonnées et version. CIN masquée dans le résumé et le champ de saisie.
- Dossier médical : `patientId`, version, métadonnées et `record`. Rubriques et `questionnaireVersion: 1` respectent le contrat de phase 8.3A. Non renseigné, non et rubrique renseignée vide restent distincts.
- Création dentiste : POST atomique `with-medical-record`. Création accueil : POST administratif uniquement ; le backend initialise le dossier médical vide.

## Rôles et état de session

L’accueil accède à l’annuaire, à la création, à la fiche et à la modification administratives. Les composants chargeant et affichant le dossier médical ne montent pas pour ce rôle. La navigation, la garde de route et le composant patient vérifient le rôle ; Spring reste l’autorité pour chaque requête.

Les données persistantes restent dans les composants de l’écran courant, sans contexte global, stockage navigateur ou préchargement serveur. Aucun dossier patient n’est sérialisé dans une page statique. Les providers existants contiennent exclusivement des fixtures synthétiques et ne reçoivent jamais les résultats du client HTTP.

Chaque mutation explicite récupère un nouveau jeton via `/auth/csrf`. Aucun rejeu automatique d’écriture n’est effectué. Un 401 confirmé par l’API masque le contenu puis navigue complètement vers `/login`. Une indisponibilité temporaire reste une erreur distincte, sans faux logout. La déconnexion confirmée existante abandonne les composants et le cache de navigation par une navigation complète.

## Concurrence, cycle de vie et erreurs

Les versions administrative et médicale sont indépendantes. Les réponses doivent contenir des entiers sûrs JavaScript : les versions au-delà de `Number.MAX_SAFE_INTEGER` sont refusées plutôt qu’arrondies. Le formulaire renvoie sa version de lecture ; une mise à jour clinique ne renvoie pas la version administrative.

Un 409 conserve les saisies, bloque une nouvelle soumission obsolète et propose de recharger. Le rechargement demande confirmation avant d’abandonner des changements. Le conflit médical relit aussi le statut administratif pour détecter un archivage concurrent. Les liens sortants et la fermeture/recharge du navigateur avertissent des saisies non enregistrées. La navigation historique demande aussi confirmation lorsque le navigateur fournit une Navigation API annulable ; ce contrôle reste à vérifier sur les navigateurs ciblés. Les navigateurs sans cette API conservent les avertissements sur liens sortants et fermeture/recharge.

L’archivage/restauration utilise le PUT administratif avec identité, statut et version courante. Il ne supprime rien. Un patient inactif reste consultable ; le formulaire médical est bloqué jusqu’à restauration. L’erreur 409 peut aussi indiquer un changement d’état du patient, sans supposer systématiquement une modification concurrente.

Les écrans présentent chargement, liste vide, recherche sans résultat, validation, sauvegarde, confirmation, conflit, refus et indisponibilité. Les détails RFC 9457 ne sont pas recopiés dans l’interface ; les messages français sont choisis selon le code 400/401/403/404/409/429/5xx. Après une erreur réseau d’écriture, vérifier le dossier avant une nouvelle tentative : la réponse peut avoir été perdue après validation serveur.

## Frontière des prototypes

`/demo/patients` conserve les anciens écrans et les interactions synthétiques nécessaires aux rendez-vous, consultations, traitements, prescriptions, factures, paiements et assurances. Les liens de ces modules restent dans cette famille d’identifiants. Le dashboard et ces modules portent une notice de démonstration. L’accueil ne reçoit pas l’accès à ces anciennes pages patients mixtes.

La fiche persistante n’affiche aucun historique de soins, facture, ordonnance ou assurance fictive. `/patients/{UUID}/clinique` explique la limite et renvoie vers le prototype sans lui transmettre l’UUID. Aucun générateur, template officiel PDF ou mapping dentaire n’est modifié.

## Démarrage local

Utiliser une base isolée et des comptes synthétiques pour la validation. Ne pas exécuter les tests avec les comptes ou données du cabinet.

```sh
# Terminal 1, après configuration privée de backend/.env selon backend/README.md
cd backend
set -a
. ./.env
set +a
docker compose up -d postgres
./mvnw verify
# Sur une base de test vide uniquement, créer les deux comptes synthétiques avec saisie masquée :
java -jar target/sijilmassa-backend-0.1.0-SNAPSHOT.jar --spring.profiles.active=bootstrap
./mvnw spring-boot:run
```

```sh
# Terminal 2, frontend/.env.local définit l’origine interne, sans secret DB.
cd frontend
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
# Seulement si Turbopack est bloqué par l’environnement :
pnpm exec next build --webpack
pnpm start
```

Pour les parcours navigateur, `AUTH_TEST_FIXTURE` désigne un fichier privé hors dépôt contenant `dentist` et `receptionist`, chacun avec `identifier` et `password`, correspondant aux comptes synthétiques créés explicitement. Ne pas afficher ce fichier. Le supprimer après validation.

```sh
cd frontend
# Définir AUTH_TEST_FIXTURE dans le terminal ; fichier privé, chmod 600.
# BACKEND_INTERNAL_URL doit correspondre au backend de test.
# Optionnel : PATIENTS_TEST_BASE_URL pour réutiliser un serveur Next déjà démarré.
# Optionnel : PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH pour un Chrome local.
pnpm test:browser
```

Les quatre nouveaux tests navigateur couvrent création et refresh, édition administrative et médicale, conflits indépendants et rechargement, archivage/restauration, accueil et refus clinique côté serveur, absence de requêtes cliniques de l’accueil, panne de transport explicite, séparation des prototypes, reconnexion et session invalidée. Ils exigent Spring et PostgreSQL réels ; aucune authentification simulée n’est ajoutée. Les anciens tests de démonstration utilisent désormais `/demo/patients`.

## Vérification initiale de phase 8.3B — 9 novembre 2026

| Contrôle | Résultat observé |
| --- | --- |
| TypeScript | Réussite |
| ESLint | Réussite sans avertissement |
| Tests unitaires | 206 réussis, aucun échec ou test ignoré ; 21 nouveaux tests API/proxy et un test de droits supplémentaire |
| `pnpm build` | Échec Turbopack : création de processus CSS puis ouverture de port refusée, `Operation not permitted` |
| Webpack | Réussite hors sandbox ; dans le sandbox, Next ne pouvait pas analyser la sortie du sous-processus TypeScript `--showConfig` |
| Navigateur complet | 29 tests en échec de préparation, 0 réussi, 0 ignoré : Next ne démarre pas dans le sandbox ; exécution ciblée des quatre nouveaux tests hors sandbox : 4 erreurs de préparation car `AUTH_TEST_FIXTURE` est absent |
| Intégration PostgreSQL réelle | Non exécutée : Docker inaccessible dans le sandbox ; hors sandbox, socket Docker absent et connexions 5432/8080 refusées |

Les résultats PostgreSQL/Testcontainers de phase 8.3A ne sont pas présentés comme une nouvelle validation de cette phase. Les empreintes de 184 fichiers publics/PDF/mappings ont été comparées avant/après : aucune différence. Le code backend existant n’est pas modifié. La commande ciblée `./mvnw -B -ntp -Dtest=PatientIntegrationTest,PatientMigrationUpgradeTest,AuthenticationIntegrationTest test`, exécutée hors sandbox, échoue avec 3 erreurs de préparation, 0 assertion en échec et 0 test ignoré : `Could not find a valid Docker environment`. Les 25 scénarios patients ne sont donc pas exécutés. La phase 8.3B reste à valider de bout en bout dans un environnement disposant de PostgreSQL, Java 21 JDK, Docker pour Testcontainers et des deux comptes synthétiques.

## Suite

Terminer les parcours réels ci-dessus avant toute utilisation clinique. La phase 8.4 pourra définir la persistance du prochain module et ses relations avec les UUID patients, avec migrations et autorisations propres. Aucun travail de phase 8.4 n’est commencé.


## Phase 8.3B.1 — validation réelle et stabilisation

### Causes des échecs de préparation

La première livraison n’avait ni daemon Docker accessible hors sandbox, ni backend/base de test actifs, ni fichier `AUTH_TEST_FIXTURE`. Dans le sandbox, Next ne pouvait pas démarrer son serveur ; les échecs de préparation se propageaient à la suite utilisant les hooks Node. Ces échecs ne validaient aucun parcours. Docker est désormais accessible hors sandbox, version 29.9.3, avec l’image PostgreSQL 17.11 attendue. Les connexions réseau et ouvertures de ports restent soumises aux restrictions du sandbox.

`AUTH_TEST_FIXTURE` est lu dans `tests/browser/browser-harness.mjs` et les parcours d’authentification/patients. Il contient des **identifiants et mots de passe synthétiques**, pas des références de comptes : `{ dentist: { identifier, password }, receptionist: { identifier, password } }`. Le harnais utilise ensuite les vrais endpoints CSRF/login et le cookie HttpOnly. La documentation initiale décrivait une préparation manuelle ; aucun provisionnement automatique n’existait.

### Préparation automatique isolée

`backend/src/test/java/ma/sijilmassa/BrowserIntegrationEnvironment.java` démarre un PostgreSQL Testcontainers neuf, puis le vrai Spring Boot en profil `dev` sur un port loopback libre. Il vérifie la chaîne exacte V1/V2/V3, le mode JPA `validate` et l’absence de patient initial, puis appelle le service transactionnel `AccountBootstrap` existant pour créer deux comptes synthétiques aux mots de passe aléatoires, hachés par le même encodeur que les comptes normaux.

Ce lanceur n’appartient qu’au classpath de test, pas au JAR de production. Sa configuration limite le scan JPA aux entités de production : la sonde de validation des tests unitaires n’appartient pas à cet environnement navigateur. Aucun endpoint de provisionnement, droit spécial, contournement de login ou affaiblissement de CSRF n’est ajouté.

`frontend/tests/browser/run-real-integration.mjs` compile ce lanceur, crée un répertoire temporaire privé, attend Spring, démarre Next sur un port libre et transmet les variables déjà utilisées par le harnais. Le fichier `users.json` suit le format existant de `AUTH_TEST_FIXTURE`, avec permissions 0600 dans un répertoire 0700. Les métadonnées de démarrage restent dans un fichier privé distinct, sans mots de passe. Les logs de services sont privés et les mots de passe ne sont pas affichés.

La base et les comptes sont jetables. Le nettoyage ferme uniquement les processus et le conteneur créés par ce lanceur, puis supprime le fichier de credentials. Aucune base existante ni aucun volume du Compose habituel n’est réinitialisé ou supprimé. Le lanceur ne source pas `backend/.env` : les paramètres DB viennent du conteneur neuf et l’origine interne Next est fournie par le processus de test. En cas d’échec, les logs de diagnostic privés restent disponibles, sans le fichier de credentials.

Exécution sous Linux avec Docker accessible, JDK 21 et les dépendances Maven/pnpm installées :

```sh
# Terminal disposant de JAVA_HOME vers un JDK 21.
cd backend
./mvnw -B -ntp verify
cd ../frontend
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
# Si le blocage Turbopack décrit ci-dessous se reproduit :
pnpm exec next build --webpack
# Provisionnement, vrai login, tests et nettoyage automatiques :
node tests/browser/run-real-integration.mjs
```

Si Playwright utilise un Chrome déjà installé, définir la variable existante `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` avant la dernière commande. Il n’est pas nécessaire de préparer `AUTH_TEST_FIXTURE` à la main avec ce lanceur. Ne pas lancer un build pendant la suite : elle utilise les fichiers `.next` de la compilation de production.

### Défauts reproduits et corrections ciblées

La première exécution réelle a obtenu 26 réussites et 3 échecs sur 29 parcours, sans test ignoré. Les tests agenda et patients synthétiques cliquaient encore sur la navigation principale « Patients », désormais persistante. Ils utilisent maintenant le lien explicite « Annuaire synthétique », en conservant la navigation cliente et leurs données mémoire. Le contrôle de séparation des domaines cherchait aussi immédiatement une fixture sans filtrer la pagination ni attendre le chargement : il effectue désormais une recherche explicite et attend le lien attendu.

Ces corrections concernent les tests, sans changement du comportement métier. Le parcours dentiste persistant et celui de l’accueil réussissaient déjà lors de cette première exécution. Un parcours réel supplémentaire couvre la recherche par nom et référence, 21 créations synthétiques persistantes, les deux pages serveur et une recherche vide. Le lanceur vérifie aussi une panne réelle en arrêtant son propre backend après la suite, sans réponse API simulée.

### Résultats finaux

Contrôles exécutés avec Java Temurin 21.0.13, Docker 29.9.3, PostgreSQL 17.11, Node 24.20.0 et Chromium local :

| Contrôle | Résultat de phase 8.3B.1 |
| --- | --- |
| Maven `./mvnw -B -ntp verify` | 53 tests réussis, 0 échec, 0 erreur, 0 ignoré ; JAR exécutable produit |
| PostgreSQL/Flyway/JPA | Base neuve connectée, V1/V2/V3 appliquées, validation Hibernate réussie ; passage V2 → V3 également testé |
| Health et accès anonyme | Health 200 avec le seul statut UP ; annuaire anonyme 401 |
| TypeScript/ESLint | Réussite, aucun avertissement ESLint |
| Tests unitaires frontend | 206 réussis, 0 échec, 0 ignoré |
| Build standard dans le sandbox | Échec environnemental Turbopack : processus CSS, `binding to a port`, `Operation not permitted (os error 1)` |
| Build Webpack hors sandbox | Réussite, script de production inchangé |
| Suite navigateur finale réelle | 30 réussis, 0 échec, 0 ignoré, sur la compilation de production Webpack ; durée 178,2 secondes |
| Arrêt réel du backend après la suite | 503 privé et sans cache, aucune origine interne dans l’erreur, interface indisponible sans faux logout ni fallback |
| Stockage navigateur et logs | localStorage/sessionStorage vides, aucune base IndexedDB ; aucun mot de passe généré ni marqueur de contenu patient testé dans les logs Spring/Next |

Le JAR ne contient ni le lanceur navigateur, ni la sonde JPA, ni les migrations réservées aux tests. Les 184 fichiers publics/PDF/mappings comparés avant/après sont identiques ; les 21 fichiers suivis de références et ressources publiques sont aussi identiques à HEAD. Les modifications antérieures du répertoire de travail sont conservées.


### Régressions de sécurité et parcours confirmés

- Dentiste : login réel, création complète, persistance après refresh et reconnexion, éditions administrative et médicale, questionnaire et distinction des réponses, archivage/restauration.
- Accueil : création et lecture administratives réelles, aucun champ médical dans les réponses contrôlées, aucun composant ni appel clinique depuis l’interface. Lecture/écriture médicale et création complète refusées en 403 côté Spring.
- Concurrence : écrivain HTTP concurrent réel, 409 pour les versions administrative et médicale, saisies conservées, nouvelle soumission obsolète bloquée, rechargement confirmé du contenu courant.
- Recherche : nom et référence serveur, 21 patients de test, pagination réelle 20 + 1, recherche sans résultat ; aucune fixture synthétique utilisée comme repli.
- Sessions : rotation du cookie, rejet de l’ancien CSRF, renouvellement explicite réussi, logout, retour arrière, session invalidée et route protégée renvoyant vers la connexion. Aucun mock d’authentification.
- Confidentialité : réponses patient non mises en cache ; données cliniques absentes des DTO administratifs, stockages navigateur et logs contrôlés. Les chunks publics ne contiennent ni `BACKEND_INTERNAL_URL` ni l’origine backend de développement.
- Frontière synthétique : agenda, consultations, prescriptions, facturation, paiements, CNSS/CNOPS/FAR restent opérationnels sur leurs fixtures et anciens identifiants ; aucun lien n’attache ces activités aux patients PostgreSQL.
- Panne : un test de transport interrompu et un arrêt effectif du processus Spring temporaire confirment les erreurs explicites et l’absence de données de remplacement. La panne temporaire n’est pas présentée comme un logout.

Le lanceur final termine avec un code 0 et supprime ses credentials, processus et conteneur. Le PostgreSQL Compose préexistant reste en place ; il n’a pas servi aux tests et n’a pas été arrêté. Aucun défaut fonctionnel patient n’a été reproduit pendant cette validation ; les corrections concernent le provisionnement et les trois attentes de tests obsolètes décrites ci-dessus. Aucun code métier, schéma, template PDF ou mapping n’est modifié en phase 8.3B.1.

La restriction restante concerne le build Turbopack dans cet environnement : Webpack fournit une compilation de production validée. Les tests navigateur couvrent Chromium ; ils ne constituent pas un audit exhaustif de sécurité ou de tous les navigateurs. Aucun déploiement ni travail de phase 8.4 n’est entrepris.
