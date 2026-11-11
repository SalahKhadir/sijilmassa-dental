# Ordonnances persistantes — tests et plan après 8.5C.1

## Statut

Matrice cible issue de 8.5C.1. **Les résultats de la fondation 8.5C.2A sont distingués en fin de document ; les preuves backend/PDF de 8.5C.2B.2 sont dans le [contrat de finalisation](prescription-finalization-contract.md). Les tests proxy/UI persistés restent à implémenter.** Références : [domaine, sécurité et PDF](prescription-persistence-contract.md), [API et DTO](prescription-rest-contract.md). Les suites du prototype et de 8.5B.2 restent des résultats historiques tant qu’elles ne sont pas relancées.

Les tests de persistance utilisent PostgreSQL Testcontainers jetable, comptes dentiste/accueil synthétiques et deux patients fictifs. Les tests HTTP passent par login réel, cookies et CSRF. Les courses utilisent deux sessions/transactions indépendantes avec barrières déterministes, sans sleep supposé représenter un verrou. Ne pas lire les `.env` du cabinet, toucher à sa base, réinitialiser son volume ou modifier ses comptes.

## Matrice backend et contrat

Chaque ligne est une famille de scénarios, pas un compte annoncé de tests réussis. Les preuves SQL, HTTP et PDF doivent être distinctes pour éviter de valider seulement une façade.

| ID | Couche et scénario | Assertions attendues |
| --- | --- | --- |
| B01 | Migration depuis le schéma effectivement présent V1–V6 | Patients, médical, rendez-vous, consultations, lignes et audit conservés ; checksums anciens inchangés ; JPA valide ; aucune fixture importée |
| B02 | Contraintes SQL directes | FK restrictives, lien consultation/patient composite, positions uniques/différables, bornes versions/textes ; finalisé sans document impossible au commit ; pas de document orphelin ; mutation/suppression document ou lignes finalisés refusée |
| B03 | Création | Version 0, UUID serveur, dates/acteurs cohérents, brouillon vide autorisé ; un événement atomique ; zéro document |
| B04 | Mise à jour agrégat | Ajouter/corriger/réordonner/retirer des lignes en une transaction ; UUID conservés et jamais recyclés ; positions contiguës ; version +1 exactement, y compris contenu identique accepté ; rollback complet si commande invalide |
| B05 | Validation stricte | Date impossible, nulls, inconnus imbriqués, UUID démo/étrangers/répétés, 21 lignes, longueur excessive, NUL/C0/substitut isolé et version fractionnaire/négative/hors entier sûr refusés ; limites UTF-16 et corps multioctets testés |
| B06 | Propriété patient | Détail, update, finalisation, archive et PDF d’A demandé sous B → 404 sans fuite ; patient absent → 404 ; aucune mutation ou audit de succès |
| B07 | Rôles sur toutes routes | Dentiste autorisé ; accueil → 403 pour liste, détail, PDF et chaque mutation, même avec UUID connu ; absence d’exécution renderer ou lecture bytes après refus |
| B08 | Sessions et CSRF | Anonyme/révoqué refusé ; jeton absent/invalide refusé pour tous POST/PUT ; rotation de session existante conservée ; révocation pendant rendu empêchant le commit |
| B09 | Liens consultation | null, brouillon et consultation terminée du même patient acceptés ; autre patient/absente refusée ; plusieurs ordonnances pour une consultation ; aucun contenu/statut/version clinique changé |
| B10 | Patient archivé | Historique/détail/PDF finalisé lisibles ; création, édition, finalisation, archive et aperçu brouillon refusés ; restauration patient réactive seulement le brouillon non archivé |
| B11 | Archivage brouillon | Version +1 et événement ; contenu conservé, filtre actif l’exclut, historique le montre ; double archive, restauration inventée, édition/finalisation/aperçu et archive finalisé refusés |
| B12 | Pagination réelle | 0, 1, 49, 50, 51 et 101 prescriptions ; dates égales ; ordre SQL UUID décroissant ; curseur exclusif, page terminale vide admise ; filtres status/archive/consultation cohérents ; paramètres inconnus/répétés/partiels rejetés |
| B13 | Versions concurrentes | Deux mises à jour à même version : un succès, un 409, aucune perte de ligne ; retrait obsolète ne supprime pas ajout concurrent ; UI ne renouvelle pas la version silencieusement |
| B14 | Finalisation complète | Au moins une ligne complète ; version ordonnance et patient concordantes ; snapshot, bytes, hash, taille, instant/acteur et audit enregistrés ensemble ; version +1 ; absence marqueur brouillon |
| B15 | Immutabilité | PUT, nouvelle finalisation, archive, ajout/retrait de ligne ou remplacement du PDF finalisé impossibles par service/HTTP et protections SQL ; ancienne version non acceptée |
| B16 | Rendu et identité | Patient modifié avant préparation → 409 par patientVersion ; patient/ordonnance modifiés entre préparation et commit → 409 ; pas de snapshot/PDF enregistré ; relecture obligatoire |
| B17 | Course archive patient | Archive avant commit bloque finalisation ; finalisation tenant le verrou patient précède l’archive concurrente sans document partiel ni deadlock ; PDF final reste lisible |
| B18 | Double finalisation | Deux transactions indépendantes : une seule transition, un seul document et un seul événement ; seconde réponse 409 ; aucun remplacement de bytes |
| B19 | Rollback | Injection d’échec audit, stockage bytea ou contrainte au commit : brouillon/version/lignes inchangés, zéro document et zéro événement de succès |
| B20 | Arrêt et réponse perdue | Crash avant commit → brouillon intact ; après commit mais avant réponse → GET retrouve finalisé et PDF unique ; aucune compensation ni création automatique |
| B21 | Profil et ressources | Profil absent/non approuvé, acteur incompatible, modèle/police/bundle manquant ou hash inattendu empêchent finalisation ; historique existant reste accessible sans renderer |
| B22 | Erreurs et journaux | RFC 9457, requestId, no-store, codes prescriptions sûrs ; aucun médicament/nom/credential/marqueur clinique dans erreurs ou logs Java/Node/PostgreSQL de test |
| B23 | Proxy | Allowlist/méthodes, propriété query conservée sur PUT, Location relatif, CSRF/cookies, JSON/PDF types, disposition sûre, limites 256 Kio/2 Mio, refus redirections et erreurs non transformées en Blob |

