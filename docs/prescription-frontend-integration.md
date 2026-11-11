# Ordonnances enregistrées — phase 8.5C.3B

## Routes et navigation

Les écrans opérationnels utilisent le client typé et les hooks de [8.5C.3A](prescription-frontend-foundation.md). Les données viennent de Spring/PostgreSQL par le proxy same-origin. Une panne ne charge jamais de fixtures.

| Route | Fonction |
| --- | --- |
| `/documents` | Annuaire des patients enregistrés, recherche et pagination serveur |
| `/documents?patientId={UUID}` | Historique des ordonnances du patient |
| `/documents?patientId={UUID}&consultationId={UUID}` | Historique filtré par consultation du même patient |
| `/documents/ordonnances/nouvelle` | Sélection d’un patient enregistré puis création d’un brouillon |
| `/documents/ordonnances/nouvelle?patientId={UUID}&consultationId={UUID}` | Présélection patient et consultation facultative vérifiée |
| `/documents/ordonnances/{UUID}?patientId={UUID}` | Détail, archive, finalisation et PDF conservé |
| `/documents/ordonnances/{UUID}/modifier?patientId={UUID}` | Édition du brouillon ou lecture seule selon son état |
| `/documents/ordonnance-vierge` | Modèle vierge existant, sans contenu patient |
| `/demo/documents` et ses sous-routes | Prototype synthétique, aperçus PDF et feuilles de soins conservés |

Les fiches patient réelles et leur historique clinique proposent « Ordonnances du patient ». Une consultation réelle propose son historique filtré et la création d’une ordonnance associée, y compris après sa clôture si le patient reste actif. Le détail d’ordonnance permet de revenir au patient, à son historique et à la consultation liée.

L’API n’a pas d’annuaire global d’ordonnances : l’annuaire recherche des patients, puis ouvre leur historique. Aucune quantité globale d’ordonnances n’est déduite d’une page bornée. Le statut, le classement et le curseur de l’historique restent ceux du contrat backend : au plus 50 ordonnances, date puis UUID décroissants, première page et page plus ancienne. Le classement « Historique complet » inclut les brouillons archivés. Changer un filtre revient à la première page.

Les composants du prototype pointent désormais vers `/demo/documents`. Les anciens accès `/documents/assurances` restent des alias de démonstration, sans relation avec les dossiers enregistrés. Les liens internes des feuilles de soins passent par `/demo/documents/assurances`. Aucun contenu ni calcul d’assurance n’est modifié et aucune persistance d’assurance n’est ajoutée.

## Saisie et cycle

Le patient est sélectionné dans l’annuaire réel, puis relu avant le formulaire. Son identité ne peut pas être changée sur une ordonnance existante. Les consultations proposées appartiennent à ce patient, sont paginées et conservent la sélection courante même hors de la page affichée. Une association reçue par URL est aussi relue avec le patient attendu ; Spring valide à nouveau la propriété au moment de l’écriture. Les observations, soins et plans de traitement ne remplissent jamais les lignes de médicaments.

Le formulaire réutilise React Hook Form/Zod et `usePrescriptionDraftForm`. Il permet les lignes incomplètes, leur ajout, leur déplacement et leur retrait confirmé. L’UUID serveur d’une ligne est distinct de la clé React. Le tableau transmis définit l’ordre ; une nouvelle ligne n’envoie pas d’UUID. Enregistrer conserve un brouillon et ne finalise jamais implicitement.

| État | Comportement |
| --- | --- |
| Brouillon actif, patient actif | Modification, archive confirmée et finalisation séparée |
| Brouillon archivé | Lecture seule définitive ; aucune restauration, finalisation ou édition |
| Ordonnance finalisée | Contenu et PDF immuables ; aucune correction, archive ou nouvelle finalisation |
| Patient archivé | Historique, détails et PDF finalisés accessibles ; toutes les écritures refusées |

Après création ou enregistrement, la navigation ouvre le détail et le relit. Après archive/finalisation, le détail est rechargé depuis l’API. Les libellés et dates viennent des réponses persistées ; les instants sont affichés selon `Africa/Casablanca`.

