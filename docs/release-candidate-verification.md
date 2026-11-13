# Vérification de la version candidate — phase 9.3C

## Référence du 12 novembre 2026

Branche `main`, HEAD `98dd31e4e51a6d20006b7e112e6cf167557c6052`. La copie de vérification inclut les modifications locales 9.3A et 9.3B. Les journaux et l’état Git initial sont conservés dans [test-results/phase-9.3c](../frontend/test-results/phase-9.3c). Les tests utilisent des comptes et des dossiers fictifs. Les fichiers privés du cabinet sont exclus de la copie.

Inventaire Flyway de production, V1 à V12. V1 fondation, V2 comptes et audit, V3 patients, V4 agenda, V5 consultations, V6 cycle clinique, V7 brouillons d’ordonnance, V8 PDF d’ordonnance figés, V9 registre financier, V10 factures, V11 références dentaires des factures émises et V12 assurance. Le fichier `flyway.sha256` conserve les empreintes initiales. Les migrations et les fonds de référence correspondent au HEAD au démarrage.

Hôte de test Fedora, Node 24.20.0, pnpm 12.6.0, Next.js 16.4.5, Java 25.0.4.1 pour Maven avec cible Java 21, Podman 5.8.9, Compose 5.7.0, PostgreSQL 17.11, Caddy 2.10.2. Le runtime Java de production est Temurin 21. Les essais utilisent Chrome 157.0.8103.38, Playwright 1.65, Python 3.14.8, GnuPG 2.4.9, `pdftotext` 26.01.0 et `pdfinfo` 26.05.0. Les recettes physiques restent dans la [fiche du cabinet](clinic-on-site-acceptance.md).

État initial du répertoire de travail · 42 fichiers modifiés et 8 chemins non suivis. Les fichiers 9.3A et 9.3B étaient présents avant les vérifications. Aucun commit ni déploiement au cabinet.

## Matrice de vérification

| Module et routes | Rôle et suites exécutées | Persistance et sécurité | Échec exercé | Résultat |
| --- | --- | --- | --- | --- |
| `/login`, tableau de bord et navigation | Les deux rôles · `authentication`, `ui-stabilization`, `AuthenticationIntegrationTest`, `ApiSecurityTest` | Cookie de session, CSRF, navigation et état privé | Session révoquée, panne, reconnexion, déconnexion | PASS |
| `/patients`, `/patients/[id]/dossier`, `/rendez-vous` | Les deux rôles pour l’administration, dentiste pour le dossier clinique · `persistent-patients`, `persistent-appointments`, `persistent-dossier`, tests HTTP Spring | Identifiants, versions, accès au patient et dossier PDF | Conflit d’agenda, archive, accès direct par l’accueil, session expirée | PASS |
| `/consultations`, `/documents/ordonnances` | Dentiste · `persistent-clinical`, `persistent-prescriptions`, `prescription-unavailable`, tests HTTP Spring | Association au patient, version, PDF figé | Conflit, édition interdite, moteur ou profil indisponible | PASS |
| `/patients/[id]/finances`, `/facturation` | Les deux rôles, prix saisi par le dentiste · `persistent-financial`, `persistent-invoices`, `FinancialHttpIntegrationTest` | Centimes V9, rejeu, réservation, instantané et PDF émis | Réponse perdue, concurrence, version obsolète, dépassement | PASS |
| `/patients/[id]/assurances`, `/documents/assurances` | Dentiste, refus pour l’accueil · `persistent-insurance`, `InsuranceHttpIntegrationTest` | Version, rattachement au patient, PDF autorisé et gabarit d’origine | Débordement, session expirée, génération FAR bloquée | PASS |
| Pile de type production, HTTPS sur boucle locale | Compose, Caddy, scripts et exercice Python · opérateur et les deux rôles | Réseaux privés, accès HTTPS, cookie Secure, persistance après redémarrage | Paramètres absents, port occupé, origine et CA invalides | PASS |
| Sauvegarde et restauration | Exercice Python sur deux projets Compose · opérateur | Archive chiffrée, manifeste et restauration indépendante | Altération, clé ou cible incompatible, support absent, verrou | PASS |
| Mise à niveau Flyway | Tests Spring de migration sur PostgreSQL jetable | Démarrage neuf V1–V12, mises à niveau exercées par les classes de migration, contraintes de référence | Données antérieures et associations invalides | PASS |
| Poste, support amovible et impression au cabinet | Les deux rôles et opérateur · fiche de recette | Confiance de la CA, pare-feu, impression et reprise | Coupure réelle, redémarrage du poste et support externe | NOT TESTED |

