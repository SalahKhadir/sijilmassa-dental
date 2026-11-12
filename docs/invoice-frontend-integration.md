# Factures persistantes dans Next.js — phase 8.7C.1

## Accès à la facturation

| Écran | Parcours |
| --- | --- |
| `/facturation` | Recherche d’un patient actif ou archivé, puis ouverture de son historique |
| `/patients/{patientId}/factures` | Historique paginé, accessible aussi depuis la fiche et la page Finances du patient |
| `/facturation/nouvelle` | Sélection d’un patient actif |
| `/facturation/nouvelle?patientId=…` | Sélection et confirmation des soins pour ce patient |
| `/facturation/{invoiceId}?patientId=…` | Détail, préparation de l’émission et lecture du document émis |
| `/facturation/{invoiceId}/modifier?patientId=…` | Modification de la sélection du brouillon |

Le dentiste et l’accueil ont les mêmes droits de facturation. La recherche et les pages de facturation utilisent les données administratives du patient et les projections de facturation. Les écrans de facturation ne chargent aucune consultation, ordonnance ou donnée de santé. Les dossiers archivés gardent leur historique en lecture seule.

V10 fournit uniquement un historique par patient. La page Facturation utilise l’annuaire administratif paginé et interroge l’historique du patient sélectionné. Une vue transversale du cabinet demanderait une opération backend autorisée et paginée. Le prototype et ses documents de démonstration restent sous `/demo/facturation`, dans un fournisseur réservé aux routes `/demo`.

## Client et proxy

`src/lib/invoices` contient le client, les schémas Zod et les chemins de navigation. Les composants dans `src/components/billing/persistent` utilisent le transport de session existant. Le client vérifie le patient, l’identifiant de facture, l’état, la version et, pour les écritures de brouillon, la sélection renvoyée. Les lectures paginées transmettent les deux champs du curseur. La portée authentifiée annule les appels en cours quand elle change ou se ferme. Les écrans conservent uniquement les données nécessaires à la lecture et à l’édition courantes.

| Opération V10 | Appel |
| --- | --- |
| Créer | `POST /api/v1/invoices` avec `patientId` et `chargeIds` |
| Lire | `GET /api/v1/invoices/{invoiceId}?patientId=…` |
| Modifier | `PUT /api/v1/invoices/{invoiceId}?patientId=…` avec `expectedVersion` et `chargeIds` |
| Émettre | `POST /api/v1/invoices/{invoiceId}/issue?patientId=…` avec `expectedVersion` |
| Historique | `GET /api/v1/patients/{patientId}/invoices`, curseur `afterCreatedAt` et `afterInvoiceId` |
| Soins disponibles | `GET /api/v1/patients/{patientId}/invoice-eligible-charges`, curseur `afterDate` et `afterChargeId` |

Le proxy autorise ces six couples chemin-méthode. Il transmet le cookie de session, le CSRF et le périmètre patient à Spring. La taille des corps de facturation est limitée à 16 Kio. Les réponses sont privées et sans cache. L’en-tête `Location` d’une création doit correspondre à un chemin relatif de détail avec son patient. Les conflits RFC 9457 connus sont traduits en messages locaux sans afficher le texte distant.

## Brouillon et émission

La création exige une sélection explicite d’au moins un soin. Les lignes proviennent des charges V9 disponibles et gardent leur date, leur libellé et leur prix convenu. Le total de sélection est calculé en centimes avec `BigInt`. Le brouillon démarre sans numéro. Le remplacement d’une sélection peut vider un brouillon et libère les charges retirées au commit.

Après un conflit de version, l’écran conserve la sélection proposée et relit le brouillon. Il affiche la sélection enregistrée et sa version pour comparaison. L’utilisateur ouvre une nouvelle confirmation avant de soumettre avec cette version. Après une erreur de lecture, le bouton de reprise relit le brouillon et l’enregistrement reste désactivé. Si la réponse de création est incertaine, l’écran invite à vérifier l’historique avant de créer de nouveau.

Avant d’ouvrir la confirmation d’émission, l’écran relit le brouillon pour afficher les soins, le total, le reçu et le reste courants. La confirmation indique que le numéro définitif est attribué à l’émission et que les données du document sont figées. Spring enregistre les montants validés au moment de l’émission. Un paiement concurrent peut donc modifier le reçu entre la confirmation et l’émission.

