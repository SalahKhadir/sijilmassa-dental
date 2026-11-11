# Rendez-vous réels — intégration frontend, phase 8.4B

## Architecture et frontières

Les routes `/rendez-vous` lisent et modifient exclusivement l’agenda Spring Boot/PostgreSQL de phase 8.4A. Le navigateur utilise des URL relatives `/api/v1/appointments` ; le proxy Next conserve l’origine interne serveur, le cookie JSESSIONID, CSRF, les statuts HTTP, les en-têtes Set-Cookie distincts et l’absence de cache. Aucun endpoint ou mécanisme de sécurité backend n’est modifié.

Les DTO persistants restent séparés du modèle mémoire `Appointment`. La grille existante est réutilisée avec une projection d’affichage minimale (UUID, date/heure locales, durée, catégorie, statut et UUID patient), jamais comme corps de mutation. L’agenda textuel réel affiche les instants avec leur décalage. Aucun motif ou note libre ne figure dans le formulaire ni les requêtes.

Les anciennes routes, formulaires et dépôts synthétiques sont conservés sous `/demo/rendez-vous`. Les liens issus des consultations et fiches patients synthétiques y restent confinés. Le tableau de bord synthétique reste sous `/demo` ; il ne lit pas PostgreSQL. Aucun identifiant de démonstration n’est converti en UUID ou transmis à une création réelle.

Les factures, paiements, prescriptions, assurances et consultations restent en mémoire. Aucun rendez-vous persistant n’offre une action créant une relation clinique ou financière fictive. Aucun PDF, mapping dentaire ou branding n’est modifié.

## Audit et contrat consommé

Les six catégories et cinq statuts viennent des définitions existantes, sans seconde nomenclature frontend. Le contrat backend impose les instants avec décalage, les durées écoulées entières de 30 à 180 minutes, le statut initial EN_ATTENTE et une fin au plus tard à minuit local. Ses horaires d’ouverture ne sont pas configurés : la grille persistante couvre 00:00–24:00 sans peinture de plages fictives ; son défilement initial ne définit pas les horaires du cabinet.

| Opération | Endpoint / projection |
| --- | --- |
| Lire la période visible | GET `/api/v1/appointments?from=…&to=…&page=…&pageSize=100` |
| Filtrer une fiche patient | Même lecture, avec `patientId` UUID |
| Lire un rendez-vous | GET `/api/v1/appointments/{UUID}` |
| Créer | POST collection avec `patientId,startAt,endAt,type` |
| Remplacer la planification | PUT détail avec ces champs et `version` |
| Changer le statut | PUT `/api/v1/appointments/{UUID}/status` avec `version,status` |
| Rechercher un patient réel | GET `/api/v1/patients`, actifs uniquement, recherche et pagination serveur |
| Vérifier le patient choisi / résoudre son identité | GET `/api/v1/patients/{UUID}`, projection administrative uniquement |

Les réponses sont validées avec Zod, en refusant les propriétés inconnues et les versions fractionnaires ou non représentables comme entiers sûrs JavaScript. L’identité du calendrier ne conserve que nom/prénom, référence et téléphones ; aucun dossier médical n’est demandé. Les identifiants synthétiques sont refusés avant le transport.

`lib/api/session-request.ts` extrait le transport de session déjà utilisé par les patients : délai, absence de cache, credentials same-origin, validation JSON, erreurs et CSRF par mutation explicite. Le client patient conserve ses contrats et messages. Les particularités de rotation au login restent dans le service d’authentification existant.

## Périodes, pagination et mise à jour

La semaine commence le lundi. Le calendrier conserve date et vue jour/semaine dans l’URL ; noms et données médicales n’y sont jamais placés. Le formulaire de création conserve ce contexte lors du retour à l’agenda, où une confirmation est affichée. Le mobile affiche un agenda quotidien avec sélection du jour en vue semaine.

