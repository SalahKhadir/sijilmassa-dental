# Composants visuels et interactions

## Choix de la phase 2

Les contrôles fonctionnels utilisent les primitives shadcn/ui adaptées au projet. `Input` suit la même organisation que `Button`, avec les jetons canoniques, le focus visible et les états d’erreur. Le formulaire utilise des libellés persistants et des boutons HTML.

Les transitions de bordure, de fond et l’enfoncement de 1 px du bouton de connexion sont écrits localement en CSS. Ils respectent `prefers-reduced-motion`, qui supprime le déplacement et la transition du bouton. Le contenu reste visible dès le rendu serveur.

## Ressources examinées le 7 novembre 2026

| Ressource | Examen | Décision |
| --- | --- | --- |
| [React Bits](https://reactbits.dev/get-started/index) et [Fade Content](https://reactbits.dev/animations/fade-content) | Le [source TypeScript](https://github.com/DavidHDev/react-bits/blob/main/src/ts-default/Animations/FadeContent/FadeContent.tsx) importe GSAP et ScrollTrigger, expose plusieurs effets et prend en compte la réduction des mouvements. Le contenu démarre avec `visibility: hidden`. La [licence](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md) est MIT avec une condition Commons Clause et impose de conserver les notices lors d’une copie substantielle. | Un formulaire de connexion doit être lisible immédiatement. Les transitions CSS locales suffisent à cette page. |
| [Kinetics](https://kinetics.colorion.co/) et son [dépôt](https://github.com/ckissi/kinetics) | Les exemples affichent les extraits CSS et React. L’exemple Floating Label emploie `:placeholder-shown` et des transformations CSS, avec un identifiant fixe dans l’extrait. Le manifeste du site utilise Astro. La page et les fichiers racine consultés ne fournissent pas de licence explicite de réutilisation. | Les libellés restent au-dessus des champs. La réutilisation de code Kinetics attend une licence explicite compatible. |

La phase 2 comprend du CSS original et les primitives déjà adoptées. Le registre ci-dessus documente la consultation des ressources et les raisons de sélection. Aucune notice de code tiers supplémentaire n’est requise pour ces transitions originales.

## Règles pour les prochaines intégrations

- Définir le besoin d’interaction et préférer les contrôles shadcn/ui pour les formulaires, dialogues et navigations.
- Lire le code et la licence du composant exact, puis examiner ses dépendances avant de l’adopter.
- Choisir des composants gratuits dont la licence autorise l’usage prévu. Conserver les notices et obligations de la version copiée dans le dépôt.
- Documenter le lien source, la version ou révision, la licence, les dépendances et les adaptations de chaque composant copié.
- Copier les sources nécessaires localement et utiliser les couleurs du design system. Fournir les ressources localement pour le fonctionnement sur le réseau du cabinet.
- Vérifier le rendu serveur, l’accès clavier, les libellés, les annonces d’état, le focus, le contraste, les cibles tactiles et le comportement avec JavaScript indisponible.
- Tester les tailles bureau et mobile, le zoom et `prefers-reduced-motion`. Donner la priorité à la lisibilité et à la stabilité des contrôles.
- Retenir des effets CSS courts et limités au retour d’interaction lorsque cela suffit au besoin.

## Phase 3 — dossier patient

Les écrans patients réutilisent les cartes, boutons et champs du projet. `Select` et `Textarea` sont des contrôles HTML natifs stylés avec les mêmes jetons. Les cases et boutons radio sont groupés avec `fieldset` et `legend`, conservent leurs interactions clavier natives et utilisent la couleur primaire pour la sélection.

Les écrans du dossier et le formulaire à étapes utilisent les transitions de couleur déjà définies dans le design system. Le changement d’étape place le focus sur son titre après le rendu. Les contrôles restent visibles et lisibles avec la réduction des mouvements.


## Phase 4 — agenda partagé

La grille horaire et l’agenda utilisent les contrôles existants et les jetons canoniques. Les chevauchements occupent des colonnes distinctes et conservent une largeur lisible dans une région défilante au clavier. Le jour sélectionné est ramené dans la région visible sans animation. La liste complète et les détails conservent les noms complets.

Sur petit écran, les cartes d’agenda remplacent les sept colonnes. Les statuts ont un texte, une icône et une présentation centralisée. Les formulaires et changements de statut utilisent les primitives natives déjà adoptées. Les transitions de couleur respectent la réduction des mouvements définie dans la feuille de style.

## Phase 5 — espace clinique

Les vues cliniques reprennent les cartes et contrôles existants. Les dialogues de retrait d’un soin non enregistré et de clôture utilisent la primitive Radix déjà installée, avec titre, description, focus contenu et annulation au clavier. Les champs de texte conservent des libellés persistants, des messages associés et une hauteur confortable.

Les listes générales présentent l’identité, la date, le statut et le nombre de soins. Le compte rendu détaillé reste dans les vues cliniques. Les réponses du questionnaire réutilisé distinguent les catégories rapportées, absentes et non renseignées. Le bordeaux clair met en évidence les allergies déclarées avec leur libellé.

Les formulaires et résumés deviennent monocolonnes sur mobile. Les statuts Brouillon et Terminée combinent texte et icône. Les transitions existantes et la réduction des mouvements sont conservées. Cette phase utilise les composants locaux et le dialogue existant.

Le surtitre partagé utilise le bordeaux existant pour assurer le contraste des petits caractères sur le fond chaud. Les valeurs canoniques restent centralisées et identiques à celles du fichier AGENTS.md.

## Phase 6 — ordonnances

Les ordonnances réutilisent les contrôles existants et le dialogue de confirmation. Les médicaments sont regroupés dans des fieldsets numérotés. Des boutons nommés permettent le déplacement et le retrait confirmé des lignes au clavier. Les erreurs de date, de référence et de longueur sont associées aux champs. La finalisation présente le patient, la date et le contenu à relire sur l’écran de détail.

L’aperçu utilise le PDF réel dans le lecteur du navigateur. Il possède un titre, des commandes explicites de téléchargement et d’impression et un lien vers un nouvel onglet. Les erreurs de génération sont lisibles et peuvent être réessayées. Les modèles de feuilles de soins dentaires apparaissent comme des catégories informatives.

Les nouveaux libellés français ont été relus manuellement avec les principes Unslop. Les scanners installés ciblent la prose anglaise. La relecture conserve les libellés officiels, les instructions médicales et les limites du prototype.


## Phase 7 — facturation

Les contrôles locaux et les formulaires React Hook Form/Zod servent à la saisie des factures et des règlements. Les lignes de facture sont des fieldsets nommés, avec boutons de déplacement et retrait confirmé. Chaque montant possède une unité explicite. Les erreurs sont associées aux champs et le premier champ invalide reçoit le focus. Les statuts combinent texte et icône.

Les dialogues existants encadrent l’émission, le règlement et l’annulation. Le prix reste modifiable sur le brouillon ; la vue émise présente les montants en lecture seule. Les tables de bureau deviennent des cartes sur les écrans étroits. Les historiques regroupent le reçu et le reste par facture pour éviter une fausse affectation des paiements aux soins.

Le PDF indisponible est expliqué dans une carte avec la dépendance manquante. Aucun bouton ne simule sa génération. Aucun composant décoratif React Bits, Kinetics ou Stageshow n’est ajouté. Les transitions existantes respectent la réduction des mouvements. La relecture française manuelle applique les principes Unslop en conservant le sens des termes financiers.
