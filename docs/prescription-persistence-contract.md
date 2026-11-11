# Persistance des ordonnances — phase 8.5C.1

## Statut et périmètre

Contrat conçu en 8.5C.1 le 10 novembre 2026, puis mis à jour pour **8.5C.2A — fondation backend des brouillons**. La création, lecture, pagination patient, modification des lignes et archive sont maintenant implémentées côté Spring/PostgreSQL. Le frontend des ordonnances reste synthétique. Le rendu interne et sa validation sont livrés en 8.5C.2B.1, sans route publique. La finalisation atomique, les instantanés et les téléchargements authentifiés sont livrés côté backend en [8.5C.2B.2](prescription-finalization-contract.md). Les corrections, le proxy et les écrans persistés restent futurs.

Décision et état du rendu privé : [pont Java/Node 8.5C.2B.1](prescription-rendering-bridge.md).

Documents associés : [API et DTO](prescription-rest-contract.md), [tests et plan 8.5C.2](prescription-acceptance-plan.md), [prototype et PDF actuels](prescription-management.md), [intégration clinique livrée](clinical-frontend-integration.md).

Le besoin est de permettre au dentiste d’enregistrer une ordonnance pour un patient du cabinet, éventuellement depuis une consultation, de corriger le brouillon puis de finaliser un document conservé à l’identique. L’accueil ne reçoit ni médicaments, ni historique d’ordonnances, ni PDF nominatif. La réussite sera vérifiée sur PostgreSQL et HTTP réels, avec données synthétiques, puis en navigateur lors de l’intégration frontend ultérieure.

## État examiné et conventions conservées

- `frontend/src/lib/prescriptions/{types,schema,repository}.ts` : brouillons incomplets, vingt lignes au maximum, ordre explicite, identifiants stables, finalisation après contrôle PDF, patient non modifiable et plusieurs ordonnances possibles par consultation.
- `frontend/src/lib/prescriptions/pdf/{service,renderer,layout}.ts` : chargement navigateur des ressources, moteur `renderPrescriptionPdf` acceptant les octets du modèle et de la police, contrôle de caractères, largeur, hauteur et format natif. Le service navigateur n’est pas une preuve de validation serveur.
- `frontend/tests/{prescriptions,prescription-pdf,prescription-components}.test.mjs` et `tests/browser/prescriptions.test.mjs` : régressions du prototype à préserver.
- Spring : monolithe modulaire, DTO séparés des entités, UUID, `@Version`, transactions, autorisation HTTP/contrôleur/service, audit atomique et erreurs RFC 9457. Patients et consultations disposent déjà de verrous et de contrats de propriété. Migrations présentes : V1–V6 ; aucun numéro futur n’est réservé ici.
- Le principal de session contient un UUID, un identifiant de connexion, un rôle et une version de session. **Il ne contient pas l’identité professionnelle du praticien.** Ne pas imprimer son username comme nom du prescripteur.

## Modèle de domaine proposé

Le package `ma.sijilmassa.prescription` et V7 livrent `prescription` et `prescription_line`, sans service séparé ni base supplémentaire. La table `prescription_document`, les champs de finalisation et les protections spécifiques aux PDF restent différés. La table ci-dessous conserve le modèle cible complet.

| Objet | Champs et invariants |
| --- | --- |
| `prescription` | `id` UUID serveur ; `patient_id` UUID obligatoire et immuable ; `consultation_id` UUID nullable ; `version` Long non négatif ; `status` `BROUILLON` ou `FINALISEE` ; `issued_date` date civile ; `general_instructions` ; `created_at`, `updated_at` ; `created_by`, `updated_by` UUID d’acteur ; `finalized_at`, `finalized_by` nullables ; `archived_at`, `archived_by` nullables ; `corrects_prescription_id` UUID nullable réservé pour la correction future |
| `prescription_line` | UUID serveur stable ; `prescription_id` obligatoire et immuable ; `position` entier 0–19 ; `medication_name`, `dosage`, `frequency`, `duration`, `instructions` ; ordre unique par ordonnance |
| `prescription_document` | Une ligne maximum par ordonnance finalisée ; instantané structuré versionné, octets PDF `bytea`, taille, SHA-256, identifiants/empreintes du moteur et des ressources, instant de capture. Aucune ligne pour un brouillon |