## Matrice PDF et processus serveur

| ID | Scénario | Assertions attendues |
| --- | --- | --- |
| P01 | Réemploi du moteur sur données synthétiques | Même format natif, CropBox/rotation, en-tête, pied, police et coordonnées que le prototype ; empreintes modèles/font conservées ; différence de métadonnée de démonstration limitée et testée |
| P02 | Brouillon | Marqueur visible, lignes incomplètes autorisées ; nom/version patient et version ordonnance contrôlés ; zéro document durable ; GET sans audit de mutation |
| P03 | Débordement | Instructions longues, nom sur trois lignes et limite de dernière ligne : 400 avec code de débordement ; aucune troncature, réduction de police ou page ajoutée ; état/version du brouillon inchangés |
| P04 | Caractères et ressources invalides | Glyphe absent → 400 sûr ; modèle illisible, mauvaise taille/rotation ou police absente → échec technique sûr ; jamais finalisé sans rendu |
| P05 | Historique | Après changement de nom patient, profil praticien, modèle, moteur puis archivage patient : même hash et mêmes bytes téléchargés ; identité historique distincte de l’identité actuelle |
| P06 | Protocole et confiance | Faux PDF envoyé par navigateur, booléen de prévalidation et hash client refusés ; commande/injection de chemin impossibles ; sortie Node invalide/trop grande refusée ; stdout/stderr ne deviennent pas logs cliniques |
| P07 | Bornes du processus | Entrée/sortie/bytes bornés ; timeout détruit descendants ; saturation → 503 sans attente indéfinie ; pas de fichier patient ni processus survivant ; budget total compatible avec proxy/client |
| P08 | Panne et corruption | Renderer arrêté → 503 et brouillon intact ; PDF historique se télécharge encore ; bytes manquants/hash corrompu → erreur sûre, aucune régénération ; restauration PostgreSQL isolée retrouve document et snapshot |
| P09 | Inspection visuelle | Poppler et comparaison ciblée sur copies synthétiques : accents, deux lignes de nom, instructions, dernière ligne, marqueur brouillon et absence sur final ; fond officiel inchangé |

Les tests P01/P09 pourront employer les outils de rendu PDF déjà disponibles, sans nouvelle dépendance applicative. Les PDF de test restent temporaires ; captures et journaux n’utilisent que des identités fictives. La sortie sur l’imprimante du cabinet et la recevabilité administrative restent des validations humaines séparées.

## Parcours navigateur à ajouter lors de l’intégration réelle

