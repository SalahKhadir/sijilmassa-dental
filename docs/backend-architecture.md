# Architecture backend — phase 8.3A

## Périmètre

Le backend est un monolithe modulaire Java 21, Spring Boot 4.1.2, Spring MVC, JPA, Validation, Security, Actuator, PostgreSQL et Flyway. Le parent Spring Boot gère les versions compatibles ; aucune dépendance cloud, Lombok ou H2 n’est ajoutée. Le Maven Wrapper fixe Maven 3.9.11. [Spring Boot documente cette gestion des dépendances](https://docs.spring.io/spring-boot/reference/using/build-systems.html).

Les packages actifs sont `common.api`, `common.exception`, `security`, `audit` et `patient`, sous `ma.sijilmassa`. Les API d’authentification et patients sont livrées ; les autres modules métier ne sont pas persistants. V1 établit l’historique, V2 ajoute les comptes et l’audit de sécurité, V3 sépare identité patient et dossier médical. Les identités utilisent des UUID et les réponses ne sérialisent pas les entités JPA.

## Références du frontend

Les contrats examinés sont `frontend/src/lib/{patients,appointments,consultations,prescriptions,billing,insurance}/types.ts` et les implémentations de dépôts correspondantes. Les documents patients, clinique et facturation décrivent les limites du prototype.

- `Patient` rassemble aujourd’hui identité, questionnaire, allergies et antécédents. Le backend sépare désormais les projections administratives et cliniques, sans sérialiser cette structure entière pour la réception.
- Les rendez-vous référencent un patient ; une consultation peut référencer un rendez-vous de ce patient. Les consultations et soins ont leur propre cycle de vie.
- Les ordonnances et documents d’assurance restent distincts des consultations. Les confirmations dentaires propres aux organismes doivent être conservées explicitement.
- Les factures ont un cycle brouillon/émise/annulée et les paiements sont distincts. Les montants restent exacts en centimes MAD, avec entiers ou décimaux exacts côté Java/PostgreSQL.
- Les dépôts mémoire, identifiants locaux et références séquentielles du navigateur ne sont pas des mécanismes de concurrence ou de numérotation serveur.

Ces concepts guideront les migrations futures. Ils ne justifient pas la création immédiate de toutes les tables. Les contraintes, transactions et règles de modification devront être définies avec chaque module.

## Frontières des modules

| Module futur | Responsabilité |
| --- | --- |
| `security` | Identité, sessions et autorisations serveur |
| `patient` | Identité administrative et accès distinct aux données de santé |
| `appointment` | Créneaux, statuts et prévention transactionnelle des conflits |
| `consultation` | Rencontres cliniques, soins, clôture et corrections auditées |
| `prescription` | Ordonnances et règles d’édition |
| `billing` | Factures, paiements, numérotation et calcul exact |
| `insurance` | Polices, brouillons et validations propres aux organismes |
| `audit` | Événements nécessaires, accès, rétention et intégrité à définir |

Les futurs contrôleurs utiliseront des DTO dédiés ; les entités JPA resteront internes. Les transactions et autorisations seront placées à la frontière des opérations métier. Les erreurs HTTP partagent le contrat décrit dans [backend/README.md](../backend/README.md).

## Phase 8.2 — authentification et autorisations

`LocalAuthenticationService` vérifie les identifiants dans une transaction qui met à jour la dernière connexion et persiste l’audit. Un résultat d’échec est retourné sans lever d’exception afin de conserver son événement. Un hash fictif généré au démarrage impose le travail BCrypt aux comptes inconnus ; les comptes désactivés suivent également ce travail et reçoivent le même message que les autres échecs.

`AuthenticationController` gère le JSON de connexion, les informations minimales du compte et la déconnexion. Les sessions utilisent `HttpSessionSecurityContextRepository` avec sauvegarde explicite du contexte. Une stratégie Spring Security combine changement d’identifiant de session et suppression du jeton CSRF au login. Logout invalide la session et expire le cookie. Le principal ne conserve aucun hash ou mot de passe.

`SessionAccountFilter`, intégré seulement dans la chaîne Spring Security, relit le compte avant l’autorisation. Une désactivation, un changement de rôle ou de nom, ou une version de session différente révoque la session à son prochain usage. Cela empêche de conserver les anciens droits dans une session après une intervention sur le compte. Le défaut d’accès à la base refuse l’opération. Les changements externes nécessitent un parcours administratif audité dans une phase ultérieure ; aucune route de gestion des comptes n’est ajoutée ici.

`@EnableMethodSecurity` active les politiques `RolePolicies.CLINICAL` (DENTIST) et `ADMINISTRATIVE` (DENTIST ou RECEPTIONIST). Les futurs modules devront combiner règles HTTP explicites, annotations sur leurs services et projections limitées. Les routes sans règle restent refusées, y compris pour le dentiste. Les sondes cliniques et administratives sont présentes exclusivement dans les tests.

`LoginThrottle` applique des fenêtres fixes de 60 secondes : 5 tentatives par identifiant normalisé et 60 globalement. Les clés sont des empreintes en mémoire, leur nombre est borné, et les refus ne prolongent pas la fenêtre. Les succès comptent aussi. Le statut 429 et le message sont indépendants de l’existence du compte. L’état n’est pas durable et ne se partage pas entre JVM : le déploiement visé reste un unique serveur local.

`AccountBootstrap` ne fonctionne que si aucun utilisateur n’existe et prend un verrou transactionnel PostgreSQL avant ce contrôle. Deux commandes concurrentes ne peuvent pas créer deux jeux de comptes. Le profil `bootstrap` lance `BootstrapCommand`, sans serveur HTTP, avec saisies de mots de passe masquées et confirmation. Il crée atomiquement les deux comptes locaux et un événement d’initialisation. Aucun compte de démonstration n’est inséré au démarrage normal.

Les événements d’audit sont l’initialisation, les connexions réussies et échouées, le logout, le constat d’un compte désactivé, le plafonnement des connexions et la révocation de session. L’acteur n’est renseigné que si l’opération est authentifiée ; un échec peut référencer le compte concerné par son UUID. Les identifiants inconnus, mots de passe, hashes, sessions, jetons et données médicales ne sont pas enregistrés dans ces événements. Les refus répétés du limiteur sont regroupés par fenêtre. Aucune fonction de modification de rôle n’existe encore ; son audit devra accompagner son implémentation.

Les endpoints, le bootstrap, le contrat CSRF et la matrice de rôles sont détaillés dans [backend/README.md](../backend/README.md). Le frontend appelle ces endpoints depuis la phase 8.2A ; ses données métier restent des fixtures de démonstration.

## Phase 8.3B — intégration frontend patients

L’API persistante de phase 8.3A est détaillée dans [le contrat patients](patient-backend-contract.md). Le frontend devra utiliser des DTO administratifs et cliniques distincts, la pagination serveur, les UUID et les versions de concurrence. Les états « non renseigné » du questionnaire doivent rester distincts d’une réponse négative et les dates civiles ne doivent pas être converties en instants UTC.

V3 crée les tables patients avec leurs contraintes ; aucun adaptateur de persistance patient n’est encore livré au frontend. Les pièces PDF et générateurs existants restent inchangés. L’allowlist du proxy Next.js, aujourd’hui limitée à l’authentification, devra évoluer explicitement pour ces routes, avec cookies, CSRF et absence de cache. L’accès LAN prévu reste sous une même origine HTTPS ; le backend et PostgreSQL restent sur loopback. Aucun déploiement ou proxy TLS n’est configuré ici.

## Exploitation future et sauvegardes

Le poste hôte devra conserver l’application, les dépendances et PostgreSQL localement pour fonctionner sans Internet. Docker n’est qu’une option de développement ; un service PostgreSQL natif convient au cabinet. Le volume Docker assure la persistance locale, mais ne constitue pas une sauvegarde.

Avant utilisation réelle, définir une sauvegarde PostgreSQL cohérente (`pg_dump` au format personnalisé, puis `pg_restore` testé sur une base isolée), la sauvegarde des rôles/configurations et des éventuels fichiers attachés. Chiffrer les copies, limiter les accès, conserver une copie séparée du poste, définir fréquence, rétention et objectifs de perte/rétablissement. Tester périodiquement la restauration et la version applicative associée aux migrations. Ne pas restaurer automatiquement au démarrage et ne jamais écraser une base clinique pour un test. Séparer à terme les droits de migration et les droits applicatifs d’exécution.

Prévoir les mises à jour de sécurité installables localement, le démarrage après redémarrage du PC et la protection du poste/réseau. Ces exigences restent à réaliser dans une phase de déploiement autorisée. L’hébergement local ne prouve pas la conformité CNDP ou à la Loi 09-08.

## Validation de la phase 8.2

Contrôles exécutés avec Java Temurin 21.0.13, Spring Boot 4.1.2, Maven Wrapper 3.9.11 et Docker accessible hors sandbox :

- `./mvnw verify` : 27 tests réussis, aucun échec, aucune erreur et aucun test ignoré ; JAR exécutable produit.
- PostgreSQL 17 Testcontainers : migrations V1/V2 et contraintes, validation JPA des utilisateurs et de l’audit, détection d’une dérive de schéma.
- Serveur HTTP réel : login, état minimal `/me`, erreurs génériques, CSRF lié à la session et renouvelé après connexion, changement d’identifiant de session, logout et rejeu d’ancien cookie refusé.
- Autorisations : refus anonyme, restrictions dentiste/réception sur sondes de test, refus des routes sans règle, révocation après désactivation, changement de rôle et version de session.
- Bootstrap : hachage, normalisation, refus si comptes existants, validation des entrées, atomicité et concurrence ; aucun compte réel créé.
- Cookies : HttpOnly et SameSite Strict, Secure confirmé en profil `prod`, réponses CSRF non mises en cache.
- Protection des tentatives : plafonds par identifiant et global, expiration sans attente réelle, reprise après fenêtre et audit limité des refus.
- Commande interactive du JAR sur une base Compose fictive isolée : création des deux comptes réussie, mots de passe masqués, aucun serveur HTTP ; seconde initialisation et exécution sans terminal refusées avec un code non nul. Les ressources temporaires ont été supprimées.
- Configuration Compose inchangée : `docker compose config --quiet` avec variables synthétiques réussit.

Le JDK et les caches Maven de validation sont installés dans `/tmp`, sans modification système. Les bases de tests sont éphémères et ne contiennent que des comptes fictifs. Les PDF et les modules métier restent inchangés.

Cette validation ne constitue pas un audit de sécurité complet. L’intégration Next.js est livrée en phase 8.2A (voir ci-dessous). Le proxy HTTPS, la gestion/récupération des comptes, les actions administratives auditées et la politique de rétention des événements restent à réaliser. Aucune persistance patient n’est implémentée.


## Intégration frontend — phase 8.2A

Le frontend utilise désormais les sessions Spring à travers un proxy Next.js de même origine. Le contrat backend, CSRF et les cookies restent inchangés. Voir [l’intégration frontend](../docs/frontend-authentication.md) pour le proxy, la restauration, le logout, les restrictions provisoires de présentation et les tests. Les dépôts métier restent fictifs et ne sont pas protégés comme des données cliniques persistantes.


## Phase 8.3A — premier domaine persistant

Le package `patient` regroupe DTO explicites, validation, mapping, services transactionnels, contrôleurs REST et entités administratives/cliniques séparées. L’entité administrative ne référence pas le dossier médical : les chemins d’annuaire et de détail administratif ne peuvent pas le sérialiser par inadvertance.

V3 crée `patient`, `patient_medical_record`, `patient_history_condition`, `patient_allergy_category` et la séquence des références. Les catégories sont typées et les questions fixes versionnées ; aucune réponse n’est stockée sous forme de JSON arbitraire. V1/V2 restent inchangées. Aucun lien SQL ne pointe vers un module futur.

Le dentiste et l’accueil disposent des opérations administratives explicites. Seul le dentiste lit/modifie le dossier médical et crée un patient avec ses réponses initiales. Contrôleur et service appliquent les politiques de rôle, en plus de l’allowlist HTTP. Les routes non prévues restent refusées.

L’identité et le dossier médical ont des versions optimistes indépendantes. Un verrou partagé du parent pendant l’écriture clinique coordonne le statut actif avec l’archivage. Les écritures et l’audit sont atomiques ; les événements patients ne contiennent que cible, acteur, type et instant. Aucune suppression physique ou historisation du contenu médical n’est ajoutée.

Le [contrat patients](patient-backend-contract.md) contient le mapping audité, les décisions de confidentialité, les exemples JSON, les limites de recherche, les règles d’archivage et les exigences exactes de phase 8.3B. La persistance des patients est livrée côté backend ; le frontend conserve ses dépôts mémoire et son proxy d’authentification.

`./mvnw verify` : **53 tests réussis**, dont **25 tests patients** sur un serveur HTTP réel et PostgreSQL Testcontainers, aucune erreur et aucun test ignoré. Sont vérifiés migrations, JPA, FK/contraintes, rôles, CSRF, sérialisation, questionnaire, rollback sur refus d’audit, références concurrentes et conflits de versions. Les empreintes V1/V2 et frontend/PDF sont conservées.

Le test de passage V2 → V3 vérifie aussi la conservation d’un compte et d’un événement d’authentification existants, ainsi que les checksums des migrations appliquées.
