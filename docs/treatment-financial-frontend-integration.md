# Tarification et encaissements des soins — phases 8.6B et 8.6B.1

## Parcours dans le dossier patient

La fiche administrative ouvre **Finances du patient** sur `/patients/[id]/finances`. Les deux rôles peuvent consulter les soldes, le détail et l’historique des encaissements d’un soin. L’onglet **Verso du dossier** présente les colonnes Date, Traitement, Prix, Reçu et Reste. Les deux vues affichent le total des soins tarifés, le total reçu et le total restant pour l’ensemble du patient, même si la table occupe plusieurs pages.

`PatientFinances` charge le statut administratif du patient et la projection financière. L’accueil peut lire les libellés de soins et leurs données d’encaissement. Cette page n’appelle ni le dossier de santé, ni les consultations, ni les ordonnances. Le patient archivé conserve ses historiques en lecture seule. Si le statut du patient ne peut être vérifié, l’encaissement est désactivé.

## Tarification dans la consultation

Sur `/consultations/[id]?patientId=…`, le dentiste ouvre un brouillon, enregistre le soin, puis saisit son prix dans la carte du soin enregistré. La carte conserve le libellé et la référence dentaire de l’éditeur clinique. `TreatmentPrice` transmet l’UUID du soin persisté et la version courante de la consultation après confirmation du prix définitif. Le prix doit être saisi. La valeur zéro est acceptée.

Le soin et le prix sont enregistrés par deux requêtes indépendantes. Si l’attribution échoue, le soin reste enregistré et sa tarification est relue. Une consultation finalisée ou un patient archivé ne permet plus l’attribution. L’encaissement d’une charge existante peut se poursuivre après la finalisation de la consultation.

Après ouverture ou actualisation de la consultation, l’éditeur lit la projection de tarification réservée au dentiste. Il valide le patient, la consultation, sa version et la liste complète des UUID de soins actifs. Un soin tarifé affiche son prix enregistré en lecture seule. Un soin sans prix conserve l’action d’attribution tant que la consultation et le patient sont modifiables. Des soins ayant le même libellé ou la même date restent distincts grâce à leurs UUID.

Pendant la lecture, l’état de tarification est en cours de vérification. En cas de version divergente, de données manquantes ou de panne, les actions de tarification restent masquées et l’éditeur propose d’actualiser le dossier et les prix. Une attribution réussie déclenche une nouvelle lecture. En cas d’attribution concurrente, `DUPLICATE_CHARGE` déclenche aussi une relecture. Un conflit de version à l’écriture recharge le dossier et exige une nouvelle confirmation si le soin est encore tarifable. Les deux lectures, clinique et financière, sont distinctes. Une modification concurrente peut demander une actualisation, et l’unicité en base protège l’intervalle entre lecture et confirmation.

## Encaissement et reprise

Dans **Soldes des soins**, ouvrir le soin concerné, saisir le montant et choisir le mode de paiement. `ChargeCollection` lit d’abord l’état courant de la charge et affiche le reste dû. Le formulaire refuse les montants nuls, imprécis ou supérieurs au reste. La confirmation présente le montant, le mode et le libellé du soin. Le client transmet l’instant de la confirmation en UTC. Après succès, le détail, les totaux et l’historique sont relus.

La confirmation crée un `operationId` UUID et fige le corps contenant la version attendue, le montant, l’instant et le mode. Une seule opération peut rester en attente ou en vérification dans la session de travail. Une réponse perdue ou non vérifiable conserve ce corps en mémoire. Le bouton **Renvoyer le même encaissement** transmet le corps d’origine et sa clé sur la même charge. Un rejeu réussi confirme le même paiement. Le contenu est conservé pendant la navigation interne, y compris en quittant puis en rouvrant la fiche du patient.

Un conflit de version déclenche une relecture de la charge. La saisie et la confirmation sont requises pour une nouvelle opération avec la version actualisée. Si un refus lors d’un rejeu ne permet pas de conclure sur la première demande, celle-ci reste en vérification. L’interface ne change jamais automatiquement la version ou la clé d’une demande incertaine.

Les opérations en mémoire appartiennent au compte et à son rôle dans la session du cabinet. Les requêtes financières sont interrompues quand leur écran est démonté ou que la session cesse d’être utilisable. La déconnexion, le changement de compte et le rechargement complet effacent la mémoire. L’application demande au navigateur d’avertir avant un rechargement ou une fermeture avec opération en cours. Après une interruption de session, consulter l’historique du soin et vérifier l’encaissement avant de saisir un nouveau paiement. Aucune clé, saisie financière ou projection n’est écrite dans localStorage, sessionStorage ou IndexedDB.

## Transport, montants et pagination

Le proxy Next autorise les sept opérations de l’[API financière](treatment-financial-rest-contract.md). Il conserve le cookie de session, le jeton CSRF, les paramètres de portée et de pagination, les erreurs HTTP et l’en-tête `Location` relatif de création. Le corps des écritures est limité à 4 096 octets. Le client reçoit les projections par des URL de même origine sans mise en cache. Spring vérifie les rôles et la propriété des ressources.

| Appel | Écran |
| --- | --- |
| GET `/consultations/{consultationId}/pricing` | Prix par UUID de soin dans l’éditeur dentiste |
| POST `/charges` | Attribution définitive sur le soin enregistré |
| GET `/charges/{chargeId}` | Solde et version du soin sélectionné |
| GET `/charges/{chargeId}/payments` | Historique de ce soin |
| POST `/charges/{chargeId}/payments` | Encaissement et rejeu |
| GET `/patients/{patientId}/summary` | Totaux et sélection du soin à encaisser |
| GET `/patients/{patientId}/verso` | Projection du verso et totaux |

