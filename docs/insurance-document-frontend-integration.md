# Documents d’assurance dentaire — phase 9.2C

Le dentiste ouvre **Documents d’assurance** depuis la fiche d’un patient ou depuis une consultation. L’historique contient les documents enregistrés dans le cabinet. Les exemples du prototype restent sous `/demo`.

## Pages et composants

| Page | Composant | Usage |
| --- | --- | --- |
| `/patients/{patientId}/assurances` | `PatientInsuranceHistory` | Historique de 50 documents par page, avec dates, état, organisme et accès à la consultation liée. |
| `/documents/assurances/nouvelle?patientId=…` | `NewInsuranceDocument` | Choix de l’organisme, de l’objet et de la consultation. Le lien depuis le compte rendu propose son `consultationId`. |
| `/documents/assurances/{documentId}?patientId=…` | `InsuranceDocumentPage` | Lecture du document, modification du brouillon et vérification avant finalisation. Les actions de l’historique ouvrent la vue appropriée avec `action=modifier` ou `action=finaliser`. |

Les composants se trouvent dans `frontend/src/components/insurance/persistent/`. L’historique reprend le curseur UTC renvoyé par Spring avec toute sa précision. Le DTO d’historique donne l’organisme et l’état. L’objet du document est visible dans le détail.

## Requêtes et accès

Le client `frontend/src/lib/insurance/api/` valide les requêtes et réponses avec Zod. Il conserve les montants par acte en centimes entiers et le total figé sous forme de chaîne décimale. Zéro est une valeur saisie. Un montant absent s’affiche comme non renseigné. Les erreurs RFC 9457 sont lues par statut et code et associées à des messages locaux.

| Action | Méthode et route de même origine |
| --- | --- |
| Créer | `POST /api/v1/insurance-documents` |
| Lire | `GET /api/v1/insurance-documents/{documentId}?patientId=…` |
| Enregistrer | `PUT /api/v1/insurance-documents/{documentId}?patientId=…` |
| Finaliser | `POST /api/v1/insurance-documents/{documentId}/finalize?patientId=…` |
| Parcourir | `GET /api/v1/patients/{patientId}/insurance-documents` avec le couple de curseurs sur les pages suivantes |

Le proxy autorise ces cinq combinaisons et limite les corps à 128 Kio. Les requêtes utilisent le cookie de session et un jeton CSRF à chaque écriture. Spring vérifie le rôle dentiste, la session et le rattachement au patient. L’accueil n’a aucun lien d’assurance dans la fiche du patient. Les accès directs sont filtrés avant le chargement de l’espace. Le client annule les requêtes lors d’un changement de session ou d’une déconnexion. Les saisies restent dans le formulaire ouvert. Les URLs ne contiennent que des identifiants et des paramètres de navigation.

## Formulaires et sources

| Volet | Objet et saisie |
| --- | --- |
| CNSS | Entente préalable ou soins exécutés. Immatriculation, lien avec l’assuré, INP à neuf chiffres et catégories CNSS. Jusqu’à trois actes. |
| CNOPS | Entente préalable ou soins exécutés. Affiliation et immatriculation distinctes, INPE à neuf chiffres et catégorie CIM-10 facultative au format lettre et deux chiffres. Jusqu’à neuf actes. |
| FAR | Devis ou reçus. Référence de compte, grade, unité, INPE, contexte, nature des soins, déclaration et nombres de pièces. Les dents FDI sont marquées individuellement d’un cercle ou d’une croix. Jusqu’à cinq actes. |

L’identité de l’assuré est reprise de la fiche si le patient est lui-même assuré. Pour un conjoint ou un enfant, les données de l’assuré sont saisies dans le document. Les numéros d’assurance et de praticien sont saisis par le dentiste. La couverture administrative du patient et les notes cliniques ne préremplissent aucun code ni numéro.

La liste paginée des consultations utilise l’historique clinique existant et indique leur état. Pour les soins exécutés ou les reçus, le formulaire demande de choisir une consultation avant la création, car le lien est fixe et nécessaire à la finalisation. Le dentiste peut préparer le brouillon pendant la consultation et le finaliser après sa clôture. Le lien est facultatif pour une entente préalable ou un devis. Pour les actes exécutés, les soins actifs viennent du compte rendu autorisé et les prix convenus de la lecture V9. Le formulaire présente la date, le libellé, la dent et le prix sélectionnable. Les notes et observations reçues par la lecture clinique existante ne sont ni affichées ici ni reprises dans les données d’assurance. Il manque une projection de lecture réservée aux consultations et soins admissibles qui éviterait de recevoir le compte rendu complet.