Les FK interdisent la suppression des parents. Pas de cascade de suppression de patient ou consultation. L’appartenance de la consultation au patient est contrôlée par service et par FK composite `(consultation_id, patient_id)` vers une clé unique `(id, patient_id)` de consultation, à ajouter dans une future migration additive. Le lien patient d’une consultation reste immuable. L’unicité du lien consultation n’est pas exigée : plusieurs ordonnances peuvent s’y rattacher. Les UUID d’acteurs référencent les comptes avec suppression interdite ; aucun nom de compte n’est copié dans les lignes métier.

Les lignes appartiennent à un seul agrégat. Pas de version publique par ligne : chaque édition, ajout, retrait ou changement d’ordre vérifie et incrémente une seule fois la version de l’ordonnance. Le remplacement complet des lignes conserve les UUID fournis appartenant à l’agrégat ; les nouvelles lignes reçoivent un UUID serveur ; les lignes omises sont retirées du brouillon. Aucun recyclage d’UUID. Une contrainte unique différable sur `(prescription_id, position)` permet de réordonner sans collision transitoire. Le service impose des positions contiguës déduites du tableau, sans les accepter du client. Un retrait de ligne de brouillon n’a pas d’historique de contenu propre ; son événement de mutation parent est conservé. Une historisation détaillée des brouillons reste hors périmètre.

V7 couvre tailles, bornes, FK, positions contiguës et cohérence des champs d’archivage. Le CHECK `prescription_draft_phase` impose `BROUILLON` et un lien correctif nul ; il est impossible d’insérer ou de simuler une ordonnance finalisée dans cette fondation. Le lien futur `corrects_prescription_id` possède déjà une FK composite sur le même patient et refuse l’auto-référence. Une migration ultérieure pourra lever ce verrou de phase uniquement avec les invariants documentaires complets. Les exigences suivantes concernent cette extension future : `FINALISEE` implique un instantané et un PDF non vide ; leur présence croisée doit être protégée par contrainte différée/trigger transactionnel et testée directement en SQL. La transition et l’immutabilité du document et des lignes finalisées doivent également être protégées en base, en complément du service. Une simple contrainte CHECK sur la table parent ne suffit pas à contrôler une autre table. Les octets ne sont pas chargés pour les listes ou les détails JSON.

Les instants sont UTC (`timestamptz`), avec précision microseconde et `updated_at` strictement avancé lors d’une mutation acceptée, selon les conventions cliniques. Les dates civiles restent `LocalDate` de l’an 1 à 9999. Les lectures UI utilisent `Africa/Casablanca`, sans UTC+1 constant. Aucun montant, diagnostic automatique ou suggestion de médicament n’est ajouté.

## Cycle de vie, liens et archives

| Situation | Règle proposée |
| --- | --- |
| Création | Patient actif obligatoire ; date explicite ; zéro à vingt lignes, éventuellement incomplètes ; version 0 |
| Édition | Brouillon non archivé, patient actif, version attendue ; patient conservé ; consultation facultative modifiable après vérification de propriété |
| Consultation terminée | Association autorisée, comme avec un brouillon clinique ; aucun changement de consultation, soins ou statut clinique |
| Finalisation | `BROUILLON → FINALISEE` seulement ; patient actif ; au moins une ligne complète ; validation PDF autoritaire ; instantané et PDF atomiques |
| Ordonnance finalisée | Contenu, lignes, date, lien consultation, instantané, octets et métadonnées de finalisation immuables ; aucune nouvelle finalisation |
| Patient archivé | Historique, détail et PDF finalisé accessibles au dentiste ; toute écriture d’ordonnance et tout nouvel aperçu de brouillon refusés. Restaurer le patient peut rendre un brouillon non archivé éditable |
| Archivage d’ordonnance | Uniquement un brouillon non archivé d’un patient actif ; confirmation explicite ; conservation intégrale en base ; version avancée ; lecture historique maintenue |
| Brouillon archivé | Lecture seule ; pas de finalisation, nouvel aperçu, restauration ou suppression dans ce périmètre |
| Ordonnance finalisée à retirer/corriger | Pas d’archivage ni d’annulation dans ce contrat. Conserver l’original et créer une nouvelle ordonnance liée explicitement à l’original, avec relation auditée ; workflow différé, sans révocation implicite |

