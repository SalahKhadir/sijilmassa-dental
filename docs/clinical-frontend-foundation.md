# Fondation frontend clinique — phase 8.5B.1

## Périmètre

Cette phase prépare le client HTTP et les formulaires pour le [contrat REST clinique](clinical-rest-contract.md). Aucun écran du cabinet ne change de source de données : les routes, formulaires et dépôts cliniques du prototype restent inchangés. Les nouveaux hooks et composants ne sont montés dans aucune route. Ils n’importent aucune fixture et ne constituent pas un dépôt mémoire clinique.

## DTO et validation

`lib/consultations/api/schemas.ts` définit des schémas Zod stricts et leurs types TypeScript nommés. Les identifiants sont des UUID, les dates cliniques des dates civiles `AAAA-MM-JJ` de l’an 1 à 9999 et les horodatages des instants ISO UTC. Les versions doivent être des entiers JavaScript sûrs, non négatifs ; une réponse contenant une version Java non représentable est refusée.

| Modèle | Correspondance REST |
| --- | --- |
| `ClinicalDraftContent` | Rendez-vous nullable, date, motif, observations, évaluation, plan et notes |
| `ClinicalTreatmentContent` | Date, description, référence dentaire et notes |
| `CreateConsultation` | Patient UUID et contenu du brouillon |
| `UpdateConsultation` / `TreatmentMutation` | Version parent et contenu |
| `PersistentConsultation` | UUID consultation/patient, statut, version, contenu, soins actifs et horodatages |
| `PersistentTreatment` | UUID, version propre, contenu et horodatages ; aucun `consultationId` fictif ajouté |
| `ClinicalHistoryPage` | Au plus 50 résumés, curseur suivant nullable |
| `RemovedClinicalHistoryPage` | Au plus 50 soins retirés avec `removedAt`, curseur suivant nullable |

Les limites de texte sont celles du backend : motif 500, champs complémentaires 5 000 chacun, description de soin 1 000, référence dentaire 50 et notes du soin 2 000. Les entrées refusent les caractères NUL, textes obligatoires blancs, propriétés étrangères et références dentaires hors syntaxe autorisée. Aucun texte n’est tronqué ou transformé par le client ; la normalisation d’enregistrement reste celle du service.

Les réponses de soins conservent une référence textuelle historique même si elle ne respecte plus la validation d’entrée actuelle. Elles ne sont pas réécrites. Les soins retirés ont une représentation distincte ; `removedAt` n’est jamais accepté comme propriété d’un soin actif. Les collections refusent les doublons, les pages trop longues et les curseurs incohérents. Les dates et UUID suivent l’ordre PostgreSQL pour la pagination.

## Client typé

`createConsultationApi` réutilise exclusivement `createSessionRequest` : URL relatives, `credentials: same-origin`, `cache: no-store`, délai de 10 secondes et nouveau CSRF à chaque soumission explicite. Aucun jeton, résultat clinique ou cache global n’est conservé dans le client.

| Opération client | Méthode et chemin relatifs |
| --- | --- |
| `create` | POST `/api/v1/consultations` |
| `get` | GET `/api/v1/consultations/{id}?patientId=…` |
| `update` | PUT sur ce même détail |
| `addTreatment` | POST `/{id}/treatments?patientId=…` |
| `editTreatment` | PUT `/{id}/treatments/{treatmentId}?patientId=…` |
| `removeTreatment` | PUT `/{id}/treatments/{treatmentId}/removal?patientId=…` |
| `finalize` | PUT `/{id}/finalization?patientId=…` |
| `history` | GET collection avec patient et curseur `beforeDate,beforeId` facultatif |
| `removedTreatments` | GET `/{id}/treatments/removed?patientId=…`, curseur `afterDate,afterId` facultatif |

Les deux historiques retournent une seule page par appel, sans accumulation automatique. Un curseur non nul doit correspondre à la dernière ligne d’une page de 50 ; les lignes suivantes doivent dépasser le curseur dans le sens prévu. Un curseur final peut conduire à une page vide, comme sur le serveur.

Les écritures vérifient la version parent, jamais celle du soin comme substitut. La réponse doit appartenir au patient et à la consultation demandés et avancer la version parent d’une unité. La création doit retourner un brouillon version 0 et la clôture doit retourner `TERMINEE`. Une réponse incohérente devient une erreur sûre 502, sans reprise automatique ni fixtures.

