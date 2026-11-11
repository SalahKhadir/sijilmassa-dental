# API des ordonnances — contrat proposé 8.5C.1

## Statut et conventions

**État 8.5C.2B.2 : brouillons, finalisation atomique et PDF finalisé sont implémentés côté Spring/PostgreSQL. Correction, restauration et aperçu HTTP de brouillon restent non exposés.** Voir le [contrat de finalisation et ses preuves](prescription-finalization-contract.md). Ce document complète le [domaine, la sécurité et la politique PDF](prescription-persistence-contract.md). Le [plan de validation](prescription-acceptance-plan.md) définit leurs critères d’acceptation.

Préfixe `/api/v1/prescriptions`. UUID serveur, JSON strict, DTO dédiés sans sérialisation JPA. Toutes les opérations nominatives sont réservées au dentiste. Session et CSRF suivent les [conventions existantes](clinical-rest-contract.md). GET n’effectue aucune mutation métier. POST et PUT exigent un jeton CSRF valide ; pas de multipart ni upload PDF. Aucun DELETE, PATCH, chemin de fichier ou URL de téléchargement public.

Les réponses JSON et erreurs livrées, ainsi que les futures réponses PDF, portent `Cache-Control: private, no-store, max-age=0`, `Vary: Cookie` et `X-Request-ID`. Pas d’ETag, 304, cache CDN ou réponse Range/206 pour ces documents ; un en-tête Range est ignoré et une réponse complète reste 200. Le proxy same-origin futur doit ajouter explicitement les routes/méthodes, les types `application/pdf`, les en-têtes sûrs et les limites de taille. Son allowlist actuelle n’accepte pas les prescriptions et refuse le PDF : aucune intégration n’est acquise.

## Routes

`P` désigne `/api/v1/prescriptions/{id}`. Tous les chemins avec `{id}` exigent `patientId` en requête. Les paramètres inconnus, répétés, vides ou partiellement fournis sont refusés (400). POST collection n’accepte aucun paramètre.

| Méthode et chemin | Entrée | Réussite |
| --- | --- | --- |
| POST `/api/v1/prescriptions` | `Create` | 201 `Details`, `Location: P?patientId={UUID}` relatif et validé par le proxy |
| GET `/api/v1/prescriptions?patientId=…` | Filtres et curseur ci-dessous | 200 `HistoryPage` |
| GET `P?patientId=…` | Aucun corps | 200 `Details`, y compris archive et patient archivé |
| PUT `P?patientId=…` | `Update` remplaçant tout le contenu du brouillon | 200 `Details` avec version +1 |
| PUT `P/finalization?patientId=…` | `Finalize` | 200 `Details` finalisé avec version +1 ; PDF déjà enregistré |
| PUT `P/archival?patientId=…` | `ExpectedVersion` | 200 `Details` archivé avec version +1 |
| GET `P/pdf?patientId=…&version=…` | `patientVersion` requis pour brouillon seulement ; `disposition` facultatif | 200 `application/pdf` ou erreur Problem Details |

Les lignes sont gérées par le tableau ordonné de POST/PUT : ajouter, corriger, retirer et réordonner font partie d’un seul remplacement atomique. Il n’y a pas d’endpoint de ligne, de sauvegarde intermédiaire automatique ni de version de ligne publique. L’interface doit confirmer un retrait avant d’émettre la nouvelle liste. Une finalisation n’accepte pas un contenu de remplacement ; enregistrer d’abord le brouillon, puis finaliser sa version relue.

`disposition` vaut `inline` par défaut, ou `attachment`. Les autres valeurs sont refusées. `version` PDF est la version d’ordonnance attendue, obligatoire pour les deux statuts. Pour un brouillon, `patientVersion` est aussi obligatoire pour protéger l’identité de l’aperçu ; pour un document finalisé, ce paramètre est interdit car l’identité vient du snapshot. Le PDF finalisé reste accessible après archivage du patient. Un brouillon archivé ou un patient archivé n’autorise pas un nouvel aperçu (409).

## Types communs et normalisation

