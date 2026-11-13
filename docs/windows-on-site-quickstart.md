# Pilote Windows sur site

**STOP si un prérequis critique échoue.** Corriger l’écart et relancer le contrôle avant de poursuivre. Ce pilote utilise des comptes et dossiers fictifs. La version reste **CONDITIONAL RC WITH OPEN RISKS**. La mise en service clinique et la migration de données réelles restent bloquées.

## Avant le départ et sur le PC dentiste

Prendre le paquet source, les quatre archives `941-review`, le registre des empreintes, le support externe identifié, la clé publique GPG vérifiée et la fiche de recette. Vérifier le paquet source avant de remplacer la copie GitHub dans `C:\SijilmassaDental\source`. Conserver toute copie préexistante contenant des modifications. [Lot à transférer](windows-pilot-delivery.md) · [Registre à remplir](windows-pilot-acceptance-results.md#registre-de-résultats-sur-site)

Sur le PC dentiste, ouvrir **Windows PowerShell 5.1 64 bits** sous le compte opérateur. Confirmer Windows 11 x64, la virtualisation/SLAT, au moins 8 Go de RAM et 20 Gio libres sur le disque fixe indiqué dans Docker Desktop → Resources. Réserver l’IPv4 privée sur le routeur. Faire appliquer la règle HTTPS au profil Privé et aux postes autorisés. [Pare-feu](windows-11-clinic-installation.md#adresse-privée-et-pare-feu)

```powershell
Set-Location 'C:\SijilmassaDental\source'
$ErrorActionPreference = 'Stop'
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, BuildNumber, OSArchitecture
Get-CimInstance Win32_ComputerSystem | Select-Object TotalPhysicalMemory, HypervisorPresent
Get-PSDrive -PSProvider FileSystem
Get-NetIPAddress -AddressFamily IPv4 | Select-Object InterfaceAlias, IPAddress
wsl.exe --version
wsl.exe --status
wsl.exe --list --verbose
docker --context desktop-linux info --format '{{.OSType}}'
docker --context desktop-linux compose version --short
```

Attendre WSL ≥ 2.1.5, la distribution utilisateur `Ubuntu` ou son nom exact en colonne VERSION `2`, le moteur `linux` et Compose ≥ 2.30. Dans Docker Desktop, confirmer **Use the WSL 2 based engine** et l’intégration de la distribution utilisateur. Si Docker manque, vérifier l’installation et rouvrir PowerShell. Si le moteur est indisponible, ouvrir Docker Desktop et attendre. [Dépannage WSL](windows-11-clinic-installation.md#dépannage-de-la-détection-wsl)

## Préparer la configuration privée

```powershell
$root = 'C:\SijilmassaDental'
$pilot = Join-Path $root 'config\pilot.json'
New-Item -ItemType Directory -Force -Path "$root\config", "$root\config\practitioner", "$root\logs" | Out-Null
if (-not (Test-Path -LiteralPath $pilot)) {
    [IO.File]::Copy((Resolve-Path '.\deployment\windows\pilot.example.json').Path, $pilot, $false)
}
notepad.exe $pilot
```

- Garder `syntheticPilot: true`. Choisir un nom inédit `sijilmassa-…-pilot` pour une installation neuve. Pour une reprise, conserver le nom du pilote déjà vérifié.
- Mettre `941-review` dans `release`. Dans `url`, mettre l’IPv4 réservée réellement affectée au PC, par exemple sous la forme `https://ADRESSE:PORT`. Omettre le port pour 443. Saisir le dossier réel du disque Docker dans `dockerDiskDirectory`. Dans le JSON, écrire les chemins avec `/` ou doubler chaque antislash.
- Garder les chemins proposés sous `C:/SijilmassaDental/config` si cette disposition est utilisée. Laisser `caSha256` et `practitionerSha256` vides pour le premier démarrage. Renseigner le nom exact de la distribution WSL et le chemin Linux réel de `windows-backup.conf`. [Dossiers et configuration](windows-11-clinic-installation.md#dossiers-et-configuration)
- Créer `db.env` avec une ligne `DB_PASSWORD=…` et `admin.env` avec une ligne `POSTGRES_PASSWORD=…`. Utiliser deux secrets de pilote aléatoires et indépendantes d’au moins 32 caractères hexadécimaux ou Base64URL, produites par un gestionnaire de mots de passe. Enregistrer en UTF-8 sans BOM. Désactiver l’héritage ACL sur chaque fichier, limiter les droits à l’opérateur, à SYSTEM et aux administrateurs autorisés. Restreindre aussi `config` et `logs`. Saisir les valeurs dans l’éditeur hors dépôt et fermer les fichiers avant toute capture.
- Dans Ubuntu, préparer `clinic.env`, sa configuration de sauvegarde et les deux fichiers privés avec les mêmes valeurs, en mode 0600 sous le domicile WSL. Monter le disque externe, vérifier son marqueur et importer la clé **publique** vérifiée dans le trousseau dédié mode 0700. Activer l’intégration WSL pour que le socket Docker local soit accessible. [Préparation de la sauvegarde](windows-11-clinic-installation.md#sauvegarde-chiffrée-et-planification)

## Vérifier et charger les quatre archives

Les quatre empreintes sont vérifiées avant le premier chargement. Pour un autre lot, utiliser les sommes et ID du registre de ce lot avec le tag correspondant dans `pilot.json`.

```powershell
$archives = Read-Host 'Chemin du dossier contenant les quatre archives'
$hashes = [ordered]@{
    backend  = 'b911b2173dd28751bf334fd2e9b6e42bd690c913115a7de9b2bc670d4d3bdabe'
    frontend = '00c9722a392f38a9801615d2be0cec664b9a982505a2828705495d3dfb923285'
    postgres = 'd0db4d8ad49d39d5cdb414482aa0a8da8c12231130f2df4101c4a5e3ece7969f'
    https    = 'e7d209c6b37e75825a30ea7f464683c313fa5ccb4bd89b53866da8981d767008'
}
$ids = @{
    backend  = 'ab747ee766adc11cb40af587cec0bee9594e3f296ae658ef0b36e58b5b109a02'
    frontend = 'c2a27f0fd7870512204d9534155d9c400d2c188b437bd68f453f3743f9f2f11c'
    postgres = 'ae9409ed808c76357c1d72046eda7dcb58f247c58fbb8fb32a4d5e4d4509f629'
    https    = '2b8e8413f9cef2cd7ad967cd15f58b4e6350a80f5e9e0bbf72982c6d2e5d5d3e'
}
foreach ($component in $hashes.Keys) {
    $file = Join-Path $archives "$component.image.tar"
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $hashes[$component]) {
        throw "Empreinte différente ($component). Arrêter."
    }
}
foreach ($component in $hashes.Keys) {
    $image = "localhost/sijilmassa-${component}:941-review"
    $expected = "sha256:$($ids[$component]) linux/amd64"
    docker --context desktop-linux load -i (Join-Path $archives "$component.image.tar")
    if ($LASTEXITCODE -ne 0) { throw "Chargement en échec ($component)." }
    $actual = docker --context desktop-linux image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' $image
    if ($LASTEXITCODE -ne 0 -or $actual -cne $expected) { throw "Image inattendue ($component)." }
    Write-Host "OK  $image"
}
```

## Première installation et lancement

```powershell
.\deployment\windows\Install-SijilmassaDental.ps1 -ConfigPath $pilot -BeforeInstall
if ($LASTEXITCODE -ne 0) { throw 'Préflight en échec. Arrêter.' }
.\deployment\windows\Install-SijilmassaDental.ps1 -ConfigPath $pilot -Install -BootstrapAccounts -ExportPublicCa
if ($LASTEXITCODE -ne 0) { throw 'Installation incomplète. Corriger avant de poursuivre.' }
```

Attendre les lignes `OK` du préflight, puis confirmer le démarrage, la création interactive des deux comptes fictifs et l’export de la CA. À la reprise d’une installation partielle, vérifier quelles actions ont abouti et omettre les options déjà effectuées. En cas de port occupé, identifier le processus ou choisir un port libre et mettre à jour l’URL, le pare-feu et `clinic.env` avant le premier démarrage. En cas d’image manquante, contrôler le tag puis recharger l’archive vérifiée. Pour un fichier privé refusé, vérifier le chemin, l’ACL et l’encodage. Un échec de santé PostgreSQL ou backend impose un diagnostic dans Docker Desktop. Conserver les volumes du pilote.

Sur le PC dentiste, comparer le SHA-256 du certificat DER à l’empreinte affichée à l’export. Reporter cette empreinte dans `caSha256`. Faire approuver l’import manuel de la CA publique vérifiée dans les racines de confiance du compte Edge. Contrôler la chaîne, l’IPv4 du certificat et les dates. Si la CA ou le certificat est rejeté, arrêter et vérifier l’identité du fichier et l’URL.

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\SijilmassaDental\config\clinic-ca.crt'
.\deployment\windows\Start-SijilmassaDental.ps1 -ConfigPath $pilot -NoBrowser -Dialog
if ($LASTEXITCODE -ne 0) { throw 'HTTPS non validé. Arrêter.' }
```

Dans Edge, ouvrir l’URL exacte. Attendre la page de connexion sans avertissement. Dans le menu **Applications**, installer le site sous **Sijilmassa Dental**, puis créer le raccourci Bureau depuis `edge://apps`. [Raccourci et lancement](windows-11-clinic-installation.md#démarrage-quotidien-et-raccourcis)

## Poste accueil et impressions

Transférer le certificat **public** à l’accueil. Comparer son SHA-256 à celui lu sur le terminal dentiste par un canal indépendant avant l’import approuvé. Ouvrir Edge, vérifier la chaîne et créer le raccourci sous le compte accueil. Tester l’accès HTTPS depuis l’accueil, le refus des ports 5432, 8080 et 3000, puis le refus HTTPS depuis un réseau interdit. Avec le compte Accueil fictif, vérifier la prise de rendez-vous et le refus d’accès direct au dossier clinique et aux ordonnances. [Étapes de la recette accueil](windows-pilot-acceptance-results.md#3-préparer-le-pc-accueil)

Préparer le profil praticien fictif à partir de l’UUID du compte Dentiste et appliquer la procédure de maintenance du seul backend. Imprimer à 100 % une facture A5, une ordonnance A5 et le dossier A5 recto/verso. Imprimer les deux pages CNSS et les deux pages CNOPS au format natif du PDF généré. Les fonds de référence affichent environ 364 × 257 mm pour CNSS et 282 × 202,5 mm pour CNOPS, en paysage. Mesurer et relever l’alignement, les bords, le bac et le retournement. [Profil fictif et tailles à contrôler](windows-pilot-acceptance-results.md)

## Sauvegarde et reprise

```powershell
.\deployment\windows\Invoke-SijilmassaDentalBackup.ps1 -ConfigPath $pilot -ValidateOnly
if ($LASTEXITCODE -ne 0) { throw 'Support ou configuration de sauvegarde en échec.' }
.\deployment\windows\Invoke-SijilmassaDentalBackup.ps1 -ConfigPath $pilot
if ($LASTEXITCODE -ne 0) { throw 'Sauvegarde en échec.' }
.\deployment\windows\Get-SijilmassaDentalStatus.ps1 -ConfigPath $pilot
if ($LASTEXITCODE -ne 0) { throw 'Contrôle du pilote en échec.' }
```

Sur le support externe, vérifier la date, le manifeste, l’empreinte et l’enveloppe chiffrée. Tester le refus avec le support absent, puis la reprise avec le support connecté. Sur un moteur séparé, restaurer dans un PostgreSQL jetable avec un nouveau conteneur et un nouveau volume. Relire le dossier, les montants et les PDF fictifs. [Restauration sur un volume neuf](database-backup-and-recovery.md#restaurer-sur-un-volume-neuf)

Redémarrer Docker Desktop, puis Windows, et relancer le script `Start` après ouverture de session. À chaque essai, vérifier l’accès depuis l’accueil, le dossier témoin et l’empreinte de la CA. Renseigner chaque ligne **PASS**, **FAIL** ou **NOT TESTED** avec une preuve. Laisser la sauvegarde planifiée désactivée. [Registre de recette](windows-pilot-acceptance-results.md#registre-de-résultats-sur-site)
