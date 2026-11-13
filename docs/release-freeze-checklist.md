# Gel de la version candidate

Le candidat 9.4A a été construit depuis une copie d’un arbre de travail modifié. Les images et les preuves sont identifiées dans la [revue de sécurité](production-image-security-review.md). Le gel Git reste à effectuer après revue des écarts et des risques.

## Préparer le point de contrôle Git

1. Relever la branche et le commit de départ avec `git branch --show-current` et `git rev-parse HEAD`. Examiner `git status --short --untracked-files=all`, `git diff` et `git diff --cached`. Passer en revue chaque fichier non suivi.
2. Examiner les exclusions Git et le contexte de build. Garder hors de l’index les fichiers d’environnement privés, clés, profils du praticien, volumes, sauvegardes, journaux, archives d’images, SBOM et rapports bruts. Vérifier les chemins sensibles avec `git check-ignore -v CHEMIN`. Inspecter les exemples suivis pour confirmer qu’ils ne contiennent que des valeurs d’exemple.
3. Après revue, ajouter explicitement les chemins approuvés avec `git add -- CHEMINS_APPROUVÉS` et relire `git diff --cached`. Créer les commits intentionnels selon les changements revus. Relever le nouveau SHA et vérifier que `git status --porcelain=v1` est vide. Effectuer le build dans une copie propre à ce SHA, avec un contexte issu des fichiers suivis.
4. Garder les références de base par digest, la plateforme, la version du moteur, les versions des outils et les sommes du contexte. Conserver les fichiers de verrouillage. Documenter les sources de dépendances nécessaires au build. Les téléchargements Maven et npm et les horodatages de build peuvent influer sur une reconstruction indépendante.

## Construire et identifier les quatre images

Exécuter à la racine de la copie propre, avec le moteur de vérification et une étiquette de travail choisie par l’opérateur.

```sh
release=rc-revision-a-renseigner
podman build --platform linux/amd64 --pull=missing --layers -f deployment/Dockerfile --target backend -t "localhost/sijilmassa-backend:$release" .
podman build --platform linux/amd64 --pull=missing --layers -f deployment/Dockerfile --target frontend -t "localhost/sijilmassa-frontend:$release" .
podman build --platform linux/amd64 --pull=missing --layers -f deployment/infra.Dockerfile --target database -t "localhost/sijilmassa-postgres:$release" .
podman build --platform linux/amd64 --pull=missing --layers -f deployment/infra.Dockerfile --target gateway -t "localhost/sijilmassa-https:$release" .
for service in backend frontend postgres https; do
  image="localhost/sijilmassa-$service:$release"
  podman image inspect --format '{{.Id}} {{.Digest}} {{json .RepoDigests}}' "$image"
done
```

- [ ] Associer chaque ID de configuration et digest de manifeste au SHA Git, à la plateforme et au tag de travail. Conserver les archives des images contrôlées et leurs SHA-256 avec le dossier de preuves.
- [ ] Rafraîchir les bases Trivy, analyser chaque archive, générer les quatre SBOM et relever les versions des bases. Réexaminer les alertes nouvelles et résiduelles sur les digests issus du build propre.
- [ ] Exécuter le prévol et l’exercice HTTPS avec restauration dans le moteur jetable. Vérifier les identités effectivement démarrées. Documenter les contrôles ciblés exigés par toute modification depuis 9.4A.
- [ ] Refaire un build indépendant si une reproductibilité octet par octet est exigée. Comparer les manifestes, les couches et les sorties applicatives. Consigner les différences avant d’affirmer une identité de reconstruction.
- [ ] Faire valider les écarts de sécurité, le plan de reprise et les exigences métier avant la mise en service. Compléter ensuite la [recette sur site](clinic-on-site-acceptance.md) et la [liste avant ouverture](production-readiness-checklist.md).

## Conditions de gel après 9.4A.1

- [ ] Clore les lignes à preuve insuffisante du [registre de triage](../frontend/test-results/phase-9.4a.1/critical-high-triage.tsv). Consigner le correctif ou la décision d’applicabilité, la preuve et l’image exacte pour chaque écart critique ou élevé restant.
- [ ] Résoudre le chemin XML accessible au rôle SQL applicatif et les deux avis Caddy. Si une restriction est retenue, vérifier son efficacité dans la configuration cible et sur l’image définitive. [Décisions de sécurité](production-image-security-review.md#suivi-94a1--13-novembre-2026)
- [ ] Vérifier l’impact du moteur cible sur les capacités, les limites de processus et les chemins en lecture seule. Dimensionner les limites mémoire et CPU sur le poste prévu. Rejouer la recette et la restauration avec les images gelées.