| Type | Règle |
| --- | --- |
| UUID | UUID valide ; pas d’identifiant mémoire, chaîne vide ou UUID d’un autre agrégat |
| Version | Entier JSON entre 0 et 9 007 199 254 740 991 ; rejet fraction, négatif, dépassement ; `Long` Java interne, entier sûr TypeScript ; bloquer l’écriture si l’incrément ne serait plus représentable |
| Date | Chaîne `AAAA-MM-JJ`, date civile réelle entre 0001-01-01 et 9999-12-31 ; aucune conversion UTC ; passé et futur acceptés |
| Instant | Chaîne ISO UTC avec `Z`, précision au plus microseconde ; affichage Casablanca |
| Texte | UTF-8 valide ; absence de NUL, substitut Unicode isolé et contrôle C0 hors tabulation/CR/LF ; jamais HTML ; limite en unités UTF-16, cohérente avec Java String et JS String |

Les champs texte facultatifs sont présents avec `""`, pas null. Seuls `consultationId`, les métadonnées d’archive/finalisation et le snapshot peuvent être null selon l’état. Le service supprime les espaces U+0020, tabulations, CR et LF en bord de champ ; il conserve l’intérieur et ne tronque jamais. Les limites sont vérifiées sur le texte reçu et normalisé. Les champs requis à la finalisation doivent contenir au moins un caractère autre qu’un espace Unicode. Un test partagé doit couvrir les espaces insécables ; ne pas supposer que `String.strip()` et `.trim()` ont exactement le même domaine. Les retours à la ligne sont conservés et comptent dans le contrôle de hauteur PDF.

## Commandes JSON

Formes exactes ; chaque propriété indiquée est obligatoire sauf `id` d’une ligne nouvelle. Aucun champ `status`, acteur, position, nom patient, snapshot, bytes, hash ou résultat de contrôle PDF n’est accepté dans une commande.

```text
LineInput = {
  id?: UUID,                    // interdit sur création ; omission = nouvelle ligne sur PUT
  medicationName: string,       // 0..200
  dosage: string,               // 0..300
  frequency: string,            // 0..200
  duration: string,             // 0..200
  instructions: string          // 0..1500
}
DraftContent = {
  consultationId: UUID | null,
  issuedDate: Date,
  medications: LineInput[],     // 0..20, ordre faisant autorité
  generalInstructions: string   // 0..2000
}
Create = { patientId: UUID, content: DraftContent }
Update = { version: Version, content: DraftContent }
Finalize = { version: Version, patientVersion: Version }
ExpectedVersion = { version: Version }
```

Pour PUT, les UUID fournis doivent être distincts et déjà appartenir aux lignes actuelles de cette ordonnance. Un UUID étranger, absent, retiré précédemment ou répété donne 400, sans indication sur son existence ailleurs. Une nouvelle ligne omet `id` ; null et UUID choisi par le client sont refusés. Un UUID valide d’une autre ordonnance ne donne jamais le droit de copier sa ligne. Les lignes omises sont retirées uniquement si la version parent est valide ; un ancien formulaire ne peut pas effacer des ajouts concurrents.

La création et la mise à jour acceptent des lignes incomplètes. La finalisation exige 1–20 lignes, avec `medicationName`, `dosage`, `frequency` et `duration` renseignés sur chacune. Les instructions restent facultatives. Aucun médicament, dose, durée, dent, soin clinique ou diagnostic n’est déduit d’un autre module.

`patientVersion` de finalisation vient du patient administratif affiché au dentiste. Le serveur compare cette version dès la préparation puis au commit, en plus de celle du brouillon. Un changement d’identité avant le clic ne peut donc pas être adopté silencieusement. Cette comparaison est volontairement conservatrice : une autre modification administrative déclenche aussi une relecture. La consultation associée peut être brouillon ou terminée ; sa version n’est pas envoyée car son contenu n’est ni copié ni modifié.

Limite HTTP pour les seules commandes prescriptions : **256 Kio** côté Spring (livré via RequestBodyAdvice avant binding) et côté Next lors de sa future intégration, indépendamment des limites par champ. Les 64 Kio actuels des autres ressources restent inchangés. Les vingt lignes avec caractères multioctets peuvent dépasser 64 Kio. Rejeter un corps plus grand avec 413 avant parsing/transport et tester les limites en octets, pas en caractères. Le JSON interne du renderer garde sa borne distincte de 1 Mio.

Exemple de création, exclusivement synthétique :

