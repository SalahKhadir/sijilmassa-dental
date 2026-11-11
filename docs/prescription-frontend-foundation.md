# Fondation frontend des ordonnances persistées — 8.5C.3A

Cette phase ajoute un client typé, le proxy same-origin et des hooks de formulaire réutilisables. Les routes `/documents` et les providers du prototype restent inchangés. Aucun écran opérationnel ne consomme encore ce client.

Les sources de vérité sont `PrescriptionController`, `PrescriptionDtos`, `PrescriptionValidation`, `PrescriptionService` et `GlobalExceptionHandler` côté Spring. Certaines sections historiques du [contrat REST](prescription-rest-contract.md) décrivent des opérations futures. Le [contrat de finalisation livré](prescription-finalization-contract.md) prévaut pour la finalisation et les PDF.

## Opérations et routes

Le navigateur utilise exclusivement `/api/v1/prescriptions` sur son origine Next. L’adresse Spring reste une variable serveur privée.

| Client | Méthode et chemin proxy | Entrée |
| --- | --- | --- |
| `create` | POST `/prescriptions` | `{ patientId, content }` |
| `history` | GET `/prescriptions` | Patient obligatoire ; statut, archive, consultation et curseur facultatifs |
| `get` | GET `/prescriptions/{id}` | `patientId` |
| `update` | PUT `/prescriptions/{id}` | `patientId`, corps `{ version, content }` |
| `archive` | PUT `/prescriptions/{id}/archival` | `patientId`, corps `{ version }` |
| `finalize` | PUT `/prescriptions/{id}/finalization` | `patientId`, corps `{ version, patientVersion }` |
| `download` | GET `/prescriptions/{id}/pdf` | `patientId`, `version`, `disposition=attachment` |

Le tableau omet le préfixe `/api/v1`. Les autres méthodes sont refusées avec 405 et les chemins inconnus avec 404. Le contrôleur Spring conserve la validation des paramètres inconnus, répétés, vides et des associations. Le proxy transmet aussi les paramètres des mutations pour préserver leur périmètre patient et permettre ce contrôle.

L’historique accepte uniquement `patientId`, `status=BROUILLON|FINALISEE`, `archive=active|archived|all`, `consultationId` et `before={ date, id }`. Le client traduit le curseur en `beforeDate`/`beforeId`. Une page contient au plus 50 résumés, ordonnés par date d’émission puis UUID décroissants. Une page pleine fournit le curseur de son dernier élément ; la page suivante peut être vide. Le client valide ordre, unicité, curseur et correspondance des filtres. Il ne charge pas automatiquement les pages suivantes.

## DTO et validation

`frontend/src/lib/prescriptions/api/schemas.ts` définit les schémas Zod stricts et les types inférés des commandes, lignes, contenu, détails, résumés, historique, curseurs et métadonnées documentaires.

- Patient obligatoire et consultation explicitement nullable. La propriété de la consultation reste contrôlée par Spring.
- UUID canoniques selon le contrôleur Java, sans restriction artificielle de version UUID.
- Dates civiles réelles entre les années 0001 et 9999 ; instants UTC avec précision maximale de six décimales.
- Versions entières sûres, non négatives. Aucune mutation quand la version ne peut plus être incrémentée.
- Limites de texte en unités UTF-16, contrôles C0 interdits hors tabulation/CR/LF, substituts Unicode isolés refusés. Le client ne modifie ni ne tronque le texte ; Spring applique sa normalisation de bord.
- Zéro à vingt lignes incomplètes autorisées au brouillon. Les UUID de lignes sont absents à la création, facultatifs et distincts à la mise à jour, obligatoires en réponse.
- L’ordre du tableau représente l’ordre des médicaments ; aucun champ `position` ou version de ligne n’est envoyé. Un remplacement retire les lignes omises.
- `BROUILLON` implique `finalizedAt=null` et `document=null`. `FINALISEE` exige les métadonnées documentaires et interdit une archive. La projection patient courante doit appartenir à l’ordonnance.

Le client contrôle également patient/ordonnance en réponse, association demandée à la création/modification et incrément de version après mutation. Les identités historiques dans `document.patientIdentity` restent distinctes de l’identité administrative actuelle ; elles ne sont jamais remplacées par celle-ci.

## Session, CSRF et erreurs

Le transport partagé expose désormais `createSessionResponse` pour les réponses binaires. `createSessionRequest` conserve la validation JSON. Les deux imposent credentials same-origin, absence de cache, refus des redirections et erreurs sûres. Chaque mutation obtient un nouveau jeton CSRF ; aucune écriture n’est rejouée. Le délai client de finalisation est de 30 secondes, celui du proxy de 25 secondes, pour couvrir le rendu et les transactions backend. Un délai dépassé ne prouve pas l’absence de commit.