| ID | Parcours | Résultat observable |
| --- | --- | --- |
| E01 | Depuis patient persistant : brouillon incomplet, rechargement, ajout/correction/réordre/retrait confirmé | Données réelles conservées, UUID stables, ordre exact et messages français ; aucun provider mémoire consulté |
| E02 | Depuis consultation réelle terminée puis brouillon clinique | Patient et lien vérifiés ; plusieurs ordonnances possibles ; aucune modification clinique ; URL de consultation d’un autre patient rejetée |
| E03 | Aperçu, finalisation et téléchargement | Identité/date présentées avant confirmation ; brouillon marqué ; final PDF authentifié et stocké ; rechargement donne lecture seule ; pas de génération navigateur faisant autorité |
| E04 | Deux sessions éditant le même brouillon | 409 conserve les champs, bloque submit, relecture confirmée remplace la version sans renvoi automatique ; conflit pendant finalisation également couvert |
| E05 | Identité patient changée dans l’autre session | Finalisation avec ancienne patientVersion → 409 ; nouvelle identité montrée avant nouvelle confirmation ; PDF historique antérieur inchangé |
| E06 | Texte trop long ou glyphe absent, puis renderer indisponible | Message de correction distinct de panne ; saisie intacte ; aucune finalisation ni faux succès ; reprise explicite après relecture |
| E07 | Accueil, session expirée et CSRF retiré | Accueil ne monte aucun lecteur de prescriptions, API/PDF 403 ; expiration retire champs/données/Blob ; CSRF refusé conserve saisie sous session encore vérifiée |
| E08 | Archive ordonnance puis patient | Brouillon archivé accessible uniquement en historique/lecture seule ; final PDF lisible sur patient archivé ; toutes écritures et nouveaux aperçus brouillon refusés |
| E09 | Arrêt réel du backend et réponse perdue après commit | 503 sans fixture ni faux logout ; contenu de lecture et Blob retirés ; relecture retrouve un document unique, pas de retry ou seconde création automatique |
| E10 | Fuseau New York, mobile 390 px et clavier | Date civile Casablanca correcte, focus/labels/annonces et dialogue accessibles ; pas de débordement horizontal ; ordre des lignes contrôlable sans glisser-déposer |
| E11 | Frontières et régressions | Parcours prototype ordonnances/PDF conservés sous navigation démo définie ; patient/agenda/clinique réels inchangés ; facturation et assurances restent synthétiques ; stockages navigateur sans contenu clinique |

Le harnais `tests/browser/run-real-integration.mjs` devra connaître les migrations effectivement ajoutées, sans numéro supposé ; ports, comptes et conteneurs isolés, nettoyage en finally. Ne pas modifier les limites de login pour faire passer une rafale de tests. Toute mise à jour du moteur ou tzdata doit être diagnostiquée avant de réécrire les attentes temporelles existantes.

## Périmètre approuvé et livré en 8.5C.2A

L’instruction de phase 8.5C.2A remplace le découpage proposé en 8.5C.1. Elle autorise la fondation **et les contrôleurs REST de brouillon**, tout en excluant le stockage/rendu/finalisation PDF. Les décisions A–E sont approuvées dans le [contrat de domaine](prescription-persistence-contract.md).

Livraison :

1. V7 additive : ordonnance, lignes ordonnées, lien consultation/patient composite, cibles d’audit ; statut SQL limité à `BROUILLON`. La relation corrective `corrects_prescription_id` est réservée avec FK de même patient et garde NULL. Aucun PDF, snapshot ou enregistrement finalisé n’est créé ou migré ; V1–V6 restent inchangées.
2. Entités/dépôts internes, projection patient minimale, contrôle d’existence de consultation sans contenu clinique, validation de domaine et service transactionnel dentiste pour création, détail, historique, modification et archive. Aucune nouvelle identité/praticien ni mécanisme d’authentification.
3. Cinq opérations REST avec DTO stricts, UUID, limite de corps de 256 Kio, pagination par curseur et erreurs sûres. Les lignes sont remplacées atomiquement, sans endpoints supplémentaires.
4. Autorisations HTTP/contrôleur/service ; provenance issue du principal ; version parent pour les lignes ; ordre de verrou patient partagé puis ordonnance exclusive ; événements atomiques pour création, modification et archivage.
5. Tests de validation pure, tests HTTP/PostgreSQL et tests d’upgrade/contraintes SQL. Les nettoyages et attentes de schéma des tests existants sont adaptés seulement aux nouvelles FK/colonnes. Le test historique V5→V6 reste explicitement ciblé sur V6.