## Backend et frontend

- **Backend · PASS.** `cd backend && ./mvnw -o -B -ntp verify` sous le socket Podman isolé a produit le JAR Spring Boot avec **401 tests réussis**, 0 échec, 0 erreur et 0 ignoré. Le journal liste les tests de migration et de démarrage, de contrôle d’accès et de persistance, de rendez-vous, de finalisation clinique, de prescriptions, de comptabilité, de factures et d’assurance. Les suites ont notamment appliqué V11 → V12 sur des données synthétiques préexistantes. La vérification du JAR de l’image a comparé les octets des 12 migrations et des quatre fonds documentaires au dépôt. [Journal Maven](../frontend/test-results/phase-9.3c/backend-verify.log) · [Inventaire du JAR](../frontend/test-results/phase-9.3c/image-artifacts.log)
- **Frontend · PASS.** Depuis `frontend`, `node --import tsx --test --experimental-test-isolation=none tests/*.test.mjs` a donné **368 réussites**, 0 échec et 0 ignoré. `node node_modules/typescript/bin/tsc --noEmit --incremental false`, `node node_modules/eslint/bin/eslint.js . --max-warnings=0` et `node node_modules/next/dist/bin/next build` ont réussi. L’image de production a aussi compilé le frontend via webpack. [Tests](../frontend/test-results/phase-9.3c/frontend-test.log) · [Codes de sortie](../frontend/test-results/phase-9.3c/frontend-status.txt)

## Régression navigateur

Chaque lot a démarré Spring et PostgreSQL jetables, avec Next.js compilé et Chrome piloté par Playwright. Depuis la copie du frontend, la commande était `BROWSER_TEST_FILE=<fichiers-séparés-par-virgule> node tests/browser/run-real-integration.mjs`. Le lanceur attend la santé de l’application, vérifie V1–V12 et utilise le runner Node avec `--experimental-test-isolation=none`. Les deux modes d’échec de rendu fixent `PRESCRIPTION_E2E_MODE` à `renderer-disabled` ou `missing-practitioner`. Les noms et durées des cas se trouvent dans les journaux.

| Lot | Fichiers `.test.mjs` | Cas réussis |
| --- | --- | ---: |
| [Connexion](../frontend/test-results/phase-9.3c/auth.log) | `authentication` | 5 |
| [Patients](../frontend/test-results/phase-9.3c/patients.log) | `persistent-patients` | 6 |
| [Agenda](../frontend/test-results/phase-9.3c/appointments.log) | `persistent-appointments` | 6 |
| [Navigation et clavier](../frontend/test-results/phase-9.3c/layout.log) | `ui-stabilization` | 1 |
| [Soins et finances](../frontend/test-results/phase-9.3c/care.log) | `persistent-clinical`, `persistent-dossier`, `persistent-financial` | 15 |
| [Factures et assurance](../frontend/test-results/phase-9.3c/billing-insurance.log) | `persistent-insurance`, `persistent-invoices` | 14 |
| [Ordonnances](../frontend/test-results/phase-9.3c/prescriptions.log) | `persistent-prescriptions` | 10 |
| [Moteur désactivé](../frontend/test-results/phase-9.3c/renderer-disabled.log) | `prescription-unavailable` | 1 |
| [Praticien absent](../frontend/test-results/phase-9.3c/missing-practitioner.log) | `prescription-unavailable` | 1 |
| [Démonstration soins](../frontend/test-results/phase-9.3c/demos-care.log) | `appointments`, `billing`, `clinical` | 6 |
| [Démonstration assurance](../frontend/test-results/phase-9.3c/demos-insurance.log) | `cnops-insurance`, `far-insurance`, `insurance-audit`, `insurance` | 8 |
| [Démonstration patients](../frontend/test-results/phase-9.3c/demos-patients-retry.log) | `patients` | 3 |
| [Démonstration ordonnances](../frontend/test-results/phase-9.3c/demos-prescriptions.log) | `prescriptions` | 3 |