```json
{
  "patientId": "00000000-0000-4000-8000-000000000001",
  "content": {
    "consultationId": null,
    "issuedDate": "2026-11-10",
    "medications": [{
      "medicationName": "Produit fictif de test",
      "dosage": "Texte synthétique",
      "frequency": "Texte synthétique",
      "duration": "Texte synthétique",
      "instructions": "Exemple de validation uniquement"
    }],
    "generalInstructions": ""
  }
}
```

## Réponses JSON

Les représentations suivantes sont exhaustives. Les objets JSON imbriqués sont stricts. Les versions et dates reçues sont aussi validées par le client ; aucun fallback de fixture.

```text
Line = LineInput avec id obligatoire
StoredContent = DraftContent avec medications: Line[]
PatientDisplay = {
  id: UUID, reference: string, firstName: string, lastName: string,
  displayName: string, version: Version, status: "active" | "inactive"
}
DocumentIdentity = {
  firstName: string, lastName: string, displayName: string, reference: string
}
DocumentMetadata = {
  snapshotSchemaVersion: 1, capturedAt: Instant,
  patientIdentity: DocumentIdentity,
  practitionerDisplayName: string,
  templateId: string, templateSha256: string,
  rendererId: string, pdfSha256: string, pdfBytes: integer
}
Details = {
  id: UUID, patientId: UUID, version: Version,
  status: "BROUILLON" | "FINALISEE", content: StoredContent,
  patient: PatientDisplay,
  createdAt: Instant, updatedAt: Instant,
  finalizedAt: Instant | null, archivedAt: Instant | null,
  document: DocumentMetadata | null
}
Summary = {
  id: UUID, issuedDate: Date, status: "BROUILLON" | "FINALISEE",
  version: Version, consultationId: UUID | null,
  finalizedAt: Instant | null, archivedAt: Instant | null
}
HistoryPage = { items: Summary[], nextCursor: { date: Date, id: UUID } | null }
```

`DocumentIdentity` décrit le patient historique et `practitionerDisplayName` le prescripteur historique ; aucune donnée actuelle ne remplace ces valeurs. Le snapshot complet, les UUID d’acteurs, ressources internes et bytes ne sont pas renvoyés par le détail JSON. `patient` est une projection administrative minimale courante, sans téléphones, CIN ni données médicales. Sa présence permet de confirmer la version/identité avant finalisation ; elle n’altère jamais le PDF historique. Les lectures de détail utilisent une transaction cohérente pour agrégat, lignes et projection patient.

`document` est null pour un brouillon et sera présent pour `FINALISEE`, avec `pdfBytes` entre 1 et la limite serveur configurée (2 097 152 par défaut) et hash SHA-256 en 64 caractères hexadécimaux minuscules. `finalizedAt` est null uniquement pour un brouillon. Une archive n’est possible que pour un brouillon ; `archivedAt` ne devient jamais non null sur `FINALISEE`. Les lignes sont ordonnées par position croissante. Les réponses ne contiennent aucune URL signée, donnée base64 ou chemin système. Le client construit le chemin relatif du PDF depuis les UUID vérifiés.

## Historique, filtres et pagination

GET collection exige un patient existant et accepte uniquement : `patientId`, `status`, `archive`, `consultationId`, `beforeDate`, `beforeId`.

- `status` absent = deux statuts ; sinon exactement `BROUILLON` ou `FINALISEE`.
- `archive` vaut `active` par défaut (ordonnances non archivées), `archived` (brouillons archivés) ou `all`. Un patient archivé reste lisible avec les mêmes filtres ; ce filtre ne désigne pas le statut du patient.
- `consultationId` facultatif doit désigner une consultation de ce patient, sinon 400 générique. Utile depuis une consultation réelle, sans recherche globale ou déduction à partir d’une première page.
- `beforeDate` et `beforeId` sont absents ensemble ou fournis ensemble. Ils reprennent le curseur de la page précédente ; filtre et patient doivent rester identiques côté client.

Ordre `issued_date DESC, id DESC`, comparaison SQL du couple strictement inférieur au curseur, maximum fixe de 50 résumés. `nextCursor` vaut le couple de la dernière ligne lorsque la page contient 50 résultats, sinon null ; une page suivante peut être vide. Aucun total global, `pageSize`, texte clinique de recherche ou accumulation automatique. Les déplacements concurrents de date/filtre peuvent déplacer des lignes : les pages ne constituent pas un snapshot. La vue « Historique complet » demande `archive=all` et affiche explicitement les archives, sans les rendre éditables. Un patient sans ordonnance retourne `items: []`, pas 404.