Les montants en DH saisis avec une virgule ou un point sont convertis en centimes avec `BigInt`. Seul un entier dans la plage exacte JavaScript peut entrer dans une commande. Les totaux sont reçus en chaînes décimales et formatés avec `BigInt`. Zod valide les commandes et projections, dont la devise, les identifiants, les versions et les bornes de page. Le client reconnaît les codes de conflit documentés et affiche ses propres messages. Un 401 renvoie vers la connexion. Plusieurs réponses 401 lors du même chargement déclenchent une seule navigation.

Chaque table ou historique lit au plus 50 lignes par requête. Les contrôles de page transmettent le curseur exclusif du serveur. Les pages sont des lectures distinctes. Les totaux se rapportent à l’instant de leur réponse et peuvent changer entre deux pages.

## Préparation du verso A5

Les cinq colonnes et les totaux proviennent directement de la projection financière et sont disponibles pour une intégration A5 ultérieure. Une future génération devra définir comment parcourir les pages, traiter un dossier qui dépasse une feuille et obtenir une vue cohérente des encaissements pendant le rendu. Le modèle et le moteur PDF restent hors du parcours financier.

## Vérification initiale 8.6B du 11 novembre 2026

| Contrôle | Résultat |
| --- | --- |
| Tests financiers ciblés | 7 réussis |
| `pnpm test` | 339 réussis, dont les 7 tests financiers |
| `pnpm exec tsc --noEmit --incremental false` | Réussi |
| `pnpm lint` | Réussi |
| `node node_modules/next/dist/bin/next build --webpack` | Réussi dans une copie temporaire sans `.env` du cabinet |
| Navigateur, finances persistées | 4 parcours réussis |
| Navigateur, authentification | 5 parcours réussis |
| Navigateur, clinique persistée | 5 parcours réussis |
| Navigateur, ordonnances persistées, mode `ready` | 10 parcours réussis |
| `git diff --check` | Réussi |

Les suites ont terminé sans échec ni test ignoré. Les quatre groupes navigateur ont utilisé Chrome, Node 24.20.0, JDK 25.0.4.1 et des bases PostgreSQL 17.11 Testcontainers distinctes via un socket Podman privé. Le lanceur vérifie V1–V9 et la validation JPA. Après chaque groupe, il arrête son propre backend et vérifie le 503 sans cache, ainsi que le retrait du contenu devenu indisponible. Aucun test Maven backend n’est relancé pour cette phase. Le harnais compile son lanceur et démarre le backend réel avec des données synthétiques.

```sh
node --import tsx --test --experimental-test-isolation=none tests/financial.test.mjs
BROWSER_TEST_FILE=persistent-financial.test.mjs node tests/browser/run-real-integration.mjs
BROWSER_TEST_FILE=authentication.test.mjs node tests/browser/run-real-integration.mjs
BROWSER_TEST_FILE=persistent-clinical.test.mjs node tests/browser/run-real-integration.mjs
PRESCRIPTION_E2E_MODE=ready BROWSER_TEST_FILE=persistent-prescriptions.test.mjs node tests/browser/run-real-integration.mjs
```

Le parcours de rejeu envoie une vraie requête qui enregistre le paiement, puis coupe la réponse au navigateur. Après navigation interne, la reprise renvoie exactement le corps d’origine et l’historique contient un seul paiement. Les autres parcours vérifient notamment l’identifiant persistant du soin, le refus de tarifer deux fois, la clôture, l’encaissement partiel puis total, l’archivage, la session expirée, la confidentialité à 390 px et les pages de 51 soins avec totaux complets.

Le premier passage navigateur a révélé l’absence de région nommée autour du détail du soin. L’ajout de cette région accessible permet de vérifier le solde après paiement ou conflit. La vérification finale a aussi repéré deux redirections concurrentes après expiration de session. L’authentification partage désormais un seul déclenchement de la navigation vers la connexion. Le premier lancement du build et des régressions du renderer a rencontré les restrictions de création de sous-processus du bac à sable. Les contrôles ont été relancés avec cet accès, sur les mêmes sources. Le scanner Unslop étant limité à l’anglais, le document et les libellés français ont été relus manuellement.

## Vérification 8.6B.1 du 11 novembre 2026

| Contrôle | Résultat |
| --- | --- |
| Tests financiers ciblés | 8 réussis |
| `pnpm test` | 340 réussis, dont les 8 tests financiers |
| `pnpm exec tsc --noEmit --incremental false` | Réussi |
| `pnpm lint` | Réussi |
| Build Next.js de production avec Webpack | Réussi dans une copie sans `.env` du cabinet |
| Chrome, finances persistées | 5 parcours réussis |
| Chrome, clinique persistée | 5 parcours réussis |
| Chrome, ordonnances persistées en mode `ready` | 10 parcours réussis |

Aucun test en échec ou ignoré. Les parcours utilisent le proxy de production, Spring Boot et PostgreSQL 17.11 Testcontainers sur des données synthétiques. Les tests de tarification vérifient deux soins de même libellé et de même date, l’un tarifé et l’autre non tarifé, le rechargement, la finalisation, l’archivage, le refus de l’accueil et la reprise après un échec de lecture. Les parcours d’encaissement vérifient encore le paiement partiel puis total, le rejeu d’une réponse perdue et le conflit de version. Le scanner Unslop étant limité à l’anglais, le document et les messages français ont été relus manuellement.
