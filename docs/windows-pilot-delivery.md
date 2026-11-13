# Lot à transférer pour le pilote Windows 9.5A.1

**CONDITIONAL RC WITH OPEN RISKS.** Le lot est réservé à une recette avec des données fictives. Les écarts libxml2, Caddy et le triage résiduel restent ouverts. La mise en service et la migration de données réelles restent bloquées. [Revue de sécurité](production-image-security-review.md#suivi-94a1--13-novembre-2026)

## Identifier et préparer le transfert

- [ ] Source de départ Git `fffc1469c0e48eb7aac24a362467fa3cdc6b02cb`, plus les fichiers du correctif 9.5A.1. Relever le SHA du checkout et conserver le manifeste du paquet source. Sur le PC dentiste, vérifier la copie sous `C:\SijilmassaDental\source` avant d’exécuter les scripts. Une archive GitHub contient les fichiers suivis au SHA choisi. Le correctif local et les archives Docker se transfèrent séparément d’une archive GitHub du SHA de départ.
- [ ] Copier les quatre fichiers `*.image.tar` depuis `frontend/test-results/phase-9.4a.1/candidate/` dans un dossier de transfert séparé, avec les deux colonnes d’identification ci-dessous. Prévoir environ 2,51 Gio sur le support. Sur chaque poste qui charge les archives, contrôler les SHA-256 avant le chargement, puis les ID d’image et `linux/amd64` après chargement. Le guide rapide contient les commandes.
- [ ] Emporter `pilot.example.json`, `windows-backup.example.conf`, `deployment/.env.example`, les deux fichiers Compose, les scripts PowerShell et Bash et la recette imprimable. Les copier depuis le paquet source. Préserver le BOM UTF-8 des scripts PowerShell et les fins de ligne LF de Bash.
- [ ] Confirmer Windows 11 x64, virtualisation/SLAT, 8 Go de RAM, 20 Gio libres sur le disque fixe de Docker, WSL ≥ 2.1.5, distribution utilisateur en version 2, Docker Desktop Linux/WSL 2, Compose ≥ 2.30, Edge et pilotes d’impression. Vérifier la version prise en charge et les conditions Docker Desktop applicables. [Prérequis du guide Windows](windows-11-clinic-installation.md#prérequis-du-pc-dentiste)
- [ ] Préparer l’IPv4 réservée, le port HTTPS, le pare-feu privé, les deux postes Edge et le transfert de la seule CA publique après export et contrôle indépendant de son empreinte.
- [ ] Préparer le support externe identifié, la clé publique GPG vérifiée, la distribution Ubuntu intégrée à Docker et l’environnement de restauration jetable. Le responsable conserve la clé privée de reprise sur un poste séparé.
- [ ] Garder hors du transfert les secrets, les fichiers privés d’installation, les clés privées, les journaux, les sauvegardes et les bases. Emporter le [guide rapide](windows-on-site-quickstart.md) et le [registre de recette](windows-pilot-acceptance-results.md#registre-de-résultats-sur-site).

## Identité du lot local `941-review`

Chaque image est étiquetée `localhost/sijilmassa-<composant>:941-review`. L’ID de configuration est la valeur de `docker image inspect --format '{{.Id}}'` après chargement. Les quatre sommes des archives et leurs ID ont été contrôlés à nouveau. Les digests de manifestes Podman d’origine sont consignés dans la [revue 9.4A.1](production-image-security-review.md#identités-et-résultats).

| Composant et archive | SHA-256 de l’archive | ID de configuration Docker |
| --- | --- | --- |
| `backend.image.tar` | `b911b2173dd28751bf334fd2e9b6e42bd690c913115a7de9b2bc670d4d3bdabe` | `sha256:ab747ee766adc11cb40af587cec0bee9594e3f296ae658ef0b36e58b5b109a02` |
| `frontend.image.tar` | `00c9722a392f38a9801615d2be0cec664b9a982505a2828705495d3dfb923285` | `sha256:c2a27f0fd7870512204d9534155d9c400d2c188b437bd68f453f3743f9f2f11c` |
| `postgres.image.tar` | `d0db4d8ad49d39d5cdb414482aa0a8da8c12231130f2df4101c4a5e3ece7969f` | `sha256:ae9409ed808c76357c1d72046eda7dcb58f247c58fbb8fb32a4d5e4d4509f629` |
| `https.image.tar` | `e7d209c6b37e75825a30ea7f464683c313fa5ccb4bd89b53866da8981d767008` | `sha256:2b8e8413f9cef2cd7ad967cd15f58b4e6350a80f5e9e0bbf72982c6d2e5d5d3e` |

Le build 9.4A.1 partait de `98dd31e4e51a6d20006b7e112e6cf167557c6052` avec des modifications locales. Le SHA-256 de `build-source.tar` est `6782ff0f09608f284e4ef4222e511b374d12846446350e8a3f583a7faa5dbb5d`. La comparaison avec `git archive` du SHA de départ 9.5A.1 couvre les fichiers admis par `.dockerignore`, dont les Dockerfiles, le worker, les sources, les ressources, les fonds PDF et les changements frontend déjà présents dans l’archive historique. Elle compare les chemins, le contenu et les bits d’exécution. Les changements 9.5A.1 portent sur les scripts et les guides hors du contexte de build. Réutiliser les archives vérifiées pour ce pilote.

### Si un fichier manque ou ne correspond plus

Arrêter le transfert et rechercher une copie vérifiée. Si une reconstruction est nécessaire, partir d’un export Git propre, avec Podman et un espace privé neuf. Construire les quatre cibles, puis conserver le SHA Git, le tag, les fichiers d’identité et les sommes avec les archives. Les bases sont épinglées dans les Dockerfiles. Le build peut contacter les registres et les dépôts de dépendances. Exécuter dans Bash depuis le dépôt, sur le poste de développement.

```bash
set -euo pipefail
umask 077
revision=$(git rev-parse HEAD)
lot=$(mktemp -d "${TMPDIR:-/tmp}/sijilmassa-pilot.XXXXXXXX")
release="95a1-${revision:0:12}-${lot##*.}"
mkdir "$lot/source" "$lot/images"
git archive "$revision" | tar -x -C "$lot/source"
printf '%s\n' "$revision" > "$lot/images/git-revision.txt"
printf '%s\n' "$release" > "$lot/images/release.txt"
cd "$lot/source"
for component in backend frontend postgres https; do
    case "$component" in
        backend|frontend) file=deployment/Dockerfile; target=$component ;;
        postgres) file=deployment/infra.Dockerfile; target=database ;;
        https) file=deployment/infra.Dockerfile; target=gateway ;;
    esac
    image="localhost/sijilmassa-$component:$release"
    podman build --platform linux/amd64 --pull=missing -f "$file" --target "$target" -t "$image" .
    podman image inspect --format '{{.Id}} {{.Digest}} {{.Os}}/{{.Architecture}}' "$image" > "$lot/images/$component.identity.txt"
    podman save --format docker-archive -o "$lot/images/$component.image.tar" "$image"
done
cd "$lot/images"
sha256sum {backend,frontend,postgres,https}.image.tar > SHA256SUMS
sha256sum --check SHA256SUMS
for component in backend frontend postgres https; do
    podman load -i "$component.image.tar"
    image="localhost/sijilmassa-$component:$release"
    test "$(podman image inspect --format '{{.Id}} {{.Digest}} {{.Os}}/{{.Architecture}}' "$image")" = "$(cat "$component.identity.txt")"
    grep -q ' linux/amd64$' "$component.identity.txt"
done
printf 'Lot à vérifier dans le moteur jetable : %s\n' "$lot/images"
```

La procédure de reconstruction est fournie pour un futur besoin. Pour un nouveau lot, utiliser un moteur jetable pour vérifier les ID après chargement, le préflight, HTTPS et la reprise selon la [liste de gel](release-freeze-checklist.md). Une nouvelle image demande une analyse de ses propres octets. Les résultats Trivy antérieurs concernent le lot analysé, avec les écarts déjà ouverts.

## Compose et Windows

Compose 5.7.0 accepte le modèle fusionné et les chemins de forme `C:/Sijilmassa Dental/…` dans le parseur Linux. La surcharge remplace le montage backend `ro,z` par un montage long en lecture seule sans relabel SELinux. Les trois volumes nommés `db-data`, `tls-data` et `tls-config` restent gérés par Docker. Les fichiers DB utilisent `env_file` en mode `raw`. Caddy publie le seul port TCP de l’IPv4 configurée. PostgreSQL, backend et frontend restent internes. Le minimum Compose 2.30 couvre à la fois `!override` et `env_file` avec `format: raw`. [Fusion Compose](https://docs.docker.com/reference/compose-file/merge/) · [Fichiers env et montages](https://docs.docker.com/reference/compose-file/services/)

Le parseur Linux et le moteur Podman ne qualifient pas les montages NTFS, les ACL, la publication sur l’IPv4 du dentiste, le pare-feu ou le moteur Docker Desktop sous WSL 2. Ces contrôles restent **NOT TESTED** sur le PC Windows. Relever leurs résultats dans le registre sur site.
