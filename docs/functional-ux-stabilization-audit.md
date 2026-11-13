# Audit fonctionnel du cabinet — phase 9.3B

L’inventaire initial associe chaque parcours aux contrôles existants. Les résultats d’exécution et les écarts figurent après la matrice. Les vérifications utilisent des comptes de test et des données fictives sur PostgreSQL jetable.

| Route et rôle | Action attendue | Opération | Échec et reprise attendus | Couverture initiale et constat |
| --- | --- | --- | --- | --- |
| `/login`, anonyme, puis les deux rôles | Se connecter, afficher le mot de passe, revenir après expiration et se déconnecter | CSRF, login, me, logout | Erreur générique, nouvelle soumission explicite, retrait des vues privées | `authentication`, `patients` |
| Structure du cabinet, deux rôles | Ouvrir les modules autorisés, suivre les liens directs, revenir et naviguer au clavier sur mobile | Session serveur et revalidation `GET /auth/me` | Écran de refus ou d’indisponibilité, contenu masqué et inerte | `authentication`, `ui-stabilization`, contrôle d’arrêt |
| `/`, Dentiste | Lire les compteurs et ouvrir l’agenda ou les factures | Lectures patients et rendez-vous | État de chargement ou reprise de lecture | `ui-stabilization`, `appointments` |
| `/patients`, `/patients/nouveau`, fiche et édition administrative, deux rôles | Rechercher, filtrer, trier, paginer, créer, modifier et archiver | Liste, POST patient, PUT versionné | Erreurs de saisie, conflit et relecture explicite | `persistent-patients`, `patients` |
| Fiche de santé et PDF patient, Dentiste | Lire le questionnaire, distinguer les réponses, modifier si actif, télécharger | GET/PUT medical-record et GET dossier PDF | Historique lisible après archivage, écriture refusée, erreur de rendu explicite | `persistent-dossier`, `persistent-patients`, tests de composants. P0, le lien de modification reçoit un attribut HTML sans effet. |
| `/rendez-vous` et détail, deux rôles | Jour/semaine, sélectionner, réserver, déplacer, changer le statut et ouvrir la fiche | GET calendrier, POST, PUT versionnés | Chevauchement, horaire invalide et conflit signalés | `persistent-appointments` |
| `/consultations`, détail et historique, Dentiste | Créer, modifier le brouillon, ajouter des soins, tarifer, terminer | Consultation et soins versionnés, POST charge | Conflit, contrôle des références et état final en lecture seule | `persistent-clinical`, `persistent-financial` |
| `/documents` et ordonnances, Dentiste | Historique, lignes de médicaments, brouillon, finalisation, téléchargement et impression | GET/POST/PUT ordonnance, finalisation et PDF figé | Conflit, rendu indisponible, erreur A5 ou session expirée | `persistent-prescriptions`, `prescription-unavailable`, `prescriptions` |
| Finances patient, deux rôles | Sélection du soin, encaissements partiels et complets, historique, totaux et verso | GET ledger/détail/historique, POST avec version et operationId | Conflit à reconfirmer, rejeu explicite du même paiement, lecture seule si archivé | `persistent-financial`. P0, le clic après retrait du cookie a dépassé 8 s en 9.2C. |
| `/facturation` et factures patient, deux rôles | Recherche patient, sélection, brouillon, émission, soldes, PDF et impression | Historique, charges éligibles, POST/PUT brouillon, POST issue, GET PDF | Relecture après réponse perdue, nouvelle confirmation si brouillon | `persistent-invoices` |
| Historique assurance et détail, Dentiste | Choisir CNSS/CNOPS/FAR, saisir les actes, éditer, finaliser et consulter les documents | GET/POST/PUT et finalisation assurance, GET PDF CNSS/CNOPS | Champs incomplets, conflit, relecture, refus PDF FAR | `persistent-insurance` |

## P0 · Actualisation des finances et expiration de session

