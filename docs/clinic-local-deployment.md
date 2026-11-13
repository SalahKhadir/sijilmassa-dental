# Installation locale du cabinet

Cette procédure prépare une installation sur un PC dentiste Linux équipé de Docker Engine et du plugin Docker Compose 2.30 ou supérieur. L’accueil utilise un navigateur sur le réseau privé du cabinet. L’exercice de validation utilise un moteur Podman rootless via l’API compatible Docker, sur des volumes et des comptes jetables. La procédure de recette ci-dessous reste à exécuter sur les deux postes du cabinet.

Pour un PC serveur Windows 11, suivre le [guide du pilote Windows](windows-11-clinic-installation.md). La recette utilise exclusivement des données fictives.

## Architecture

| Service | Écoute | Accès |
| --- | --- | --- |
| Caddy | TCP 443 par défaut, publié sur l’IPv4 privée configurée | Les deux postes du cabinet |
| Next.js en production | 3000 sur les réseaux internes web et API | Caddy côté navigateur |
| Spring Boot, profil `prod` | 8080 sur les réseaux internes API et données | Next.js et sondes locales du conteneur |
| PostgreSQL 17.11 | 5432 sur le réseau interne données | Spring Boot et opérations locales via le moteur |

Le navigateur n’appelle que l’origine HTTPS de Caddy. Next.js transmet les routes API autorisées à Spring. Les cookies gardent `Secure`, `HttpOnly` et `SameSite=Strict`. Spring vérifie le CSRF et les rôles. La session expire après 20 minutes d’inactivité. Après expiration, reconnectez-vous et relisez l’état du dossier avant de reprendre une action interrompue.

Seul le port HTTPS est publié. Le script refuse une adresse générique ou publique. Les réseaux API et données restent internes. Le volume `db-data` conserve la base, et `tls-data` conserve l’autorité privée de Caddy. Les conteneurs redémarrent selon `unless-stopped`. L’attente PostgreSQL teste le serveur TCP définitif. Spring démarre ensuite, applique et valide Flyway puis vérifie JPA. Next.js teste le chemin du proxy jusqu’au refus attendu d’une requête sans session. Caddy vérifie la page de connexion depuis une sonde en boucle locale.

## Première installation

Prévoir un SSD, au moins 8 Go de mémoire pour construire les images confortablement et de la place pour le répertoire de construction, la base et les sauvegardes. Installer Bash, GNU coreutils, util-linux, GnuPG et OpenSSL sur le serveur. Le poste d’accueil doit pouvoir joindre le PC dentiste par son adresse privée fixe ou réservée en DHCP. Le premier build télécharge les images et dépendances publiques. Une fois les images disponibles, l’application fonctionne sur le LAN sans service hébergé. Garder une copie des images validées pour une reconstruction sans téléchargement.

Depuis la racine de la version à installer, créer une configuration privée hors du dépôt. Ces commandes créent des fichiers de première installation. Arrêter si le répertoire cible existe déjà.

```sh
clinic_config="$HOME/.config/sijilmassa-clinic"
(
  set -eu
  umask 077
  mkdir -p "$(dirname "$clinic_config")"
  mkdir "$clinic_config"
  mkdir "$clinic_config/practitioner"
  { printf 'DB_PASSWORD='; openssl rand -hex 32; } > "$clinic_config/db.env"
  { printf 'POSTGRES_PASSWORD='; openssl rand -hex 32; } > "$clinic_config/admin.env"
  cp deployment/.env.example "$clinic_config/clinic.env"
)
export CLINIC_ENV_FILE="$clinic_config/clinic.env"
```

Renseigner `CLINIC_RELEASE` avec un identifiant inédit, `CLINIC_LAN_IP` avec l’IPv4 réservée du PC dentiste et les trois chemins absolus des fichiers privés. Les fichiers `db.env` et `admin.env` ont chacun une ligne et restent en mode 0600. `CLINIC_PRIVATE_CONFIG_DIR` désigne le répertoire du profil praticien. Les mots de passe PostgreSQL sont distincts. PostgreSQL utilise un compte d’application sans privilège d’administration. Les administrateurs du moteur peuvent lire les variables du conteneur. Limiter l’accès au socket local du moteur et éviter les sorties de configuration non filtrées. Après initialisation, modifier un fichier ne change pas le mot de passe enregistré dans PostgreSQL. Toute rotation doit être coordonnée avec le rôle en base et testée séparément.

```sh
deployment/clinic.sh config --quiet
deployment/clinic.sh build
deployment/clinic.sh up --wait --no-build --pull never
deployment/clinic.sh run --rm --no-deps backend --spring.profiles.active=prod,bootstrap
```