L’archivage n’est pas un troisième statut clinique : c’est une métadonnée de classement des brouillons. Aucun DELETE métier n’est exposé. La lecture historique utilise les mêmes routes et autorisations avec un filtre d’archive explicite. Aucun effacement automatique ni durée de rétention n’est inventé. Un vrai parcours de rectification/remplacement et d’annulation doit être défini avec le cabinet avant de prétendre corriger juridiquement un document émis ; il n’est pas ajouté implicitement à 8.5C.2.

## Sécurité et matrice d’autorisation

| Opération | DENTIST | RECEPTIONIST | Anonyme/session révoquée |
| --- | --- | --- | --- |
| Liste, détail et historique d’ordonnances | Oui, patient vérifié | 403 | 401 après contrôle CSRF applicable |
| PDF finalisé et aperçu nominatif de brouillon | Oui, avec règles d’archive ci-dessus | 403 | 401 après contrôle CSRF applicable |
| Création, remplacement du brouillon/lignes, finalisation, archivage | Oui, patient actif et état/version valides | 403 | 401 après contrôle CSRF applicable |
| Modèle PDF vierge existant, sans patient | Ressource statique existante | Aucun nouveau droit clinique | Pas de changement de son accès actuel |

La règle approuvée et implémentée est **aucun accès de l’accueil aux ordonnances**, y compris leurs métadonnées. Les droits administratifs sur les patients et factures ne donnent pas accès aux prescriptions. Le serveur applique les contrôles aux règles HTTP futures, contrôleur et service avec `RolePolicies.CLINICAL`. 8.5C.2A ajoute uniquement les cinq opérations autorisées à l’allowlist HTTP ; les mécanismes de connexion, sessions, CSRF et les droits des autres modules restent inchangés.

Chaque lecture ou mutation vérifie `patientId` et l’UUID de l’ordonnance ensemble ; le patient n’est pas un tenant et les deux rôles ne deviennent pas propriétaires de patients. Il s’agit d’empêcher les mélanges entre dossiers dans une clinique unique. Un UUID d’ordonnance d’un autre patient donne 404, comme un UUID absent. Une consultation absente ou appartenant à un autre patient donne 400 sans révéler lequel. Aucun contrôle ne repose uniquement sur l’URL, le bouton masqué ou un objet navigateur.

Les corps refusent les propriétés étrangères, UUID synthétiques, versions non entières et textes NUL. Les textes obligatoires à la finalisation ne peuvent pas être blancs. Les champs sont des textes, jamais du HTML interprété ; aucune URL, commande ou chemin de ressource n’est accepté. Les tailles et règles détaillées figurent dans l’API.

Cookies et CSRF suivent le contrat existant. Tout contenu nominatif utilise `private, no-store`, y compris PDF et erreurs. Pas de cache public, service worker, localStorage, sessionStorage, IndexedDB ou télémétrie clinique. Les PDF Blob sont révoqués lors d’un changement de dossier/session et du démontage. Une copie téléchargée explicitement ne peut pas être révoquée à distance. Le proxy ne doit pas journaliser de corps, médicaments, noms, cookies ou bytes PDF. Les URL ne contiennent que UUID, versions et filtres définis.

Audit cible : `PRESCRIPTION_CREATED`, `PRESCRIPTION_DRAFT_UPDATED` (inclut les lignes), `PRESCRIPTION_FINALIZED`, `PRESCRIPTION_ARCHIVED`. Chaque événement contient UUID acteur, UUID cible ordonnance, type et instant ; aucune ligne de médicament, nom, motif libre ou PDF. V7 ajoute les FK/CHECK et les trois événements de brouillon/archive ; `PRESCRIPTION_FINALIZED` reste différé. Les cibles ne se mélangent pas. La mutation et son événement se valident ou s’annulent ensemble. Les lectures/PDF n’ajoutent pas de nouveaux événements d’audit dans ce périmètre ; une politique d’audit des consultations de documents reste à décider séparément.

## Instantané documentaire