Après une réponse d’émission perdue, le client effectue uniquement un `GET` sur la facture concernée. Si le document est émis, l’écran affiche son numéro. Si le brouillon est toujours présent, l’écran indique sa version et exige une nouvelle confirmation. Si la lecture échoue, seul le bouton « Relire la facture » permet de reprendre la vérification. La requête d’émission ne fait l’objet d’aucun rejeu automatique.

## Montants originaux et courants

« Facture originale » affiche le numéro, la date, l’identité à l’émission, les soins et les montants figés. « Situation financière actuelle » affiche le reçu, le reste et l’état de règlement calculés à partir des paiements V9. L’historique montre lui aussi les soldes courants. Les paiements se saisissent depuis les finances des soins. Le bouton « Actualiser la facture » relit le solde courant. Les agrégats reçus en chaînes de centimes sont formatés avec le formateur MAD existant, qui utilise `BigInt`.

## Préparation du PDF A5

Depuis la phase 8.7C.2A, le client accepte `issuanceSnapshot.lines[].toothReference`. La propriété peut être omise par une ancienne réponse ou valoir `null` pour une référence indisponible. Une valeur présente est conservée telle qu’émise. Le formateur français accepte les centimes sous forme de chaîne ou d’entier exact et couvre le total maximal de 250 lignes. Voir [la préparation des données du PDF](invoice-pdf-data-readiness.md) pour la plage et les règles de rendu restantes.

Depuis la phase 8.7C.2B, le détail émis permet de télécharger le PDF original et de l’ouvrir dans le lecteur du navigateur pour l’imprimer. Les deux rôles utilisent la même route authentifiée. Le navigateur ne reconstruit pas le document et libère l’URL Blob à la fermeture de l’aperçu ou au changement de vue. Voir [l’intégration du PDF](invoice-pdf-integration.md).

## Vérification du 11 novembre 2026

| Contrôle | Résultat |
| --- | --- |
| `node --import tsx --test --experimental-test-isolation=none tests/invoices.test.mjs` | 7 réussis |
| `pnpm test` | 350 réussis |
| `pnpm exec tsc --noEmit --incremental false` et `pnpm lint` | Réussis |
| `node node_modules/next/dist/bin/next build --webpack` | Build de production réussi dans une copie sans fichier d’environnement du cabinet |
| Chrome, factures, registre des soins, dossier PDF, authentification et prototype isolé | 19 réussis, dont 5 nouveaux parcours de facturation |
| Chrome, ordonnances persistantes avec le renderer synthétique existant | 10 réussis |
| Chrome, rendez-vous et clinique persistants | 10 réussis |
| Chrome, annuaire et dossier administratif persistants | 5 réussis |

Les 350 tests frontend et les 44 parcours navigateur se sont terminés sans échec ni test ignoré dans les passages finaux. Le harnais utilise Next.js en mode production, le vrai serveur Spring et une base PostgreSQL 17.11 jetable pour chaque groupe. Il vérifie V1–V10, la validation JPA et l’arrêt du backend de test. Le parcours d’émission avec réponse perdue envoie la requête au vrai serveur, puis interrompt la réponse et la première relecture. La reprise vérifie qu’un seul POST a été envoyé. Un autre parcours interrompt l’envoi avant qu’il atteigne le serveur et vérifie que le brouillon demande une nouvelle confirmation. Les parcours couvrent également le règlement V9 avant et après émission, les archives, la pagination et une lecture à 390 px.

Le premier passage navigateur a révélé une dépendance résiduelle du tableau de bord au fournisseur de démonstration. Le tableau de bord ouvre maintenant la recherche de factures. Un passage groupé a aussi partagé le quota de connexion des comptes de test entre suites et utilisé un chemin de dépendances inaccessible au worker d’ordonnances. Les résultats ci-dessus proviennent de groupes isolés et d’un chemin de worker vérifié. Le port de travail de Turbopack était indisponible dans cet environnement, d’où le build Webpack. Le backend a été compilé pour le harnais. Sa suite autonome n’a pas été relancée. Les libellés et le document français ont été relus manuellement avec les critères Unslop.

`git diff --check` et `git status` ont été exécutés sur les fichiers finaux. Les empreintes des migrations V1–V10 et des deux copies du fond de facture correspondent au point de départ.
