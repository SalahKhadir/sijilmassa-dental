# Authentification frontend — phase 8.2A

## Architecture et périmètre

Le service frontend simulé est remplacé par les endpoints Spring Boot de phase 8.2. Le navigateur utilise uniquement des URL relatives `/api/v1/auth/*`. Next.js transmet les requêtes au backend local ; le navigateur n’a besoin d’accéder ni au port Spring, ni à PostgreSQL.

Avant cette phase, le formulaire renvoyait toujours « indisponible ». Il n’existait ni fournisseur de session, ni garde de routes, ni rôle courant ou sélecteur de rôle. Les dépôts métier utilisaient uniquement la mémoire du navigateur. Aucun JWT, localStorage ou sessionStorage n’a été ajouté pour authentifier l’utilisateur.

Sont intégrés : connexion réelle, sessions serveur, CSRF, restauration de session, déconnexion et présentation adaptée au rôle serveur. Les patients, soins, ordonnances, factures et assurances restent des prototypes sur données synthétiques, sans API de persistance métier. Le déploiement HTTPS, les sauvegardes et la récupération des comptes ne sont pas réalisés dans cette phase.

## Proxy de même origine

`src/app/api/v1/[...path]/route.ts` utilise le transport Node de `src/lib/auth/backend-proxy.ts`. La destination provient uniquement de `BACKEND_INTERNAL_URL`, variable serveur sans préfixe `NEXT_PUBLIC_`. Elle doit être une origine HTTP(S) sans identifiants, chemin, paramètres ou fragment. Les paramètres de la requête cliente ne choisissent jamais la destination.

Le proxy autorise seulement les quatre chemins d’authentification avec leurs méthodes actuelles ; les autres chemins et méthodes sont refusés. Cette liste devra évoluer explicitement avec les futures API. Un Route Handler a été retenu pour contrôler les délais, les erreurs, l’absence de cache et le transfert distinct des en-têtes `Set-Cookie`. Une rewrite seule n’aurait pas fourni ces conventions d’erreur.

Le corps est transmis sans modification, avec une limite de 4 Kio. Seuls `Content-Type`, `X-CSRF-TOKEN` et le cookie `JSESSIONID` sont transférés. Les cookies étrangers au backend, `Host`, les en-têtes de proxy fournis par le client et les en-têtes hop-by-hop ne sont pas transmis. Les mutations vérifient aussi l’origine lorsqu’elle est présente, en comparant son autorité au `Host` reçu ; l’URL interne de Next.js peut contenir `localhost` alors que le navigateur utilise `127.0.0.1`.

Les en-têtes `Set-Cookie` sont transférés séparément, sans perdre les virgules d’un attribut `Expires`. Spring fournit des cookies sans Domain et avec Path=/ : ils deviennent donc des cookies de l’origine Next.js. Une réponse contenant un Domain inattendu est refusée, plutôt que de modifier silencieusement le périmètre du cookie. HttpOnly, Secure et SameSite ne sont pas affaiblis.

Les redirections et réponses non JSON inattendues du backend sont refusées avec 502. Une connexion impossible ou un dépassement du délai de 8 secondes reçoit 503. Le client attend au plus 10 secondes. Les erreurs locales suivent Problem Details, sans URL interne, exception ou secret. Les réponses portent `Cache-Control: private, no-store, max-age=0` et `Vary: Cookie`. Le proxy ne journalise aucun corps, cookie ou jeton.

## Contrat utilisé

| Endpoint | Requête et réponse |
| --- | --- |
| `GET /api/v1/auth/csrf` | Réponse `{ headerName: "X-CSRF-TOKEN", token }`, avec session anonyme si nécessaire |
| `POST /api/v1/auth/login` | JSON `{ identifier, password }`, cookie et jeton CSRF ; réponse `{ id, username, role }` |
| `GET /api/v1/auth/me` | Identité `{ id, username, role }`, ou 401 si la session n’est pas valide |
| `POST /api/v1/auth/logout` | Cookie et jeton CSRF ; 204 après invalidation, avec expiration du cookie |

Les rôles acceptés sont exactement `DENTIST` et `RECEPTIONIST`. Les réponses sont validées avec Zod ; un rôle inconnu n’accorde aucun accès. Le frontend ne conserve ni hash, ni version interne de session, ni secret de session. Les messages d’erreur en français sont choisis selon le code HTTP et ne recopient pas le détail technique reçu.