Chaque lecture est limitée à la période visible, convertie en `[from,to)` explicite. Le client lit toutes les pages jusqu’à `pageCount`, sans présenter une première page comme l’agenda entier. Il vérifie le total et l’absence de doublons ; si le jeu change pendant la pagination, une erreur explicite demande de recharger. La lecture n’est pas un snapshot transactionnel entre plusieurs requêtes HTTP.

Une limite frontend de 100 pages, soit 10 000 entrées dans la fenêtre, évite une consommation mémoire sans borne. Si elle est dépassée, une erreur demande de réduire la période ; aucun résultat partiel n’est présenté. Le backend limite toujours la fenêtre à 43 jours, mais le calendrier courant ne demande qu’un jour ou une semaine.

Les mutations confirmées actualisent la vue concernée et signalent le changement aux lecteurs montés du même onglet. Le calendrier et les sections patient relisent au focus, au retour de visibilité et toutes les 30 secondes lorsque l’onglet est visible. Les réponses d’une ancienne période ne peuvent pas remplacer la période courante. Une panne affiche une erreur, sans repli vers les fixtures.

Deux postes voient donc les mêmes données PostgreSQL à leur prochaine lecture ; il n’existe pas de synchronisation instantanée, WebSocket ou infrastructure supplémentaire. Les formulaires d’édition conservent leur version de lecture tant que l’utilisateur ne recharge pas explicitement : une revalidation ne remplace pas leurs saisies ou version en silence.

## Temps et changements d’heure

`Africa/Casablanca` est toujours fourni à Intl. Les opérations sur les dates civiles utilisent les utilitaires grégoriens existants, sans interpréter une saisie avec le fuseau implicite du navigateur. Le frontend recherche les décalages présents autour de la date, calcule les instants candidats, puis les vérifie par conversion aller-retour :

- aucun candidat : heure inexistante, soumission refusée ;
- un candidat : conversion non ambiguë ;
- deux candidats : choix explicite du décalage dans le formulaire.

Une édition initialise aussi ce choix à partir de l’instant existant. La fin est calculée par ajout de minutes écoulées à l’instant, pas par addition de chaînes horaires locales. Les requêtes transmettent des instants ISO UTC `Z`, décalage explicite accepté par Spring. Les réponses restent des instants jusqu’à leur présentation.

Les bornes d’un jour utilisent deux minuits civils résolus séparément, jamais `début + 24 h`. Les tests de référence couvrent les 15 février et 22 mars 2026 : journées marocaines de 25 et 23 heures. La grille temporelle classique est remplacée, pendant une période de transition, par la liste chronologique avec offsets ; elle ne peint pas une durée réelle comme une durée murale erronée. Les données de fuseaux du navigateur/Node/JDK doivent rester à jour.

## Formulaires, conflits et rôle

La sélection recherche les patients actifs dans l’annuaire réel et conserve une sélection existante pendant une recherche sans résultat. Le patient présélectionné est relu, affiché avec sa référence et revérifié avant mutation. Un patient archivé ne peut pas recevoir de nouvelle réservation ni déplacement ; son dossier reste accessible.

Les doubles soumissions sont bloquées par un verrou local et l’état de sauvegarde. Une mutation n’est jamais rejouée automatiquement, même après timeout ou renouvellement CSRF. Un timeout peut suivre une validation serveur : vérifier l’agenda avant une nouvelle tentative.

La version de lecture est envoyée sans modification. Le 409 backend ne distingue pas un chevauchement, une version obsolète ou un patient devenu inactif. Le frontend ne devine pas un nouveau code métier : il conserve les saisies, bloque le rejeu direct et propose un rechargement confirmé ou le choix explicite d’un autre horaire en conservant la version initiale. Il ne récupère jamais une nouvelle version pour réémettre une ancienne saisie en silence.