Politique approuvée pour la phase future : **conserver les octets du PDF finalisé dans PostgreSQL avec un instantané immuable**, et toujours servir ces octets historiques. Ne jamais régénérer silencieusement un document finalisé à partir des données actuelles.

L’instantané interne possède `snapshotSchemaVersion: 1` et les champs suivants :

| Groupe | Capture à la finalisation |
| --- | --- |
| Patient | UUID, référence administrative, version administrative, prénom, nom, nom d’affichage exact imprimé. Aucune CIN, adresse, naissance, réponse médicale ou téléphone patient : le PDF actuel imprime seulement son nom |
| Prescripteur | UUID de l’acteur authentifié ; identifiant et révision du profil professionnel serveur ; noms d’affichage français/arabe, titre professionnel, mentions de diplôme, adresses et téléphones tels qu’intégrés au modèle officiel ; INPE nullable, uniquement s’il est vérifié dans ce profil |
| Ordonnance | UUID, patient UUID, consultation UUID nullable, version source du brouillon, date civile, instructions, UUID/ordre/champs complets des lignes, instant de capture, instant/acteur de finalisation |
| Ressources | Identifiant et SHA-256 du modèle, de la police et du bundle moteur ; versions `pdf-lib`/fontkit, version d’adaptateur, locale `fr-MA`, zone `Africa/Casablanca`, dimensions/CropBox/rotation attendus |
| Résultat | PDF exact, SHA-256 et nombre d’octets, une page, absence du marqueur brouillon |

L’instantané structuré est un document `jsonb` interne dont le schéma versionné est validé côté serveur ; ce choix ne transforme pas les données patient ou médicales existantes en JSON libre. Il est construit uniquement par le service, avec les groupes et champs de la table ci-dessus, et ne peut être mis à jour après insertion. Le PDF est un `bytea` distinct ; ni base64 ni ressources binaires dans le JSON. Une version de schéma inconnue n’autorise pas une réécriture de l’historique.

L’identité professionnelle est l’identité **imprimée par le modèle**, distincte du compte qui agit. Un profil serveur local versionné, associé explicitement au compte dentiste autorisé et au modèle, est nécessaire ; il n’existe pas encore. Les champs intégrés au modèle doivent être vérifiés une fois par le cabinet et correspondre à son empreinte. Aucune copie des valeurs de production n’est ajoutée aux fixtures de test. Un champ INPE absent n’est ni deviné ni inséré dans le PDF inchangé. Le profil doit identifier explicitement les champs imprimés et les champs de provenance non imprimés. Un profil incomplet, non approuvé ou incompatible avec l’acteur bloque la finalisation.

Une correction ultérieure de l’identité patient, du profil praticien, de la police ou du modèle ne modifie pas l’instantané. Le détail JSON distingue le nom historique de l’identité administrative courante. Le PDF enregistré reste identique octet par octet après mise à jour des ressources ou du logiciel. Les snapshots et octets font partie de la même sauvegarde PostgreSQL ; le hash détecte une altération, sans constituer une signature électronique ou une preuve de conformité.

## Réemploi du moteur A5 et frontière de confiance

L’empreinte actuelle du modèle source et de sa copie publique est `9b988a24085101a888a9feac3271dd7e76e310dfff264abb7f1ce27d8a8d0bdd`. Celle de `LiberationSans-Regular.ttf` est `76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8`. Le format actuel est 419,25 × 595,499986 pt ; CropBox d’origine décalée de 8,580014 pt ; rotation 0°. Les coordonnées et la police existantes sont conservées.

Le moteur `renderPrescriptionPdf(record, patient, assets)` est réutilisable côté Node avec un adaptateur serveur. `prescriptionPdfService` fait des fetchs relatifs navigateur et ne sera pas exécuté tel quel dans Spring. La proposition concrète est un **processus Node local borné, lancé par Spring sans shell**, utilisant le moteur TypeScript compilé, ses dépendances déjà présentes et des ressources locales en lecture seule. Cela reste un auxiliaire du monolithe, sans endpoint public ni service cloud. L’architecture de ce pont Java/Node est approuvée ; le worker compilé, son adaptateur et leur validation sont livrés en 8.5C.2B.1. Le détail de configuration et des contrôles actuels figure dans le contrat du pont. L’isolation du processus local et de ses pipes constitue la frontière de confiance interne, sans jeton/API publique. Une éventuelle variante HTTP privée exigerait une authentification serveur-à-serveur explicite et un autre contrat ; elle n’est pas mise en place ici.

