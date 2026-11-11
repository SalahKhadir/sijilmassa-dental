# Espace clinique enregistré — phase 8.5B.2

## Flux réel et limites du contrat

Les routes cliniques du cabinet utilisent désormais le client typé de [8.5B.1](clinical-frontend-foundation.md), le proxy same-origin et les neuf opérations du [contrat REST](clinical-rest-contract.md). Les données affichées proviennent de Spring/PostgreSQL. Une panne ou une réponse invalide produit un état d’erreur ; aucune fixture ne remplace une lecture réelle.

L’API fournit un historique par patient, pas un annuaire global de consultations. `/consultations` est donc un annuaire de patients enregistrés, avec recherche et pagination serveur, puis accès à leur historique. Aucun total clinique global ni compteur de tableau de bord n’est déduit d’une page limitée. Le tableau de bord et les modules financiers conservent leurs périmètres existants.

## Routes et composants

| Route | Fonction |
| --- | --- |
| `/consultations` | Annuaire clinique des patients actifs et archivés |
| `/consultations?patientId={UUID}` | Historique borné du patient |
| `/patients/{UUID}/clinique` | Même historique, depuis la fiche patient |
| `/consultations/nouveau?patientId={UUID}` | Création d’un brouillon pour un patient vérifié |
| `/consultations/nouveau?patientId={UUID}&appointmentId={UUID}` | Création avec rendez-vous vérifié et présélectionné |
| `/consultations/{UUID}?patientId={UUID}` | Compte rendu, soins actifs, actions et historique séparé des retraits |
| `/consultations/{UUID}/modifier?patientId={UUID}` | Correction du brouillon ; lecture seule si terminé ou patient archivé |
| `/demo/consultations` et ses sous-routes | Prototype clinique synthétique conservé |

Le paramètre `patientId` des détails fait partie du contrat de propriété du service ; un UUID de consultation seul ne suffit pas. Les URL ne portent pas de notes ou de contenu clinique. Les messages de confirmation de navigation utilisent seulement des codes fixes, jamais du texte clinique transmis dans la requête.

`components/consultations/persistent/history.tsx` gère l’annuaire et les pages d’historique. `forms.tsx` compose les champs avec les hooks React Hook Form/Zod existants. `record.tsx` affiche le compte rendu et les soins, puis compose les confirmations de retrait et de clôture. `shared.tsx` fournit la frontière de session, les lectures annulables au démontage et les états de chargement/erreur. Les réponses obsolètes d’une autre lecture ne remplacent pas la vue courante.

Le prototype conserve ses composants réutilisables. Ses liens cliniques et les deux retours depuis les ordonnances synthétiques pointent vers `/demo/consultations`. Les tests du prototype suivent ces nouvelles routes. Aucun générateur de PDF, calcul de facturation ou modèle d’assurance n’est modifié. Les providers mémoire historiques restent nécessaires aux autres modules de démonstration ; les écrans cliniques réels ne les consultent pas et n’y insèrent aucun UUID persistant.

## Patients et rendez-vous

La fiche patient réelle propose « Historique clinique » uniquement au dentiste. Le patient y est présélectionné pour une nouvelle consultation, puis relu avant affichage. L’historique donne accès au questionnaire et aux antécédents via leur route persistante existante.

Le détail d’un rendez-vous réel propose la création clinique au dentiste. Le rendez-vous est relu ; son patient doit correspondre au patient demandé. Sa date initiale est calculée avec les utilitaires `Africa/Casablanca`, sans décalage fixe. Le formulaire propose les rendez-vous de ce patient dans une fenêtre hebdomadaire et conserve une sélection existante même hors de cette fenêtre. Une autre date permet de consulter une autre semaine.

L’association est facultative et reste unique. Le serveur vérifie aussi la propriété du rendez-vous et les conflits. L’API ne fournit pas de recherche directe de consultation par rendez-vous : aucun lien « Ouvrir la consultation liée » n’est inventé à partir d’une première page d’historique. Une association déjà utilisée produit 409 ; l’utilisateur peut retrouver le dossier dans l’historique patient.