Aucun port de rendu avec doublure de production n’est ajouté. `finalizedAt` et `document` restent null dans le DTO cible. Les routes de finalisation, PDF, correction et restauration ne sont pas autorisées ; aucune implémentation factice. Frontend, proxy Next, PDF et leurs dépendances restent inchangés.

## Préparation de 8.5C.2B

La fondation peut servir à la prochaine phase, dont le périmètre devra être explicitement confirmé. Les fonctions restantes sont : profil professionnel serveur validé et lié au modèle, pont privé Java/Node avec bornes et isolation, snapshot/PDF `bytea` immuables, limite configurable, finalisation atomique et téléchargements authentifiés. Le cycle correctif doit vérifier original finalisé, lien immuable du même patient et audit, sans altérer le document d’origine. Aucun de ces workflows n’est commencé dans 8.5C.2A.

L’intégration frontend doit rester un lot distinct : client typé/proxy, séparation des démonstrations, liens patient/consultation et parcours E01–E11. Le lanceur navigateur frontend attend encore exactement V1–V6. Son contrat devra accepter V7 lors de sa phase autorisée, avant de relancer les E2E ; son code n’est pas modifié sous l’exclusion frontend de cette phase. Le provisionneur Java connaît déjà V7 et les entités prescriptions.

## Stratégie de validation par lot

Pour la fondation backend, exécuter d’abord les tests ciblés de migration/domaine/autorisation avec JDK 21 et PostgreSQL jetable, puis les régressions patients/consultations/audit affectées et la construction Maven. Choisir les noms de classes réels au moment de leur création ; aucune commande vers une classe inexistante n’est prescrite comme déjà exécutable. Ajouter une suite complète seulement si le schéma ou les interfaces partagées le justifient. Le frontend inchangé ne nécessite pas un nouveau build ou E2E pour cette seule fondation.

Lors de l’intégration API : tests HTTP réels de chaque rôle, CSRF, erreurs, propriété, transactions, renderer réel et proxy. Lors de l’intégration UI : tests frontend ciblés, TypeScript, lint, build Webpack de production isolé puis E01–E11 ; élargir les régressions aux parcours affectés. Distinguer tests simulés de renderer, rendu réel et téléchargement d’un PDF stocké.

Chaque rapport doit donner commandes, nombres réellement exécutés, échecs/ignorés, empreintes des ressources préservées, diff final et nettoyage. Ne jamais réutiliser un ancien résultat comme preuve d’un nouveau comportement.

## Vérifications effectuées pour 8.5C.1

La phase documentaire vérifie les liens locaux, exemples JSON, cohérence des routes/DTO/états et `git diff --check`. Les empreintes des fichiers préexistants sont comparées à une capture prise avant rédaction afin de préserver le travail non committé. Aucun test applicatif, build, lint de code, parcours navigateur ou test de restauration n’est nécessaire ou revendiqué pour ces seuls documents. Relecture manuelle du français selon Unslop ; ses scanners anglais ne constituent pas une validation des termes médicaux français.

Résultats documentaires du 10 novembre 2026 : 14 liens locaux résolus et deux exemples JSON valides dans les quatre documents concernés ; blocs de code et tableaux vérifiés. Les 1 250 autres fichiers préexistants gardent leur empreinte ; seul un avis de contexte est ajouté à `prescription-management.md`, dont le corps historique est conservé. Trois nouveaux documents sont créés. Les contrôles de whitespace portent aussi sur ces fichiers non suivis, en complément du diff Git.

Le scanner Unslop de phrases a décliné le français sur les trois nouveaux documents. Les scanners de structure ont émis uniquement des avertissements souples de répétition d’ouverture et de titres reprenant l’introduction ; après revue, ces formes sont conservées pour les contrats et matrices techniques demandés. Aucun résultat de ces scanners anglais n’est présenté comme un test de qualité linguistique française réussi.

## Résultats exécutés — phase 8.5C.2A

Validation du 10 novembre 2026 : JDK installé 25.0.4.1, compilation Maven `release 21`, PostgreSQL 17.11 Testcontainers via un socket Podman rootless privé. Les bytecodes du contrôleur livré sont bien Java 21. Aucun résultat d’exécution sous JDK 21 n’est revendiqué pour ce lot. Bases, comptes, ports et schémas sont synthétiques et isolés ; aucune configuration du cabinet n’est lue.