## PDF : transport et erreurs

Le PDF utilise un nom ASCII fixe `ordonnance-{UUID}.pdf`, sans nom patient, date de naissance ou CIN dans `Content-Disposition`. Réponse : `Content-Type: application/pdf`, `Content-Length` exact, `Content-Disposition: inline; filename="…"` ou `attachment`, `X-Content-Type-Options: nosniff`, en-têtes de non-cache et requestId. Le proxy transmet uniquement les en-têtes documentés, refuse une redirection upstream, un type inattendu ou une taille supérieure à 2 Mio, et conserve les erreurs JSON sans les traiter comme un Blob PDF. Aucune redirection vers un répertoire public.

Pour un aperçu, le serveur capture version ordonnance et version patient, génère hors transaction puis revalide session, état/version et patient avant restitution. Si elles ont changé, 409 ; aucun aperçu obsolète n’est transmis. Comme toute lecture, le contenu correspond à un instant vérifié, sans promesse de bloquer les changements après cet instant. Le document porte le marqueur brouillon ; aucun état n’est modifié par ce GET. Pour `FINALISEE`, vérifier propriété et version, puis lire les bytes enregistrés, indépendamment des versions actuelles du patient, du modèle et du moteur.

## Statuts d’échec

| Statut | Cas et traitement client |
| --- | --- |
| 400 | JSON, UUID/date/version invalides, propriété inconnue, curseur invalide, ligne étrangère, lien consultation invalide, finalisation incomplète, dépassement A5 ou caractère non imprimable ; conserver la saisie et corriger explicitement |
| 401 | Session absente, expirée ou révoquée ; retirer les données nominatives et suivre le mécanisme existant de connexion |
| 403 | Accueil, CSRF absent/invalide, origine d’écriture refusée ; pas de retry automatique. Le CSRF peut être refusé avant le contrôle de session |
| 404 | Patient absent, ordonnance absente ou ordonnance d’un autre patient, sans distinction publique |
| 405 / 403 | Méthode non autorisée : 405 au proxy pour un chemin connu ; le refus par défaut Spring peut produire 403 selon les règles existantes |
| 409 | Ancienne version ordonnance/patient, archive, finalisation répétée ou changement pendant rendu ; conserver les champs, bloquer l’écriture, proposer relecture explicite et nouvelle confirmation |
| 413 / 415 | Corps trop grand / format de corps non supporté |
| 500 | Échec d’audit, contrainte inattendue, snapshot/document historique manquant ou corrompu ; aucun succès partiel |
| 502 | Réponse amont incohérente, DTO/PDF invalide au proxy/client ; erreur sûre, pas de fixture |
| 503 | Backend inaccessible, base indisponible identifiée, renderer absent/occupé, timeout de rendu ou ressources indisponibles ; aucune déconnexion fictive ni nouvelle soumission automatique |

Les pannes base non catégorisées restent 500 selon le gestionnaire existant ; ne pas promettre 503 pour toute exception SQL. Le proxy produit 503 si Spring est injoignable. Un renderer renvoyant un protocole invalide produit 500 côté Spring ; cela ne doit pas être confondu avec un contenu utilisateur non imprimable.