Le proxy transmet le seul cookie de session existant et `X-CSRF-TOKEN`, conserve séparément les cookies de réponse et refuse les cookies de domaine. La vérification d’origine existante reste appliquée aux écritures. La limite des commandes prescriptions est de 256 Kio mesurés en octets ; les limites des autres ressources restent inchangées.

Les statuts et Problem Details RFC 9457 de Spring sont conservés. Le client ne conserve que les codes connus avec leur statut attendu et affiche ses propres messages français. Les détails bruts, chemins et valeurs rejetées ne sont pas affichés.

| Situation | Traitement |
| --- | --- |
| 400 `INVALID_INPUT` / `INCOMPLETE_PRESCRIPTION` | Corriger le brouillon, conserver les saisies |
| 400 `PDF_UNSUPPORTED_CHARACTER` | Expliquer les caractères non imprimables, notamment le texte arabe dynamique |
| 400 `PDF_LAYOUT_OVERFLOW` | Réduire ou réorganiser le contenu A5 ; aucune troncature |
| 409 `VERSION_CONFLICT` / `READ_ONLY` | Bloquer les nouvelles écritures jusqu’à une relecture explicite |
| 503 `RENDERER_UNAVAILABLE` | Finalisation non confirmée, relecture avant nouvelle tentative |
| 503 `PRACTITIONER_UNAVAILABLE` | Demander la validation du profil au responsable du cabinet, sans exposer sa configuration |
| 500 `DOCUMENT_UNAVAILABLE` | Restitution ou finalisation non confirmée ; aucune régénération |
| 401 / 403 | Connexion selon le mécanisme existant / accès refusé ; aucune relance automatique |
| Réponse incohérente / backend inaccessible | Erreur locale 502 / 503, sans données de démonstration |

Spring utilise 400 pour ses validations, pas 422. Le fallback 422 est néanmoins testé sans lui attribuer une opération inexistante.

## Formulaires et confirmations

`usePrescriptionDraftForm` prépare création et édition avec React Hook Form/Zod. `useFieldArray` fournit ajout, retrait confirmé et déplacement. Sa clé React `formKey` reste séparée de l’UUID métier `id`. Le patient d’une ordonnance existante est immuable.

Le contrôleur de mutation bloque immédiatement les doubles soumissions et toute répétition après succès. Sur 409, 401/403 ou erreur serveur au résultat incertain, il bloque les écritures sans toucher aux valeurs du formulaire. `acceptReload(record, true)` accepte uniquement une réponse validée pour le même dossier, met à jour la version et remplace explicitement la saisie. Le consommateur doit obtenir ce détail par `api.get` après action de l’utilisateur et expliquer que la confirmation remplace ses champs. Aucun rechargement ni rapprochement automatique n’est effectué. Pour une création au résultat incertain, consulter l’historique patient avant de remonter un formulaire neuf.

`usePrescriptionAction` prépare archive et finalisation. La finalisation présente l’identité, la date et les versions ordonnance/patient relues ; elle envoie uniquement ces deux versions. L’action exige `submit(true)` après le dialogue. Après relecture, le dialogue doit être confirmé à nouveau. `PrescriptionActionConfirmation` réutilise le dialogue accessible existant ; `PrescriptionMutationFeedback` annonce attente, erreur et succès avec les rôles ARIA.

Ces hooks sont réservés au dentiste, vérifient les droits avant/après transport et refusent les résultats d’une ancienne session. Les consommateurs doivent monter l’ensemble des champs uniquement dans une frontière de session dentiste vérifiée, démonter les formulaires lors d’une perte de droits et utiliser une clé de session/dossier. Les composants de retour et de confirmation n’affichent rien avec `allowed=false`. La révocation invalide aussi les permissions au démontage.

## Téléchargement des PDF

Le proxy exige `application/pdf`, une taille déclarée positive d’au plus 2 Mio et le nom ASCII exact `ordonnance-{UUID}.pdf`, avec disposition inline ou attachment. Il reconstruit les en-têtes sûrs, ajoute `nosniff`, conserve `private, no-store, max-age=0` et `Vary: Cookie`, retire les en-têtes non autorisés et refuse les redirections. Il transmet le flux sans charger le PDF entier en mémoire. Le flux est interrompu si sa longueur réelle diffère de celle annoncée ; après émission des en-têtes, cette erreur interrompt le téléchargement et ne peut plus devenir un Problem Details JSON.

Complément de transport livré en 8.5C.3B : Next peut retirer `Content-Length` sur une réponse diffusée. Le proxy ajoute donc `X-Prescription-PDF-Bytes`, validé contre la taille annoncée par Spring. Le client accepte ce compte lorsque `Content-Length` est absent et refuse deux comptes contradictoires.

Le client distingue d’abord les erreurs JSON. Il borne la lecture du flux, vérifie sa longueur, son type, sa signature PDF et son nom avant de produire un Blob temporaire. `useFinalizedPrescriptionDownload` n’autorise que les documents finalisés et écarte une réponse devenue obsolète après changement de dossier/session ou démontage. Le téléchargement explicite supprime son lien temporaire et révoque son URL Blob. Une copie téléchargée par l’utilisateur reste sur son poste.

