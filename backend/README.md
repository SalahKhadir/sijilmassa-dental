# Backend — phase 8.4A

Backend local avec comptes persistants, authentification par session et autorisations serveur. Le module patients persiste désormais l’identité administrative et le dossier médical séparément. Les rendez-vous disposent aussi d’une API persistante avec protection PostgreSQL contre les chevauchements. Le calendrier frontend reste un prototype mémoire ; son intégration n’est pas commencée. Les autres modules métier ne sont pas persistants. Le frontend utilise ces sessions depuis la phase 8.2A et l’API patients depuis la phase 8.3B ; les autres écrans métier gardent leurs dépôts synthétiques.

## Prérequis

- JDK **21 LTS** (`JAVA_HOME` vers le JDK).
- Maven **3.9.11**, téléchargé par `./mvnw` (Wrapper officiel 3.3.4, sans JAR ; `mvnw.cmd` sous Windows). Maven global n’est pas nécessaire.
- Docker Engine et Docker Compose pour PostgreSQL en développement et Testcontainers. Un PostgreSQL natif convient aussi à l’application.
- Internet pour télécharger initialement Maven, les dépendances et l’image PostgreSQL. Après leur installation, le fonctionnement du backend ne dépend d’aucun service externe.

Spring Boot **4.1.2** gère les versions des dépendances, dont Flyway **12.4.0**, Hibernate et Testcontainers. Java est compilé avec `--release 21`. Voir les [prérequis officiels Spring Boot](https://docs.spring.io/spring-boot/system-requirements.html).

## PostgreSQL de développement

Depuis `backend/` :

```sh
cp .env.example .env
# Renseigner DB_PASSWORD et POSTGRES_ADMIN_PASSWORD dans .env avec des valeurs locales distinctes.
# Utiliser des valeurs compatibles avec la syntaxe shell pour la commande source ci-dessous.
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d --wait postgres
```

L’image est `postgres:17.11-bookworm`. Le port est lié à `127.0.0.1`, jamais à l’interface LAN. Le volume nommé `postgres_data` conserve les données. Le contrôle `pg_isready` indique si PostgreSQL accepte les connexions ; le démarrage de Spring vérifie ensuite les identifiants, les migrations et JPA.

À la première initialisation du volume, le script `docker/postgres-init/01-application-user.sh` crée un rôle applicatif sans privilèges de superutilisateur, de création de base ou de rôle. Ce rôle peut créer les objets du schéma `public` pour Flyway. L’administrateur PostgreSQL est distinct du compte applicatif. Les variables d’initialisation ne recréent pas les utilisateurs et ne changent pas leurs mots de passe dans un volume existant. Une modification doit être faite explicitement dans PostgreSQL, puis dans la configuration locale.

`docker compose stop` arrête le service ; `docker compose down` retire le conteneur et le réseau en conservant le volume. Ne pas ajouter `-v` : cela supprimerait les données. Aucun script ne réinitialise la base automatiquement.

Avec un PostgreSQL natif, créer une base vide et un rôle dédié disposant de `CONNECT` sur cette base et de `USAGE, CREATE` sur le schéma retenu. Configurer ensuite `DB_URL`, `DB_USERNAME` et `DB_PASSWORD`. L’application n’utilise aucune API Docker.

## Configuration et démarrage

Compose lit `.env` ; Spring Boot ne le charge pas automatiquement. Dans un shell POSIX, depuis `backend/` :

```sh
set -a
. ./.env
set +a
./mvnw spring-boot:run
```

Sous Windows, définir ces variables dans l’environnement du processus avant `mvnw.cmd spring-boot:run`. Le fichier `.env` est ignoré par Git ; ne jamais y mettre de données de patients. Ne pas publier la sortie de `docker compose config` sans `--quiet`, car elle contient les secrets résolus.

| Variable | Usage |
| --- | --- |
| `DB_URL` | URL JDBC obligatoire ; exemple `jdbc:postgresql://127.0.0.1:5432/sijilmassa_dev` |
| `DB_USERNAME`, `DB_PASSWORD` | Identifiants applicatifs obligatoires, sans valeur par défaut |
| `POSTGRES_ADMIN_PASSWORD` | Mot de passe administrateur réservé à l’initialisation Compose |
| `POSTGRES_DB` | Base créée par Compose |
| `POSTGRES_PORT` | Port hôte PostgreSQL, `5432` par défaut ; adapter aussi `DB_URL` s’il change |
| `SPRING_PROFILES_ACTIVE` | Choisir `dev`, `test` ou `prod` ; aucun profil de développement implicite |
| `SERVER_ADDRESS` | `127.0.0.1` par défaut |
| `SERVER_PORT` | `8080` par défaut |

`dev` permet les cookies sur HTTP local. `test` reçoit la connexion du conteneur PostgreSQL. `prod` conserve les cookies Secure, HttpOnly et SameSite Strict, la liaison loopback et l’absence de confiance implicite dans les en-têtes de proxy. `bootstrap` démarre uniquement la commande locale d’initialisation, sans serveur HTTP. Les identifiants DB restent obligatoires dans tous les profils. Il n’y a pas encore de configuration de déploiement.

```sh
curl -i http://127.0.0.1:8080/actuator/health
# 200, {"status":"UP"} si la base est disponible ; 503 si son contrôle échoue.
curl -i http://127.0.0.1:8080/api/v1/patients
# 401 application/problem+json ; aucun CRUD n’existe.
```

## Initialisation locale des comptes

L’initialisation est une action explicite de l’administrateur, sur une base sans utilisateur. Arrêter le serveur applicatif avant cette opération et conserver les mêmes variables DB. Compiler, puis lancer dans un terminal local interactif :

```sh
./mvnw verify
java -jar target/sijilmassa-backend-0.1.0-SNAPSHOT.jar --spring.profiles.active=bootstrap
```

La commande demande un identifiant et deux saisies masquées du mot de passe pour chacun des deux comptes, dentiste puis réception. Aucun serveur HTTP ne démarre. Elle refuse les entrées redirigées ou l’absence de terminal. Ne jamais passer un mot de passe en argument, dans l’URL ou dans une commande enregistrée dans l’historique. Aucun mot de passe n’est demandé via une variable d’environnement.

Les identifiants sont normalisés en minuscules après retrait des espaces de bord : 3 à 64 caractères ASCII, première lettre ou chiffre, puis lettres, chiffres, point, tiret ou soulignement. Les mots de passe ne sont ni normalisés ni tronqués : au moins 12 caractères Unicode, au plus 72 octets UTF-8. Ils sont hachés avec BCrypt, coût 12. Les deux identifiants doivent être distincts.

Un verrou transactionnel PostgreSQL sérialise les initialisations concurrentes. La présence d’un seul compte suffit à refuser l’opération. La création des deux comptes et son audit sont atomiques ; un refus donne un code de sortie non nul. Aucun compte n’est créé au démarrage normal, dans une migration ou par une route publique. Il n’existe pas encore d’interface de gestion ou de récupération des comptes.

## Endpoints et cycle de session

| Méthode et chemin | Accès et réponse |
| --- | --- |
| `GET /api/v1/auth/csrf` | Public ; crée une session anonyme si nécessaire et retourne `headerName`, `token` |
| `POST /api/v1/auth/login` | Public avec CSRF ; JSON `identifier`, `password` ; retourne `id`, `username`, `role` |
| `GET /api/v1/auth/me` | Session authentifiée ; retourne seulement `id`, `username`, `role` |
| `POST /api/v1/auth/logout` | Session authentifiée avec CSRF ; invalide la session et expire le cookie ; réponse 204 |
| `GET`, `HEAD /actuator/health` | Public ; statut uniquement, sans détail de base ou de composant |

Les mots de passe incorrects, comptes inconnus et comptes désactivés reçoivent le même 401 et le même message générique. Un compte inconnu ou désactivé effectue également la vérification BCrypt. Un JSON invalide reçoit 400 et un CSRF absent ou incorrect reçoit 403. Les requêtes refusées avant vérification des identifiants ne sont pas des tentatives de connexion auditées.

L’authentification utilise les sessions du conteneur Servlet, en mémoire dans l’unique processus backend. Aucun JWT, Basic, formulaire HTML de connexion ou mécanisme « se souvenir de moi » n’est ajouté. Le principal de session ne contient ni mot de passe ni hash. À chaque connexion réussie, Spring Security change l’identifiant de session, supprime l’ancien jeton CSRF et sauvegarde explicitement le contexte de sécurité.

Le cookie `JSESSIONID` est HttpOnly, SameSite Strict, limité au chemin `/`, Secure par défaut et en profil `prod`. Seul `dev` autorise HTTP local. Les sessions expirent après 20 minutes d’inactivité ; les identifiants de session ne passent jamais dans les URL. Le redémarrage du backend termine toutes les sessions. Plusieurs connexions simultanées d’un même compte sont possibles.

Sur chaque requête authentifiée, le serveur relit l’état du compte. Un compte désactivé, un changement de rôle ou d’identifiant, ou une incrémentation de `session_version` invalide la session à sa prochaine utilisation. Les autres sessions du même compte subissent le même contrôle. Un échec d’accès à la base refuse la requête avec 503. Aucun endpoint de gestion des comptes ou des sessions d’un tiers n’est livré ; les changements administratifs et leur interface restent à réaliser.

## CSRF et futur frontend Next.js

Le frontend devra utiliser une même origine avec le backend, par l’intermédiaire d’un futur proxy local HTTPS :

1. Appeler `GET /api/v1/auth/csrf` en conservant le cookie de session. Lire `headerName` et `token` dans la réponse JSON non mise en cache.
2. Envoyer ce jeton dans l’en-tête indiqué (`X-CSRF-TOKEN`) et le JSON `identifier`, `password` au login, avec le cookie de session. Le champ frontend existant `identifier` correspond déjà au contrat ; aucun adaptateur n’est encore branché.
3. Après connexion, récupérer un **nouveau** jeton CSRF : celui de la session anonyme est supprimé. Envoyer le nouveau jeton pour chaque mutation, y compris logout.
4. Après déconnexion ou expiration, abandonner l’ancien jeton et récupérer une session anonyme pour une nouvelle connexion. `/auth/me` sert à relire l’identité courante ; 401 invite à se reconnecter.

Les jetons CSRF utilisent la protection XOR de Spring Security et restent dans la mémoire du frontend, sans stockage persistant. Le navigateur n’a pas besoin de lire le cookie HttpOnly. Aucune règle CORS publique n’est ajoutée ; appeler directement le backend depuis un autre port du navigateur n’est pas le modèle d’intégration prévu.

## Autorisations

Les routes de connexion, CSRF et santé sont explicitement autorisées. `/me` et logout exigent une session authentifiée. Toute autre route applicative reste refusée, même pour le dentiste. Il n’y a pas encore d’API patient.

| Opération future | DENTIST | RECEPTIONIST |
| --- | --- | --- |
| Administration autorisée, agenda, factures et paiements | Autorisé selon le module | Autorisé selon le module |
| Antécédents, notes cliniques, actes réservés au dentiste | Autorisé | Refusé |
| Nouvelle route sans règle explicite | Refusé | Refusé |

`RolePolicies.CLINICAL` et `RolePolicies.ADMINISTRATIVE` définissent les expressions de `@PreAuthorize` pour les futurs services. Chaque opération devra aussi disposer d’une autorisation HTTP explicite et de DTO adaptés. Les seuls endpoints qui exercent cette matrice aujourd’hui sont des sondes **exclusivement dans les tests**, absentes du JAR.

## Protection des connexions et audit

La limite est de 5 tentatives admises par identifiant normalisé et par fenêtre fixe de 60 secondes, avec un plafond global de 60 requêtes de connexion par minute pour limiter les changements d’identifiant. Les tentatives réussies comptent également. Les refus ne prolongent pas la fenêtre. Une limite atteinte retourne 429 générique avec `Retry-After: 60`, sans bloquer définitivement le compte. Les en-têtes d’adresse fournis par le client ne servent pas de preuve d’identité.

Le limiteur est synchronisé, borné en mémoire, sans Redis ; il conserve des empreintes des identifiants et ne persiste pas les valeurs saisies. Son état est perdu au redémarrage et n’est pas partagé entre processus : ce choix cible un unique backend local. Il ne protège pas seul contre une saturation réseau ou une attaque du poste hôte.

`security_audit_event` contient uniquement UUID, instant UTC, type, acteur et compte concerné lorsqu’ils sont connus. Les événements sont `ACCOUNTS_BOOTSTRAPPED`, `LOGIN_SUCCEEDED`, `LOGIN_FAILED`, `LOGOUT`, `ACCOUNT_DISABLED`, `LOGIN_THROTTLED` et `SESSION_REVOKED`. L’audit de succès et la mise à jour de dernière connexion sont transactionnels. Les échecs de connexion sont persistés sans provoquer de rollback de leur audit.

Une tentative échouée n’a pas d’acteur authentifié ; seul l’UUID du compte concerné est associé s’il existe. Un identifiant inconnu n’est jamais copié dans l’audit. Les refus du limiteur sont regroupés à un événement par fenêtre concernée pour éviter d’écrire un événement par requête refusée. Aucun mot de passe, hash, identifiant de session, jeton CSRF, adresse IP, corps de requête ou détail médical n’est enregistré dans ces événements.

`ACCOUNT_DISABLED` constate une tentative ou une session refusée pour un compte désactivé. Les changements SQL externes ne produisent pas un historique automatique des actions administratives ; il n’existe pas encore de fonction de changement de rôle à auditer. Une future gestion des comptes devra auditer les transitions avec leur acteur. Les règles de rétention, la consultation et les garanties contre l’altération de l’audit restent à définir avant exploitation réelle.

## Contrat d’erreur

Les erreurs suivent RFC 9457 avec `type`, `title`, `status`, `detail`, `instance` et `requestId`. Les titres HTTP standards restent en anglais ; les explications sont en français. Chaque requête reçoit un UUID serveur dans `X-Request-ID`, le corps d’erreur et le contexte MDC. L’en-tête client est ignoré. `instance` utilise une URN de corrélation pour éviter de recopier une URL contenant des données personnelles.

Les DTO d’entrée utilisent Jakarta Validation et `@Valid`. Les erreurs de champs exposent uniquement le nom du champ et un message générique. Ne pas renvoyer les valeurs rejetées, les messages SQL ou les messages d’exception. Les erreurs MVC, de méthode sécurisée, de filtre et de conteneur utilisent le même générateur. Les réponses de sécurité ne sont pas mises en cache.

## Migrations et dates

Flyway est le seul outil de migration. `V1__foundation.sql` reste inchangée et établit l’historique. `V2__users_and_security_audit.sql` ajoute les utilisateurs et les événements de sécurité, avec contraintes de nom normalisé et unique, hash BCrypt coût 12, rôles admis, horodatages, version de session et clés étrangères d’audit. Des index couvrent la date, l’acteur et le compte concerné. Il ne s’agit pas d’un `baseline-on-migrate` : une base non vide sans historique doit être examinée explicitement. Aucun utilisateur, mot de passe ou dossier n’est inséré.

`ddl-auto=validate`, `open-in-view=false`, initialisation SQL automatique désactivée, validation Flyway active, `clean` désactivé. Ne jamais modifier une migration appliquée ; ajouter une nouvelle migration versionnée avec contraintes explicites. La validation JPA compare maintenant les mappings d’identité et d’audit au schéma V2. Les tests conservent en plus une table et une entité exclusivement sur le classpath de test pour exercer le refus d’une colonne manquante.

Les connexions JDBC utilisent UTC ; Hibernate utilise UTC pour ses échanges temporels. Les futurs horodatages seront des `Instant` et des colonnes `timestamptz`, renvoyés en ISO 8601 UTC. Les dates civiles restent des `LocalDate`/`date`. Les créneaux de rendez-vous devront être interprétés explicitement avec `Africa/Casablanca`, dont le décalage varie ; ne jamais figer `+01:00`. Aucun changement global du fuseau JVM n’est requis.

## Vérifications

```sh
./mvnw verify
./mvnw -Dtest=AuthenticationIntegrationTest,ProductionCookieTest,LoginThrottleTest test
POSTGRES_DB=synthetic DB_USERNAME=synthetic DB_PASSWORD=synthetic POSTGRES_ADMIN_PASSWORD=synthetic docker compose config --quiet
```

La suite complète utilise PostgreSQL 17 avec Testcontainers, sans H2 et sans ignorer les tests si Docker est absent. Elle couvre migrations V1/V2, contraintes, hachage, bootstrap atomique et concurrent, login, compte désactivé, sessions et cookies réels, fixation, rejeu après logout, CSRF, rôles, révocation et audit. Le limiteur est testé avec une horloge contrôlée pour éviter les pauses d’une minute.

La validation de phase 8.2 et ses limites sont consignées dans [l’architecture backend](../docs/backend-architecture.md). Les PDF et les modules métier restent inchangés ; l’intégration frontend de phase 8.2A est décrite ci-dessous.

## Exigences avant déploiement HTTPS

Utiliser une origine unique en HTTPS avec `prod`, les cookies Secure et un proxy dont les en-têtes fiables seront configurés explicitement. Ne pas activer `dev` sur le LAN pour contourner Secure. Les ressources de santé doivent également être limitées au réseau prévu. Le socle ne configure aucun proxy ni certificat. Les sauvegardes, la récupération des comptes, la rétention d’audit et la validation juridique/organisationnelle restent à traiter ; l’hébergement local ne prouve pas la conformité CNDP.


## Intégration frontend — phase 8.2A

Le frontend utilise désormais les sessions Spring à travers un proxy Next.js de même origine. Le contrat backend, CSRF et les cookies restent inchangés. Voir [l’intégration frontend](../docs/frontend-authentication.md) pour le proxy, la restauration, le logout, les restrictions provisoires de présentation et les tests. Les dépôts métier restent fictifs et ne sont pas protégés comme des données cliniques persistantes.


## Patients persistants — phase 8.3A

V3 ajoute l’identité administrative, le dossier médical, ses catégories et la cible patient des événements d’audit. V1/V2 sont conservées. `ddl-auto=validate`, sessions, CSRF et refus par défaut restent actifs. Aucun patient n’est inséré au démarrage.

Les deux rôles accèdent à la création, recherche paginée, lecture et modification administratives sous `/api/v1/patients`. Le dossier `/api/v1/patients/{id}/medical-record` et la création combinée `/api/v1/patients/with-medical-record` sont réservés au dentiste. Les PUT exigent une version ; les conflits répondent 409. `inactive` archive sans supprimer et permet une restauration versionnée.

Le [contrat patient complet](../docs/patient-backend-contract.md) documente les champs, DTO, exemples, validations, audits et adaptations requises en phase 8.3B. Le frontend et son proxy ne sont pas encore reliés à ces endpoints patients ; leurs fichiers restent inchangés.

Validation : `./mvnw verify` réussit avec **53 tests**, dont **25 tests patients** sur PostgreSQL et sessions HTTP réelles, sans test ignoré. Les événements d’audit font partie de la transaction de mutation et ne contiennent que les UUID, le type et la date. Les détails d’erreur serveur pgJDBC sont désactivés ; les journaux PostgreSQL natifs doivent également être protégés avant usage réel.


## Rendez-vous persistants — phase 8.4A

V4 ajoute l’agenda unique, ses versions optimistes et les cibles d’audit rendez-vous. Les patients référencés doivent être des UUID PostgreSQL actifs pour une réservation ou un déplacement. Les identifiants synthétiques du calendrier frontend ne sont jamais importés.

Les routes sont `GET/POST /api/v1/appointments`, `GET/PUT /api/v1/appointments/{id}` et `PUT /api/v1/appointments/{id}/status`. La lecture exige `from`/`to` avec décalage, une fenêtre maximale de 43 jours et une pagination de 1 à 100 résultats. Les deux rôles gèrent les opérations administratives ; seul le dentiste peut envoyer TERMINE, ensuite immuable. Les motifs/notes libres ne sont pas acceptés dans cette phase.

La contrainte GiST PostgreSQL sur `tstzrange(start_at,end_at,'[)')` réserve les créneaux EN_ATTENTE/CONFIRME/TERMINE et autorise les bornes adjacentes. Aucune extension n’est nécessaire pour cet agenda sans dimension de ressource. L’échec d’une réservation concurrente ou d’une version obsolète reçoit un 409 générique. L’audit participe à la même transaction et son échec annule toute mutation.

Le [contrat rendez-vous](../docs/appointment-backend-contract.md) détaille les DTO, la matrice des statuts, les règles Africa/Casablanca, les contraintes, les tests et les adaptations à prévoir en phase 8.4B. Les horaires fictifs du frontend ne sont pas appliqués au backend. Aucun endpoint de consultation ou de facturation n’est ajouté.

V1/V2/V3 restent inchangées ; le rôle de migration habituel peut créer cette table et ses index, sans installer d’extension. Exécuter `./mvnw verify` avec JDK 21 et Docker pour la validation PostgreSQL complète. Ne pas utiliser la base Compose existante pour les tests : les Testcontainers restent isolés.

**Validation de phase 8.4A : `./mvnw -B -ntp verify` réussit avec 80 tests, 0 échec, 0 erreur et 0 test ignoré.** Cela comprend 26 tests de rendez-vous sur serveur HTTP et PostgreSQL réels, le passage V3→V4 avec données conservées et les 53 régressions antérieures. Les collisions concurrentes, la course archivage/réservation, les rôles, CSRF, les versions et le rollback d’audit sont vérifiés. Le JAR est produit ; V1/V2/V3, les composants frontend et les PDF restent identiques.