## Brouillons, confirmation et récupération

Le patient, l’organisme, l’objet et la consultation sont fixés à la création. Le brouillon peut rester incomplet. La modification envoie `expectedVersion` et remplace le brouillon complet. Si le serveur signale un conflit, le formulaire conserve les saisies et relit la version enregistrée. Le dentiste peut comparer cette version, abandonner ses saisies ou les conserver en vue d’un remplacement explicite. Un avertissement s’affiche avant de quitter une saisie non enregistrée.

La vérification relit le document et les sources nécessaires. La boîte de confirmation montre le patient, l’assuré, la consultation, les actes et les déclarations. Elle signale les champs manquants. La confirmation transmet les versions lues du document, du patient et de la consultation liée. Spring vérifie la complétude et fige les valeurs dans la même transaction. Le détail finalisé utilise l’instantané fourni par V12. Un patient archivé garde son historique et ses documents en lecture seule.

Si la réponse de finalisation se perd, le client relit le même document. L’instantané finalisé confirme le succès. Un brouillon relu exige une nouvelle vérification et une nouvelle confirmation. Si la lecture échoue, le bouton **Relire le document** réessaie uniquement le GET.

## Préparation du PDF

La phase 9.2D pourra s’appuyer sur l’instantané, sa version et l’empreinte du fond. Il reste à confirmer la recevabilité des fonds, le sens de la référence de compte FAR, les frais à déclarer et les justificatifs de paiement. Les montants saisis sur un devis et les prix convenus V9 sont conservés avec leur provenance. La signature, le cachet, le dépôt et la décision de remboursement relèvent des démarches auprès de l’organisme.

## Fichiers de la phase

- Pages sous `frontend/src/app/(cabinet)/documents/assurances/` et `frontend/src/app/(cabinet)/patients/[id]/assurances/`, liens dans les fiches patient et consultation, et libellé de l’espace de travail.
- Historique, formulaires, éditeur, détail et confirmation sous `frontend/src/components/insurance/persistent/`. Les layouts déplacent le fournisseur de données fictives sous `/demo`. L’avertissement partagé de sortie laisse passer une redirection de déconnexion.
- Schémas et client sous `frontend/src/lib/insurance/api/`, et routes explicites dans `frontend/src/lib/auth/backend-proxy.ts`.
- `frontend/tests/persistent-insurance.test.mjs`, `frontend/tests/browser/persistent-insurance.test.mjs` et le contrôle de panne dans `frontend/tests/browser/run-real-integration.mjs`.

## Vérification du 12 novembre 2026

| Contrôle | Résultat |
| --- | --- |
| Tests ciblés assurance et proxy d’authentification | 14 réussis sur 14, dont 6 nouveaux. |
| Suite frontend complète | 366 réussis sur 366, aucun ignoré. |
| TypeScript strict, ESLint, build Next.js de production | Réussis. Le build final utilise Turbopack dans une copie sans fichiers d’environnement du cabinet. |
| Harnais réel initial, assurance, clinique, ordonnances, finances, factures et dossier PDF | 34 réussis sur 34. |
| Harnais élargi avec les parcours du prototype d’assurance | 41 réussis sur 42. Un clic sur « Actualiser les finances » a dépassé 8 secondes lors du contrôle d’expiration de session. |
| Assurance sur le build final, y compris création pendant une consultation en cours | 5 réussis sur 5. |
| Finances sur le build final, relancées seules après le délai dépassé | 5 réussis sur 5, y compris le scénario de conflit et d’expiration de session. |

Les contrôles frontend utilisent `pnpm exec tsc --noEmit --incremental false`, `pnpm lint` et `next build`. Dans la copie de vérification, la suite complète a été lancée avec la commande Node du script `pnpm test`. Le harnais `node tests/browser/run-real-integration.mjs` utilise Chrome, Spring Boot et PostgreSQL 17.11 jetable sous Podman. Il vérifie les migrations V1 à V12 et n’utilise que des patients et des comptes fictifs. Pour le parcours des ordonnances persistées, le mode `ready` utilise le worker synthétique décrit dans [l’intégration des ordonnances](prescription-frontend-integration.md).

Les interruptions de réponse du navigateur couvrent une finalisation enregistrée, une finalisation qui a laissé un brouillon et une relecture momentanément impossible. Le contrôle de panne arrête réellement Spring et vérifie le refus sûr en 503. `git diff --check` et `git status` ont été exécutés.