Le navigateur n’envoie jamais les octets à finaliser, un booléen « PDF valide », un nom de patient ou un profil praticien faisant autorité. Spring construit les données du rendu à partir de ses lectures. L’adaptateur traduit `consultationId: null` vers la chaîne vide attendue par le moteur et construit `PrescriptionPatient` depuis le snapshot minimal ; les téléphones inutilisés par le moteur restent vides. Aucun dépôt mémoire ni fixture n’est chargé par le processus.

Le protocole interne reçoit un JSON strict sur stdin et retourne un résultat structuré borné avec PDF en base64, taille et hash recalculés par Java. Ni contenu ni identités dans argv, variables d’environnement ou stderr. Exécutable et chemins de ressources sont fixés côté serveur, sans interpolation de commande ; aucun chemin ou URL client. Le processus n’a besoin d’aucun accès réseau ou base de données. Ne pas copier l’environnement de secrets du serveur. stderr est capturé sans journalisation brute ; les erreurs deviennent des catégories fixes. Les buffers sont libérés après la requête ; aucun fichier patient temporaire n’est nécessaire.

Budgets proposés : une génération simultanée, refus 503 sans file d’attente si occupé, 1 Mio d’entrée JSON interne, PDF borné par une configuration serveur future (2 Mio par défaut), sortie base64 bornée selon cette limite (3 Mio pour le défaut), exécution au plus 5 secondes avec destruction du processus et de ses descendants au dépassement. La finalisation HTTP doit rester sous les délais actuels du proxy (8 s) et du client (10 s) ; mesurer le budget total, y compris la base. Si ces bornes sont insuffisantes, documenter leur ajustement avant intégration, sans simplement allonger tous les délais. Le démarrage doit détecter bundle/ressources manquants et refuser la capacité de finalisation, sans empêcher les lectures historiques.

Le rendu final utilise le statut `FINALISEE`, les textes validés et l’identité capturée. Le moteur vérifie les glyphes, le nom sur deux lignes maximum, la zone du corps et l’intégrité du modèle. La limite vingt lignes n’est pas une garantie de tenue en A5. Aucun texte n’est tronqué ; pas de réduction automatique, page supplémentaire ou approximation de police.

Le moteur actuel écrit aussi le sujet PDF « Ordonnance de démonstration ». Un **adaptateur serveur futur** doit remplacer cette seule métadonnée de démonstration avant calcul du hash et stockage, sans changer le moteur, les coordonnées, le modèle ou les pixels. Tester cette différence explicitement. Cette adaptation, non réalisée en 8.5C.1, est livrée dans l’adaptateur serveur 8.5C.2B.1 avec métadonnées temporelles déterministes. Le bundle validé comprend cet adaptateur ; il doit garantir que les octets stockés proviennent du rendu contrôlé, pas d’un PDF arbitraire que Java accepterait sur son seul préfixe `%PDF`.

Un aperçu de brouillon est produit à la demande par ce même chemin fiable, marqué `BROUILLON - À VALIDER`, avec identité patient courante et version capturée. Il n’est jamais enregistré comme document final. Son succès ne remplace pas la validation de finalisation. Un PDF finalisé est lu en base et n’appelle aucun moteur. Si ses octets sont absents ou leur hash invalide, retourner une erreur sûre et ouvrir un incident ; ne pas reconstituer ni remplacer automatiquement le document.

Avec la limite par défaut de 2 Mio, le stockage par ordonnance augmente la taille de la base et des sauvegardes, mais évite un stockage fichiers à coordonner avec une transaction SQL et garantit une restitution exacte. La seule régénération depuis un snapshot dépendrait encore du moteur, des ressources et des métadonnées PDF ; elle ne garantit pas les mêmes octets. Conserver les ressources versionnées reste utile pour le diagnostic, sans en faire une condition de lecture historique.

## Finalisation atomique et concurrence

La génération ne doit pas retenir un verrou SQL pendant l’exécution Node. L’orchestrateur non transactionnel appelle deux méthodes transactionnelles distinctes, via des beans/proxies Spring effectifs (éviter la self-invocation qui contourne `@Transactional`).