400 demande de vérifier le formulaire ; 401 reste générique ; 403 indique une vérification de sécurité expirée ; 429 demande de patienter une minute. Les erreurs serveur, réseau et timeouts indiquent une indisponibilité. Aucun de ces cas n’active une authentification fictive. Les champs du mot de passe sont effacés après chaque soumission, sans journalisation ni stockage persistant.

## Cycle CSRF

`createAuthenticationService` crée un client par fournisseur React monté, sans état de jeton partagé entre requêtes serveur. Les requêtes utilisent `credentials: same-origin`, `cache: no-store` et des URL relatives.

1. Chaque soumission explicite récupère un jeton via `/auth/csrf`.
2. Le jeton est envoyé dans l’en-tête nommé par le contrat, avec le cookie et le corps JSON.
3. Après un login réussi, le client récupère un nouveau jeton : Spring a changé l’identifiant de session et supprimé l’ancien jeton.
4. Le client relit ensuite `/auth/me` pour confirmer la session avant d’ouvrir le cabinet.
5. Un rejet CSRF ne déclenche jamais de nouvelle mutation automatique. L’utilisateur doit soumettre à nouveau ; cette action récupère un nouveau jeton.

Un timeout peut survenir après que le backend a traité la mutation : login et logout ne sont donc pas rejoués automatiquement. Lors d’un logout refusé en 403, seul `/me` peut être relu pour distinguer une session expirée d’une session encore active. Les jetons restent en mémoire, sans localStorage ou sessionStorage.

## Restauration, expiration et navigation

Le layout racine lit la session côté serveur à partir du seul cookie `JSESSIONID`. Le résultat est dédupliqué par `React.cache` uniquement pendant la requête RSC courante. Les fetchs sont `no-store` et les pages sont rendues à la demande. Aucune identité n’est stockée dans un cache public ou déduite d’un cookie de rôle fourni par le navigateur.

Le layout du cabinet redirige les sessions confirmées absentes vers `/login`. Une panne du backend affiche un état « Session non vérifiée » et une reprise, sans la confondre avec une déconnexion. La page de connexion redirige les utilisateurs déjà authentifiés vers leur vue existante : tableau de bord pour le dentiste, agenda pour l’accueil.

`AuthProvider` relit `/me` lors des navigations, au retour au premier plan, au retour de l’historique et toutes les 30 secondes lorsque la page est visible. Les contrôles périodiques sont discrets pour conserver le focus, les formulaires et les dépôts mémoire. Les nouvelles routes et les restaurations depuis le cache du navigateur restent masquées pendant leur contrôle. Les réponses obsolètes ne peuvent pas rétablir une session après une connexion ou déconnexion plus récente.

Un 401 efface l’identité cliente et ferme le cabinet. Une erreur réseau garde un état distinct, masque les vues protégées et permet de réessayer. Les contrôles entre onglets utilisent BroadcastChannel pour signaler un changement de session, sans transporter d’identité ou de secret. Un onglet inactif peut conserver son état jusqu’à sa prochaine vérification ; les autorisations backend restent décisives.

Au logout confirmé, la navigation complète vers `/login` abandonne le cache App Router et les dépôts métier montés. Un marquage de visibilité masque la page avant un instantané d’historique ; son affichage attend une nouvelle vérification de session au retour. Un logout non confirmé ne redirige pas comme s’il avait réussi : un état d’erreur est affiché et la session est relue avant reprise.

## Présentation par rôle

`src/lib/auth/permissions.ts` centralise les rôles, libellés, destination de connexion et droits de présentation.

| Vue actuelle | Dentiste | Accueil |
| --- | --- | --- |
| Tableau de bord actuel | Oui | Agenda à la connexion |
| Agenda et rendez-vous administratifs | Oui | Oui |
| Patients, questionnaire et historique | Oui | Réservé provisoirement au dentiste |
| Consultations et soins | Oui | Non |
| Facturation actuelle, documents et assurances | Oui | Réservé provisoirement au dentiste |
| Paramètres | Oui | Réservé provisoirement au dentiste |

Le prototype mélange encore certaines données administratives et cliniques. Le formulaire de création patient contient le questionnaire de santé ; les factures et feuilles de soins exposent les actes. La séparation des projections administratives et la matrice détaillée restent à valider avant d’ouvrir ces écrans à l’accueil. Cette restriction ne modifie pas les politiques métier Spring : elle évite d’accorder des droits ambigus dans le prototype.