Les octets viennent exclusivement du stockage backend. Le client et ces hooks n’importent ni moteur PDF, ni modèle, ni police, ni fixtures. Ils ne régénèrent jamais un document finalisé. Le backend reste responsable du contrôle de hash et de l’autorisation de restitution.

## Confidentialité et limites

Aucun contenu clinique dans localStorage, sessionStorage, IndexedDB, logs navigateur, analytics ou cache persistant. Les URL contiennent seulement les identifiants, versions et filtres contractuels. Aucun nouveau mécanisme d’authentification/RBAC n’est ajouté ; Spring reste l’autorité pour toutes les opérations.

Le backend ne propose ni annuaire global, recherche de médicament/texte libre, total global, taille de page réglable, aperçu HTTP de brouillon, restauration, correction ou remplacement. Cette fondation n’en simule aucun. Les contrôles de mise en page et des caractères lors de la finalisation restent serveur. Le profil professionnel et le renderer doivent être approuvés/disponibles côté serveur ; aucun paramétrage réel n’est effectué ici.

## Suite : 8.5C.3B

Préparer la navigation du prototype puis brancher les routes réelles, les historiques patient/consultation, les sélecteurs d’associations et les formulaires. Composer les champs accessibles, la confirmation de retrait, les dialogues d’archive/finalisation, la relecture et le rapprochement explicites, ainsi que les états de chargement/vide/erreur. Distinguer identité courante et identité documentaire historique. Utiliser les seuls octets stockés pour le PDF finalisé.

Vérifier alors les parcours navigateur complets avec sessions dentiste/accueil et PostgreSQL synthétique : saisie concurrente, version patient, perte de droits, indisponibilité de rendu et téléchargement. Les routes du prototype, assets, migrations et services backend restent inchangés dans 8.5C.3A.

## Fichiers de cette phase

Ajouts :

- `frontend/src/lib/prescriptions/api/{schemas,client,errors,download,forms,mutation}.ts`
- `frontend/src/components/prescriptions/persistent/use-prescription-forms.ts`
- `frontend/src/components/prescriptions/persistent/mutation-feedback.tsx`
- `frontend/tests/prescription-api-foundation.test.mjs`
- `docs/prescription-frontend-foundation.md`

Modifications : `frontend/src/lib/api/session-request.ts` et `frontend/src/lib/auth/backend-proxy.ts`. Aucun autre fichier suivi n’est modifié ; dix fichiers sont ajoutés et deux adaptés. Aucune dépendance nouvelle.

## Vérification exécutée le 11 novembre 2026

Depuis `frontend/` :

```sh
node --import tsx --test --experimental-test-isolation=none \
  tests/prescription-api-foundation.test.mjs tests/auth-proxy.test.mjs \
  tests/patient-api.test.mjs tests/clinical-api-foundation.test.mjs \
  tests/persistent-appointments.test.mjs tests/prescriptions.test.mjs \
  tests/prescription-components.test.mjs tests/prescription-pdf.test.mjs
pnpm exec tsc --noEmit --incremental false
pnpm lint
```

Résultat final : **154 tests réussis, 0 échec, 0 annulé, 0 ignoré**. Répartition : 47 nouveaux tests de fondation, 65 régressions auth/proxy/patients/clinique, 24 rendez-vous persistants et 18 tests historiques ordonnances/composants/PDF. TypeScript strict et ESLint sans avertissement réussissent.

Le build est réalisé dans une copie temporaire sans `.env`, avec les dépendances déjà installées et `BACKEND_INTERNAL_URL=http://127.0.0.1:9` :

```sh
BACKEND_INTERNAL_URL=http://127.0.0.1:9 node node_modules/next/dist/bin/next build --webpack
```

Build Webpack de production réussi, y compris sa vérification TypeScript et la génération des pages. Les premières tentatives dans le sandbox échouaient car la sortie du sous-processus TypeScript était vide ; l’exécution avec prise en charge des sous-processus a réussi, sans changement de configuration du projet. Le premier lot de tests a révélé le comptage Unicode de Zod différent de Java et une souscription RHF manquante dans le harnais ; ces deux points sont corrigés. Le premier lint a signalé un verrou mutable stocké dans `useState`, remplacé par `useRef`. Aucun échec restant n’est ignoré.

Les tests de transport utilisent des réponses et des identités synthétiques ; ils ne constituent pas une nouvelle intégration HTTP avec PostgreSQL. Aucune suite backend ni Playwright n’est relancée. Le scanner Unslop décline le français ; messages et documentation sont relus manuellement. `git diff --check` réussit. Aucun commit, push ou déploiement ; aucune modification des modèles PDF, polices, migrations V1–V8, services backend ou worker Node.