La clôture clinique ne modifie pas le statut administratif du rendez-vous. Les consultations réelles n’offrent aucune création de facture, ordonnance ou dossier d’assurance fictivement lié. Ces modules restent en démonstration, avec leurs fonctionnalités et documents conservés.

## Cycle, retraits et concurrence

Une création réussie ouvre le compte rendu réel. Les messages sont explicites : « Consultation créée. », « Brouillon enregistré. », « Soin ajouté. », « Soin modifié. », « Soin retiré. » et « Consultation finalisée. ». Le compte rendu est relu après les mutations confirmées.

Les soins sont enregistrés par opérations distinctes, avec la version parent de la consultation, conformément au service. Leur affichage conserve l’ordre date puis UUID fourni par le backend. Un retrait demande confirmation, conserve la ligne en base et la retire de la liste active. L’historique des retraits n’est chargé qu’à la demande du dentiste, par pages de 50 ; aucun contrôle de modification ou de restauration n’y apparaît.

Chaque instance de formulaire conserve sa version de lecture. Un 409 laisse les champs intacts et bloque la soumission. Le rechargement explicite ouvre une confirmation, relit le serveur et appelle le mécanisme `acceptReload` de 8.5B.1. Le brouillon ou soin existant reprend alors le contenu courant ; la saisie d’un nouveau soin reste disponible pour examen après relecture du parent. Aucune ancienne saisie n’est réémise automatiquement avec une nouvelle version.

Les formulaires de soin évitent d’autres mutations concurrentes dans la même vue pendant leur édition. Les doubles soumissions sont bloquées par les helpers existants. Les confirmations restent annulables lorsque l’action est en conflit ; leur bouton d’écriture est désactivé sans enfermer l’utilisateur dans un dialogue.

Les consultations finalisées affichent un compte rendu et des soins en lecture seule, y compris sur l’URL de modification. Les patients archivés gardent leur historique lisible et leurs écritures désactivées. Une archive concurrente reste contrôlée par Spring ; le rechargement relit aussi le statut patient. Une création dont le résultat est incertain renvoie vers la vérification de l’historique plutôt que vers une nouvelle soumission automatique.

## Confidentialité, temps et accessibilité

Le cabinet conserve ses contrôles de session et de rôle. La frontière clinique ne monte les lecteurs que pour un dentiste authentifié ; un changement d’utilisateur ou une session non vérifiée démonte les données de la vue. Le client vérifie également l’autorisation avant et après ses fetchs. Spring reste l’autorité finale pour chaque lecture et écriture. L’accueil ne charge pas le dossier clinique et reçoit 403 sur les appels directs.

Un 401 suit le mécanisme existant de retour à la connexion. Un 403, un conflit et une indisponibilité sont distincts et n’activent jamais de données de démonstration. Les erreurs affichées n’exposent pas les messages SQL ou les valeurs cliniques reçues. Aucune donnée clinique n’est écrite dans localStorage, sessionStorage, IndexedDB, la console ou une télémétrie. Les états React sont locaux à leur écran et abandonnés lors du démontage.

Les dates de consultation et de soin restent des dates civiles. Leur formatage et les métadonnées temporelles utilisent `Africa/Casablanca`, même si le navigateur travaille dans un autre fuseau. Les timestamps UTC sont conservés dans les attributs `dateTime`, avec leur décalage local dans l’affichage. Aucun décalage UTC+1 annuel n’est supposé.

Les champs ont des labels et messages associés, les sauvegardes des états annoncés et les confirmations utilisent le dialogue accessible existant. Le sélecteur de rendez-vous possède un label distinct de ses options : c’est le correctif identifié par le parcours mobile. La palette canonique, les documents et le branding restent inchangés. Les captures sur données synthétiques ont été inspectées sur bureau et mobile 390 px, sans débordement horizontal dans le formulaire testé.

## Harnais et validation

`tests/browser/run-real-integration.mjs` attend V1–V6, lance Spring et PostgreSQL Testcontainers sur des ports isolés et utilise deux comptes synthétiques temporaires. Il ne lit pas les `.env` ou credentials du cabinet. Les tests sont lancés par le CLI Node existant pour éviter une réinstallation de dépendances dans la copie de validation. `BROWSER_TEST_FILE` permet un diagnostic ciblé ; sans filtre, tous les fichiers navigateur sont exécutés.