Le dépassement historique de 8 s se produisait dans le parcours « a stale payment refreshes the charge and requires reconfirmation, and archived or expired sessions cannot collect ». Il visait le clic après la suppression des cookies, après les deux actualisations réussies pour un patient encore authentifié. Voir [le compte rendu 9.2C](insurance-document-frontend-integration.md#vérification-du-12-novembre-2026).

Sur la version de départ, le scénario contrôlé a déclenché le focus après suppression du cookie et avant le clic. La réponse de `/auth/me` était un 401 en 15,565 ms selon Playwright. Le navigateur est arrivé sur `/login` sans lancer de lecture financière supplémentaire. Le clic d’origine a ensuite dépassé 8 s en attendant le bouton. Cette reproduction établit la course côté test pour cet ordre d’événements. L’ordre des événements du passage historique n’a pas été enregistré.

Deux chemins peuvent alors retirer l’écran. Le clic incrémente la révision de la fiche, du registre et du soin. Les lectures passent par le proxy. Un 401 déclenche le retour à la connexion. Indépendamment, une reprise de focus, un changement de visibilité ou la vérification périodique peuvent appeler `GET /api/v1/auth/me`. Si cette lecture constate l’expiration en premier, l’espace financier est déjà retiré lorsque Playwright cherche le bouton. La limite de 8 s correspond à la recherche de la cible de clic.

Le test sépare ces chemins. Dans le parcours du clic explicite, Playwright retarde uniquement les vérifications de session concurrentes, attend le 401 d’une lecture protégée et vérifie le retour à la connexion. Les demandes de vérification retardées sont libérées en fin de scénario. Un autre test provoque un événement de focus après suppression du cookie, attend le 401 réel de `/auth/me` et vérifie le retrait de l’espace financier. Les deux déclencheurs utilisent le proxy et Spring. Les assertions de conflit, de versions, d’archivage et de disparition du contenu sont conservées.

`useFinancialLoad` associe un résultat à la fonction qui l’a demandé et écarte les réponses obsolètes. La portée de session annule les lectures en cours lorsqu’elle prend fin. Aucune correction de ces mécanismes n’était nécessaire pour séparer les scénarios Playwright.

## P0 · Dossier patient archivé

Depuis la fiche d’un patient archivé, ouvrir **Questionnaire et antécédents** avec le rôle Dentiste. Le contrôle **Modifier le dossier de santé** recevait `disabled` tout en restant un lien avec une destination. Le chemin direct arrivait sur une page qui demandait de restaurer le patient et ne présentait aucun formulaire. Le service contrôle également le statut du patient sous verrou lors d’un PUT médical et refuse la modification d’un dossier archivé.

La reproduction a activé l’ancien lien avec Entrée et observé la navigation vers `/dossier/modifier`. La lecture du dossier et le téléchargement PDF restent disponibles au dentiste.

Le dossier archivé affiche maintenant un bouton HTML désactivé associé à une explication visible. Pour un patient actif, le contrôle mène toujours à l’édition. Le test couvre l’ouverture au clavier, la consultation et le téléchargement PDF pour le dentiste, le refus du chemin clinique à l’accueil, ainsi que la navigation de l’accueil vers les finances et l’historique des factures.

## Rechargement après un encaissement incertain

Un rechargement complet efface le contexte de rejeu gardé en mémoire. La saisie d’un encaissement indique de consulter l’historique après un rechargement ou une réponse incertaine. Le scénario ajouté laisse Spring enregistrer le règlement, coupe sa réponse côté navigateur, recharge la page et relit l’historique. Il vérifie un seul POST et un seul paiement, le solde attendu et l’absence de données de reprise dans le stockage navigateur. Le test existant de navigation interne conserve, lui, le rejeu explicite du même corps et du même `operationId`.

## P1 · Saisie avant l’activation des formulaires

Le premier essai rapide sur mobile n’a pas observé l’avertissement après saisie. Après avoir attendu la vérification de session côté client et le dialogue, le même parcours a conservé l’heure lors du refus de quitter et du refus de recharger. Un scénario contrôlé a ensuite retardé les scripts du navigateur. Le champ d’heure rendu par le serveur a accepté 12:45, puis **Annuler** a quitté la page sans avertissement. Le formulaire réutilise le contrôle d’hydratation du formulaire de démonstration pour rendre les champs et la soumission actifs une fois les interactions disponibles. Le nouveau test retarde les scripts, vérifie les contrôles désactivés, puis vérifie la conservation de l’heure après les deux avertissements. La création patient a reproduit le même défaut avec le champ Nom et le lien Annuler. La même condition d’activation couvre le formulaire patient. Son test vérifie que le nom et la commande Continuer attendent les scripts, puis que le refus de quitter conserve le nom saisi.

Deux créations d’homonymes par l’accueil ont renvoyé chacune un 201, des UUID et références distincts. La recherche a présenté les deux fiches avec leurs propres liens. Le contrat patient autorise les homonymes et attribue une référence unique à chaque dossier.

## Fichiers de la phase

- `frontend/src/components/patients/persistent/record.tsx`, `frontend/src/components/patients/persistent/form.tsx`, `frontend/src/components/financial/charge-collection.tsx` et `frontend/src/components/appointments/persistent/form.tsx`.
- `frontend/tests/browser/persistent-dossier.test.mjs`, `frontend/tests/browser/persistent-financial.test.mjs` `frontend/tests/browser/persistent-appointments.test.mjs` et `frontend/tests/browser/persistent-patients.test.mjs`.
- Le présent audit et les journaux de vérification sous [frontend/test-results/phase-9.3b](../frontend/test-results/phase-9.3b), ignorés par Git.

## Vérification et limites

Les navigateurs ont utilisé le build de production dans une copie temporaire. Le harnais démarre Spring Boot et un PostgreSQL neuf par lot, vérifie V1–V12, la santé et le refus des appels anonymes. Son contrôle d’arrêt vérifie les réponses 503 sans cache, l’indisponibilité affichée et l’absence de données privées en cache navigateur ou dans les journaux du scénario. Le scénario de panne réseau de l’authentification vérifie aussi la reprise de session par **Réessayer**.

| Contrôle | Commande ou périmètre | Résultat |
| --- | --- | --- |
| Frontend ciblé | `node --import tsx --test --experimental-test-isolation=none tests/{financial,dossier-pdf,patient-components,auth-proxy,authentication,appointment-components,persistent-appointments}.test.mjs` | 64/64 sur le build final. Le lot initial de 39 tests avait aussi réussi. |
| Frontend complet | `node --import tsx --test --experimental-test-isolation=none tests/*.test.mjs` | 368/368 |
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Réussi |
| ESLint | `node node_modules/eslint/bin/eslint.js . --max-warnings=0` | Réussi |
| Production | `node node_modules/next/dist/bin/next build` | Réussi |
| Reproduction contrôlée | Dossier et finances sur le code de départ, focus avant le clic historique | 7/8, échec attendu du clic à 8 s. Le lien archivé a navigué. |
| Finances en isolation | Deux lots `persistent-financial.test.mjs` avec deux bases neuves | 7/7 puis 7/7 |
| Finances dans un lot multi-module | Clinique, dossier et finances, en parallèle d’autres lots sur des bases distinctes | 15/15 |
| Git | `git diff --check` et `git status` | Vérifiés |

Les lots Playwright couvrent 79 cas de la suite avec les deux nouveaux tests de chargement des formulaires. Les lots ont isolé la base et les comptes entre modules qui provoquent des connexions répétées. Les parcours qui traversent les formulaires modifiés ont été rejoués sur le dernier build.

| Lot navigateur | Résultat |
| --- | --- |
| Authentification | 5/5 |
| Patients persistants, rendez-vous persistants, clinique persistante | 6/6, 6/6 et 5/5 |
| Dossier et finances | 3/3 et 7/7, plus deux répétitions financières de 7/7 |
| Factures et assurances persistantes | 7/7 et 7/7 |
| Ordonnances persistantes et indisponibilité du moteur ou du praticien | 10/10 et 1/1 pour chacun des deux modes |
| Matrice de navigation et de disposition | 1/1 |
| Démonstrations et formulaires annexes | 6/6 pour agenda, clinique et factures. 8/8 pour les assurances. 3/3 pour les patients. 3/3 pour les ordonnances. |

Les deux échecs de diagnostic figurent dans les journaux. Le clic financier a expiré après une redirection volontairement placée avant lui. Le premier essai supplémentaire d’annulation de rendez-vous a échoué sur l’attente du dialogue. La répétition synchronisée a donné 2/2, puis le test à scripts retardés a confirmé la saisie prématurée. Les deux régressions ajoutées vérifient désormais l’état du formulaire avant l’arrivée des scripts.

La suite Maven est hors périmètre de cette phase frontend. La compilation de test Maven sert au lanceur du harnais. Les réponses HTTP contrôlées concernent uniquement les comptes et données fictifs.

Le détail du rendez-vous contient encore une phrase obsolète qui présente la facturation et les ordonnances comme des démonstrations. Sa révision éditoriale et les contrôles sur les postes du cabinet restent à suivre en 9.3C. Le PDF FAR reste bloqué par les règles métier en attente. Les messages d’heure inexistante en période de changement d’heure peuvent encore se répéter. Les essais ont utilisé Chromium avec des tailles de fenêtre simulées. Les autres moteurs de navigateur, le lecteur d’écran et l’imprimante restent à vérifier. Les tests PDF couvrent les commandes et les réponses du navigateur, ainsi que les octets ou le lecteur lorsque le scénario le prévoit.