La navigation mobile et bureau applique la même politique. Les liens cliniques depuis l’agenda sont masqués pour l’accueil et l’accès direct à une vue réservée affiche un refus. Ces gardes sont des protections d’interface, **pas des frontières de confidentialité pour les dépôts mémoire** : leurs fixtures cliniques existent encore dans le bundle et doivent rester fictives. Aucun dossier médical réel ne doit y être saisi.

## Développement local

Démarrer PostgreSQL et Spring selon `backend/README.md`. Initialiser explicitement les deux comptes locaux avec la commande interactive de phase 8.2 ; aucun compte n’est créé automatiquement par Next.js.

Dans un second terminal :

```sh
cd frontend
# Copier l’exemple si aucun fichier local n’existe déjà, puis adapter l’origine serveur.
test -f .env.local || cp .env.example .env.local
pnpm dev
```

L’exemple définit `BACKEND_INTERNAL_URL=http://127.0.0.1:8080`. Cette variable reste côté serveur. Ne pas ajouter de secrets DB dans les variables Next.js. Le backend utilise `dev` sur loopback pour permettre les cookies HTTP locaux ; le navigateur ouvre uniquement l’origine Next.js, par exemple `http://localhost:3000`.

En production future, une origine HTTPS du cabinet doit mener à Next.js, qui joint Spring sur loopback. Le proxy externe devra préserver le `Host` de l’origine publique. Spring reste en profil `prod` avec Secure, HttpOnly et SameSite Strict. Ne pas désactiver Secure pour faire fonctionner un accès HTTP sur le LAN. Aucun proxy TLS ou déploiement n’est fourni ici.

## Tests

```sh
cd frontend
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
pnpm test:browser
```

Les tests navigateur exigent un backend réel, une base isolée et deux comptes synthétiques provisionnés explicitement. `AUTH_TEST_FIXTURE` doit désigner un fichier JSON privé, hors du dépôt, contenant deux objets `dentist` et `receptionist`, chacun avec `identifier` et `password`. Ne jamais utiliser les comptes du cabinet. Limiter les permissions du fichier à son propriétaire et le supprimer après les tests.

