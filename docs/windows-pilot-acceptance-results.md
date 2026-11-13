# Recette du pilote Windows 11 — phase 9.5

**Pilote sur données fictives préparé. Recette physique en attente.** La version reste **CONDITIONAL RC WITH OPEN RISKS**. Les décisions de sécurité sur libxml2 et Caddy et le triage résiduel de 9.4A.1 restent ouverts. La mise en service et la migration de données réelles restent bloquées. [Revue de sécurité](production-image-security-review.md#suivi-94a1--13-novembre-2026)

Pour exécuter la recette avec le correctif 9.5A.1, suivre le [guide rapide sur site](windows-on-site-quickstart.md) et le [registre du lot livré](windows-pilot-delivery.md). Les mesures Linux ci-dessous gardent leur portée historique.

## Registre de séance

| Élément | Valeur relevée |
| --- | --- |
| Préparation et contrôles portables | 13 novembre 2026, Codex, hôte Linux x86-64, source `5ed1e3124e5820bc1b62fca128f49c26c9d45b38` |
| Recette au cabinet | Date, heure, opérateur et initiales des deux utilisateurs à renseigner |
| PC dentiste | Modèle, édition/build Windows, CPU, RAM, espace libre et emplacement du disque Docker à renseigner |
| PC accueil | Modèle, édition/build, version Edge et interface LAN à renseigner |
| Versions et réseau | Docker Desktop, Compose, WSL, Edge dentiste, projet et lot, IP/port HTTPS, empreinte publique CA à relever |
| Impression | Modèle, pilote et version, bac, papier et duplex à renseigner |
| Reprise | Support identifié, résultat du job, horodatage UTC de l’archive et responsable de garde de la clé à renseigner |

Pour chaque essai sur site, inscrire le statut **PASS**, **FAIL** ou **NOT TESTED**, les initiales, la date et une preuve observable dans la colonne prévue. Photographier uniquement les documents fictifs si nécessaire. Les preuves excluent mots de passe, cookies, clés privées et dossiers réels. [Fiche de recette commune](clinic-on-site-acceptance.md)

## 1. Préparer le lot sur le poste de développement

1. Fournir une copie du dépôt au SHA indiqué, avec les scripts PowerShell en UTF-8 BOM et les scripts Bash en LF. Garder les configurations privées et les journaux hors de la copie transférée.
2. Transférer les quatre archives déjà analysées du lot `941-review`, par support approuvé, avec les sommes ci-dessous. Dans les archives, les noms d’images sont `localhost/sijilmassa-{backend,frontend,postgres,https}:941-review`. Aucun export de base n’est nécessaire pour démarrer ce pilote neuf. [Archive et identité du lot](../frontend/test-results/phase-9.4a.1/candidate.sha256)

| Archive | SHA-256 attendu |
| --- | --- |
| `backend.image.tar` | `b911b2173dd28751bf334fd2e9b6e42bd690c913115a7de9b2bc670d4d3bdabe` |
| `frontend.image.tar` | `00c9722a392f38a9801615d2be0cec664b9a982505a2828705495d3dfb923285` |
| `postgres.image.tar` | `d0db4d8ad49d39d5cdb414482aa0a8da8c12231130f2df4101c4a5e3ece7969f` |
| `https.image.tar` | `e7d209c6b37e75825a30ea7f464683c313fa5ccb4bd89b53866da8981d767008` |

## 2. Installer sur le PC dentiste

1. Sous le compte Windows qui exploitera le pilote, vérifier Windows 11 x64, virtualisation et SLAT, 8 Go de RAM et 20 Gio libres au minimum pour le pilote. Confirmer la licence Docker Desktop et le support de la version Windows. L’installateur approuve lui-même l’installation ou la mise à jour de WSL et Docker Desktop. Choisir le moteur Linux WSL 2. Garder le disque virtuel sur un disque fixe hors OneDrive. Les volumes PostgreSQL et TLS restent gérés par Docker. [Prérequis et licence](windows-11-clinic-installation.md#prérequis-du-pc-dentiste)
2. Réserver l’IPv4 privée du PC sur le routeur. Confirmer le profil réseau Privé et le port HTTPS disponible. L’administrateur limite la règle entrante au TCP choisi, à l’IPv4 réservée, au profil Privé et aux postes autorisés. Vérifier les règles Docker existantes, le refus du Wi-Fi invité et l’absence de redirection publique. [Réseau et pare-feu](windows-11-clinic-installation.md#adresse-privée-et-pare-feu)
3. Déposer le dépôt dans `C:\SijilmassaDental\source`. Dans PowerShell, relever les versions et préparer le fichier pilote sans écraser un fichier existant.

```powershell
Set-Location 'C:\SijilmassaDental\source'
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, BuildNumber, OSArchitecture
Get-CimInstance Win32_ComputerSystem | Select-Object TotalPhysicalMemory, HypervisorPresent
wsl --version
wsl --list --verbose
docker --context desktop-linux info --format '{{.OSType}}'
docker --context desktop-linux compose version --short
$root = 'C:\SijilmassaDental'
New-Item -ItemType Directory -Force -Path "$root\config", "$root\config\practitioner", "$root\logs" | Out-Null
$pilot = "$root\config\pilot.json"
if (-not (Test-Path -LiteralPath $pilot)) {
    Copy-Item -LiteralPath '.\deployment\windows\pilot.example.json' -Destination $pilot
}
```

4. Éditer `pilot.json`. Garder `syntheticPilot: true`, utiliser un projet inédit de forme `sijilmassa-…-pilot`, le tag `941-review`, l’URL IPv4 HTTPS réservée et l’emplacement réel du disque Docker. Laisser `caSha256` vide au premier démarrage. Préparer `db.env` et `admin.env` avec deux secrets aléatoires distincts d’au moins 32 caractères, hexadécimaux ou Base64URL, UTF-8 sans BOM. Restreindre les ACL et désactiver l’héritage sur chaque fichier selon le guide. Garder les fichiers privés hors dépôt. [Dossiers et configuration](windows-11-clinic-installation.md#dossiers-et-configuration)
5. Dans la même session, indiquer le chemin du support de transfert, calculer les sommes et les comparer au tableau avant de charger les images. Si le moteur retourne un échec, arrêter le chargement.

```powershell
$archives = Read-Host 'Chemin du dossier des quatre archives vérifiées'
$hashes = [ordered]@{
    'backend.image.tar'  = 'b911b2173dd28751bf334fd2e9b6e42bd690c913115a7de9b2bc670d4d3bdabe'
    'frontend.image.tar' = '00c9722a392f38a9801615d2be0cec664b9a982505a2828705495d3dfb923285'
    'postgres.image.tar' = 'd0db4d8ad49d39d5cdb414482aa0a8da8c12231130f2df4101c4a5e3ece7969f'
    'https.image.tar'    = 'e7d209c6b37e75825a30ea7f464683c313fa5ccb4bd89b53866da8981d767008'
}
foreach ($file in $hashes.Keys) {
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $archives $file) -ErrorAction Stop).Hash
    if ($actual -ne $hashes[$file]) { throw "Empreinte différente ($file)" }
}
foreach ($file in $hashes.Keys) {
    docker --context desktop-linux load -i (Join-Path $archives $file)
    if ($LASTEXITCODE -ne 0) { throw "Chargement en échec ($file)" }
}
.\deployment\windows\Install-SijilmassaDental.ps1 -ConfigPath $pilot -BeforeInstall
if ($LASTEXITCODE -ne 0) { throw 'Préflight en échec. Arrêter.' }
.\deployment\windows\Install-SijilmassaDental.ps1 -ConfigPath $pilot -Install -BootstrapAccounts -ExportPublicCa
```

Préparer le support et le trousseau de sauvegarde avant le préflight. La vérification de la CA se poursuit après l’export. Confirmer le démarrage et l’export sur le poste. Utiliser `-BootstrapAccounts` une seule fois pour les deux comptes fictifs. Lors d’une relance, omettre les options déjà exécutées. Conserver les ID des conteneurs et les noms des volumes du pilote avant les essais de redémarrage.

6. Relever l’empreinte SHA-256 du certificat public DER exporté au terminal serveur. Comparer le fichier par un canal indépendant, renseigner `caSha256`, puis demander à l’administrateur d’approuver l’import manuel du seul certificat public. Vérifier Edge, chaîne, IPv4 du certificat feuille, dates et absence d’avertissement. Après la connexion Dentiste fictive, ouvrir `/api/v1/auth/me` dans le même profil Edge pour relever uniquement l’UUID `id` du compte fictif. Configurer le profil d’ordonnance ci-dessous avant l’essai PDF.
7. Activer le lancement de Docker Desktop à la connexion si approuvé. Dans Edge, installer le site en tant qu’application, nommer **Sijilmassa Dental**, puis créer le raccourci via `edge://apps`. Le raccourci Edge ouvre une fenêtre indépendante. Le raccourci opérateur facultatif lance le script avec `-Dialog`. Pour tester la reprise à l’ouverture de session Windows sous le compte Docker, utiliser `-WaitForDocker -NoBrowser -Dialog` dans la tâche interactive de démarrage, après approbation. Vérifier sans élévation et noter l’effet réel du verrouillage, de la déconnexion et de la veille. [Démarrage et raccourcis](windows-11-clinic-installation.md#démarrage-quotidien-et-raccourcis)

```powershell
.\deployment\windows\Start-SijilmassaDental.ps1 -ConfigPath $pilot -Dialog
.\deployment\windows\Get-SijilmassaDentalStatus.ps1 -ConfigPath $pilot
```

### Profil fictif pour finaliser l’ordonnance

Enregistrer `practitioner.json` dans le dossier `practitionerDirectory`, en UTF-8, en reprenant les valeurs fictives de l’exercice jetable et en remplaçant l’UUID. Copier le résultat de `Get-FileHash -Algorithm SHA256` dans `practitionerSha256` dans `pilot.json`.

```json
{
  "schemaVersion": 1,
  "profileId": "synthetic-drill",
  "revision": "1",
  "dentistUserId": "REMPLACER_PAR_UUID_DENTISTE_FICTIF",
  "approved": true,
  "templateSha256": "9b988a24085101a888a9feac3271dd7e76e310dfff264abb7f1ce27d8a8d0bdd",
  "displayNameFr": "Dr Synthétique",
  "displayNameAr": "طبيب تجريبي",
  "professionalTitleFr": "Titre synthétique",
  "professionalTitleAr": "عنوان تجريبي",
  "qualificationsFr": "Diplôme synthétique",
  "qualificationsAr": "مؤهل تجريبي",
  "addressFr": "Adresse synthétique",
  "addressAr": "عنوان تجريبي",
  "phones": ["Téléphone fictif"],
  "inpe": null
}
```

En maintenance, après avoir vérifié que l’URL et le projet désignent le pilote fictif, l’opérateur peut appliquer le profil au seul backend. Cette commande recrée le conteneur backend et demande un accord explicite. Elle conserve la base et la CA.

```powershell
. .\deployment\windows\SijilmassaDental.Common.ps1
$config = Read-PilotConfig $pilot
Assert-LocalDocker
Assert-ClinicInputs $config
if ((Read-Host "Recréer uniquement le backend du projet $($config.project) ? Taper OUI") -ceq 'OUI') {
    $result = Invoke-ClinicCompose $config @('up','-d','--no-deps','--force-recreate','--no-build','--pull','never','--wait','--wait-timeout','150','backend') 165
    if ($result.Code -ne 0) { throw 'Backend indisponible. Consultez le statut du pilote.' }
}
```

## 3. Préparer le PC accueil

1. Confirmer que les deux PC rejoignent le LAN privé attendu. Transmettre l’URL et le certificat public vérifié. Comparer son empreinte SHA-256 avec celle relevée directement au terminal dentiste avant tout import approuvé. Contrôler ensuite Edge et installer le raccourci **Sijilmassa Dental** dans son propre profil. Garder le poste accueil sans moteur, secrets PostgreSQL ni clé de reprise.
2. Contrôler depuis le poste accueil. Saisir l’URL exacte du pilote, avec son port éventuel. Répéter le test HTTPS depuis un réseau invité ou interdit avec l’autorisation du responsable réseau. Le résultat attendu y est un refus.

```powershell
$site = [uri](Read-Host 'URL HTTPS privée du pilote')
Test-NetConnection $site.Host -Port $site.Port
5432, 8080, 3000 | ForEach-Object {
    Test-NetConnection $site.Host -Port $_ -InformationLevel Quiet
}
```

3. Se connecter avec le compte Accueil fictif. Depuis le compte Dentiste, relever les URL d’un dossier clinique et d’un document d’assurance fictifs. Les ouvrir dans le profil Accueil et confirmer le refus sans contenu confidentiel. Tester un mot de passe incorrect, puis un accès valide. Après déconnexion ou expiration, recharger une page privée. Fermer les autres onglets avant le test d’expiration pour éviter le maintien de session. Couper temporairement le LAN pendant une lecture, reconnecter et relire l’état avant de reprendre.

## 4. Scénario à deux postes et impression

Utiliser un patient fictif unique `Pilote 95 / Synthétique` et relever sa référence. L’accueil crée le dossier et un rendez-vous. Le dentiste ouvre le rendez-vous, crée la consultation, ajoute deux soins à **123,45 DH** et **87,65 DH**, attribue les prix, puis finalise la consultation et une ordonnance fictive. L’accueil encaisse **23,45 DH** et **7,65 DH** sur les soins correspondants. Le total attendu est **211,10 DH**, dont **31,10 DH** encaissés et **180,00 DH** restants. Le dentiste télécharge le dossier. L’accueil émet la facture des deux soins et ouvre l’aperçu. Le dentiste finalise et télécharge un document CNSS et un document CNOPS admissibles, en utilisant uniquement des identifiants fictifs. Relire les informations autorisées sur chaque poste et après redémarrage.

Pour chaque ligne, relever papier mesuré, orientation, échelle, marges, clipping, lisibilité, recto/verso, alignement des champs et fidélité du fond. Mesurer la feuille à la règle. Utiliser le pilote et le bac consignés, taille réelle **100 %**, puis comparer au PDF. Si le pilote ou le bac ne propose pas le format natif, relever l’écart et laisser l’essai en échec ou en attente. Préserver les PDF d’origine.

| Sortie | Référence de contrôle | Statut sur papier | Observation et correction |
| --- | --- | --- | --- |
| Facture | A5, 148 × 210 mm, portrait | NOT TESTED | |
| Ordonnance | A5 nominal, portrait | NOT TESTED | |
| Dossier recto | A5 nominal, portrait, volet clinique | NOT TESTED | |
| Dossier verso | A5 nominal, portrait, volet financier. Tester le bord de retournement avec le recto | NOT TESTED | |
| CNSS, deux pages | Boîte 728,40 × 1031,76 pt, rotation 270°, soit environ **364,0 × 257,0 mm affichés**, paysage | NOT TESTED | |
| CNOPS, deux pages | Boîte 799,44 × 574,08 pt, rotation 0°, soit environ **282,0 × 202,5 mm**, paysage | NOT TESTED | |

La géométrie CNSS et CNOPS provient des deux pages de chaque fond numérique. Confirmer les mêmes boîtes sur les PDF générés et les tailles prises en charge par le matériel. Le fond dossier et ordonnance mesure environ 147,9 × 210,1 mm. L’inspection numérique ne mesure aucune marge d’imprimante. [Mesures Poppler](../frontend/test-results/phase-9.5/pdf-geometry.log)

## 5. Sauvegarde, redémarrage et retour

1. Préparer le disque identifié, la distribution WSL et le trousseau public d’après le guide. Vérifier le montage et le marqueur. Le responsable garde la clé privée sur un poste de reprise distinct. Exécuter d’abord la validation, puis le job manuel après approbation.

```powershell
.\deployment\windows\Invoke-SijilmassaDentalBackup.ps1 -ConfigPath $pilot -ValidateOnly
.\deployment\windows\Invoke-SijilmassaDentalBackup.ps1 -ConfigPath $pilot
.\deployment\windows\Get-SijilmassaDentalStatus.ps1 -ConfigPath $pilot
```

2. Relever l’horodatage UTC et les résultats du contrôle de checksum et d’enveloppe. Pour consigner le SHA-256 lui-même, lire le champ `archive_sha256` du manifeste de l’archive vérifiée. Après fin de l’écriture et éjection sûre, retirer le disque, relancer et relever le code d’échec et le journal. Vérifier qu’aucune archive ne paraît sur le disque interne. Remonter le support prévu et vérifier. Après autorisation, tester une tâche interactive sous le compte Windows du pilote, avec instances concurrentes ignorées. Faire un essai de chevauchement dans ce contexte, puis laisser la tâche dans l’état approuvé. Pour l’espace faible, simuler le seuil sur le pilote, sans remplir le disque. [Planification Windows](windows-11-clinic-installation.md#sauvegarde-chiffrée-et-planification)
3. Après une archive vérifiée, tester l’arrêt et la relance de Docker Desktop, le redémarrage du service applicatif et de PostgreSQL sur le seul projet pilote, puis le redémarrage complet de Windows. Chronométrer jusqu’à l’accès HTTPS après connexion Windows. Relire le dossier fictif, les montants, les numéros et les PDF. Vérifier la conservation du volume et de la CA. Pour un arrêt imprévu, réserver la simulation à une VM jetable avec accord opérateur. Ne pas couper physiquement l’alimentation.
4. Sur un moteur de reprise séparé, suivre la procédure `deployment/restore.sh` avec le tag du manifeste et un **nouveau nom de conteneur et volume**. Comparer le dossier, la consultation, les paiements, la facture et l’assurance. Comparer les octets de la facture et de l’ordonnance figées et vérifier le texte et la géométrie des PDF recalculés. Confirmer que la source du pilote reste intacte. [Restauration isolée](database-backup-and-recovery.md#restaurer-sur-un-volume-neuf)

## Registre de résultats sur site

| ID | Contrôle physique | Statut | Preuve, écart, correction et responsable |
| --- | --- | --- | --- |
| D1 | Windows, architecture, stockage, WSL, virtualisation et moteur Docker Linux | NOT TESTED | |
| D2 | Préflight Compose, HTTPS, volume PostgreSQL et refus de certificat invalide | NOT TESTED | |
| D3 | Raccourci Edge et lanceur opérateur, deux exécutions, aucun rebuild ou remplacement inattendu | NOT TESTED | |
| D4 | Démarrage après connexion, redémarrages Docker, services et Windows, état après verrouillage, veille et déconnexion | NOT TESTED | |
| A1 | Empreinte CA vérifiée indépendamment, Edge accueil et URL HTTPS privée | NOT TESTED | |
| A2 | Ports internes et accès invité refusés, reconnexion après coupure LAN | NOT TESTED | |
| A3 | Connexion et échec de connexion, confidentialité clinique et assurance, déconnexion et expiration | NOT TESTED | |
| F1 | Scénario partagé et documents, solde 180,00 DH, cohérence après redémarrage | NOT TESTED | |
| P1 | Six sorties physiques et fidélité, voir tableau par document | NOT TESTED | |
| S1 | Support externe, sauvegarde manuelle et dernier statut vérifié | NOT TESTED | |
| S2 | Tâche Windows autorisée, disque absent, chevauchement et alerte espace faible | NOT TESTED | |
| S3 | Restauration séparée, données et PDF, garde de la clé et source intacte | NOT TESTED | |
| O1 | Reprise après arrêt simulé dans une VM jetable | NOT TESTED | |

Autorisation du pilote fictif ____________________  Date ____________________

L’ouverture clinique demande une décision distincte après traitement des écarts de sécurité, recette des deux postes, validation des formulaires et de l’impression, et revue des exigences de confidentialité, conservation et facturation.

## Vérifications exécutées sur Linux

| Vérification et commande | Résultat et portée |
| --- | --- |
| `pwsh -NoProfile -File deployment/windows/tests/WindowsPilot.Tests.ps1` · PowerShell 7.5.4 | **PASS** · syntaxe et branches portables, cas Docker simulés. [Journal](../frontend/test-results/phase-9.5/powershell.log) |
| `bash -n` sur les deux scripts Bash Windows et `bash deployment/windows/tests/windows-backup-verify.sh` | **PASS** · archive OpenPGP fictive, checksum, chemin avec espaces, support manquant et configuration dupliquée. Montage simulé. [Journal](../frontend/test-results/phase-9.5/backup-verifier.log) |
| `sha256sum --check` sur les quatre archives d’images | **PASS** · les archives correspondent au registre et portent les quatre tags `941-review`. [Journal](../frontend/test-results/phase-9.5/image-archives.log) |
| `python deployment/tests/recovery-drill.py 941-review` via un socket Podman jetable | **PASS** · copie du SHA courant avec surcharge Compose Windows et relabel SELinux ajouté au seul montage de la copie Fedora. Préflight Compose/Caddy, conflit de port, HTTPS privé, cookies et CSRF, autorisations, persistance après redémarrage des conteneurs, sauvegardes chiffrées et restauration isolée. **12 réponses API et quatre PDF** vérifiés après restauration. [Journal](../frontend/test-results/phase-9.5/linux-recovery.log) |
| `pdfinfo -f 1 -l 2 -box` sur les fonds ordonnance, dossier, CNSS et CNOPS | **PASS** · boîtes et rotations numériques relevées. Poppler a signalé une métadonnée inconnue sur le fond CNSS. L’impression reste à vérifier. [Journal](../frontend/test-results/phase-9.5/pdf-geometry.log) |
| `git diff --check`, `git status` et contrôle des empreintes initiales | **PASS** · seul ce registre de recette a été ajouté. [État final](../frontend/test-results/phase-9.5/status-final.txt) |

Les suites applicatives complètes n’ont pas été relancées. Aucun test Windows, Edge, deux-PC, Task Scheduler, support externe physique ou imprimante n’a été exécuté pendant cette session. Les résultats de la pile Linux n’attribuent aucun PASS à ces lignes.

## Vérifications 9.5A.1 sur Linux

| Vérification | Résultat |
| --- | --- |
| PowerShell 7.5.4, `deployment/windows/tests/WindowsPilot.Tests.ps1` | **PASS** · syntaxe, capture stdout/stderr, code retour, délai, UTF-8 et UTF-16LE, cas WSL/Docker simulés, configuration, port et états Compose. |
| `bash -n` et `deployment/windows/tests/windows-backup-verify.sh` | **PASS** · fichiers avec espaces, archive OpenPGP, checksum, support absent et configuration dupliquée. Montage simulé. |
| SHA-256, lot `941-review` et archive de build | **PASS** · quatre empreintes d’archive, quatre ID et plateforme après chargement dans Podman. Les 493 fichiers du contexte correspondent au Git de départ. |
| Compose 5.7.0 et Caddy sur Podman isolé | **PASS** · modèle fusionné et chemins de forme Windows acceptés par le parseur Linux. Configuration Caddy valide. Après démarrage, les quatre services sont sains et les sondes TLS vérifiées retournent 200 et 401. Un arrêt suivi d’un redémarrage conserve les ID et la CA. |
| Windows PowerShell 5.1, WSL 3.0.5.0, Docker Desktop et recette physique | **NOT TESTED** pour ce correctif. |

Le premier essai du moteur jetable a rencontré un quota sous `/tmp`. La reprise avec un stockage isolé sur le disque du projet a chargé les images. La recette Linux a utilisé le bus de session pour la résolution DNS Podman et a exécuté manuellement les sondes Compose, dont les minuteries Podman ne se déclenchaient pas sur cet hôte. Le montage de l’essai Fedora a reçu un relabel SELinux dans une surcharge locale. Les volumes de test ont été conservés. La restauration, Edge, les ACL NTFS, le pare-feu et les impressions restent à vérifier sur le matériel du pilote.
