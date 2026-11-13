# Pilote Sijilmassa Dental sur Windows 11

**Données fictives uniquement. Mise en service et migration de données réelles bloquées.** Les corrections de sécurité restantes de 9.4A.1 sont différées. La classification reste **CONDITIONAL RC WITH OPEN RISKS**. L’opérateur utilise une installation de pilote neuve, avec son propre projet Compose, ses volumes et ses comptes fictifs. [Décisions de sécurité](production-image-security-review.md#suivi-94a1--13-novembre-2026) · [Gel de la version](release-freeze-checklist.md)

## Prérequis du PC dentiste

Le PC dentiste héberge les quatre conteneurs Linux de la pile existante dans Docker Desktop avec WSL 2. Le navigateur de l’accueil se connecte au même Caddy HTTPS, à la même application et à la même base. Le pilote cible un PC x64 sous Windows 11 Pro, Enterprise ou Education encore pris en charge, build 22631 ou ultérieur, avec la virtualisation UEFI et SLAT, au moins 8 Go de RAM, WSL 2.1.5 ou ultérieur et Compose 2.30 ou ultérieur. Prévoir 20 Gio libres sur le disque fixe du pilote, puis dimensionner selon les images et la rétention. L’installateur vérifie le support Windows et les prérequis en vigueur. [Prérequis Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/) · [Installer WSL](https://learn.microsoft.com/en-us/windows/wsl/install)

Docker Desktop est gratuit pour une petite entreprise qui emploie **moins de 250 personnes et réalise moins de 10 millions USD de chiffre d’affaires annuel**. Le cabinet doit confirmer son admissibilité et accepter les conditions applicables avant installation. Si le cabinet ne remplit pas les critères, vérifier la souscription exigée avant de retenir cette architecture. Aucun hébergement payant n’est nécessaire. [Conditions Docker Desktop](https://docs.docker.com/subscription/desktop-license/) · [Accord Docker](https://www.docker.com/legal/docker-subscription-service-agreement/)

Installer ou mettre à jour WSL depuis une session autorisée. Redémarrer si demandé. Installer Docker Desktop, choisir **Use the WSL 2 based engine**, lancer Docker Desktop sous le compte Windows qui exploitera le pilote et attendre le moteur Linux. Vérifier `wsl --version`, `wsl --status`, `wsl --list --verbose` et `docker --context desktop-linux info --format '{{.OSType}}'`. Le contexte doit pointer sur le canal nommé local de Docker Desktop. Pour les sauvegardes, prévoir une distribution utilisateur WSL en version 2, par exemple Ubuntu, avec l’intégration Docker Desktop et un socket local. Utiliser le même compte Windows pour installer, exploiter et planifier le pilote. [Moteur WSL 2](https://docs.docker.com/desktop/features/wsl/)

## Dépannage de la détection WSL

Sur le PC testé à distance, WSL 3.0.5.0 répondait à `wsl --version` dans PowerShell. Le processus enfant de l’installateur a renvoyé le code 1, sans sortie standard capturée. L’ancien script écartait stderr et confondait cet échec avec une version insuffisante. La cause du code 1 reste indéterminée. Le changement 9.5A.1 capture les deux flux, décode UTF-8 et UTF-16LE, limite l’attente et distingue code non nul, version illisible, version ancienne et distribution manquante. Le texte brut de la commande reste hors des diagnostics de l’installateur.

Dans Windows PowerShell 5.1 **64 bits**, comparer la résolution de l’exécutable et les résultats directs.

```powershell
Get-Command wsl.exe -All | Select-Object -ExpandProperty Source
wsl.exe --version
$LASTEXITCODE
& "$env:SystemRoot\System32\wsl.exe" --version
$LASTEXITCODE
wsl.exe --status
wsl.exe --list --verbose
```

Utiliser le même compte que l’installateur. Relever l’ordre System32/WindowsApps, la version de PowerShell, le code de retour et la présence de sortie. La résolution par `Get-Command -CommandType Application` ignore les fonctions et alias PowerShell. Le processus enfant reçoit des arguments cités au format Win32. Les tests portables couvrent la lecture des deux flux et les délais. La comparaison System32/WindowsApps et le changement de comportement avec ou sans console restent à essayer sur Windows. [Commandes WSL](https://learn.microsoft.com/en-us/windows/wsl/basic-commands) · [Décodage des diagnostics Microsoft](https://github.com/microsoft/WSL/blob/master/diagnostics/collect-wsl-logs.ps1)

Si seule la console fonctionne, relancer le préflight depuis cette même console avec `-BeforeInstall -WslKeepConsole`. Ce mode conserve la console tout en capturant les flux et en répétant les contrôles. En cas de succès, conserver `-WslKeepConsole` sur la commande d’installation et les scripts `Start`, `Get-SijilmassaDentalStatus` et `Invoke-SijilmassaDentalBackup` exécutés depuis la console. Si la liste redirigée est vide, le script interroge `wslinfo --networking-mode` dans la distribution configurée. Si le contrôle reste en échec, arrêter le pilote, relever les résultats directs et faire diagnostiquer l’écart. [Signalement WSL sur la liste redirigée](https://github.com/microsoft/WSL/issues/41937)

L’exécution du correctif sous Windows reste **NOT TESTED**.

## Dossiers et configuration

Exemple de disposition à préparer manuellement. Un chemin source avec espaces est permis. Les fichiers PowerShell sont en UTF-8 avec BOM pour Windows PowerShell 5.1. Conserver les scripts Bash en LF.

| Emplacement | Contenu |
| --- | --- |
| `C:\SijilmassaDental\source` | Copie vérifiée du dépôt et scripts `deployment\windows` |
| `C:\SijilmassaDental\config` | `pilot.json`, fichiers privés PostgreSQL, dossier `practitioner` et certificat public |
| `C:\SijilmassaDental\logs` | Résultats fixes des tâches de sauvegarde |
| Disque image Docker Desktop | Volumes nommés PostgreSQL et Caddy |
| Dossier privé de la distribution WSL | Configuration Bash et trousseau public de sauvegarde |
| Disque externe identifié | Archives chiffrées et manifestes |

Dans Docker Desktop, relever l’emplacement du disque virtuel depuis **Settings → Resources**. Utiliser un disque fixe hors OneDrive et hors synchronisation. Ne pas déplacer ni copier le volume PostgreSQL à la main. Dans `config`, copier `deployment/windows/pilot.example.json` vers `pilot.json`, avec `syntheticPilot: true`, un projet inédit de forme `sijilmassa-…-pilot`, le tag du lot contrôlé, l’URL HTTPS privée et le chemin du disque virtuel déclaré. Garder le même projet et la même adresse pendant le pilote. Charger les quatre archives vérifiées avec `docker --context desktop-linux load -i CHEMIN`, puis comparer les ID locaux aux preuves de la version. La première installation utilise le lot fourni. Le lanceur quotidien n’effectue aucun build ni téléchargement d’image.

Créer `db.env` avec une seule ligne `DB_PASSWORD=…` et `admin.env` avec une seule ligne `POSTGRES_PASSWORD=…`. Employer deux valeurs indépendantes générées par un gestionnaire de mots de passe, au moins 32 caractères hexadécimaux ou Base64URL. Enregistrer en UTF-8 sans BOM. Dans **Propriétés → Sécurité → Avancé**, désactiver l’héritage de chaque fichier et conserver uniquement le compte opérateur, SYSTEM et les administrateurs autorisés. Le compte opérateur doit pouvoir lire les deux fichiers. Restreindre aussi les dossiers `config` et `logs` aux comptes autorisés. Le moteur peut inspecter l’environnement des conteneurs. Réserver l’accès Docker à l’opérateur et éviter de publier les sorties de configuration résolues.

Créer le dossier `practitioner`. Un profil fictif est nécessaire pour exercer la finalisation des ordonnances. Renseigner ensuite son SHA-256 dans `practitionerSha256`, avec le profil associé à l’UUID du compte dentiste fictif. L’installateur doit appliquer ce changement en maintenance sur le seul conteneur backend, conformément au contrat d’ordonnance. Le lanceur réutilise les conteneurs et ne recrée pas le backend pour appliquer un changement de profil. [Profil et rendu](prescription-frontend-integration.md)

## Adresse privée et pare-feu

Réserver l’IPv4 RFC 1918 du PC dentiste sur le routeur, puis la renseigner dans `url`. Compose reprend l’adresse pour lier Caddy et émettre le certificat. Utiliser le port 443 si disponible. En cas de conflit, choisir un autre port HTTPS et l’ajouter à l’URL sur les deux postes. Le préflight refuse les liaisons inattendues et les ports réservés au backend, à PostgreSQL ou à l’administration.

Sur le réseau de confiance du cabinet, vérifier le profil Windows **Privé**. Dans le pare-feu avancé, l’administrateur examine les règles existantes de Docker Desktop, puis limite l’entrée TCP au port HTTPS choisi, à l’IPv4 locale réservée, au profil Privé et aux IPv4 autorisées. Utiliser une réservation côté accueil si la règle vise une adresse unique. Vérifier les règles larges qui pourraient prévaloir. L’application Docker concernée pour les ports publiés est `com.docker.backend.exe`. Garder 5432, 8080 et 3000 internes. Vérifier l’absence de redirection du routeur, d’UPnP pour ce poste et d’accès depuis le Wi-Fi invité ou Internet. Les scripts n’écrivent aucune règle. [Réseau Docker Desktop](https://docs.docker.com/desktop/features/networking/) · [Pare-feu Windows](https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/)

## Première installation

Depuis le répertoire `source`, ouvrir Windows PowerShell sous le compte opérateur. Utiliser la politique d’exécution approuvée, avec les scripts vérifiés. Lancer `-BeforeInstall` pour vérifier les prérequis sans démarrer la pile ni créer de volume. Le contrôle de la CA devient obligatoire pour le lancement quotidien et le préflight actif. Préparer le support externe et le trousseau avant l’installation. `-Install` demande confirmation avant démarrage et vérifie la configuration, le moteur, les images locales et le réseau. Après confirmation, la validation Caddy se fait dans un conteneur temporaire sans réseau. Le démarrage préserve les volumes existants et refuse un conteneur d’un autre lot. `-BootstrapAccounts` demande une confirmation distincte et ouvre le terminal interactif Spring. L’utiliser uniquement pour le premier jeu de comptes fictifs.

```powershell
.\deployment\windows\Install-SijilmassaDental.ps1 -BeforeInstall
.\deployment\windows\Install-SijilmassaDental.ps1 -Install -BootstrapAccounts -ExportPublicCa
```

L’export récupère le seul certificat public de Caddy, le convertit en DER, affiche son empreinte SHA-256 et refuse d’écraser un fichier existant. Laisser `caSha256` vide jusqu’à cet export. Comparer l’empreinte SHA-256 du fichier reçu sur chaque poste avec l’empreinte lue sur le PC dentiste, par un canal distinct, puis la reporter dans `pilot.json`. Pour vérifier un fichier DER, utiliser `Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\SijilmassaDental\config\clinic-ca.crt'`.

Après approbation explicite de l’administrateur, importer manuellement ce certificat public vérifié dans **Autorités de certification racines de confiance** du compte Edge concerné. Utiliser le magasin du poste seulement si l’administrateur le décide. La clé de signature Caddy reste dans le volume TLS du serveur. Ouvrir l’URL privée exacte dans Edge. Vérifier la chaîne, l’IPv4 dans les noms alternatifs du certificat serveur, sa période de validité et l’absence d’avertissement. Le lanceur exige la validation Windows et la racine attendue. Un certificat non reconnu, une redirection ou une réponse HTTP inattendue empêche l’ouverture. [Magasins et import Windows](https://learn.microsoft.com/en-us/powershell/module/pki/import-certificate)

Caddy renouvelle les certificats feuilles avec sa CA persistante. Surveiller l’expiration et conserver les volumes TLS. Si la CA change, procéder à une rotation approuvée, vérifier séparément la nouvelle empreinte, remettre à jour les deux magasins et `caSha256`, puis retirer l’ancienne confiance après contrôle. Suivre la procédure de rotation du [guide local](clinic-local-deployment.md#https-et-accès-des-deux-postes).

## Démarrage quotidien et raccourcis

Sur le PC dentiste, activer l’option Docker Desktop **Start Docker Desktop when you sign in** dans les réglages approuvés. Compose utilise `unless-stopped`. Après un arrêt explicite, utiliser le lanceur opérateur pour reprendre. Pour une reprise automatique après connexion Windows, l’installateur peut créer manuellement une tâche **À l’ouverture de session** sous le même compte, avec un court délai, exécution interactive et sans privilèges élevés. Utiliser le lanceur avec `-WaitForDocker -NoBrowser -Dialog` et conserver son délai borné. Tester la notification d’échec. Docker Desktop peut démarrer après la connexion interactive. Il ne s’agit pas d’un service disponible avant connexion. À l’accueil, l’ERP est indisponible lorsque le PC dentiste est arrêté, en veille ou lorsque Docker Desktop ne fonctionne pas. Tester verrouillage, fermeture de session et redémarrage selon la politique du cabinet. [Réglages Docker Desktop](https://docs.docker.com/desktop/settings-and-maintenance/settings/)

Sur **chaque poste**, ouvrir l’adresse HTTPS dans Edge, puis **Paramètres et plus → Autres outils → Applications → Installer ce site en tant qu’application**. Nommer l’application **Sijilmassa Dental**. Dans `edge://apps`, ouvrir **Détails → Créer un raccourci sur le Bureau**. Edge gère l’icône et la fenêtre indépendante. Si un raccourci Windows personnalisé est requis, l’installateur peut convertir le [logo du projet](../frontend/public/branding/sijilmassa-dental-logo.png) en ICO et l’attribuer au raccourci opérateur. Ce raccourci quotidien ouvre seulement la page. À l’accueil, transmettre l’URL et le seul certificat public vérifié. Aucune copie de Docker, de la base, des identifiants PostgreSQL ou des clés privées de reprise n’est nécessaire. Utiliser le compte Accueil distinct. [Applications de site Edge](https://support.microsoft.com/en-us/edge/install-manage-or-uninstall-apps-in-microsoft-edge)

Pour la reprise manuelle côté dentiste, créer un second raccourci opérateur **Sijilmassa Dental – démarrage**. Exemple de cible, avec le chemin réel entre guillemets.

```text
powershell.exe -NoProfile -WindowStyle Hidden -File "C:\SijilmassaDental\source\deployment\windows\Start-SijilmassaDental.ps1" -Dialog
```

Le lanceur vérifie WSL, Docker, les fichiers privés et l’état des services avant d’ouvrir le navigateur par défaut. La page de connexion et la sonde anonyme du proxy doivent répondre en HTTPS. Pour l’ouverture quotidienne en fenêtre indépendante, utiliser le raccourci Edge. Si la pile est arrêtée, le lanceur vérifie Docker Desktop, puis exécute `up --no-recreate --no-build --pull never --wait`. Les erreurs s’affichent dans une boîte de dialogue avec `-Dialog`. Aucun droit administrateur n’est prévu pour l’ouverture Edge ou le démarrage sous le compte Docker autorisé. Si Docker Desktop est arrêté, l’ouvrir manuellement, attendre le moteur Linux et relancer. En cas d’échec persistant, exécuter `Get-SijilmassaDentalStatus.ps1` depuis une console opérateur.

## Sauvegarde chiffrée et planification

Dans la distribution utilisateur WSL 2, installer les outils Linux approuvés du [plan de reprise](database-backup-and-recovery.md), dont Bash, GnuPG, GNU coreutils et util-linux. Activer l’intégration Docker Desktop de cette distribution. Vérifier que `docker info` répond sur `/var/run/docker.sock` avec le moteur Linux **Docker Desktop**. L’intégration choisie doit exposer le socket, ce que le mode Docker VMM avec simple interop ne garantit pas. [Intégration Docker Desktop](https://docs.docker.com/desktop/features/wsl/)

Copier `windows-backup.example.conf` dans le système de fichiers Linux sous le domicile WSL, hors dépôt, en mode 0600. Le fichier contient uniquement des paramètres littéraux. Préparer `clinic.env` sur le même système de fichiers, en mode 0600, d’après `deployment/.env.example`. Le projet, le lot, l’IPv4 et le port doivent correspondre à `pilot.json`. Renseigner les chemins WSL absolus. Conserver des copies opérateur de `db.env` et `admin.env` sous le domicile Linux avec mode 0600, mêmes valeurs que dans les fichiers Windows. Le wrapper Linux valide ces droits et l’identité du lot en cours. Il utilise Compose pour accéder aux conteneurs existants par leur projet et leur service. Le chemin Linux du profil doit exister pour la validation Compose. Pour la reprise, suivre la procédure existante sur un volume neuf et conserver l’accès au trousseau de reprise sur un poste distinct.

Importer uniquement la clé publique vérifiée dans un trousseau WSL dédié mode 0700. Saisir son empreinte complète. Sur le disque externe, réserver une lettre stable, créer le dossier de sauvegarde et poser le marqueur `.sijilmassa-backup-media` prévu par le plan de reprise. Renseigner le point de montage WSL réel et le même identifiant dans la configuration. Le script exige un montage et un marqueur concordants. Tester l’absence du support puis son retour, la publication par renommage et les verrous `flock` sur le support choisi. La compatibilité DrvFs, la synchronisation et les verrous restent à qualifier sur ce matériel. [Disques et montages WSL](https://learn.microsoft.com/en-us/windows/wsl/wsl2-mount-disk)

Depuis PowerShell, vérifier la configuration et lancer un essai manuel, puis contrôler l’état.

```powershell
.\deployment\windows\Invoke-SijilmassaDentalBackup.ps1 -ValidateOnly
.\deployment\windows\Invoke-SijilmassaDentalBackup.ps1
.\deployment\windows\Get-SijilmassaDentalStatus.ps1
```

L’essai exécute le pipeline existant `pg_dump | gpg`, contrôle les verrous et l’identité du support, puis valide manifeste, checksum, enveloppe et fraîcheur. Le dossier `logs` contient des résultats sans données médicales. Contrôler également qu’un échec est visible dans le code de retour et le journal. Les arguments de tâche contiennent les chemins des scripts ou du fichier de configuration, sans mot de passe. La clé privée de reprise reste hors du serveur quotidien.

Après qualification, l’opérateur peut créer une tâche désactivée dans **Planificateur de tâches**. Programme `powershell.exe`. Arguments `-NoProfile -NonInteractive -File "C:\SijilmassaDental\source\deployment\windows\Invoke-SijilmassaDentalBackup.ps1"`. Sélectionner le compte qui possède Docker Desktop et la distribution WSL, **Exécuter uniquement lorsque l’utilisateur est connecté**, sans élévation, puis **Ne pas démarrer une nouvelle instance**. Choisir une heure où le PC est connecté, éveillé et le disque branché. Tester manuellement, puis activer uniquement après approbation. Une tâche interactive ne couvre pas une machine arrêtée, déconnectée ou endormie. Si cette tâche ou DrvFs échoue sur le poste, conserver la sauvegarde manuelle validée sur un environnement Linux compatible selon le plan existant, et laisser la planification Windows en attente. La sauvegarde par copie du volume actif n’est pas le plan de reprise. [Règle d’instances du planificateur](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-multipleinstancespolicytype-simpletype-element)

## Recette et état de vérification

| Contrôle | État |
| --- | --- |
| Analyse syntaxique PowerShell, URL privée, guillemets, configuration manquante, CA absente, branches Docker et Compose avec doublures | Exécuté sur Linux avec PowerShell 7.5.4 |
| Pile avec surcharge Compose, HTTPS, rôles, CSRF, documents, redémarrage et restauration chiffrée | Exercice Linux avec l’adaptation SELinux décrite ci-dessous |
| Windows 11, WSL, Docker Desktop, chemins NTFS et ACL, mauvais mode, conflit de port, lancement sans élévation, réutilisation et délai d’attente | **NOT TESTED** sur Windows |
| Deux raccourcis Edge, certificat invalide ou renouvelé, connexion LAN privée, réseaux interdits, coupure et reprise, A5 | **NOT TESTED** sur les deux postes |
| Disque externe Windows, verrous DrvFs, tâche interactive, échec visible, exécution après redémarrage et reprise isolée | **NOT TESTED** sur Windows |

Sur les deux postes, utiliser des données fictives et remplir la [fiche de recette](clinic-on-site-acceptance.md). Tester le refus HTTPS avec un mauvais certificat sans modifier les protections du navigateur, le port occupé avec un service de test, le redémarrage et les lancements répétés en comparant les conteneurs et le dossier fictif. Vérifier l’absence d’accès depuis le Wi-Fi invité, puis le retour de la lecture après coupure. Relever la dernière archive vérifiée et tester une restauration isolée. Conserver le blocage de mise en service jusqu’aux décisions de sécurité, à la validation des postes et aux exigences métier et réglementaires.

### Preuves hors Windows

- `pwsh -NoProfile -File deployment/windows/tests/WindowsPilot.Tests.ps1` a vérifié le parseur, la compilation de la sonde HTTPS et les branches portables. Les réponses Docker étaient simulées. [Journal PowerShell](../frontend/test-results/phase-9.4b/powershell-tests.log)
- `bash deployment/windows/tests/windows-backup-verify.sh` a utilisé le vérificateur réel sur une archive OpenPGP fictive. Le test a exercé les chemins avec espaces, un checksum altéré, un support absent et une configuration dupliquée. Le montage était simulé. Le premier essai en bac à sable s’est arrêté pendant la génération de clé. Le premier essai autorisé a révélé un SIGPIPE dans le test, corrigé en lisant la sortie complète. [Journal final](../frontend/test-results/phase-9.4b/backup-bridge-test-final.log)
- `python deployment/tests/recovery-drill.py 941-review` a exercé les images 9.4A.1 sur Linux en utilisant la surcharge Windows dans une copie jetable. Le premier passage a atteint le démarrage et HTTPS, puis échoué au préflight actif. Le passage suivant a ajouté le relabel SELinux au montage dans la seule copie Fedora et activé l’affichage des résultats du préflight en cas d’échec. Docker Desktop Windows n’utilise pas ce relabel. [Premier passage](../frontend/test-results/phase-9.4b/linux-overlay-recovery.log) · [Passage adapté](../frontend/test-results/phase-9.4b/linux-overlay-recovery-retry.log)

Ces preuves laissent l’exécution Windows, l’intégration WSL et le pilote à deux postes à vérifier. Les suites applicatives complètes restent celles des phases précédentes.
