# Dossier patient PDF A5 — phase 8.6C

## Modèle et génération

Le backend remplit le [modèle officiel](references/pdf-templates/dossier-patient.pdf) avec PDFBox. Le document source a deux pages sans champ interactif. Sur les deux pages, le MediaBox et le CropBox valent `[0, 8.58, 419.25, 604.08]` points à la précision d’affichage de Poppler. La zone visible mesure 419,25 × 595,5 pt. Les positions d’écriture sont mesurées depuis le haut du CropBox.

Maven inclut le PDF source et Liberation Sans Regular dans le JAR, à partir des fichiers existants. Le générateur vérifie leurs empreintes avant usage. L’empreinte SHA-256 du modèle est `f68cf8351f368bf2b0d52dd3c2aa0e421294442c729c114b169d4107f11e69b4`. PDFBox ajoute des flux aux pages d’origine et incorpore les glyphes utilisés. Les fichiers source ne sont pas réécrits. La génération produit des octets en mémoire.

## Recto

| Zone imprimée | Donnée persistée |
| --- | --- |
| Nom et prénom, sexe, date de naissance | `identity.lastName`, `firstName`, `sex`, `dateOfBirth` |
| Adresse, GSM et fixe | `identity.address`, `gsm`, `landline` |
| Profession, CIN et couverture médicale | `identity.profession`, `cin`, `medicalCoverage` |
| Antécédents et allergies | Catégories cochées dans `medicalHistory.conditions` et `allergies.categories` |
| Traitement médical et grossesse | `healthQuestionnaire.underMedicalTreatment` et `pregnant` |
| Informations complémentaires et motif | `healthQuestionnaire.additionalInformation` et `reasonForConsultation` |

Les champs administratifs inconnus restent vides. Le sexe non renseigné et les réponses Oui/Non inconnues gardent les cases libres et portent la mention « Non renseigné ». Pour les groupes de cases, « Aucune catégorie cochée » correspond à un groupe renseigné vide. Les précisions d’antécédents et d’allergies sont conservées en annexe avec un renvoi sur le recto. Le motif est celui du questionnaire patient. La couverture médicale est le texte administratif déclaré.

Les champs trop longs pour leur zone portent « Voir annexe ». L’annexe reprend la valeur complète sous le libellé du champ. Elle peut occuper plusieurs pages et vient après le dernier verso financier. Les paragraphes restent distincts. Le texte latin accentué est pris en charge. Une saisie qui exige une composition bidirectionnelle ou contient un glyphe non pris en charge reçoit un 422 explicite. Le texte arabe imprimé du modèle reste visible. Un dossier de santé absent reçoit le 404 du service patient.

## Verso et cohérence

| Colonne | Projection du registre V9 |
| --- | --- |
| Date | Date enregistrée sur la charge, au format `JJ/MM/AAAA` |
| Traitement | Libellé financier de la charge |
| Prix | `priceMinor` |
| Reçu | `receivedMinor`, cumul des paiements de la charge |
| Reste | `remainingMinor` |

Les lignes sont triées par date puis UUID de charge. Chaque charge occupe une ligne, même quand deux soins portent le même libellé et la même date. Le format des montants utilise des entiers et `BigInteger`, avec virgule décimale et groupement par espaces. Les totaux **TOTAL DES SOINS**, **TOTAL REÇU** et **RESTE À PAYER** viennent de l’agrégat patient V9. Un historique vide affiche les trois totaux à zéro.

`DossierSnapshot` ouvre une transaction courte en lecture seule et en `REPEATABLE_READ`. Les lectures d’identité, de questionnaire, de lignes et de totaux rejoignent le même snapshot PostgreSQL. Le service charge jusqu’à 251 lignes pour détecter un dépassement de la limite de 250 charges. Le rendu se déroule après la fermeture de cette transaction. Aucun appel HTTP intermédiaire ou verrou de paiement n’est nécessaire.

Les libellés sont répartis sur plusieurs lignes si besoin. Une ligne de traitement ne traverse jamais un saut de page. En cas de débordement, une nouvelle page reprend le verso officiel et ses en-têtes. Les totaux apparaissent une seule fois, ensemble après la dernière charge. Un document court tient sur les deux pages officielles. Les limites sont de 250 charges, 24 pages au total et 2 Mio de PDF. Tout dépassement renvoie 413 avec le code `DOSSIER_LIMIT`.