L’accueil gère EN_ATTENTE, CONFIRME, ANNULE et ABSENT. TERMINE n’est proposé qu’au dentiste, avec confirmation explicite ; après ce statut, aucun formulaire de statut ou lien de modification n’est proposé. Les appels directs restent soumis à Spring, ses transactions, sa version et son exclusion GiST. Les statuts annulés/absents restent affichés, avec leur libellé et icône, sans effacer leur historique.

Les messages distinguent validation, session expirée, refus, ressource introuvable, conflit, limite de lecture, indisponibilité et erreur serveur. Aucun détail Problem Details reçu, stack trace, cookie ou contenu patient n’est journalisé ou recopié dans une erreur. Un 401 confirmé masque le contenu et mène à la connexion ; un 503 ne simule pas un logout.

## Patients et tableau de bord

La fiche administrative persistante affiche les rendez-vous de la semaine choisie et propose « Prendre rendez-vous » avec UUID présélectionné si le patient est actif. Un rendez-vous ouvre la fiche administrative, sans charger le questionnaire. La section rappelle son périmètre hebdomadaire : elle ne prétend pas montrer tout l’historique.

Le tableau de bord principal utilise le total des patients actifs de l’annuaire et l’agenda réel du jour. Les indicateurs sont « Rendez-vous du jour » (statuts bloquants) et « À confirmer aujourd’hui », sans faux compteur global déduit d’une fenêtre limitée. Les quatre prochains rendez-vous affichés concernent uniquement la journée. Les finances restent dans une section explicitement nommée « Finances — Démonstration », sans association avec ces patients ou rendez-vous réels.

## Fichiers et vérification

- `lib/appointments/api/{client,time,permissions}.ts` : contrat, accès, versions, pagination, conversions et droits de présentation.
- `lib/api/session-request.ts` et client patients : transport partagé, sans cache global de données ou jetons.
- `components/appointments/persistent/` : calendrier, agenda, sélection, formulaire, détail, statut, section patient et lecture revalidée.
- Grille et sélecteurs existants : projection d’affichage typée réutilisable ; routes réelles et synthétiques explicitement séparées.
- `components/dashboard/persistent-overview.tsx` et fiche patient persistante : lectures réelles bornées, liens UUID.
- Proxy : seules collection/détail/statut de rendez-vous sont ajoutées avec leurs méthodes exactes.
- Shell : libellé de portée adapté aux pages persistantes, sans annoncer une mémoire fictive ; palette et branding conservés.
- Tests unitaires API/temps/permissions et parcours navigateur PostgreSQL réels ; anciens tests de prototype dirigés vers leurs routes `/demo`.

Validation exécutée le **10 novembre 2026**, avec Node 24.20.0, Next.js 16.4.5, Java Temurin 21.0.13, Docker 29.9.3, PostgreSQL 17.11 et Chromium :

| Contrôle | Résultat réellement exécuté |
| --- | --- |
| TypeScript strict | Réussite |
| ESLint | Réussite, aucun avertissement |
| Tests frontend | **229 réussis**, 0 échec, 0 ignoré, dont 21 nouveaux tests API/temps/permissions |
| `./mvnw -B -ntp verify` | **80 réussis**, 0 échec, 0 erreur, 0 ignoré ; aucune règle backend modifiée |
| Build standard Turbopack | Échec du sandbox : sous-processus CSS, `binding to a port`, `Operation not permitted` |
| Build officiel Webpack | Production réussie dans une copie isolée, sans altérer le `.next` du serveur du développeur |
| Suite navigateur complète sur cette production | **35 réussis**, 0 échec, 0 ignoré ; durée finale 129,9 secondes |
| Panne réelle après la suite | Backend temporaire arrêté : patients et rendez-vous renvoient 503 privés sans cache, pas d’origine interne exposée, pas de faux logout ou fallback |
| Confidentialité et préservation | Stockages navigateur contrôlés vides, contrôles de logs du harnais réussis ; 90 fichiers backend/PDF/références comparés identiques |

Les cinq nouveaux parcours rendez-vous confirment :