## Conflits et erreurs

Chaque formulaire conserve sa version de lecture. Un 409 ne rejoue pas la mutation et ne supprime pas les champs non enregistrés. Le bouton « Recharger le brouillon » ouvre une confirmation qui explique le remplacement des saisies. Seule sa confirmation relit le détail et accepte la nouvelle version. Une relecture échouée garde les champs et l’état bloqué. Pour une création au résultat incertain, consulter l’historique avant de recommencer.

La finalisation utilise `usePrescriptionAction` et un dialogue explicite : patient, date, version ordonnance, version patient, caractère irréversible et lecture seule. Le contrôleur de mutation bloque les doubles soumissions. Une erreur de version/état ou une réponse incertaine impose une actualisation explicite, puis une nouvelle confirmation. Une réponse de finalisation réussie n’est pas un PDF fourni par le navigateur : le backend a déjà conservé les octets et leur instantané.

Les codes connus sont traduits en messages français locaux : contenu incomplet, caractères non imprimables dont l’arabe dynamique, dépassement A5, renderer indisponible, profil professionnel absent/non approuvé, document indisponible et conflit. Les erreurs brutes, chemins et paramètres de configuration ne sont pas affichés. Les erreurs de session/CSRF suivent les mécanismes existants.

## PDF conservé et impression

Les écrans réels ne proposent pas d’aperçu PDF de brouillon, car le backend ne l’expose pas. Une ordonnance finalisée propose « Télécharger le PDF finalisé » et « Préparer l’impression ». Les deux appellent le téléchargement authentifié existant, avec patient, ordonnance et version attendus. Le backend lit les octets stockés et contrôle leur taille/hash. Le client et le proxy bornent également leur transport et vérifient le type et le nom ASCII du fichier. Next peut retirer `Content-Length` sur une réponse diffusée : le proxy transmet aussi `X-Prescription-PDF-Bytes`, issu du compte validé côté Spring, et le navigateur vérifie le nombre réel d’octets contre ce compte. Aucun buffering intégral n’est ajouté au proxy.

La préparation de l’impression crée une URL Blob temporaire pour ces seuls octets et affiche un lecteur titré. « Imprimer le PDF finalisé » appelle la commande du lecteur. Le document garde le format officiel A5, les fonds et les polices existants. L’utilisateur choisit A5 et 100 % ou « Taille réelle » dans son lecteur/pilote. Si le lecteur intégré ne sait pas imprimer, le téléchargement fournit le chemin vers un lecteur système.

L’URL est révoquée après l’événement d’impression lorsqu’il est transmis par le lecteur, à la fermeture de l’aperçu, après cinq minutes, au changement de dossier/version ou au démontage. La perte de session démonte le lecteur. Une réponse arrivée après changement de dossier/session est écartée. Une copie téléchargée explicitement reste sur le poste de l’utilisateur.

Aucun import du moteur PDF, de modèle ou de police dans les composants persistés. Les octets finalisés ne sont jamais reconstruits depuis l’identité administrative actuelle. Le détail distingue celle-ci de `document.patientIdentity`, l’identité historique conservée.

## Sécurité et environnement de test

Le workspace et ses lectures/actions sont réservés au dentiste. La frontière de session existante empêche le montage des écrans cliniques pour l’accueil. Les hooks vérifient les permissions avant/après transport ; Spring reste l’autorité pour chaque ressource, mutation et PDF. Aucun changement d’authentification, RBAC, session ou CSRF.

Les écrans ne consultent pas les providers mémoire. Les URL ne portent que les identifiants, versions, filtres contractuels et codes fixes de confirmation ; aucun contenu de médicament ou instruction. Aucun contenu clinique dans localStorage, sessionStorage, IndexedDB, analytics ou logs. Les lectures sont locales à l’écran, sans cache persistant, et les réponses obsolètes sont ignorées. Une actualisation en échec retire le contenu lu et le lecteur PDF.

