# PDF officiel de facture A5 — phase 8.7C.2B

## Fond et géométrie

Le serveur embarque `docs/references/pdf-templates/facture_background.png`. Son SHA-256 est `124825673d6d3623bcaafea91786b026a3e73c9635b98faae085fb59ba9196b5`. L’image RVB sRGB mesure 1 410 × 2 000 pixels et porte une résolution déclarée de 242 ppp, soit environ 148 × 210 mm. Le rapport largeur sur hauteur est de 0,705. Une page A5 portrait de 148 × 210 mm donne 419,5276 × 595,2756 points et un rapport de 0,70476. La mise à l’échelle uniforme remplit toute la largeur et laisse environ 0,10 point en haut et en bas. Le fond reste entier, avec son en-tête bilingue, son filigrane et son bandeau de coordonnées.

| Zone | Position en points depuis le coin inférieur gauche |
| --- | --- |
| Date à droite | Ligne de base à 448, sous le trait du fond |
| Titre centré en bordeaux | Ligne de base à 418, corps 14,5 |
| Patient | Départ x = 28, ligne de base à 392, interligne 11 |
| Table | x = 28 à 391,5, dessus à 370 si le nom tient, entête de 18 points |
| Colonnes DATE, DENTS, DESCRIPTION, PRIX | Bords x = 28, 88, 126, 315,5 et 391,5 |
| Total, montant reçu et reste | Alignement des valeurs à droite, lignes de base à 14, 28 et 42 points sous la table |
| Montant en lettres | Départ x = 28, à 59 points sous la table, interligne 11,5 |
| IF, ICE et INP | Départ x = 28, lignes de base à 104, 92 et 80 |

Les lignes restent entières et prennent la hauteur de leur cellule la plus longue. Le texte courant est composé à 8,5 points, avec des polices Liberation Sans Regular et Bold incorporées. Les références dentaires et les descriptions se replient dans leur colonne. Un prix très large peut occuper deux lignes. Le corps reste fixe. La table se décale si le nom l’exige. La mise en page réserve aussi la place nécessaire au montant en lettres et au pied de page. Si l’ensemble dépasse la zone imprimable, le serveur renvoie une erreur de mise en page. Il ne produit ni page supplémentaire ni PDF incomplet.

## Données et rendu

`InvoiceService.issuedDocument` vérifie le compte, le patient et la facture dans une transaction de lecture. Il lit uniquement les colonnes d’émission de `invoice` et `invoice_line`, dans l’ordre des lignes persistées. Le document immuable ne contient ni référence interne du patient, ni identifiant clinique, ni notes. Il utilise le numéro, la date et le nom figés, puis les dates, libellés, prix et références dentaires des soins figés.

V10 stocke les montants d’émission par ligne. Le modèle vérifie que chaque prix est dans la plage de V9 et que le reçu par ligne est compris entre zéro et le prix. Le total et le reçu sont les sommes exactes des lignes. Le reste est leur différence. Le rendu utilise `BigInteger` pour ces calculs, l’affichage des centimes et le montant français en lettres. Le formateur Java couvre la plage V10 de 0 à 2 251 799 813 685 247 750 centimes et partage ses cas de référence avec le formateur TypeScript.

Une ligne historique antérieure à V11 conserve sa cellule DENTS vide. Il en va de même pour un soin sans référence lors de l’émission. Le service n’interroge ni la fiche courante du patient, ni les soins cliniques, ni les paiements V9 pour générer le document. Un règlement ultérieur peut modifier le solde de la page de suivi. Les montants du PDF restent ceux de l’émission.

`InvoicePdfRenderer` vérifie les empreintes des ressources fixes du classpath, mesure le contenu puis dessine une page avec PDFBox. Les glyphes non pris en charge et les contrôles bidirectionnels déclenchent une erreur. Deux rendus simultanés sont autorisés et la sortie complète est limitée à 2 Mio en mémoire. Les ressources et le document sont fermés après le rendu. Le serveur ne persiste pas le PDF et ne publie aucun fichier temporaire.

## Endpoint et interface

`GET /api/v1/invoices/{invoiceId}/pdf?patientId={patientId}` est accessible au dentiste et à l’accueil authentifiés. Les UUID et le paramètre patient sont obligatoires. Un patient archivé conserve l’accès à ses factures émises. La réponse contient `application/pdf`, `Content-Disposition: attachment; filename="facture-AAAA-NNN.pdf"`, une longueur vérifiée, `Cache-Control: no-store, private` et `X-Content-Type-Options: nosniff`.