1. Login accueil réel, patient synthétique créé dans PostgreSQL, présélection depuis sa fiche, double-clic sans doublon, refresh, logout/login dentiste, même UUID et modification, lecture depuis une seconde session accueil et revalidation au focus.
2. Recherche/sélection dans l’annuaire réel, refus d’un chevauchement, créneau adjacent accepté, modification concurrente réelle puis 409 sans écrasement, saisies conservées et rechargement confirmé.
3. Annulation, reprise du créneau, réactivation conflictuelle, TERMINE confirmé par le dentiste puis immuable, accueil refusé côté serveur pour cette transition et patient archivé sans action de nouvelle réservation.
4. Mobile 390 px avec navigateur en America/New_York, vue semaine, heure répétée marocaine correctement distinguée par les deux offsets, heure inexistante refusée et absence de données persistantes dans l’agenda synthétique.
5. Panne de transport explicite sans fixtures, refus des anciens identifiants synthétiques, CSRF absent refusé et session invalide en 401.

Les anciens parcours patients, agenda synthétique, consultations, facturation, paiements, prescriptions et CNSS/CNOPS/FAR restent réussis. Leurs seules adaptations de navigation ciblent `/demo` ; les générateurs, templates et mappings sont inchangés. Les captures réelles de test bureau et mobile ont été inspectées : palette conservée, données synthétiques uniquement, offsets lisibles et absence de débordement horizontal mobile.

La première exécution avait 31 réussites et 4 échecs : deux parcours butaient sur le même défaut d’association du libellé au sélecteur de statut, un ancien test cherchait un lien hors du menu mobile resté ouvert, et le test PDF ne trouvait pas ses références dans la copie isolée. Le label/ID explicite est corrigé, la navigation de test et l’accès en lecture aux références sont ajustés. L’inspection visuelle a aussi corrigé l’ancien avertissement mémoire sur les pages persistantes, sans changer le pied de page des modules de démonstration.

Les builds de vérification ont appelé le CLI Next directement (`node node_modules/next/dist/bin/next build` puis `… build --webpack`) dans une copie temporaire des mêmes sources. La suite utilise le harnais existant avec son backend Testcontainers, et les mêmes fichiers de tests Node, exécutés directement pour éviter la réinstallation liée au déplacement de `node_modules` par pnpm. Les scripts du projet ne sont pas modifiés pour contourner les restrictions du sandbox. Les environnements `.env` réels n’ont pas été copiés ; les credentials synthétiques, processus et conteneur temporaires sont nettoyés. Aucun compte réel, volume existant ou migration V1–V4 n’est modifié.

## Vérifier sur Fedora

Les services locaux et comptes réels ne doivent pas servir aux tests destructifs. Les parcours automatisés utilisent le lanceur Testcontainers de phase 8.3B.1 et ses comptes synthétiques temporaires, sans lire les credentials du cabinet.

```sh
# Backend configuré avec un JDK 21 et Docker accessible
cd backend
./mvnw -B -ntp verify
cd ../frontend
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
# Si Turbopack est bloqué par le sandbox :
pnpm exec next build --webpack
node tests/browser/run-real-integration.mjs
```

Le fichier local ignoré `frontend/.env.local` définit `BACKEND_INTERNAL_URL=http://127.0.0.1:8080` pour le fonctionnement habituel ; le lanceur isolé fournit sa propre origine serveur et `AUTH_TEST_FIXTURE`. Pour vérifier manuellement sans modifier de dossier réel : utiliser un environnement synthétique, créer un patient actif avec l’accueil, réserver depuis sa fiche, retrouver le même rendez-vous avec le dentiste, le déplacer, actualiser l’accueil, puis tester le conflit et les vues mobiles. Ne pas réinitialiser la base du cabinet.

## Suite et limites