Après les parcours, le harnais arrête uniquement son propre backend et vérifie de vrais 503 non mis en cache pour patients, rendez-vous et consultations. La vue clinique retire alors le contenu précédemment chargé, sans fixtures ou faux logout. Les stockages navigateur et les journaux des services sont contrôlés. Les comptes, fichiers de credentials et conteneurs jetables sont nettoyés. La session de cette vérification est ouverte avant les parcours et conservée en mémoire : aucun login supplémentaire ne s’ajoute à leur rafale finale et les règles de limitation des connexions restent inchangées.

Les cinq nouveaux parcours couvrent :

1. Login dentiste, création patient par l’UI, navigation depuis sa fiche, brouillon persistant après reload, plusieurs soins, correction, retrait conservé, clôture et immutabilité.
2. Modification indépendante du serveur pendant la saisie : brouillon conservé après 409, relecture confirmée, puis ajout de soin conservé et réconcilié après un autre changement serveur. Les attentes de verrou entre transactions simultanées restent couvertes par les tests backend antérieurs.
3. Navigation depuis un rendez-vous réel, association vérifiée, affichage mobile dans `America/New_York`, date clinique cohérente, clôture sans changement du rendez-vous et rejet d’un lien d’un autre patient.
4. Refus de l’accueil dans l’UI et l’API, historique archivé lisible, formulaires désactivés et rejet serveur des écritures archivées.
5. Rejet CSRF réel après suppression de l’en-tête dans le navigateur, saisie conservée, session invalidée côté serveur, disparition du formulaire et absence de stockage clinique persistant.

Le quatrième parcours a également vérifié qu’une visite accueil ne déclenche aucune requête frontend vers `/api/v1/consultations`. Le test d’indisponibilité est une vérification réelle supplémentaire du harnais, après la suite, et ne constitue pas un sixième test Node.

### Résultats

Les résultats acquis avant l’interruption sont conservés lorsqu’ils restent valides :

| Contrôle | Résultat |
| --- | --- |
| Régression frontend | 265 tests réussis, aucun échec ou test ignoré ; résultat antérieur réutilisé |
| Tests frontend cliniques ciblés | 40 réussis dans le lot antérieur, dont 4 nouveaux tests de composants/liens ; non présentés comme une nouvelle suite globale de 269 tests |
| Backend `verify` | 141 tests réussis avec Java 21, JAR construit ; résultat antérieur réutilisé, backend inchangé |
| TypeScript strict | Réussite antérieure ; nouvelle compilation TypeScript incluse dans le build Webpack de reprise |
| ESLint | Réussite antérieure, puis contrôle ciblé du formulaire corrigé et des tests navigateur/harness de cette phase |
| Production Webpack | Réussite en copie temporaire après le correctif du label ; le `.next` du développeur est conservé |
| Cinq parcours cliniques réels | 5 réussis, 0 échec, 0 ignoré après correction du label |
| Suite navigateur complète | 40 réussis, dont les 5 nouveaux parcours cliniques ; 0 échec, 0 annulé, 0 ignoré, 0 à faire ; durée Node 130 756,550614 ms |
| Contrôles supplémentaires du harnais | V1–V6 et validation JPA, arrêt réel du backend, 503 patients/rendez-vous/clinique, retrait du contenu affiché, stockages vides et absence des marqueurs sensibles dans les journaux : réussis ; launcher terminé avec code 0 |
| Vérification finale des fichiers | `git diff --check` réussi ; empreintes des 72 fichiers backend/main et public suivis à la reprise inchangées |

La commande finale était `node tests/browser/run-real-integration.mjs`, sans filtre, dans la copie temporaire construite en production, avec les variables Podman/Testcontainers, `JAVA_HOME=/usr/lib/jvm/java-25-openjdk` et `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/google/chrome/chrome`. Le conteneur PostgreSQL a été supprimé à la sortie. Les suites frontend et backend déjà réussies n’ont pas été relancées.