`BACKEND_INTERNAL_URL` configure le serveur Next lancé par le harnais. `PATIENTS_TEST_BASE_URL` permet d’utiliser une instance de production déjà démarrée. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` peut désigner Chromium installé. Le harnais attend le vrai endpoint CSRF puis établit une session réelle réutilisée pour les régressions ; aucun mode de contournement d’authentification n’existe. Les parcours de connexion utilisent des contextes anonymes distincts.

Validation exécutée le 8 novembre 2026 avec Node 24.20.0, pnpm 12.6.0, Next.js 16.4.5, Chromium et un backend Java 21/PostgreSQL isolé :

| Contrôle | Résultat |
| --- | --- |
| `pnpm exec tsc --noEmit` | Réussite |
| `pnpm lint` | Réussite, aucun avertissement |
| `pnpm test` | 184 tests réussis, aucun échec ou test ignoré |
| `pnpm build` | Échec d’environnement : le processus CSS Turbopack ne peut pas ouvrir son port local (`Operation not permitted`), même lors de la tentative hors sandbox |
| `pnpm exec next build --webpack` | Compilation de production réussie avec le mode Webpack officiel, sans modifier le script du projet |
| `pnpm test:browser` sur cette compilation | 25 parcours réussis, aucun échec ou test ignoré |
| Tests backend `AuthenticationIntegrationTest,ProductionCookieTest,LoginThrottleTest` | 16 tests réussis avec PostgreSQL Testcontainers ; aucune modification du code backend |

Les parcours réels couvrent dentiste et accueil, restauration après refresh, rotation du cookie à travers le proxy, rejet du jeton CSRF obtenu avant login, renouvellement explicite, logout, retour arrière et session invalidée côté serveur. Les régressions couvrent patients, agenda, consultations, prescriptions, facturation, paiements, CNSS/CNOPS/FAR et schémas dentaires. Les anciennes assertions d’absence de cookie ont été remplacées par le contrôle du cookie de session attendu. Les attentes de rendu ont été adaptées au contrôle de session et au titre d’assurance déjà présent.

Une panne réelle a aussi été vérifiée en arrêtant uniquement le backend synthétique après la suite : 503 non mis en cache sans URL interne, page authentifiée affichée « Session non vérifiée » sans redirection vers un logout, et aucun accès fictif depuis `/login`. Les erreurs de transport sur login/logout sont également exercées dans Chromium. Les captures de connexion, de tableau de bord dentiste et d’agenda de l’accueil ont été inspectées sur données fictives.

Les chunks client ne contiennent ni `BACKEND_INTERNAL_URL`, ni l’origine interne de test. Aucun générateur, calcul, coordonnée, modèle PDF officiel ou fichier de branding n’a été modifié. Les bases, comptes et secrets temporaires de validation ont été nettoyés.

## Suite proposée — phase 8.3A

Définir avec le cabinet les projections patients administratives et cliniques et la matrice d’accès correspondante, puis leur persistance PostgreSQL et leurs tests RBAC. La séparation des données devra précéder l’ouverture des vues mixtes à l’accueil. Aucun travail de persistance patient n’est commencé ici.


## Évolution phase 8.3B

Le proxy autorise désormais les routes patients explicites et leurs méthodes, avec une limite de 64 Kio pour ces corps et 4 Kio pour l’authentification. L’accueil peut ouvrir les pages administratives `/patients`, `/patients/nouveau`, `/patients/{UUID}` et `/patients/{UUID}/modifier`. Les routes du questionnaire restent réservées au dentiste et ne montent aucun chargeur clinique pour l’accueil. Un 401 patient confirmé force une navigation complète vers `/login` ; une panne reste une erreur distincte.

L’ancien annuaire mixte est conservé sous `/demo/patients` pour les modules synthétiques, toujours réservé au dentiste. Aucun patient persistant n’entre dans leurs dépôts ou générateurs PDF. Les paragraphes de phase 8.2A ci-dessus décrivent l’état historique ; voir [l’intégration patients](patient-frontend-integration.md) pour le périmètre et les résultats actuels, notamment la validation PostgreSQL réelle de phase 8.3B.1.


## Diagnostic local : Spring répond 401, Next répond 503

Le hotfix a reproduit un backend joignable (health 200, `/auth/me` anonyme 401), mais un proxy Next à 503. `frontend/.env.local` était absent et `BACKEND_INTERNAL_URL` n’était pas fournie au processus Next. `backendOrigin()` dans `src/lib/auth/backend-proxy.ts` refuse une origine absente ; le proxy et le lecteur de session renvoient alors une erreur d’indisponibilité sûre. Une réponse 401 reçue de Spring est conservée, pas convertie en 503.

`.env.example` est un modèle : Next ne le charge pas. Depuis `frontend/`, créer `.env.local` si nécessaire, ou ajouter uniquement la variable manquante à un fichier existant, sans remplacer ses autres valeurs :

```dotenv
BACKEND_INTERNAL_URL=http://127.0.0.1:8080
```

Ce fichier reste ignoré par Git et la variable reste exclusivement serveur. `backendOrigin()` lit `process.env` lors de chaque requête ; Next charge ces valeurs au démarrage et peut les recharger en mode développement. Un redémarrage est la procédure fiable après une modification de configuration ; le mode production demande aussi un redémarrage du processus Next. Aucun rebuild n’est requis pour cette variable serveur utilisée par ces routes dynamiques. Une variable déjà exportée dans le terminal prend priorité sur `.env.local` : vérifier aussi ce cas sans afficher d’autres variables.

Diagnostic du fichier local et de la validation réellement utilisée par le proxy, sans afficher la valeur ni des secrets (Node.js 22.13 ou supérieur) :

```sh
cd frontend
node --env-file-if-exists=.env.local --import tsx --input-type=module -e 'import {backendOrigin} from "./src/lib/auth/backend-proxy"; try { backendOrigin(); console.log("BACKEND_INTERNAL_URL : origine serveur valide"); } catch { console.error("BACKEND_INTERNAL_URL absente ou invalide : vérifier frontend/.env.local et redémarrer Next.js"); process.exitCode=1; }'
```

Ce contrôle ne prouve pas la connectivité réseau. Une origine doit être HTTP(S), sans identifiants, chemin, query ou fragment. Le proxy garde une réponse publique 503 générique en cas de configuration invalide ou panne ; le diagnostic local permet d’en distinguer la cause sans exposer l’origine interne au navigateur.

Si les services sont arrêtés, démarrage depuis la racine du dépôt, dans deux terminaux :

```sh
# Terminal backend ; .env existe déjà et reste privé. JDK avec javac configuré.
cd backend
docker compose --env-file .env up -d --wait postgres
set -a
. ./.env
set +a
./mvnw spring-boot:run
```

```sh
# Terminal frontend ; ne pas écraser un .env.local existant.
cd frontend
test -f .env.local || cp .env.example .env.local
pnpm dev
```

Ne pas relancer le bootstrap, recréer les comptes ou supprimer le volume pour ce problème de connectivité. Le navigateur ouvre uniquement `http://localhost:3000` ; Spring reste sur loopback. Vérifications anonymes attendues :

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/actuator/health
# 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/api/v1/auth/me
# 401
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/v1/auth/me
# 401
```

Vérification du hotfix exécutée le 9 novembre 2026 :

| Contrôle | Résultat |
| --- | --- |
| Services réels du développeur avant correction | Health Spring 200, `/auth/me` direct 401, proxy Next 503 |
| Services réels après ajout de `.env.local` | Health 200, direct 401, proxy `http://localhost:3000/api/v1/auth/me` 401 |
| Chromium sur le vrai port 3000 | Formulaire normal visible ; sans session et cookie invalide : 401 |
| Diagnostic de configuration | Origine configurée valide ; valeurs absente/malformée refusées avec diagnostic générique, sans afficher leur contenu |
| TypeScript et ESLint | Réussite, aucun avertissement ESLint |
| Tests unitaires frontend | 208 réussis, 0 échec, 0 ignoré ; deux régressions proxy ajoutées pour 401/403 et configuration invalide |
| Build standard Next/Turbopack | Échec environnemental à l’ouverture d’un port dans le sous-processus CSS : `Operation not permitted` |
| Build officiel `next build --webpack` | Réussite dans une copie temporaire, sans altérer le `.next` du serveur actif |
| Parcours navigateur d’authentification existants | 5 réussis, 0 échec, 0 ignoré, sur Spring/PostgreSQL réels et comptes synthétiques isolés |
| Arrêt réel du backend temporaire après les parcours | 503 privé sans cache ni origine interne exposée ; écran indisponible sans faux logout ou fallback ; stockages navigateur contrôlés vides |