Depuis `backend/`, les commandes réellement exécutées utilisent `DOCKER_HOST=unix:///tmp/sijilmassa-85c2a-runtime/podman.sock`, `TESTCONTAINERS_RYUK_DISABLED=true` et `JAVA_HOME=/usr/lib/jvm/java-25-openjdk` :

```sh
./mvnw -B -ntp -Dtest=PrescriptionValidationTest,PrescriptionHttpIntegrationTest test
./mvnw -B -ntp -Dtest=PrescriptionValidationTest,PrescriptionHttpIntegrationTest,PrescriptionMigrationUpgradeTest test
./mvnw -B -ntp verify
./mvnw -B -ntp -Dtest=AppointmentIntegrationTest verify
./mvnw -B -ntp -Dtest=PrescriptionValidationTest,PrescriptionHttpIntegrationTest,PrescriptionMigrationUpgradeTest verify
./mvnw -B -ntp -Dtest=PrescriptionHttpIntegrationTest verify
```

La suite complète a été exécutée deux fois : une première fois pour détecter les attentes devenues obsolètes avec V7, puis après leurs corrections. Les dernières relectures ciblées évitent une troisième régression globale sans changement métier supplémentaire.

| Contrôle | Résultat réel |
| --- | --- |
| Validation pure prescriptions | 5 réussis, 0 échec/erreur/ignoré |
| HTTP réel prescriptions | 24 réussis, 0 échec/erreur/ignoré dans le dernier lot |
| Upgrade V6→V7 et contraintes SQL | 3 réussis, 0 échec/erreur/ignoré |
| `verify` prescriptions complet ciblé | 32 réussis ; JAR construit/reconditionné ; code 0 |
| Dernière vérification de propriété, après revue du contrat | 24 tests HTTP réussis, JAR reconstruit ; patient étranger actif ou archivé → 404 pour détail, édition et archive ; code 0 |
| Régression globale de 173 tests avant les derniers ajustements de test | 171 réussis, 1 échec d’attente du nouveau test d’audit et 1 erreur dans une ancienne course rendez-vous ; 0 ignoré. Ce lancement n’est pas présenté comme vert |
| Relecture isolée rendez-vous | 26 réussis, 0 échec/erreur/ignoré ; `verify` et JAR réussis |
| Derniers rapports par classe, réunis après les relectures | 173 réussis distincts : 141 tests existants et 32 nouveaux ; 0 échec/erreur/ignoré dans ces derniers rapports. Il ne s’agit pas d’un unique lancement global à 173 réussites |
| Construction et compatibilité | JAR exécutable présent avec contrôleur prescriptions et V7, bytecode Java 21 ; pas de nouvelle dépendance |
| Formatage/lint | Aucun plugin Java de formatage/lint configuré ; compilation et vérifications de whitespace exécutées, sans inventer un contrôle absent |
| Git et documentation | `git diff --check`, whitespace des nouveaux fichiers non suivis, liens locaux et exemples JSON contrôlés ; empreintes frontend/PDF et V1–V6 inchangées |

La première passe ciblée a révélé que `@JsonSetter(nulls=FAIL)` sur un paramètre de record UUID facultatif refusait aussi son absence : la validation de `id: null` est maintenant faite avant binding, tandis que l’absence produit correctement une ligne nouvelle. Le test de révocation récupère un nouveau CSRF anonyme après invalidation afin de distinguer 401 de l’ancien jeton, légitimement refusé en 403. Aucun mécanisme d’authentification n’a été modifié pour ces tests.

Les attentes historiques ajustées sont les TRUNCATE de bases jetables avec les nouvelles FK, l’ajout de V7/du module au provisionneur Java et aux vérifications de schéma, la colonne nullable d’audit et la cible explicite V6 du test d’upgrade clinique. Les événements du test d’audit prescriptions partagent une horloge fixe ; le test exige l’ensemble exact des trois événements et leur attribution, sans inventer d’ordre causal entre timestamps identiques.

La course SQL rendez-vous existante a retourné `40P01` (deadlock) au lieu du `23P01` attendu lors d’un passage. Elle réussit dans le lancement précédent et dans la relecture isolée à 26 tests. Son code et ses attentes de concurrence restent inchangés ; seule sa liste de TRUNCATE inclut les nouvelles tables. Ce comportement intermittent du test existant est une limite signalée, sans changement du module rendez-vous ni masquage de l’échec global.