| Statut | Réponse |
| --- | --- |
| 400 | UUID ou paramètres invalides |
| 401 / 403 | Session absente ou accès refusé |
| 404 | Facture introuvable pour ce patient |
| 409 | `INVOICE_NOT_ISSUED` |
| 422 | `INVOICE_PDF_LAYOUT_OVERFLOW` ou `INVOICE_PDF_UNSUPPORTED_TEXT` |
| 500 | `INVOICE_PDF_INTEGRITY` ou `INVOICE_PDF_RENDER_FAILED` |
| 503 | `INVOICE_PDF_BUSY` ou indisponibilité du proxy |

Les erreurs utilisent RFC 9457 avec des messages sûrs. Le proxy même origine autorise uniquement le GET de cette route. Il vérifie le nom, la longueur et la signature du PDF complet avant de transmettre les octets. Le client compare le nom au numéro de la facture affichée, puis utilise les octets du serveur pour le téléchargement ou le lecteur PDF du navigateur. « Imprimer la facture » ouvre cet aperçu avec un lien vers un nouvel onglet. Le personnel lance l’impression depuis le lecteur PDF et choisit A5 et taille réelle. La fermeture de l’aperçu et la sortie de la vue libèrent l’URL Blob. La perte de session renvoie à la connexion.

## Vérification visuelle

Trois factures synthétiques déterministes peuvent être produites avec `-Dinvoice.pdf.samples=/tmp/sijilmassa-87c2b-visual` sur `InvoicePdfRendererTest`.

- `01-historique-soldee` contient un soin, une cellule DENTS vide, des accents et un solde nul.
- `02-reference-longue-grand-total` contient un nom et un libellé sur plusieurs lignes, plusieurs dents, des libellés dupliqués, un paiement partiel et un total de 90 071 992 548 779,92 DH.
- `03-capacite-a5` contient neuf lignes courtes. Le cas automatisé à dix lignes reçoit une erreur et ne produit aucun fichier.

Les trois pages ont été rasterisées avec Poppler et inspectées. Le titre est centré, la date reste sous le trait du fond et les colonnes ne se chevauchent pas. Les noms, libellés, dents et prix longs restent dans leurs zones. Les montants en lettres précèdent les identifiants du cabinet et le bandeau demeure visible. Aucun numéro de page n’apparaît. PDFBox vérifie la taille, les polices incorporées et l’égalité des pixels de l’image embarquée avec le PNG officiel. La validation sur imprimante physique reste à faire avec le pilote du cabinet, en A5 à 100 %.

## Vérification du 11 novembre 2026

| Contrôle | Résultat |
| --- | --- |
| Maven ciblé, `InvoicePdfRendererTest,InvoiceMigrationTest,InvoiceServiceTest,FinancialHttpIntegrationTest` | 72 réussis |
| Régressions Maven, registre, clinique, dossier et ordonnances | 149 réussis |
| `./mvnw -B -ntp -o verify` | 347 réussis |
| Frontend ciblé, contrat, transport PDF et montant en lettres | 17 réussis |
| `pnpm test` | 360 réussis |
| `pnpm exec tsc --noEmit --incremental false` et `pnpm lint` | Réussis |
| Next.js de production avec Webpack | Réussi dans une copie sans fichiers d’environnement du cabinet |
| Chrome, factures, registre, dossier et clinique | 19 réussis |
| Chrome, ordonnances persistantes | 10 réussis |

Le test de migration rend une facture émise sous V10 après application de V11. Les tests HTTP couvrent les deux rôles, le rejet des brouillons, le périmètre patient et les en-têtes. Un changement du nom courant, de la référence clinique et du solde V9 après émission donne exactement les mêmes octets lors du nouveau téléchargement. Le navigateur a validé le téléchargement, le nom, la taille A5 et l’ouverture des mêmes octets dans le lecteur intégré. Il a aussi vérifié la révocation de l’URL Blob, la reprise de connexion et le refus de mise en page. Le scanner Unslop étant limité à l’anglais, les libellés français ont été relus manuellement.

Les suites finales ont terminé sans échec ni test ignoré. Maven a produit le JAR Spring Boot en 8 min 08 s. Le JAR contient le contrôleur, le fond approuvé et les deux polices utilisées. `git diff --check` et `git status` ont été exécutés sur les fichiers finaux. Les empreintes de V1–V11, des deux copies du fond de facture et du modèle de dossier correspondent au point de départ.