Les parcours réels couvrent dentiste, accueil, cookie de session et rotation, CSRF rejeté puis renouvelé explicitement, refresh, session invalidée, logout et retour arrière. Le harnais existant a provisionné ses comptes via `AccountBootstrap` dans une base Testcontainers jetable, sans utiliser les credentials ou la base du développeur. Les credentials et processus temporaires ont été nettoyés. Aucun compte réel n’a été modifié.

Les builds et parcours isolés ont utilisé le même CLI Next et les tests existants depuis une copie temporaire : `node node_modules/next/dist/bin/next build`, `node node_modules/next/dist/bin/next build --webpack`, puis les cinq tests de `tests/browser/authentication.test.mjs`. Le CLI était appelé directement pour éviter la réinstallation automatique liée au déplacement de `node_modules` par le gestionnaire de paquets ; le script de build du dépôt n’a pas changé. La suite Maven complète n’a pas été relancée pour ce hotfix de configuration : son résultat de phase 8.4A reste 80 réussites, sans être présenté comme une nouvelle exécution.

Le seul fichier local créé est `frontend/.env.local`, ignoré par Git avec permissions 0600. Les changements suivis du hotfix sont `frontend/.env.example`, `frontend/tests/auth-proxy.test.mjs`, `README.md` et ce document. Les modifications non commitées de phase 8.4A sont conservées. Aucune logique de proxy, authentification, cookie, CSRF, rôle, patient ou rendez-vous n’est modifiée. Les migrations et données PostgreSQL existantes restent intactes ; la phase 8.4B n’est pas commencée.


## Extension rendez-vous — phase 8.4B

Le proxy autorise maintenant GET/POST collection rendez-vous, GET/PUT détail UUID et PUT statut UUID. Le transport commun `lib/api/session-request.ts` reprend la gestion HTTP/CSRF des patients pour les rendez-vous, sans modifier la rotation du login, les sessions ou les règles backend. Aucun port Spring n’est exposé au navigateur et aucun jeton n’est persistant. Les parcours réels des deux rôles et les régressions d’authentification font partie des 35 parcours réussis de phase 8.4B ; voir [l’intégration rendez-vous](appointment-frontend-integration.md).