1. **Lecture préparatoire courte et cohérente** (`REPEATABLE_READ`, lecture seule) : autoriser l’acteur, vérifier patient, brouillon/version attendue et lien consultation ; comparer aussi la `patientVersion` explicitement confirmée dans la commande ; capturer lignes, identité/version patient et révision du profil/moteur. Valider la complétude. Fermer la transaction.
2. **Rendu en mémoire hors transaction** : produire le PDF final et ses métadonnées depuis cette capture ; rejeter dépassement, caractère absent, profil incompatible, ressource absente ou timeout. Aucun état durable `EN_COURS` n’est nécessaire.
3. **Validation SQL courte** : recontrôler le compte actif, son rôle et sa version de session sans changer les règles d’authentification ; verrouiller dans l’ordre compte acteur en lecture partagée, patient en lecture partagée, consultation liée en lecture partagée si présente, ordonnance en écriture. Vérifier de nouveau état, propriété, version ordonnance et version patient. Verrouiller/relire le profil local via une révision immuable chargée pour le processus applicatif ; un changement de profil nécessite un redémarrage, pas un remplacement de fichier à chaud. Toute différence impose 409 et une nouvelle relecture explicite.
4. **Même transaction de validation** : insérer snapshot/PDF, passer à `FINALISEE`, renseigner horodatage et acteur, avancer la version une seule fois, écrire `PRESCRIPTION_FINALIZED`, flush des contraintes, commit. Retourner le détail seulement après commit.

La revalidation de compte en étape 3 protège notamment une révocation survenue pendant le rendu. Toute future écriture administrative de compte devra coordonner ce verrou. Les accès aux projections patient/consultation passent par des méthodes internes minimales, à ajouter lors de leur phase autorisée ; ne pas rendre publics leurs champs JPA ni exposer les dossiers médicaux pour obtenir un nom. Les autres mutations de prescriptions suivent le même ordre de verrous lorsqu’elles en ont besoin.

L’archivage ou une modification d’identité patient entre les étapes 1 et 3 provoque 409, même si le PDF était déjà produit ; le prochain essai nécessite relecture et confirmation du dentiste. Le verrou patient coordonne aussi une archive démarrant pendant le commit. Une modification clinique ne force pas un nouveau rendu : seul son lien de propriété est utilisé, pas ses notes ou son état de clôture. La finalisation n’écrit jamais dans la consultation.

Deux finalisations concurrentes peuvent calculer le même document, mais une seule peut insérer le document unique et changer l’état/version ; l’autre reçoit 409. Une modification de lignes pendant le rendu entraîne 409 sans document enregistré. Un échec d’audit, d’insertion PDF ou de commit annule état, snapshot, document et événement. Si le processus tombe avant le commit, les octets préparés sont perdus et le brouillon demeure ; après commit, le document est complet.

Un timeout client ou une réponse perdue ne prouve pas un rollback. Relire le détail ; si finalisé, ouvrir son PDF, sinon demander une nouvelle action explicite avec version courante. Aucun rejeu automatique de création ou finalisation, aucune seconde ordonnance générée en compensation. Une création au résultat incertain se vérifie dans l’historique patient. Les mutations ordinaires restent versionnées, sans promesse d’idempotence des POST.

Cette politique n’effectue aucune écriture externe de fichier. Si un stockage de fichiers est proposé plus tard, un rename ne fait pas partie de la transaction PostgreSQL : staging, nettoyage, reprise et publication atomique doivent alors faire l’objet d’un autre contrat. Aucun tel mécanisme n’est implicitement requis ici.

## Décisions A–E approuvées pour l’implémentation

L’instruction de phase 8.5C.2A approuve les décisions suivantes. Leur approbation technique ne vaut pas validation clinique, juridique ou réalisation des fonctions PDF.