Le harnais existant conserve son PostgreSQL Testcontainers jetable et ses comptes aléatoires. Son launcher de test accepte des modes facultatifs `ready`, `renderer-disabled` et `missing-practitioner`. Ces modes créent uniquement un profil synthétique temporaire lié au compte de test et relancent leur propre contexte Spring sur la même base jetable. Le profil est supprimé à l’arrêt. Aucun fichier praticien réel, variable du cabinet, migration ou base existante n’est modifié.

Le mode `ready` utilise le worker construit existant, Node 24, ses ressources inchangées et son manifeste épinglé. Les variables `SYNTHETIC_RX_NODE`, `SYNTHETIC_RX_WORKER`, `SYNTHETIC_RX_MODULES` et `SYNTHETIC_RX_MANIFEST` sont propres au launcher de test ; elles ne configurent pas l’application du cabinet. Les deux modes de panne ne simulent pas de réponse HTTP : ils démarrent un vrai backend dépourvu de la capacité concernée.

## Limites

Pas de recherche globale de prescriptions, total global, aperçu de brouillon, correction/remplacement, restauration de brouillon archivé ou relation de facturation/assurance persistante. L’arabe dynamique reste refusé par le renderer ; l’arabe statique du modèle est inchangé. La mise en page reste limitée à une page A5, sans troncature.

L’impression physique dépend du lecteur et du pilote Fedora. Un test de déclenchement navigateur ne remplace pas la validation papier au cabinet. Les tests utilisent des identités et textes synthétiques ; ils n’établissent ni une configuration professionnelle approuvée pour le cabinet, ni une conformité légale.

## Vérification manuelle sur Fedora

Utiliser uniquement un environnement de validation et des patients fictifs pour ces étapes.

1. Démarrer le backend et le frontend selon la configuration locale existante, puis se connecter comme dentiste. Ouvrir Documents, rechercher un patient enregistré et ouvrir son historique.
2. Créer un brouillon, ajouter deux médicaments fictifs, les réordonner, enregistrer et recharger la page. Vérifier l’ordre, la date, les instructions et le patient.
3. Modifier le brouillon depuis deux onglets. Enregistrer le premier, puis tenter le second : vérifier le 409, les champs conservés et la confirmation de rechargement avant toute nouvelle sauvegarde.
4. Archiver un brouillon d’essai. Le retrouver avec « Historique complet » et vérifier sa lecture seule. Tester aussi les liens depuis une consultation réelle du même patient.
5. Si la capacité serveur de finalisation est déjà approuvée pour cet environnement, finaliser un brouillon complet après confirmation. Sinon vérifier le message d’indisponibilité, sans modifier la configuration professionnelle du cabinet dans le cadre de cette phase.
6. Télécharger le PDF finalisé, préparer son impression et tester « Imprimer le PDF finalisé ». Avec le lecteur PDF Fedora et le pilote de l’imprimante, choisir A5, 100 % ou « Taille réelle » ; vérifier sur papier le fond, les accents, les marges et le dégagement du pied de page. Fermer l’aperçu.
7. Se connecter comme accueil : vérifier le refus du workspace et des accès directs. Invalider une session dentiste de test et vérifier le retrait du contenu clinique.
8. Ouvrir `/demo/documents` et vérifier que ses huit exemples, aperçus et feuilles de soins restent synthétiques, sans ordonnance enregistrée ajoutée dans cet espace.

## Validation exécutée le 11 novembre 2026

| Contrôle | Résultat final |
| --- | --- |
| `pnpm test` | **332/332**, aucun échec, annulé ou ignoré ; régressions frontend et PDF incluses |
| Fondation prescription + nouveaux composants + proxy auth ciblés | **62/62**, inclus dans les 332 ; 49 tests de fondation, 5 nouveaux tests de composants/liens et 8 tests auth/proxy |
| Nouveau navigateur prescriptions, mode `ready` | **10/10**, aucun échec ou ignoré |
| Navigateur, mode `missing-practitioner` | **1/1**, vrai refus 503 et brouillon conservé |
| Navigateur, mode `renderer-disabled` | **1/1**, vrai refus 503 et brouillon conservé |
| Régressions navigateur existantes | **10/10** : 3 prototype ordonnances, 5 clinique persistée, 2 CNSS/odontogramme |
| Total des parcours navigateur distincts exécutés | **22/22**, hors contrôles supplémentaires du harnais |
| `pnpm exec tsc --noEmit --incremental false` | Réussi |
| `pnpm lint` | Réussi, sans avertissement |
| `node node_modules/next/dist/bin/next build --webpack` | Réussi, y compris TypeScript et génération des pages |
| Backend `./mvnw -B -ntp test-compile` | Réussi ; seul le launcher de test change |
| `git diff --check` | Réussi |