## Accès et téléchargement

Le GET `/api/v1/patients/{patientId}/dossier.pdf` exige un UUID et une session dentiste. Spring contrôle le rôle au niveau HTTP, du service et du snapshot. L’accueil garde ses projections financières. Un patient archivé reste lisible. Les erreurs utilisent `application/problem+json` avec un identifiant de requête. Une panne de génération renvoie 500 avec un message générique.

Le bouton **Télécharger le dossier PDF** est dans `/patients/[id]/dossier`. Le proxy Next autorise ce seul GET pour le PDF du dossier. Il relaie la session, contrôle le type MIME, le nom `dossier-<UUID>.pdf` et la taille, puis transmet les octets avec une politique de cache privée `no-store`. Le client vérifie la longueur et la signature PDF avant téléchargement. Une session expirée renvoie à la connexion. Le document téléchargé s’ouvre dans le lecteur PDF du poste pour une impression A5 à taille réelle.

## Vérification visuelle

Les fixtures synthétiques couvrent un dossier court et un dossier avec 80 charges et des champs recto longs. Le test compare les flux d’origine décompressés, mesure toutes les pages, compare les pixels à l’intérieur des cases et vérifie les textes et totaux extraits. Les images Poppler sont contrôlées séparément pour le placement, la lisibilité et les retours à la ligne. Les en-têtes des deux premières pages sont comparés au modèle pixel par pixel. L’impression physique dépend des marges du pilote et du réglage A5 du poste.

Le dossier court a deux pages. La fixture à 80 charges a sept pages, dont cinq versos financiers avec en-têtes répétés et une annexe. Les images finales ont été inspectées après déplacement de la mention « Montants en DH » à l’intérieur d’une seule colonne. À 144 ppp, les 340 premiers pixels du recto et les 103 premiers pixels du verso sont identiques au modèle.

## Vérification du 11 novembre 2026

| Contrôle | Résultat |
| --- | --- |
| Backend ciblé | 150 réussis, dont 4 tests du rendu et 31 tests HTTP financiers avec 4 cas de dossier |
| Reprise des fixtures après le dernier réglage visuel | 4 réussis |
| Tests frontend ciblés du dossier | 3 réussis |
| Suite frontend | 343 réussis |
| TypeScript strict et ESLint | Réussis |
| Build Next.js de production avec Webpack | Réussi |
| Navigateur, dossier et finances | 7 parcours réussis, dont 2 de dossier |
| Navigateur, clinique | 5 parcours réussis |
| Navigateur, ordonnances en mode `ready` | 10 parcours réussis |

Les suites ci-dessus ont terminé sans échec ni test ignoré. Le test de concurrence ouvre le snapshot, laisse l’accueil valider un paiement, puis reprend la lecture financière. Le document en cours conserve les anciens montants et le document suivant montre le paiement. Les journaux capturés ne contiennent pas les données médicales synthétiques du test. Les parcours utilisent une production Next.js locale, Chrome, PostgreSQL 17.11 Testcontainers, Node 24.20.0 et OpenJDK 25.0.4.1 avec compilation Java 21. Les bases et comptes sont jetables.

```sh
cd backend
export JAVA_TOOL_OPTIONS=-Djava.awt.headless=true
./mvnw -B -ntp -o -Dtest=DossierPdfRendererTest,FinancialHttpIntegrationTest,ConsultationServiceTest,TreatmentFinancialServiceTest,PrescriptionHttpIntegrationTest,PrescriptionFinalizationIntegrationTest,PrescriptionRenderingIntegrationTest test
./mvnw -B -ntp -o verify
```

Le scanner Unslop est limité à l’anglais. Les textes français ont été relus manuellement.

L’unique passage complet de `verify` a réussi **306 tests**, avec zéro échec, erreur ou test ignoré, en 4 min 36 s. Le JAR exécutable contient le contrôleur et les deux ressources vérifiées octet par octet. Les deux parcours dossier ont également réussi sur le dernier réglage visuel. `git diff --check` a réussi et `git status` a confirmé les changements locaux attendus. Les empreintes des migrations V1–V9 et du modèle officiel correspondent à leur état initial.
