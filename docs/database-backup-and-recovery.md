# Sauvegarde PostgreSQL et reprise du cabinet

## Sauvegarder

Le script utilise `pg_dump` en format custom dans le conteneur PostgreSQL, par le socket local. PostgreSQL fournit une lecture cohérente des données pendant les écritures. La sortie est chiffrée par GPG dans le même pipeline, sans fichier de dump intermédiaire. Le dossier publié contient `database.dump.gpg` et `manifest`. Le manifeste indique l’heure UTC, le tag de l’application, la version majeure PostgreSQL, les versions et checksums Flyway et le SHA-256 du fichier chiffré. Il ne contient pas de données de patient. Les deux commandes doivent réussir et l’historique Flyway est revérifié avant la publication. Le script publie un nouveau dossier par renommage et ne supprime aucun backup précédent. [Documentation PostgreSQL de pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)

Créer une clé de chiffrement sur un poste d’administration ou de récupération et conserver la clé privée protégée, avec une copie hors du poste dentiste et distincte des disques de sauvegarde. Importer uniquement la clé publique dans le trousseau GPG du compte de sauvegarde sur le PC dentiste. Vérifier son empreinte complète avant de la définir dans `BACKUP_RECIPIENT`. Une clé absente, inutilisable ou périmée fait échouer le backup. Prévoir une rotation et conserver les anciennes clés privées tant que des archives utilisent ces clés.

```sh
export CLINIC_ENV_FILE=/chemin/prive/clinic.env
export GNUPGHOME=/chemin/prive/trousseau-sauvegarde
export BACKUP_RECIPIENT=EMPREINTE_COMPLETE_VERIFIEE
deployment/backup.sh /chemin/prive/sauvegardes
deployment/backup.sh /media/backup-cabinet/sijilmassa --external /media/backup-cabinet MEDIA-A
```

Créer les répertoires de destination avant la première exécution et les garder hors du dépôt. Pour un support externe, monter le disque au point exact puis créer à sa racine `.sijilmassa-backup-media` contenant `MEDIA-A`. Le script vérifie le montage et ce marqueur au début et avant la publication. Une absence de support provoque une erreur, sans écriture dans le répertoire sous-jacent. `BACKUP_MIN_FREE_KIB` fixe le seuil d’espace libre avant export, par défaut 1 Gio. Adapter le seuil à la taille réelle de la base et vérifier la marge disponible. Une erreur de copie ou de chiffrement doit faire l’objet d’une alerte locale.

Programmer une sauvegarde quotidienne après la fermeture. Contrôler le code de retour, l’âge de la dernière archive et le montage chaque jour. Prévoir une rotation de supports et conserver au moins une copie chiffrée hors du cabinet. Exemple de rétention à valider avec le cabinet. Garder 14 sauvegardes quotidiennes et 8 hebdomadaires. Supprimer manuellement les archives plus anciennes uniquement après validation d’une restauration récente. Garder la dernière archive dont la restauration a réussi et sa clé, même si la date de rétention est dépassée. Un backup publié est un export contrôlé. Seul un essai de reprise confirme que l’application peut le relire.

Le dump couvre la base applicative, y compris les documents d’ordonnance persistés. Les rôles PostgreSQL sont recréés par la procédure, et le volume TLS, le profil praticien, les paramètres d’installation et les images doivent être conservés séparément sur un support protégé. Garder le secret de déchiffrement en dehors de cet inventaire si le même support contient les sauvegardes. Protéger aussi le disque du serveur et du poste de récupération, car la base active contient des données en clair dans son volume.

Pour une reprise hors ligne, exporter les quatre images du tag validé vers un support protégé. Conserver leur somme SHA-256 avec l’inventaire, la vérifier sur le poste de reprise puis importer les images avec `docker image load --input ARCHIVE`.

```sh
version=TAG_VALIDE
docker image save --output /chemin/prive/sijilmassa-images.tar \
  "localhost/sijilmassa-postgres:$version" "localhost/sijilmassa-backend:$version" \
  "localhost/sijilmassa-frontend:$version" "localhost/sijilmassa-https:$version"
sha256sum /chemin/prive/sijilmassa-images.tar
```

## Vérifier la dernière archive