La dernière commande crée les deux premiers comptes dans un terminal interactif et demande deux mots de passe distincts. La relancer seulement si aucun compte n’a été créé. Les mots de passe applicatifs ne vont ni dans les fichiers Compose ni dans la ligne de commande. Après création, utiliser l’interface de connexion.

Pour finaliser des ordonnances, placer le profil approuvé `practitioner.json` dans le répertoire privé, accessible en lecture au processus backend UID 10001. Renseigner `CLINIC_PRACTITIONER_SHA256` avec son empreinte SHA-256. Le profil doit viser l’UUID du compte dentiste créé. Recréer le backend avec `deployment/clinic.sh up --wait --no-build --pull never`. Le worker et ses polices sont intégrés aux images, et son manifeste est vérifié. En l’absence du profil approuvé, la finalisation des ordonnances reste indisponible. Voir le [contrat des ordonnances](prescription-frontend-integration.md).

Sur Linux avec SELinux, le moteur applique un label partagé au répertoire du profil. Réserver ce répertoire au profil. Donner à l’UID du backend dans le conteneur les droits de traversée du répertoire et de lecture du fichier, en tenant compte du mappage d’UID si le moteur est rootless. Vérifier avec `deployment/clinic.sh exec -T backend test -r /run/clinic/practitioner.json`. Les deux fichiers de mots de passe restent dans le répertoire parent.

## Préflight avant la recette

Installer également Python 3 et les utilitaires `ip` et `ss` d’iproute2. Exporter les paramètres du trousseau public et de la destination de sauvegarde depuis la configuration privée décrite dans le [plan de reprise](database-backup-and-recovery.md). Lire ce plan et confirmer qui garde la clé de reprise et où elle est conservée hors du serveur. Ne transmettre ni clé ni phrase secrète au préflight.

```sh
python3 deployment/clinic-preflight.py install --ack-recovery
```

Le contrôle vérifie le modèle Compose résolu, les secrets privés, l’adresse et le port local, l’isolation réseau, les quatre images, la configuration Caddy, les volumes et la destination de sauvegarde. Le seuil de stockage du moteur est de 2 Gio. Pour l’adapter, passer `--min-data-free-kib N`. Le résultat vaut 1 si un contrôle échoue. Les points `MANUAL CHECK` restent à valider même si la commande renvoie 0.