La dernière revue a déplacé le refus de patient archivé après la résolution de propriété de l’ordonnance, sans changer l’ordre des verrous : un UUID de prescription d’un autre dossier reçoit 404 même si le patient demandé est archivé. Les tests HTTP complets sont relancés après cette correction.

Les tests livrés prouvent le cycle des brouillons, leur projection et historique bornés, liens de consultation terminée ou brouillon, isolement patient, rôles au contrôleur et au service, sessions et CSRF, scalaires/tailles, ordre et identité des lignes, conflits édition/édition et édition/archive, lecture historique, provenance et rollback d’audit. Les tests d’upgrade vérifient conservation des données antérieures, checksums, validation Flyway et contraintes directes ; JPA est validé lors des démarrages HTTP. Aucun PDF n’est généré ou stocké. B14–B18/B20–B21, les volets PDF de B02/B07/B10, B23, P01–P09 et E01–E11 restent à couvrir dans leurs phases futures. Les courses avec finalisation et les restaurations documentaires ne sont pas simulées comme des fonctions livrées.

Aucun test/build/lint frontend ni parcours navigateur n’est exécuté : les fichiers frontend, moteurs PDF, modèles et migrations antérieures restent identiques ; les mécanismes d’authentification sont conservés à leur état de début de phase. Les erreurs d’audit injectées produisent des 500 sûrs et un rollback réel ; aucun test d’arrêt réseau d’un client prescriptions n’est revendiqué avant son intégration frontend.

### Fichiers de ce lot

- Nouveaux : `backend/src/main/java/ma/sijilmassa/prescription/{Prescription,PrescriptionLine,PrescriptionRepository,PrescriptionLineRepository,PrescriptionDtos,PrescriptionValidation,PrescriptionFailure,PrescriptionService,PrescriptionController,PrescriptionRequestAdvice,PrescriptionPrivacyFilter}.java` ; V7 ; `PrescriptionHttpIntegrationTest`, `PrescriptionMigrationUpgradeTest` et `prescription/PrescriptionValidationTest`.
- Adaptations ciblées : `PatientRepository` pour la projection minimale ; `ConsultationRepository` pour le test d’existence ; types, cible et service d’audit ; handler des erreurs prescriptions ; allowlist HTTP des cinq opérations.
- Maintenance de tests : nettoyages `PatientIntegrationTest`, `AppointmentIntegrationTest`, `AuthenticationIntegrationTest` ; attentes `PostgresFoundationTest`, `ClinicalLifecycleMigrationTest`, `clinical/ConsultationServiceTest` et provisionneur `BrowserIntegrationEnvironment`.
- Documentation : contrats domaine/REST, présent plan, notice du prototype et section ordonnances dans `backend-architecture.md`.

Aucun commit, push, déploiement ou démarrage de 8.5C.2B n’est effectué.

Nettoyage final observé : aucun conteneur Podman restant après les tests ; le service rootless du socket privé de cette phase est arrêté. Le contrôle final retrouve 173 succès dans les derniers rapports par classe réunis, confirme le JAR Java 21 et préserve les empreintes de tous les fichiers frontend/PDF et de V1–V6. Au total, 15 fichiers sont ajoutés et 19 fichiers préexistants sont adaptés dans le périmètre backend/documentation ; les autres changements non committés sont conservés.


## Validation du pont — 8.5C.2B.1

La livraison et les résultats exécutés sont détaillés dans le [rapport de rendu privé](prescription-rendering-bridge.md). Le moteur, le protocole Node, l’adaptateur Java et son inspection PDF indépendante sont testés ; aucune finalisation ou persistance documentaire n’est simulée comme livrée.

La couverture nouvelle concerne P01 (structure/flux/visuel identiques), P02 (rendu brouillon interne, sans route publique), P03/P04 (débordement, glyphes, ressources), P06/P07 (protocole, intégrité, bornes, timeout et arrêt) et P09 (trois comparaisons pleine page). P05 et les volets stockage/rétention/restauration de P08 restent différés ; le volet indisponibilité renderer est testé sans mutation. Les contrôles du service prouvent la relecture de version et du compte, les refus d’archives/rôles et l’absence de retry ou d’écriture.

Les trois anciens parcours navigateur du prototype sont relancés ; ce ne sont pas E01–E11, qui concernent la future intégration persistante. La maintenance du harnais frontend se limite à attendre V1–V7, attendu déjà livré par le provisionneur Java en 8.5C.2A. Aucune nouvelle intégration frontend/API ou route PDF n’est ajoutée.