| Décision | Règle approuvée | Livraison 8.5C.2A et dépendances futures |
| --- | --- | --- |
| A — Identité du praticien | Profil professionnel géré côté serveur, jamais issu du client ; acteurs issus du principal authentifié | `created_by`, `updated_by`, `archived_by` utilisent l’UUID dentiste existant. Pas de nouveau système d’identité. Le profil et son association au modèle restent à provisionner avant PDF : noms FR/AR, titre, diplôme, adresse, téléphones, INPE vérifié nullable, révision et validation par le cabinet |
| B — Rendu privé Java/Node | Réutiliser le moteur existant, isolation interne de confiance, bornes, timeout, erreurs sûres et chemins fixes | Pont privé livré en 8.5C.2B.1, sans endpoint HTTP. Le futur poste serveur devra disposer de Node compatible, du bundle compilé/versionné et de ses dépendances locales ; droits des processus, ressources en lecture seule et nettoyage à valider. Aucun changement de déploiement dans cette phase |
| C — Archive | Brouillons uniquement, lecture seule définitive, aucune restauration, conservation en historique et audit | Implémenté au service, HTTP et contraintes/guards SQL ; aucune archive de finalisé possible |
| D — Conservation PDF | Snapshot structuré immuable, bytes exacts en PostgreSQL `bytea`, SHA-256 et métadonnées de génération ; taille maximale configurable | Aucune table PDF, génération, insertion ou migration de PDF en 8.5C.2A. Le paramètre serveur futur `prescription.documents.max-pdf-bytes` aura 2 097 152 octets par défaut ; les plafonds renderer/proxy doivent suivre toute modification. Aucun paramètre de taille client |
| E — Correction | Nouvelle ordonnance liée à l’original, relation auditée, original et PDF conservés et accessibles | Colonne `corrects_prescription_id` avec FK de même patient et garde NULL réservée ; aucun DTO ni workflow correctif. La phase future devra contrôler original finalisé, même patient, relation immuable et audit de création corrective |

Politique explicite de rétention retenue pour la fondation et le futur stockage : aucune purge automatique, aucun effacement métier des ordonnances, de leur lien correctif, snapshots ou PDF ; conservation sans échéance automatique et inclusion dans les sauvegardes PostgreSQL protégées. Une durée légale ou une procédure d’effacement ne sont pas déduites de cette décision technique ; leur validation avec le cabinet reste requise avant utilisation réelle. La restauration d’une sauvegarde doit être testée sur une base isolée avant l’activation du stockage documentaire.

## Livraison et écarts de périmètre 8.5C.2A

Le plan 8.5C.1 prévoyait une fondation sans contrôleur et une réserve de table documentaire. L’instruction explicite 8.5C.2A remplace ce découpage : cinq opérations REST de brouillons sont livrées maintenant, le stockage documentaire et tout rendu/finalisation sont différés. Aucune contradiction d’architecture ne bloque la fondation.

Le DTO de détail conserve `finalizedAt: null` et `document: null`, conformément à sa forme cible. `status=FINALISEE` reste un filtre valide donnant zéro ligne, sans inventer de documents finaux. Le contrôle de version porte sur tout l’agrégat ; il n’y a ni version ni route d’écriture distincte par ligne. La projection patient interne est minimale et ne charge pas de contenu clinique. Les consultations ne sont interrogées que pour leur existence dans le patient demandé.

Le frontend et son proxy restent inchangés ; aucun écran ne consomme encore ces API. Le rapport de validation est dans le [plan d’acceptation](prescription-acceptance-plan.md). L’extension PDF et le démarrage de 8.5C.2B ne sont pas effectués automatiquement.


## État du rendu — 8.5C.2B.1

Le [rapport du pont privé](prescription-rendering-bridge.md) compare les trois architectures, définit le protocole strict version 1 et donne les tests réellement exécutés. Le rendu est une opération interne en mémoire, sans changement de prescription/version/audit. Le service lit le dossier persistant, refuse archives et versions obsolètes, puis revalide après le rendu. Le worker n’accepte pas d’identité, chemin ou modèle venant d’une route navigateur ; aucune route de rendu n’est ajoutée.

Le mode interne de contrôle de mise en page finale ne finalise aucun document. Le profil professionnel validé, snapshot/bytes `bytea`, transaction atomique et téléchargements restent à livrer en phases autorisées ultérieures. V1–V7, règles de sessions/CSRF, branding et assets ne changent pas. Les anciens résultats 8.5C.2A ci-dessus restent historiques ; ils ne remplacent pas les tests du pont.