Le format RFC 9457 reste `type: about:blank`, `title`, `status`, `detail`, `instance: urn:request:…`, `requestId`. Les erreurs de champ ajoutent seulement des chemins de DTO et « Valeur invalide. », sans texte rejeté. Pour distinguer le débordement A5 des autres 400, une extension **limitée aux erreurs prescriptions** est proposée : `code` dans l’énumération `INVALID_INPUT`, `INCOMPLETE_PRESCRIPTION`, `PDF_LAYOUT_OVERFLOW`, `PDF_UNSUPPORTED_CHARACTER`, `VERSION_CONFLICT`, `READ_ONLY`, `RENDERER_UNAVAILABLE`, `DOCUMENT_UNAVAILABLE`. Ces codes sont émis uniquement pour une cause connue ; ils ne sont pas obligatoires pour les erreurs génériques/transport et ne modifient pas les autres API. Le client utilise des messages français locaux sûrs, avec fallback par statut, jamais le message brut du renderer.

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "La requête est invalide. Vérifiez les champs transmis.",
  "instance": "urn:request:00000000-0000-4000-8000-000000000099",
  "requestId": "00000000-0000-4000-8000-000000000099",
  "code": "PDF_LAYOUT_OVERFLOW"
}
```

Message client proposé : « Le contenu dépasse une page A5. Réduisez ou réorganisez le brouillon avant de finaliser. Aucun texte n’a été tronqué. » Les erreurs ne recopient jamais les médicaments, noms, SQL, chemins, URL de requête ou stacks. Une finalisation au résultat incertain se résout par GET détail ; aucune relance automatique. Une lecture impossible retire le contenu de la vue et son aperçu Blob ; les champs non soumis peuvent rester en mémoire d’un formulaire tant que la session est vérifiée, sans permettre une écriture incertaine.

## Intégration frontend ultérieure

Réutiliser le transport de session, React Hook Form/Zod, dialogues et états accessibles existants avec des DTO persistants distincts. L’annuaire de prescriptions réelles part des patients persistants, puis de leur historique borné ; ne pas simuler un annuaire global avec une première page. Ajouter les liens depuis patient et consultation seulement lorsque ces routes réelles sont disponibles. Ne jamais injecter un UUID persistant dans les providers mémoire.

Avant de basculer `/documents` et ses sous-routes, définir la navigation de démonstration qui conserve ordonnances, assurance et PDF actuels. Le déplacement des routes n’est pas réalisé ici ni inclus dans la fondation 8.5C.2. Préserver les labels français, branding, état vide, chargement, erreurs, focus et lecture seule ; session non vérifiée ou accueil ne monte aucun lecteur clinique. Vérifier les droits avant/après fetch et ignorer les réponses d’une ancienne session ou d’un autre patient. La confirmation de finalisation présente le patient/date/version lus et rappelle la lecture seule ; le PDF définitif provient du téléchargement authentifié, jamais du rendu navigateur.

## État exact des opérations en 8.5C.2A

| Opération | État |
| --- | --- |
| POST collection ; GET collection/détail ; PUT détail/archival | Implémentées avec les chemins, DTO, filtres et curseurs ci-dessus |
| PUT finalization ; GET pdf ; corrections ; restauration | Aucun contrôleur ni autorisation HTTP dédié ; refus par défaut 403 avec session/CSRF applicables, sans endpoint factice |
| Lignes | Tableau complet dans POST/PUT ; UUID serveur conservés, retrait des lignes omises et ordre atomique |
| Codes d’erreur métier | `INVALID_INPUT`, `VERSION_CONFLICT`, `READ_ONLY` pour les causes connues ; 404 et erreurs génériques conservent le contrat RFC 9457 sans code additionnel obligatoire |
| Taille HTTP | 256 Kio avant parsing/binding, y compris corps sans Content-Length ; autres ressources inchangées |
| Proxy Next et UI | Non intégrés, allowlist frontend inchangée ; pas de parcours réel de prescriptions dans le navigateur |

Décisions A–E approuvées : voir le [contrat de domaine](prescription-persistence-contract.md). Le futur correctif exigera une nouvelle ordonnance liée à l’original et auditée ; la relation n’est pas acceptée dans les commandes actuelles. Les structures et sections PDF de ce document décrivent la cible future et ne constituent pas une API disponible.


## Rendu interne — 8.5C.2B.1

Le [worker local et son adaptateur Java](prescription-rendering-bridge.md) sont maintenant implémentés. Leur protocole de pipes est privé et ne constitue pas une extension de cette API REST. Le mode `FINAL_LAYOUT_CHECK` ne change aucun statut et ne produit aucun document durable. Les cinq opérations REST de brouillons restent identiques ; aucune route de rendu, PDF ou finalisation n’est exposée, et les autorisations HTTP restent inchangées.

Les catégories de rendu sont typées en Java, sans nouveau mapping HTTP avant la phase qui l’autorisera. Aucune donnée PDF n’est jointe aux détails JSON existants ; `document` et `finalizedAt` restent null. Le frontend des ordonnances demeure synthétique et son générateur navigateur conserve son comportement.