La première tentative de reprise n’a exécuté aucun parcours : Docker était arrêté et son socket absent. Un socket Podman rootless privé a permis de conserver l’isolation, sans démarrer les conteneurs du cabinet. Les variables de connexion et de désactivation de Ryuk suivent la [configuration Testcontainers pour Podman](https://java.testcontainers.org/supported_docker_environment/). Le launcher conserve son nettoyage explicite des conteneurs.

Le JDK 21 temporaire de la session précédente avait disparu. La reprise navigateur a donc utilisé le JDK installé 25.0.4.1, avec compilation Maven `release 21`, Node 24.20.0 et PostgreSQL 17.11. Cela ne remplace pas le résultat backend antérieur sous Java 21 et ne modifie pas la cible Java du projet.

Un premier passage complet avec Chromium 153 en cache a donné 39 réussites et un échec dans un ancien test de chevauchement d’agenda. Le diagnostic isolé a montré deux plages différentes pour la même heure locale : Node, avec tzdata 2026c, préparait 10:00 UTC, tandis que Chromium 153 soumettait 09:00 UTC. Le backend acceptait correctement ces plages non superposées. Chrome 157 déjà installé donne la même conversion que Node ; aucun code d’agenda ou ancien test n’a été changé pour contourner le conflit. Le nouveau test clinique calcule également sa date attendue depuis les utilitaires du cabinet, sans hypothèse UTC+1 annuelle.

## Vérification manuelle sur Fedora

Utiliser exclusivement une base synthétique isolée et des comptes de test pour les parcours de création, archivage ou conflit. Ne pas réinitialiser ni utiliser les dossiers réels du cabinet.

Avec JDK 21 et un moteur Docker compatible disponible, depuis `frontend/` :

```sh
pnpm exec next build --webpack
node tests/browser/run-real-integration.mjs
```

Si un navigateur Chromium/Chrome compatible est déjà installé, définir `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` pour cette commande. La reprise a utilisé `/opt/google/chrome/chrome` (157.0.8103.38), dont les règles horaires correspondent à Node. Tenir à jour les données de fuseaux du navigateur, de Node et du JDK ; un ancien binaire peut préparer un autre instant pour la même saisie locale. Le harnais provisionne sa base et ses comptes, fournit l’origine backend interne à Next et nettoie ses ressources. Pour ne lancer que les nouveaux parcours :

```sh
BROWSER_TEST_FILE=persistent-clinical.test.mjs node tests/browser/run-real-integration.mjs
```

Pour la vérification visuelle, se connecter comme dentiste de test, créer un patient fictif, ouvrir « Historique clinique », enregistrer un brouillon puis plusieurs soins. Tester une correction et un retrait, ouvrir l’historique des retraits, puis terminer la consultation et confirmer la lecture seule. Depuis un rendez-vous du même patient, vérifier la présélection et l’indépendance des statuts. Dans une seconde session, modifier le même brouillon avant la sauvegarde du premier et vérifier le 409 sans perte de saisie. Refaire l’accès avec l’accueil, puis avec un patient de test archivé.

## Fichiers et limitations restantes

Les changements de ce lot portent sur les routes consultations et clinique patient, les nouvelles vues de `components/consultations/persistent/{shared,history,forms,record}.tsx`, les liens patients/rendez-vous, les liens cliniques du prototype vers `/demo`, les deux retours d’ordonnances synthétiques, les libellés de portée du shell et les tests associés. Les parcours de démonstration ne changent que de navigation ; leurs règles et générateurs restent identiques.

Tests ajoutés : `tests/persistent-clinical-components.test.mjs` et `tests/browser/persistent-clinical.test.mjs`. Le harnais et les anciens parcours cliniques, patients, facturation et prescriptions sont adaptés aux routes `/demo/consultations`. Les migrations, services backend, règles d’authentification et PDF ne changent pas.

Limites conservées : historique par patient, pages de 50 sans total global, pas de recherche directe par rendez-vous, sélection de rendez-vous par semaine, absence de synchronisation instantanée entre postes et pas de correction après clôture. Les autres modules métier restent dans leur état de démonstration existant. Aucun travail de phase suivante, commit ou push n’est effectué.