```sh
BACKUP_MAX_AGE_HOURS=30 deployment/verify-backup.sh /chemin/prive/sauvegardes
BACKUP_MAX_AGE_HOURS=30 deployment/verify-backup.sh \
  /media/backup-cabinet/sijilmassa --external /media/backup-cabinet MEDIA-A
```

Le contrôle sélectionne le dossier publié le plus récent par date UTC. Il vérifie le manifeste, le SHA-256, l’enveloppe OpenPGP chiffrée et l’espace libre. Il ne déchiffre pas l’archive et n’a pas besoin de la clé privée. Un dossier récent incomplet ou corrompu déclenche une erreur. Les codes sont `0` pour un contrôle réussi, `1` pour un échec et `2` pour une archive intacte trop ancienne. Le seuil d’âge par défaut est de 30 heures. Le contrôle de l’enveloppe et du checksum ne remplace pas une restauration et n’authentifie pas l’origine du fichier. [Options GnuPG](https://www.gnupg.org/documentation/manuals/gnupg.pdf)

## Programmer le job sur le PC dentiste

Utiliser un compte Linux qui a déjà accès au moteur et au trousseau public de sauvegarde. Copier le modèle vers `~/.config/sijilmassa-clinic/backup.env`, le protéger en mode 0600 et renseigner les chemins absolus. Les chemins comportant des espaces peuvent être entre apostrophes. Le fichier contient des chemins et une empreinte publique. Les mots de passe restent dans les fichiers privés de la pile. Pour un disque externe, renseigner `BACKUP_MOUNTPOINT` et `BACKUP_MEDIA_ID` ensemble. Pour un disque local, laisser ces deux valeurs vides. Une destination externe absente fait échouer le job sans repli sur le disque interne.

Avant installation, charger uniquement le fichier de configuration que vous avez préparé et valider le job. `--check` valide la configuration sans lancer d’export.

```sh
(
  set -a
  . "$HOME/.config/sijilmassa-clinic/backup.env"
  set +a
  deployment/scheduled-backup.sh --check
)
systemd-analyze verify deployment/systemd/sijilmassa-backup.service deployment/systemd/sijilmassa-backup.timer
systemd-analyze calendar '*-*-* 20:00:00'
```

Installer les deux unités dans le gestionnaire utilisateur sur le serveur après la recette. Le créneau par défaut est 20 h en heure locale. Pour le modifier, créer un drop-in avec `systemctl --user edit sijilmassa-backup.timer` et ajouter un bloc `[Timer]`, une ligne `OnCalendar=` vide, puis la ligne `OnCalendar=` avec le créneau validé. Le timer rattrape un déclenchement manqué lorsque le gestionnaire utilisateur redémarre. Si le job doit fonctionner sans ouverture de session, faire configurer la persistance du gestionnaire utilisateur par l’administrateur du serveur. [Timers systemd](https://www.freedesktop.org/software/systemd/man/256/systemd.timer.html)

```sh
install -d "$HOME/.config/systemd/user"
install -m 644 deployment/systemd/sijilmassa-backup.service \
  deployment/systemd/sijilmassa-backup.timer "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now sijilmassa-backup.timer
systemctl --user list-timers sijilmassa-backup.timer
journalctl --user -u sijilmassa-backup.service --since today
```

Le job et les commandes manuelles utilisant le même répertoire de configuration partagent un verrou. Le verrou de destination protège aussi le dossier de sauvegarde. Le journal planifié indique le succès, l’échec ou l’absence du support sans détailler la sortie de PostgreSQL ou les paramètres privés. Vérifier les codes d’échec et l’âge de l’archive après le premier créneau. Le timer n’efface aucune archive.

Pour suspendre la programmation, exécuter `systemctl --user disable --now sijilmassa-backup.timer`. Si le service exporte encore, le laisser terminer et vérifier son résultat avec `systemctl --user status sijilmassa-backup.service`. Pour désinstaller, retirer les deux unités et le drop-in de ce timer s’il existe, puis lancer `systemctl --user daemon-reload`. Conserver les archives et la clé de reprise.

## Restaurer sur un volume neuf

1. Choisir un dossier complet provenant du cabinet, le tag d’application indiqué et l’image PostgreSQL correspondante. Préparer les deux fichiers de mots de passe du serveur de récupération, en mode 0600. Utiliser un moteur local avec assez d’espace.
2. Sur le poste de récupération, importer la clé privée protégée dans son trousseau dédié. Si nécessaire, la déverrouiller avant de lancer le script avec `gpg --output /dev/null --decrypt CHEMIN_VERS_DATABASE_DUMP_GPG`. Cette commande utilise le dialogue GPG et jette le flux déchiffré. Ne pas stocker la phrase secrète dans le script.
3. Exécuter la commande ci-dessous. Le dernier argument doit répéter exactement le nom du nouveau conteneur.

```sh
export CLINIC_DB_PASSWORD_FILE=/chemin/prive/db.env
export CLINIC_PG_ADMIN_FILE=/chemin/prive/admin.env
export GNUPGHOME=/chemin/prive/trousseau-reprise
export GPG_TTY=$(tty)
deployment/restore.sh /chemin/clinic-backup-HORODATAGE-ID clinic-recovery-controle VERSION --confirm clinic-recovery-controle
```

Le script vérifie les fichiers et la somme chiffrée, le tag, PostgreSQL et l’inventaire Flyway avant de créer le conteneur. Il crée un nom neuf, sans réseau ni port et avec un volume anonyme neuf. Il déchiffre le flux directement vers `pg_restore` dans une transaction. Le rôle applicatif devient propriétaire des objets restaurés. Le script compare ensuite les valeurs Flyway de l’archive et de la base restaurée. En cas d’échec, le volume reste isolé pour diagnostic. Utiliser un nom neuf pour un nouvel essai. Un checksum détecte une corruption accidentelle. N’accepter que des sauvegardes provenant d’un stockage de confiance. [Documentation PostgreSQL de pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html)

4. Relever le nom du volume avec `docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' clinic-recovery-controle`. Arrêter le conteneur de récupération avant de monter ce volume ailleurs.
5. Préparer une configuration Compose indépendante, en boucle locale, avec le tag attendu et les mêmes fichiers de secrets que la restauration. Ajouter un fichier local de surcharge avec la structure suivante. Puis démarrer le projet de reprise via `deployment/clinic.sh -f /chemin/prive/volume-reprise.yml up --wait --no-build --pull never`.

```yaml
volumes:
  db-data:
    external: true
    name: NOM_DU_VOLUME_NEUF
```

6. Vérifier Flyway et JPA au démarrage Spring. Tester les deux comptes et la cohérence d’un échantillon autorisé, dont patient, consultation, charge, paiement, numéro et snapshot de facture. Ouvrir une ordonnance persistée, le dossier et une facture émise. Valider la recette avant tout changement d’adresse ou de routage. Garder l’ancien volume hors ligne pour permettre un retour documenté.

## Incident, remplacement et mises à jour

- **Base corrompue.** Suspendre la saisie et arrêter le projet. Conserver le disque ou le volume pour diagnostic. Restaurer le dernier backup vérifié dans un projet neuf et noter la période de saisie à reconstituer depuis l’horodatage.
- **Remplacement du PC.** Installer le moteur, importer les images validées ou les reconstruire avec le bon tag, récupérer le profil et les secrets nécessaires. Restaurer dans un volume neuf. Si l’autorité privée a changé, distribuer son nouveau certificat public aux deux postes et vérifier l’empreinte avant connexion.
- **Mise à jour.** Choisir une fenêtre sans saisie. Faire un backup avant changement et consigner le tag, les images et Flyway. Tester la version proposée sur une restauration isolée. Conserver l’ancien tag et sa sauvegarde. Reprendre la saisie seulement après la recette.
- **Retour arrière.** Si le schéma est compatible et que cela a été vérifié, utiliser les images précédentes. Si une migration a avancé ou si la compatibilité est incertaine, restaurer le backup d’avant mise à jour dans un volume neuf avec l’ancienne version. Documenter les écritures postérieures au backup avant de rouvrir le service.
- **Support absent.** Reconnecter le bon disque, vérifier son marqueur et relancer la tâche externe. Vérifier l’âge de la copie locale et la présence d’une copie hors site. L’absence du disque externe ne change pas la destination locale.