## Proxy same-origin

L’allowlist de `lib/auth/backend-proxy.ts` est étendue aux neuf opérations, avec leurs méthodes exactes et UUID. Les routes inventées, identifiants synthétiques et méthodes non prises en charge sont refusés avant le transport. Les corps cliniques gardent la limite existante de 64 Kio.

Les paramètres de requête sont conservés aussi sur POST/PUT cliniques : ils portent le `patientId` requis. Les paramètres inconnus restent transmis au backend pour son rejet explicite ; ils ne sont pas effacés pour transformer une requête invalide en écriture valide. Les règles historiques des autres ressources ne changent pas.

Le proxy conserve JSESSIONID, CSRF, statuts et réponses JSON, cookies `Set-Cookie` distincts, identifiant de requête et absence de cache. L’origine des écritures est vérifiée selon le mécanisme existant. Un en-tête `Location` clinique n’est transféré que s’il désigne le détail relatif documenté avec UUID et `patientId` ; une URL interne ou un Domain de cookie inattendu est refusé. Les credentials et `BACKEND_INTERNAL_URL` restent côté serveur.

## Formulaires et versions

`api/forms.ts` prépare un modèle de brouillon avec patient UUID et rendez-vous vide ou UUID. La chaîne vide du sélecteur devient `appointmentId: null` dans la commande. Les soins sont des commandes séparées : aucun tableau de soins ou identifiant du prototype n’est envoyé avec le brouillon. Cette différence avec le formulaire mémoire est volontaire, car chaque opération réelle possède sa propre transaction et sa version parent.

Les hooks de `components/consultations/persistent/use-clinical-forms.ts` fournissent :

- `useClinicalDraftForm` pour création et modification, avec React Hook Form et résolveur Zod.
- `useClinicalTreatmentForm` pour ajout et correction d’un soin actif.
- `useClinicalAction` pour retrait logique et clôture, avec textes de confirmation et exécution uniquement après `submit(true)`.
- `useClinicalApi` pour l’accès clinique lié à l’état d’authentification courant.

Chaque instance conserve sa version de lecture initiale. Une revalidation des props ne remplace ni les champs ni la version en silence. Le patient et la consultation restent liés à leur identité initiale ; le changement d’identité ou une consultation terminée désactive l’écriture. Les soins absents de la liste active ne peuvent pas être édités ou retirés par les helpers.

Le contrôleur `api/mutation.ts` bloque les doubles soumissions avant l’attente réseau. Une réussite confirmée termine l’instance du formulaire et empêche un second envoi identique. Il ne conserve pas le résultat clinique : celui-ci est remis au callback `onSaved`.

Après 409, 401/403 ou une erreur 5xx, la soumission reste bloquée. Les champs React Hook Form et la version initiale restent en mémoire. Seul `acceptReload(record, true)` peut installer une version relue explicitement. Le booléen de confirmation doit venir d’une action utilisateur après examen du dossier. Un brouillon ou soin existant recharge alors son contenu ; l’ajout d’un nouveau soin conserve ses saisies après relecture explicite du parent. Une réponse terminée ou un soin devenu indisponible maintient la lecture seule.

Une création sans UUID dont le résultat est incertain ne peut pas être relancée par ce mécanisme : vérifier l’historique du patient, puis proposer l’ouverture du dossier retrouvé ou une nouvelle action explicite. Un timeout ne prouve pas l’absence d’enregistrement.

## Intégration accessible et confidentialité

Les consommateurs doivent monter les hooks après vérification de la session, avec une clé liée à l’utilisateur et au dossier. Si `allowed` est faux, ne pas afficher les champs cliniques ; masquer uniquement le bouton ne suffit pas. Les instances de mutation sont liées à leur utilisateur initial et nécessitent un remontage lors d’un changement de session.

`ClinicalMutationFeedback` fournit `aria-busy`, un statut de sauvegarde annoncé poliment et des erreurs `role="alert"`. Il ne rend rien lorsque l’accès clinique est refusé. Les futurs champs doivent associer leurs labels et messages React Hook Form et utiliser `disabled` pour prévenir les actions concurrentes.