Les commandes frontend sont exécutées depuis `frontend/`. Le build et le harnais navigateur utilisent une copie temporaire sans `.env`, avec les dépendances déjà installées. Le build utilise `BACKEND_INTERNAL_URL=http://127.0.0.1:9` ; le harnais remplace cette valeur par son propre backend jetable au démarrage.

Les trois modes sont exécutés séparément, depuis cette copie :

```sh
PRESCRIPTION_E2E_MODE=ready BROWSER_TEST_FILE=persistent-prescriptions.test.mjs node tests/browser/run-real-integration.mjs
PRESCRIPTION_E2E_MODE=missing-practitioner BROWSER_TEST_FILE=prescription-unavailable.test.mjs node tests/browser/run-real-integration.mjs
PRESCRIPTION_E2E_MODE=renderer-disabled BROWSER_TEST_FILE=prescription-unavailable.test.mjs node tests/browser/run-real-integration.mjs
PRESCRIPTION_E2E_MODE=off BROWSER_TEST_FILE=prescriptions.test.mjs,persistent-clinical.test.mjs,insurance.test.mjs node tests/browser/run-real-integration.mjs
```

L’environnement de ces commandes définit le socket Podman privé de test via `DOCKER_HOST`, `TESTCONTAINERS_RYUK_DISABLED=true`, le JDK 25, Chrome et les quatre variables synthétiques de rendu décrites plus haut. Le worker est construit avec `node frontend/scripts/build-prescription-renderer.mjs` depuis la racine ; ses chemins sont absolus et son manifeste est haché avant le lancement. Les tests spécifiques aux capacités de rendu sont ignorés hors de leur mode explicite ; aucun ne l’a été dans les passages ci-dessus.

La cible Java reste 21 ; le runtime réellement utilisé est JDK 25.0.4.1. PostgreSQL est 17.11, Node 24.20.0. Les anciennes **231 validations backend** de 8.5C.2B.2 restent un résultat historique, réutilisé car aucun code backend de production ne change ; elles ne sont pas présentées comme relancées. Le launcher modifié est compilé et exercé directement par les nouvelles intégrations réelles.

### Couverture des parcours

Les dix nouveaux parcours en mode `ready` couvrent ensemble : connexion dentiste, création d’un patient depuis l’interface, sélection par annuaire, création/ordre/retrait/édition d’un brouillon, persistance après rechargement, archive confirmée et immutabilité, historique par patient et consultation, contrôle de propriété, conflit ordonnance/patient, saisies conservées puis rechargement confirmé, finalisation séparée et irréversible, double clic ne produisant qu’une requête, document finalisé en lecture seule, session invalidée, CSRF refusé, accueil interdit, contenu incomplet, arabe dynamique et débordement A5 refusés, mobile et isolation du prototype.

Le PDF téléchargé par le navigateur est parsé : une page, 419,25 × 595,499986 points. Son SHA-256 et sa longueur correspondent aux métadonnées persistées ; ses octets correspondent à un second téléchargement authentifié. Une modification ultérieure de l’identité patient synthétique change l’en-tête courant du détail, conserve l’identité historique et restitue exactement les mêmes octets pour l’impression. L’appel natif d’impression est espionné dans le test : il s’agit d’une preuve du déclenchement, pas d’une impression physique. La fermeture du lecteur révoque son URL Blob.

