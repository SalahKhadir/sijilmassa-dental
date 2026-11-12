# Recette avant ouverture du cabinet

## Recette sur les deux postes

Les éléments ci-dessous restent à valider sur les postes du cabinet. Consigner les résultats, l’opérateur et les corrections dans la [fiche de recette imprimable](clinic-on-site-acceptance.md).

- [ ] Réserver l’IPv4 du PC dentiste. Vérifier l’accès HTTPS des deux postes et le refus depuis le Wi-Fi invité ou un réseau extérieur. Vérifier l’absence de publication de PostgreSQL et Spring.
- [ ] Installer le certificat public vérifié sur les deux postes. Confirmer que le navigateur n’affiche pas d’avertissement. Tester connexion, expiration de session et accès limité du compte accueil.
- [ ] Consigner la version d’application, les images, la version PostgreSQL, les migrations et les chemins des volumes. Vérifier le démarrage après arrêt et après redémarrage du PC.
- [ ] Initialiser les deux comptes depuis le terminal local. Confirmer que le profil praticien approuvé permet de finaliser une ordonnance.
- [ ] Tester un dossier, une facture et une ordonnance avec des données synthétiques. Vérifier l’impression A5 à taille réelle sur le matériel du cabinet.
- [ ] Chiffrer le stockage du poste. Vérifier les permissions des fichiers de configuration et limiter les accès administrateur au moteur.
- [ ] Configurer la tâche quotidienne, la copie externe, l’alerte locale et le suivi de l’espace disque. Noter qui vérifie l’âge de la dernière sauvegarde.
- [ ] Vérifier la clé de reprise sur un autre poste et conserver une copie hors site. Tester une récupération complète sans connecter le volume de reprise au projet actif.
- [ ] Documenter le responsable de la reprise, la durée d’interruption acceptable et le volume de saisie à reconstituer si une sauvegarde manque.
- [ ] Confirmer les exigences locales de confidentialité, de conservation et de conformité avant l’usage de données de soins.

Voir [l’installation](clinic-local-deployment.md) et le [plan de reprise](database-backup-and-recovery.md).

## Rejouer l’exercice sur données synthétiques

Construire les quatre images avec le même tag sur un moteur réservé à l’essai. Prévoir Python 3, GnuPG, OpenSSL, `systemd-analyze` et `pdftotext` sur la machine d’essai. Le script utilise la boucle locale, un client sur le réseau d’entrée, deux projets Compose et des volumes jetables. Il crée ses propres identifiants et clés, puis retire ses conteneurs et volumes à la fin.

```sh
DOCKER_HOST=unix:///chemin/vers/le-moteur-jetable.sock \
  python3 deployment/tests/recovery-drill.py TAG_DES_QUATRE_IMAGES
```

L’exercice vérifie le chemin HTTPS et les API avec des clients HTTP. Réserver la recette navigateur, pare-feu, stockage externe et impression aux deux postes du cabinet. Essayer chaque future mise à jour sur une copie restaurée avant de changer le tag du cabinet.

## Résultats du 11 novembre 2026

Les quatre images de production ont été construites avec le tag local `91a-drill`. L’exercice complet a réussi avec Docker Compose 5.7.0, Podman rootless 5.8.9, PostgreSQL 17.11 et GnuPG 2.4.9.

- Démarrage à froid et après arrêt contrôlé. Flyway a appliqué V1 à V11. Les deux comptes se sont connectés par HTTPS avec l’autorité privée. Le client d’entrée a joint Next.js par Caddy. Les trois services internes n’avaient aucun port publié. Le test a vérifié les attributs du cookie, le refus sans CSRF ou avec une origine étrangère et le refus d’accès clinique pour l’accueil.
- Deux sauvegardes distinctes ont été créées avec un trousseau public seul. La clé de reprise a pu déchiffrer les deux exports. L’absence d’identifiants, de répertoire, de support ou de clé et un seuil d’espace trop élevé ont provoqué des refus. Un verrou PostgreSQL a fait expirer `pg_dump`. Les archives précédentes sont restées intactes.
- Une archive altérée, un tag incompatible, une mauvaise confirmation et la réutilisation du nom de reprise ont été refusés. La restauration a réussi dans un PostgreSQL neuf sans réseau. Le projet de reprise a démarré sur le volume restauré et Spring a validé Flyway et JPA.
- Les réponses restaurées ont correspondu pour le patient, la consultation, la charge, le paiement, la facture émise et son numéro, son snapshot et l’ordonnance. Les PDF de la facture et de l’ordonnance ont été identiques octet pour octet. Le texte extrait du dossier A5 a été identique.
- `docker compose config --quiet`, la validation Caddy, ShellCheck 0.10.0 sur six scripts et les contrôles de syntaxe shell et Python ont réussi. Un essai PostgreSQL distinct a confirmé qu’une requête d’erreur synthétique n’apparaissait pas dans le journal serveur.

La validation a utilisé un moteur rootless et des clients HTTP. Elle ne couvre pas les magasins de certificats des navigateurs du cabinet, le pare-feu et le routeur physiques, le redémarrage du PC, l’expiration réelle d’une session, l’impression A5 ou la copie sur un disque externe monté.

## Vérification automatisée 9.1B

L’exercice étendu a réutilisé les quatre images `91a-drill` avec Docker Compose 5.7.0, Podman rootless 5.8.9 et PostgreSQL 17.11. Il a utilisé des comptes, dossiers, volumes et clés jetables.

- Le préflight hors service a réussi deux fois. Les inventaires des conteneurs, des volumes et du dossier de sauvegarde sont restés identiques. Une configuration ou un secret absent, une IPv4 générique, un port occupé, une publication PostgreSQL dans Compose, un fichier Caddy invalide, un seuil d’espace trop élevé et une destination absente ont donné un code d’échec. Les sorties ne contenaient pas les mots de passe synthétiques. Un contrôle complémentaire a vérifié le port libéré, l’IPv4 non attribuée et le traitement d’une permission de bind insuffisante.
- Le préflight actif a vérifié les services, les volumes, le profil praticien, les permissions des clés Caddy, la chaîne TLS, le cookie et le refus CSRF. Une mauvaise empreinte de CA et un seuil de durée serveur supérieur à la durée résiduelle ont été refusés.
- Le contrôle de sauvegarde a accepté une archive chiffrée et refusé un manifeste invalide, un checksum incorrect et un fichier non chiffré avec checksum correct. Une archive intacte de deux jours a donné le code 2 avec la politique par défaut. Les sorties d’échec ne contenaient pas le contenu synthétique du fichier.
- Les unités et le calendrier systemd ont été validés avec `systemd-analyze`. Le script du job a été exécuté à la main sur la pile jetable. Il a signalé l’absence de support externe et refusé un second export lorsque le verrou du cabinet était détenu. Aucun timer n’a été installé ni activé.
- Le démarrage, le redémarrage, les workflows fictifs et la restauration 9.1A ont réussi. Après restauration, la facture et l’ordonnance PDF ont correspondu octet pour octet. Le dossier A5 a donné le même texte extrait.
- Les huit scripts shell ont passé ShellCheck 0.10.0 et les contrôles de syntaxe. Les deux scripts Python ont compilé. `git diff --check` a réussi.

La [fiche de recette sur site](clinic-on-site-acceptance.md) reste à remplir. Elle couvre notamment le navigateur et le pare-feu des deux postes, la coupure réseau, la confiance TLS, le minuteur en service, le disque externe, le redémarrage réel et les impressions A5.