Pour les actions, composer les propriétés `confirmation` avec le dialogue accessible existant `ClinicalConfirmation`, son état `busy` et son callback de confirmation. Aucun dialogue ou champ du prototype n’est remplacé en 8.5B.1.

Le client exige une fonction de permission et la vérifie avant et après chaque fetch, y compris CSRF. Les hooks n’accordent l’accès qu’à une session dentiste vérifiée. Leur garde suit la permission validée au dernier commit React et l’utilisateur propriétaire du client ; une réponse tardive d’une ancienne session est refusée. Ce contrôle protège les parcours UI ; il ne constitue pas une autorisation serveur. Spring conserve la responsabilité finale des rôles, liens, versions et états.

Aucune donnée clinique n’est placée dans localStorage, sessionStorage, des logs console, de la télémétrie ou des paramètres d’URL. Les URL ne portent que les UUID et curseurs documentés. Les saisies restent dans la mémoire de l’instance React, sans stockage persistant. Le proxy ne déduit jamais un rôle du navigateur.

## Erreurs et validation exécutée

`ClinicalApiError` choisit un message français selon le statut sans recopier le corps Problem Details reçu. Un 401 confirmé appelle le mécanisme existant de retour à la connexion ; 403 reste un refus, 409 un conflit et 503 une indisponibilité. Les réponses JSON de forme inattendue sont refusées. Le traitement des erreurs de décodage JSON reste celui du transport partagé, sans tentative de mutation supplémentaire.

Les tests ciblés utilisent des DTO synthétiques et des fetchers contrôlés, pas une nouvelle persistance. Ils vérifient les neuf opérations, CSRF, permissions, réponses incohérentes, pages, proxy, erreurs, verrou de soumission et préservation des saisies avec le vrai contrôle React Hook Form. Les états accessibles sont vérifiés par rendu statique. Aucun parcours navigateur, montage interactif complet ou test PostgreSQL de frontend n’est revendiqué pour cette phase.

```sh
cd frontend
node --import tsx --test --experimental-test-isolation=none tests/clinical-api-foundation.test.mjs
pnpm exec tsc --noEmit
pnpm lint
pnpm test
```

Validation exécutée le 10 novembre 2026 avec Node 24.20.0 :

| Contrôle | Résultat exécuté |
| --- | --- |
| Tests ciblés `clinical-api-foundation.test.mjs` | **36 réussis**, 0 échec, 0 ignoré |
| `pnpm test`, régressions frontend complètes | **265 réussis**, 0 échec, 0 ignoré |
| `pnpm exec tsc --noEmit` | Réussite |
| ESLint | Réussite, aucun avertissement |
| `git diff --check` | Réussite |
| SHA-256 migrations V1–V6 | Inchangées |

Le mode Node `--experimental-test-isolation=none`, déjà utilisé par le projet, donne les comptes individuels des tests. Aucun build de production, suite backend ou parcours navigateur n’est présenté comme exécuté ici. Unslop a décliné le français ; les messages et la documentation ont été relus manuellement. Aucun compte ou dossier réel n’est utilisé.

## Fichiers de cette phase

- `frontend/src/lib/consultations/api/{schemas,client,forms,mutation}.ts`
- `frontend/src/components/consultations/persistent/use-clinical-forms.ts`
- `frontend/src/components/consultations/persistent/mutation-feedback.tsx`
- `frontend/src/lib/auth/backend-proxy.ts`
- `frontend/tests/clinical-api-foundation.test.mjs`
- `docs/clinical-frontend-foundation.md`

## Reste pour 8.5B.2

Brancher explicitement les routes cliniques réelles, charger les patients/rendez-vous persistants, composer les champs et confirmations, puis relire l’agrégat après chaque opération confirmée. Conserver une séparation visible avec le prototype et ses fixtures ; ne pas convertir d’identifiants synthétiques en UUID.

Vérifier en navigateur la navigation, les champs et leur focus, les conflits avec saisies conservées, le retrait historique, les deux rôles, la session expirée, les erreurs réseau et les écritures depuis deux sessions. Adapter alors le harnais navigateur aux migrations V1–V6. Aucun de ces branchements, changement backend, migration, PDF ou usage de données réelles n’est commencé ici.