Aucune persistance clinique ou financière n’est commencée. Une phase ultérieure devra définir ces domaines, les liens vers les UUID rendez-vous/patient, leurs autorisations et migrations avant d’autoriser une activité réelle liée. Les textes libres, horaires d’ouverture, ressources multiples et agrégats globaux de rendez-vous restent hors du contrat actuel.


## Inventaire des fichiers de phase 8.4B

Les changements non commités des phases précédentes sont conservés. Cet inventaire exclut les fichiers déjà modifiés mais non touchés par cette intégration.

- `README.md`
- `docs/appointment-frontend-integration.md`
- `docs/appointment-management.md`
- `docs/frontend-authentication.md`
- `frontend/src/app/(cabinet)/demo/page.tsx`
- `frontend/src/app/(cabinet)/demo/rendez-vous/[id]/modifier/page.tsx`
- `frontend/src/app/(cabinet)/demo/rendez-vous/[id]/page.tsx`
- `frontend/src/app/(cabinet)/demo/rendez-vous/layout.tsx`
- `frontend/src/app/(cabinet)/demo/rendez-vous/nouveau/page.tsx`
- `frontend/src/app/(cabinet)/demo/rendez-vous/page.tsx`
- `frontend/src/app/(cabinet)/page.tsx`
- `frontend/src/app/(cabinet)/rendez-vous/[id]/modifier/page.tsx`
- `frontend/src/app/(cabinet)/rendez-vous/[id]/page.tsx`
- `frontend/src/app/(cabinet)/rendez-vous/nouveau/page.tsx`
- `frontend/src/app/(cabinet)/rendez-vous/page.tsx`
- `frontend/src/components/appointments/appointment-agenda.tsx`
- `frontend/src/components/appointments/appointment-details.tsx`
- `frontend/src/components/appointments/appointment-form.tsx`
- `frontend/src/components/appointments/appointment-states.tsx`
- `frontend/src/components/appointments/calendar-grid.tsx`
- `frontend/src/components/appointments/calendar-page.tsx`
- `frontend/src/components/appointments/patient-appointments.tsx`
- `frontend/src/components/appointments/persistent/agenda.tsx`
- `frontend/src/components/appointments/persistent/calendar.tsx`
- `frontend/src/components/appointments/persistent/form.tsx`
- `frontend/src/components/appointments/persistent/patient-picker.tsx`
- `frontend/src/components/appointments/persistent/patient-section.tsx`
- `frontend/src/components/appointments/persistent/record.tsx`
- `frontend/src/components/appointments/persistent/shared.tsx`
- `frontend/src/components/consultations/consultation-details.tsx`
- `frontend/src/components/dashboard/appointment-list.tsx`
- `frontend/src/components/dashboard/dashboard-overview.tsx`
- `frontend/src/components/dashboard/persistent-overview.tsx`
- `frontend/src/components/dashboard/quick-actions.tsx`
- `frontend/src/components/patients/persistent/record.tsx`
- `frontend/src/components/patients/persistent/shared.tsx`
- `frontend/src/components/shell/application-shell.tsx`
- `frontend/src/components/shell/data-scope-label.tsx`
- `frontend/src/components/shell/prototype-notice.tsx`
- `frontend/src/lib/api/session-request.ts`
- `frontend/src/lib/appointments/api/client.ts`
- `frontend/src/lib/appointments/api/permissions.ts`
- `frontend/src/lib/appointments/api/time.ts`
- `frontend/src/lib/appointments/selectors.ts`
- `frontend/src/lib/auth/backend-proxy.ts`
- `frontend/src/lib/patients/api/client.ts`
- `frontend/tests/appointment-components.test.mjs`
- `frontend/tests/browser/appointments.test.mjs`
- `frontend/tests/browser/billing.test.mjs`
- `frontend/tests/browser/clinical.test.mjs`
- `frontend/tests/browser/patients.test.mjs`
- `frontend/tests/browser/persistent-appointments.test.mjs`
- `frontend/tests/browser/run-real-integration.mjs`
- `frontend/tests/persistent-appointments.test.mjs`