Le harnais arrête aussi son vrai backend après les parcours : les réponses patients, agenda, clinique et prescriptions passent à 503 sans cache ; une actualisation retire le contenu nominatif. Les stockages navigateur restent vides et les marqueurs cliniques/mots de passe synthétiques sont absents des logs de service. Les captures 1440 px du détail finalisé et 390 px du formulaire sont inspectées, sans débordement horizontal sur le formulaire mobile. Les empreintes du modèle A5 et de Liberation Sans correspondent aux contrats existants.

### Échecs rencontrés et corrigés

Le premier lot de 20 parcours a passé 16 tests et en a échoué 4. Les causes étaient : téléchargement refusé car Next retirait `Content-Length`, libellé de filtre incluant le texte des options, sélecteur d’erreur ambigu avec l’annonceur Next, et sixième connexion dans la fenêtre du throttle existant. Le transport porte maintenant un compte d’octets explicite, les filtres ont des labels associés par identifiant, les tests ciblent le message d’erreur réel et les groupes tournent sur des environnements jetables séparés. Le throttle n’est pas modifié.

Une promesse de téléchargement non consommée masquait initialement l’assertion de transport sous une erreur de fermeture de contexte ; le test a été corrigé pour révéler la véritable absence de taille. Les deux passages intermédiaires à 9/10 précèdent le correctif de transport. Les passages finaux sont verts ; aucun échec intermittent restant n’est écarté ou relancé automatiquement.

Le scanner Unslop décline le français : relecture manuelle des messages et de cette documentation. La revue React porte sur les dépendances des hooks, la conservation des saisies, les réponses obsolètes, les contrôles accessibles et le nettoyage des URL. Aucun conteneur ou serveur de test n’est conservé après validation.

## Fichiers concernés

- Routes réelles : `frontend/src/app/(cabinet)/documents/page.tsx` et `documents/ordonnances/{nouvelle,[id],[id]/modifier}/page.tsx`.
- Routes de démonstration ajoutées : `frontend/src/app/(cabinet)/demo/documents/`, dont ordonnances, modèle vierge et aliases des feuilles de soins.
- Écrans ajoutés : `frontend/src/components/prescriptions/persistent/{shared,history,forms,record,pdf-panel}.tsx`.
- Fondation adaptée : `frontend/src/components/prescriptions/persistent/use-prescription-forms.ts`, `frontend/src/lib/prescriptions/api/download.ts`, `frontend/src/lib/auth/backend-proxy.ts` et documentation de fondation. Les autres fichiers déjà non committés de 8.5C.3A sont conservés.
- Navigation réelle : `components/patients/persistent/{record,shared}.tsx`, `components/consultations/persistent/{history,record}.tsx`, `components/shell/{prototype-notice,data-scope-label}.tsx`.
- Navigation du prototype : `components/prescriptions/{documents-page,patient-prescriptions,prescription-details,prescription-form-page,prescription-form,prescription-list,prescription-states,blank-prescription-page}.tsx` ; seuls les chemins des liens changent, avec un retour paramétrable pour le modèle vierge.
- Liens d’assurance synthétiques : `components/insurance/{documents-insurance-section,insurance-draft-form,insurance-draft-page,patient-insurance-section}.tsx`.
- Tests ajoutés : `frontend/tests/persistent-prescription-components.test.mjs`, `frontend/tests/browser/{persistent-prescriptions,prescription-unavailable}.test.mjs`.
- Tests adaptés : `frontend/tests/prescription-api-foundation.test.mjs`, attentes de routes des fichiers navigateur `prescriptions`, `patients`, `insurance`, `cnops-insurance`, `far-insurance`, `insurance-audit`, et `tests/browser/run-real-integration.mjs`.
- Launcher backend de test : `backend/src/test/java/ma/sijilmassa/BrowserIntegrationEnvironment.java`.
- Documentation : ce fichier et le complément de transport dans `docs/prescription-frontend-foundation.md`.

Aucune dépendance, migration V1–V8, règle d’authentification/RBAC, service backend de production, worker Node, modèle, police ou branding modifié. Aucun enregistrement réel, commit, push ou déploiement. La phase s’arrête à 8.5C.3B.