**79 cas réussis sur 79**, sans cas ignoré, dans 13 lots isolés. Le premier démarrage du lot de démonstration patients et celui du groupe élargi finances se sont arrêtés avant les cas. Testcontainers a expiré en attendant le message de disponibilité de PostgreSQL pendant les vérifications concurrentes. Les journaux internes de PostgreSQL contenaient le message attendu. La cause du délai du harnais reste indéterminée. Le lot patients relancé seul a réussi 3/3. [Essai patients](../frontend/test-results/phase-9.3c/demos-patients.log) · [Essai finances élargi](../frontend/test-results/phase-9.3c/finance-historical-group.log)

## Actualisation financière et expiration

La [reproduction contrôlée 9.3B](functional-ux-stabilization-audit.md#p0--actualisation-des-finances-et-expiration-de-session) a reçu un 401 de `/api/v1/auth/me` en 15,565 ms avant le clic. Elle a observé la redirection vers `/login` et zéro requête financière supplémentaire. Dans cet ordre, Playwright attendait un bouton déjà retiré. Le journal historique 9.2C a conservé le dépassement de 8 secondes, avec un ordre des requêtes inconnu. L’âge de la session, les événements de focus et l’influence éventuelle des cas voisins au moment de cet incident restent indéterminés.

Le lot soins de 9.3C a exercé les deux séquences avec des attentes d’événements. Dans la première, le contrôle concurrent de session est suspendu jusqu’à l’observation du 401 de la lecture financière provoquée par le clic. Dans la seconde, le focus déclenche un 401 réel de `/auth/me` après suppression du cookie et la vue privée disparaît. Les deux scénarios ont réussi. Le contrôle de panne réelle a aussi réussi. [Journal du lot soins](../frontend/test-results/phase-9.3c/care.log)

La répétition de la configuration élargie a réuni, dans une seule exécution du lanceur avec un même backend, les fichiers persistants clinique, dossier, finances, assurance, factures et ordonnances ainsi que les quatre fichiers de démonstration assurance. **47/47** cas ont réussi, dont **7/7** financiers, et le contrôle d’arrêt a réussi. Ces résultats répètent des cas déjà présents dans les 79. Le délai au clic ne s’est pas reproduit pendant cette phase. [Répétition élargie](../frontend/test-results/phase-9.3c/finance-historical-group-retry.log)

## Intégrité financière, confidentialité et PDF

Les tests Spring ont vérifié la somme exacte du registre V9, le paiement partiel ou intégral, le rejet du trop-perçu, la concurrence sur une version et le rejeu d’un identifiant d’opération. La lecture du dossier et du verso utilise les charges et paiements enregistrés. Les tests de facturation ont exercé la réservation d’une charge, les numéros distincts en concurrence, l’émission unique et l’immutabilité de la facture après un encaissement. Les parcours navigateur ont perdu volontairement des réponses après soumission. Le paiement incertain a conservé l’identifiant d’opération. L’émission incertaine a repris par lecture.

Les suites vérifient les sessions anonymes, révoquées ou expirées, le retrait de l’état privé lors de la déconnexion, les refus cliniques et d’assurance pour l’accueil, la portée patient, les projections financières limitées à la collecte et le CSRF. Le contrôle d’arrêt de chaque lot réussi arrête réellement Spring et vérifie les réponses 503 sans cache, l’état d’indisponibilité, l’absence de repli vers des données de démonstration et l’absence des valeurs témoins et des identifiants de test dans les journaux. La revue de secrets portait sur les sources suivies et la configuration livrée. La recherche ciblée de marqueurs de clés privées et de jetons GitHub et AWS n’a renvoyé aucun fichier source.

| PDF | Vérification de cette phase | Résultat |
| --- | --- | --- |
| Ordonnance | Finalisation, octets stockés, autorisation, disposition et indisponibilité du rendu | PASS |
| Facture A5 | Émission, champs figés, aperçu natif, accès des rôles autorisés, refus de PDF pour le brouillon, débordement contrôlé | PASS |
| Dossier A5 | Recto et verso, pagination financière, montants exacts, refus de l’accueil et erreur sûre pour texte non pris en charge | PASS |
| CNSS et CNOPS | Formulaires finalisés, géométrie des fonds, aperçu d’impression, autorisation, débordement et absence de PDF partiel | PASS |
| FAR | Enregistrement des documents couvert, génération indisponible selon la règle existante | PASS pour le blocage |
| Sorties papier | A5, supports, signatures et cachets | NOT TESTED |

## Dépendances et configuration

`pnpm audit --prod --json` a renvoyé 0 avis pour le graphe de production du frontend. La liste Maven obtenue avec `./mvnw -o -B -ntp dependency:list -DincludeScope=runtime` a été confrontée aux JAR de l’image. Les requêtes batch OSV ont renvoyé 103 résultats et aucun avis pour les coordonnées Maven interrogées, dont les 90 bibliothèques présentes dans le JAR de l’image, outil de lancement Spring Boot compris. La demande contenait les identifiants publics des artefacts et leurs versions. Ces résultats sont bornés aux bases d’avis et paquets interrogés. Analyse CVE des paquets système des images et audit de l’historique Git **NOT TESTED**. [Audit pnpm](../frontend/test-results/phase-9.3c/pnpm-audit.json) · [Réponse OSV](../frontend/test-results/phase-9.3c/osv-response.json) · [Outil de lancement](../frontend/test-results/phase-9.3c/osv-jarmode-response.json) · [Périmètre du JAR](../frontend/test-results/phase-9.3c/packaged-dependency-coverage.txt) · [API OSV](https://google.github.io/osv.dev/post-v1-querybatch/)

Les quatre builds locaux des cibles `backend`, `frontend`, `database` et `gateway` ont réussi avec `podman build --pull=never`, en utilisant `deployment/Dockerfile` pour les deux applications et `deployment/infra.Dockerfile` pour les deux services d’infrastructure. `caddy validate --config /etc/caddy/Caddyfile` a validé la configuration. Caddy a signalé un écart de formatage sans erreur de validation. ShellCheck 0.10.0 et `systemd-analyze verify` ont terminé avec le code 0. Les deux invocations initiales de ShellCheck ont échoué sur l’expansion du glob, puis sur l’absence de `/bin/sh` dans l’image. L’invocation directe du binaire avec les chemins développés sur l’hôte a réussi. [Validation Caddy](../frontend/test-results/phase-9.3c/caddy-validate.log) · [Codes de sortie des scripts](../frontend/test-results/phase-9.3c/script-status.txt)

## Parcours lié sur la pile HTTPS

L’exercice `deployment/tests/recovery-drill.py` a fait passer un même dossier fictif par les API réelles derrière Caddy. Les tests Playwright ci-dessous vérifient les gestes dans le navigateur, par lots. L’accueil a créé le patient et son rendez-vous. Le dentiste a ouvert le dossier médical, lié le rendez-vous à la consultation, saisi deux soins, puis attribué les prix avant de finaliser, conformément au cycle de la consultation. Une ordonnance liée a ensuite été finalisée.

Les soins ont été tarifés à 12 345 et 8 765 centimes. L’accueil a encaissé 2 345 et 765 centimes. Chaque rejeu a rendu l’identifiant du reçu initial. Le dossier A5 a été téléchargé par le dentiste avant émission de la facture. Les deux lignes de la facture ont été figées à 21 110 centimes, avec 3 110 encaissés et 18 000 restants. Après un encaissement supplémentaire de 1 000 centimes, le solde courant a atteint 17 000 centimes. Le JSON émis et les octets du PDF initial ont été comparés avant et après. Le contrôle a retrouvé deux charges, trois paiements et une facture.

Le dentiste a finalisé et téléchargé une entente préalable CNSS liée à cette consultation. L’accueil a reçu un 403 pour les lectures cliniques, l’assurance et les PDF confidentiels exercés. Après archivage, les deux comptes ont relu leurs historiques autorisés, dont le rendez-vous, les charges, les paiements et les documents finalisés.

## Mesures sur données synthétiques

Mesures ponctuelles côté client HTTP, via Caddy sur la boucle locale, avec un patient, un rendez-vous, une consultation, deux charges, une facture et un document d’assurance. Elles incluent le transfert et la lecture de la réponse. La recherche a retourné le patient archivé attendu.

| Lecture | Durée |
| --- | ---: |
| Recherche patient | 41,9 ms |
| Agenda | 18,7 ms |
| Données de l’éditeur de consultation | 18,0 ms |
| Historique de paiements d’un soin | 13,6 ms |
| Historique des factures | 12,5 ms |
| Historique assurance | 15,5 ms |
| PDF dossier | 42,2 ms |
| PDF CNSS | 42,9 ms |

Dans le lot navigateur soins, le scénario de consultation avec saisie, rechargement, correction et finalisation a duré 9,02 s. Le scénario de conflit, conservation de la saisie et rechargement explicite a duré 3,20 s. Ce sont des durées de scénarios complets. La charge d’un cabinet et la latence entre deux postes sont **NOT TESTED**. [Mesures HTTPS](../frontend/test-results/phase-9.3c/recovery-drill-final.log) · [Lot soins](../frontend/test-results/phase-9.3c/care.log)

## Déploiement local et reprise

| Cible de build | Image locale | Identifiant |
| --- | --- | --- |
| backend | `localhost/sijilmassa-backend:93c-drill` | `9dff96d5e757` |
| frontend | `localhost/sijilmassa-frontend:93c-drill` | `6365ab721014` |
| database | `localhost/sijilmassa-postgres:93c-drill` | `f8ea657d3b96` |
| gateway | `localhost/sijilmassa-https:93c-drill` | `ba80936977e8` |

`DOCKER_HOST=unix://<socket-jetable> python3 deployment/tests/recovery-drill.py 93c-drill` a démarré les quatre images avec Compose et attendu leurs contrôles de santé. Le test a vérifié que seul Caddy publiait un port, que le client du réseau d’entrée ne pouvait pas atteindre les services privés et que la base neuve ne contenait aucun compte. Les sessions ont reçu des cookies `Secure`, `HttpOnly` et `SameSite=Strict`. Le contrôle a refusé une connexion sans CSRF ou avec une origine étrangère. Le prévol a aussi refusé les identifiants absents, la liaison sur toutes les interfaces, un port occupé et des empreintes ou durées de certificat invalides. L’arrêt et le redémarrage des conteneurs ont conservé les lectures enregistrées.

Le script a généré une clé GnuPG et des identifiants synthétiques propres à l’essai. La sauvegarde a utilisé la clé publique. Deux archives chiffrées et leurs manifestes ont été contrôlés. Le script a exercé les refus pour archive altérée, mauvaise clé, tag différent et cible déjà utilisée, ainsi que le manque d’espace, le support absent, le chevauchement de jobs et un échec réel de `pg_dump`. La simulation de tâche a appelé le script de sauvegarde directement, sans activer de minuteur système.

Le processus de restauration a chargé un PostgreSQL neuf sans réseau. Une seconde pile HTTPS a redémarré sur le volume restauré. Les **12 réponses JSON** ont été comparées à celles du projet source. Les **quatre PDF** ont été relus, avec égalité octet par octet pour la facture et l’ordonnance, puis égalité du texte extrait et de la géométrie pour le dossier A5 et le CNSS. Les lectures et les deux PDF figés du projet source ont été contrôlés de nouveau après restauration. CNOPS a été vérifié dans les suites de rendu et de navigateur.

L’essai initial a échoué sur la comparaison de l’inventaire global des conteneurs pendant l’exécution concurrente d’autres suites. La tentative suivante, lancée sous le bac à sable, a échoué avant le démarrage du moteur car le répertoire Podman était en lecture seule. Deux exécutions isolées ont terminé avec le code 0. La seconde a ajouté une assertion sur le résultat de la recherche de patient archivé et a rejoué la restauration entière. [Essai concurrent](../frontend/test-results/phase-9.3c/recovery-drill.log) · [Première restauration réussie](../frontend/test-results/phase-9.3c/recovery-drill-serial.log) · [Exercice final](../frontend/test-results/phase-9.3c/recovery-drill-final.log)

## Décision de version candidate

**CONDITIONAL RC WITH OPEN RISKS.** Les régressions backend, frontend et navigateur, la pile HTTPS et la restauration isolée ont réussi. La cause exacte du délai historique reste ouverte. Les deux séquences de session sont exercées et la répétition élargie a réussi. L’analyse des dépendances applicatives a renvoyé zéro avis dans les sources interrogées. Le déploiement au cabinet reste soumis aux validations sur site et aux décisions métier ci-dessous.

| Risque ouvert | Niveau | Éléments de vérification |
| --- | --- | --- |
| Ancien délai d’actualisation financière | Faible sur le candidat vérifié | Deux séquences d’expiration et répétition élargie réussies. L’ordre historique des requêtes reste inconnu. |
| Analyse CVE des paquets système | Moyen | Les avis npm et Maven ont été interrogés. L’analyse des paquets de l’OS des images reste à faire. |
| Conditions de mise en service | Bloquant pour le cabinet | Les postes, l’impression, la politique de reprise et les règles métier attendent leur recette. |

## Recette restante

- **Cabinet · NOT TESTED.** Installation sur le PC du dentiste, accès depuis le poste d’accueil, confiance de la CA locale, pare-feu, coupure réseau, redémarrage de l’hôte, support externe, reprise par l’opérateur, impressions A5, signatures, cachets et acceptation de l’équipe. [Fiche de recette sur site](clinic-on-site-acceptance.md)
- **Règles métier et conformité · ouvertes.** Valider les règles de génération FAR, l’acceptation des fonds CNSS et CNOPS, les obligations marocaines de protection des données et de facturation, la durée de conservation, les modalités de reprise et les besoins d’annulation, remboursement ou correction.

## État Git final

`git diff --check` a réussi. `git status` a confirmé trois changements propres à 9.3C. Le script d’exercice, le présent rapport et la liste de contrôle avant ouverture ont été modifiés ou ajoutés. Les 42 modifications et les 8 chemins non suivis d’origine ont été comparés à l’état initial. Les empreintes SHA-256 de V1 à V12 correspondent. [État Git final](../frontend/test-results/phase-9.3c/status-final.txt) · [Contrôle Flyway](../frontend/test-results/phase-9.3c/flyway-after.log)

## Suivi 9.4A du 13 novembre 2026

La [revue des images de production](production-image-security-review.md) clôt le contrôle manquant des paquets système. Les quatre images ont été scannées et documentées en CycloneDX avant et après la mise à jour de leurs bases. Le candidat reconstruit a réussi la recette HTTPS et la restauration isolée. La classification **CONDITIONAL RC WITH OPEN RISKS** reste applicable. Les alertes résiduelles et leur examen d’applicabilité, le gel depuis un SHA propre et la recette physique restent à traiter. Les résultats Maven et Playwright ci-dessus portent sur 9.3C. [Procédure de gel](release-freeze-checklist.md)

## Suivi 9.4A.1 · Durcissement et triage

La [revue de sécurité](production-image-security-review.md#suivi-94a1--13-novembre-2026) donne les digests du candidat durci, le registre des avis critiques et élevés et les preuves d’applicabilité. La recette HTTPS, le remplacement sur un volume PostgreSQL jetable, la restauration isolée et les 368 tests frontend ont réussi. **CONDITIONAL RC WITH OPEN RISKS.** L’installation reste bloquée par les décisions sur libxml2 et Caddy, le triage résiduel et le gel sur un SHA propre. Les exigences de recette physique et réglementaire restent ouvertes.