Sur une première installation, le profil approuvé peut manquer tant que le compte dentiste n’a pas d’UUID. Le préflight signalera cet échec. Créer le compte sur le serveur en accès restreint, terminer le profil et relancer le contrôle avant la recette. Les volumes gérés par Compose peuvent être absents avant le premier démarrage. Le contrôle Caddy exécute des conteneurs éphémères sans réseau, avec stockage temporaire. Il ne démarre pas la pile du cabinet. [Modèle Compose résolu](https://docs.docker.com/reference/cli/docker/compose/config/)

## HTTPS et accès des deux postes

Exporter uniquement le certificat public de l’autorité privée depuis le PC dentiste, puis vérifier son empreinte par un canal séparé avant de l’installer sur chaque poste.

```sh
deployment/clinic.sh exec -T https cat /data/caddy/pki/authorities/local/root.crt > "$clinic_config/clinic-ca.crt"
openssl x509 -in "$clinic_config/clinic-ca.crt" -noout -sha256 -fingerprint
```

Sous Windows, importer `clinic-ca.crt` dans les autorités racines approuvées du compte utilisateur avec `certutil -user -addstore Root clinic-ca.crt`. Sous Debian ou Ubuntu, installer le certificat dans `/usr/local/share/ca-certificates/` puis lancer `sudo update-ca-certificates`. Sous Fedora, utiliser `/etc/pki/ca-trust/source/anchors/` et `sudo update-ca-trust extract`. Si le navigateur emploie son propre magasin, importer le certificat public dans les autorités de ce navigateur. Redémarrer le navigateur et ouvrir `https://ADRESSE_PRIVÉE` ou ajouter le port configuré. Une alerte TLS exige de vérifier l’adresse et le certificat avant de saisir des identifiants. La clé de l’autorité reste sur le serveur.

Comparer l’empreinte par un canal indépendant, puis vérifier le certificat et l’IP avant d’ouvrir le navigateur. Avec Python et OpenSSL sur le poste de contrôle, utiliser le certificat public exporté et l’empreinte confirmée séparément.

```sh
python3 deployment/clinic-preflight.py tls IP_DENTISTE 443 \
  --ca CHEMIN_CERTIFICAT --ca-sha256 EMPREINTE_CONFIRMEE
python3 deployment/clinic-preflight.py install --running --ack-recovery \
  --ca CHEMIN_CERTIFICAT --ca-sha256 EMPREINTE_CONFIRMEE
```

La première commande vérifie la chaîne, l’IP et la durée résiduelle du certificat, puis ouvre la page de connexion. La seconde se lance sur le serveur et vérifie aussi l’état des conteneurs, les publications de ports, les permissions des clés Caddy, le cookie et le refus d’une requête sans jeton CSRF. La sonde crée une session anonyme de courte durée. Elle n’utilise aucun compte. Les seuils de durée sont d’une heure pour le certificat serveur et de 30 jours pour le CA. Les options `--min-leaf-hours` et `--min-ca-days` permettent de les ajuster.

Caddy renouvelle automatiquement ses certificats internes lorsque le service et le volume TLS sont disponibles. Si le seuil de durée est franchi, vérifier l’heure système, l’état de Caddy et son volume. Prévoir la rotation du CA ou le changement d’IP sur une pile isolée avant l’intervention. Comparer la nouvelle empreinte sur le serveur, distribuer le nouveau certificat public et refaire les contrôles TLS sur les deux postes. Retirer l’ancienne confiance après confirmation du basculement et traiter séparément la conservation du volume TLS protégé. [Autorité et renouvellement Caddy](https://caddyserver.com/docs/automatic-https#local-https)

Configurer le pare-feu et le routeur pour limiter le port publié aux postes du cabinet. Désactiver les redirections de port, l’UPnP pour cet équipement et le routage depuis le Wi-Fi invité. Docker Engine peut contourner les règles d’entrée UFW pour un port publié. Sous Docker avec iptables, le filtrage doit tenir compte de `DOCKER-USER` et de la destination d’origine après DNAT. Avec nftables ou Podman, appliquer les règles adaptées au moteur et tester depuis un poste autorisé et un réseau interdit avant l’ouverture. Lier le service à une adresse privée ne suffit pas si le routeur relaie cette adresse depuis l’extérieur. [Pare-feu Docker](https://docs.docker.com/engine/network/packet-filtering-firewalls/) · [Filtrage Docker avec iptables](https://docs.docker.com/engine/network/firewall-iptables/) · [Confiance TLS locale Caddy](https://caddyserver.com/docs/running)

## Opérations quotidiennes

`deployment/clinic.sh ps` indique l’état des services. `deployment/clinic.sh images` donne les images effectivement utilisées. Relever le tag `CLINIC_RELEASE`, les ID d’images et l’empreinte du certificat dans le journal d’installation. Une connexion PostgreSQL peut être contrôlée localement avec `deployment/clinic.sh exec -T db pg_isready -h 127.0.0.1 -U postgres -d sijilmassa`. Vérifier HTTPS avec `curl --cacert CHEMIN_CERTIFICAT https://ADRESSE_PRIVÉE/login`.

Pour un arrêt volontaire, utiliser `deployment/clinic.sh stop`. Repartir avec `deployment/clinic.sh up --wait --no-build --pull never`. Les volumes restent en place. Vérifier l’espace du système, du volume PostgreSQL et de la destination de sauvegarde avec `df -h`. Consulter uniquement les journaux nécessaires avec `deployment/clinic.sh logs --tail 100 SERVICE`. Le moteur limite la taille des journaux de chaque conteneur. Caddy conserve ses journaux de fonctionnement et écarte les journaux susceptibles de contenir les URL ou en-têtes des requêtes. Ne pas joindre les journaux à un service externe. [Journalisation Caddy](https://caddyserver.com/docs/caddyfile/options#log)

Activer le démarrage automatique du moteur sur le serveur si le cabinet veut reprendre après un redémarrage du PC. Le moteur peut relancer les conteneurs en parallèle. Vérifier ensuite les quatre services avec `deployment/clinic.sh ps` et ouvrir la page de connexion. Pour un démarrage ordonné après une intervention, utiliser la commande `up --wait` ci-dessus. Un état `unhealthy` demande un diagnostic, même si le conteneur tourne encore.

PostgreSQL conserve ses journaux de fonctionnement. Les réglages du conteneur limitent le détail des erreurs et réservent la journalisation des instructions SQL en erreur au niveau `PANIC`. Laisser la journalisation des paramètres et des requêtes désactivée en usage courant. [Journalisation PostgreSQL](https://www.postgresql.org/docs/17/runtime-config-logging.html)

La procédure de sauvegarde, la mise à jour et le retour arrière sont décrits dans le [plan de reprise](database-backup-and-recovery.md).

Utiliser la [fiche de recette sur site](clinic-on-site-acceptance.md) pour consigner le contrôle des deux postes et l’impression A5.
