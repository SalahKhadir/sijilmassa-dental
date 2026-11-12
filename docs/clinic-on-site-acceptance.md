# Fiche de recette sur site — Sijilmassa Dental

Cabinet ____________________  Version ____________________  Date ____________________

PC dentiste ____________________  PC accueil ____________________  URL HTTPS ____________________

Utiliser des comptes et des dossiers fictifs. Effectuer les essais de coupure, de reprise et de mise à jour sur une installation jetable. Sur le matériel destiné au cabinet, faire la recette initiale avant toute saisie réelle.

Pour chaque ligne, remplacer **NOT TESTED** par **PASS** ou **FAIL** après observation. Inscrire les initiales et la date. Reporter tout échec et sa correction dans le registre en bas de page.

## Démarrage, TLS et réseau

| Exigence | Vérification | Résultat attendu | Statut | Opérateur / date |
| --- | --- | --- | --- | --- |
| Préparation du serveur | Lancer le préflight depuis le PC dentiste avec le disque et le trousseau prévus. | Aucun FAIL. Les points manuels sont attribués. | NOT TESTED | |
| Démarrage du serveur | Lancer `deployment/clinic.sh up --wait --no-build --pull never` puis `deployment/clinic.sh ps`. | Les quatre services sont sains. | NOT TESTED | |
| Identité du serveur | Comparer l’empreinte SHA-256 du CA avec celle lue au terminal dentiste via un canal indépendant. Exécuter le contrôle TLS avec l’IP réservée. | Empreinte identique, chaîne valide, IP exacte et dates valides. | NOT TESTED | |
| Confiance sur les deux postes | Installer le seul certificat public vérifié dans le magasin utilisé par chaque navigateur. Ouvrir l’URL privée depuis les deux postes. | Page de connexion accessible. Aucun avertissement TLS. | NOT TESTED | |
| Ports internes | Depuis l’accueil, tester TCP 5432 et 8080 vers l’IP dentiste. Sous Windows utiliser `Test-NetConnection IP_DENTISTE -Port PORT`. Sous Linux utiliser `nc -vz -w 3 IP_DENTISTE PORT`. | Aucune connexion sur ces ports. Le port HTTPS du cabinet répond. | NOT TESTED | |
| Réseaux interdits | Depuis le Wi-Fi invité, puis hors du LAN, tester l’accès au port HTTPS du cabinet. Vérifier les règles du pare-feu et l’absence de redirection ou d’UPnP sur le routeur. | Accès refusé hors des postes autorisés. | NOT TESTED | |
| Coupure LAN | À l’accueil, couper le réseau pendant une lecture. Rétablir le réseau, recharger et vérifier l’état avant de reprendre. | Connexion rétablie. Les dossiers se chargent sans erreur. | NOT TESTED | |

## Accès et sessions

| Exigence | Vérification | Résultat attendu | Statut | Opérateur / date |
| --- | --- | --- | --- | --- |
| Compte dentiste | Ouvrir une session depuis le PC dentiste. Consulter puis modifier un dossier fictif. | Actions cliniques autorisées. | NOT TESTED | |
| Compte accueil | Ouvrir une autre session depuis l’accueil. Consulter l’identité et les éléments de paiement du dossier fictif. | Fonctions administratives et financières accessibles. | NOT TESTED | |
| Confidentialité | Avec le compte accueil, ouvrir une URL clinique du dossier fictif relevée côté dentiste. Vérifier aussi le menu. | Aucun contenu clinique, questionnaire ni ordonnance affiché. | NOT TESTED | |
| Cookie et CSRF | Lancer le préflight `install --running`. Dans le navigateur, vérifier les attributs de `JSESSIONID` dans l’inspecteur, sans relever sa valeur. Enregistrer une modification fictive via l’interface. | `Secure`, `HttpOnly`, `SameSite=Strict`. L’action normale réussit. La sonde sans jeton reçoit 403. | NOT TESTED | |
| Déconnexion | Se déconnecter de chaque compte, revenir en arrière puis recharger la dernière page protégée. | Retour à la connexion, accès protégé refusé. | NOT TESTED | |
| Expiration | Laisser une session inactive plus de 20 minutes, fermer les autres onglets de l’application et vérifier qu’aucune requête périodique ne la maintient. Recharger une page protégée. | Reconnexion demandée. Après connexion, relire l’état avant toute nouvelle saisie. | NOT TESTED | |

## Exploitation et reprise

| Exigence | Vérification | Résultat attendu | Statut | Opérateur / date |
| --- | --- | --- | --- | --- |
| Redémarrage de l’hôte | Après une sauvegarde fictive, redémarrer normalement le PC dentiste. Contrôler `ps`, l’accès accueil et le dossier témoin. | Les services reviennent. Les données et l’autorité TLS sont conservées. | NOT TESTED | |
| Arrêt imprévu | Sur une VM jetable avec un dossier fictif, simuler un arrêt brutal, rallumer et vérifier la base et le dossier. Si une écriture était en cours, relire son état avant de la retenter. | Les services redémarrent et la dernière écriture confirmée est présente. Si la base échoue, garder son volume isolé et suivre le plan de reprise. | NOT TESTED | |
| Redémarrage PostgreSQL | Sur la pile fictive, lancer `deployment/clinic.sh restart db`, puis attendre l’état sain avec `up --wait --no-build --pull never`. Relire le dossier. | Connexion rétablie et données conservées. | NOT TESTED | |
| Redémarrage applicatif | Sur la pile fictive, redémarrer `backend frontend https`. Refaire le préflight en mode actif et se reconnecter si nécessaire. | Les sondes repassent au vert et le dossier demeure accessible. | NOT TESTED | |
| Espace faible | Dans le préflight, régler temporairement le minimum au-dessus de l’espace disponible. | Échec explicite. Le test ne remplit aucun disque. | NOT TESTED | |
| Sauvegarde en échec | Avec la configuration fictive, choisir un destinataire GPG absent, puis exécuter le job manuellement et vérifier son code de retour. | Retour non nul. Le journal du job ne contient aucun secret. Les archives antérieures sont intactes. | NOT TESTED | |
| Disque externe absent | Démonter le disque de recette, puis exécuter le job externe. Remonter le disque prévu et relancer. | Échec explicite et aucune archive sous le point non monté. Après remontage, archive valide. | NOT TESTED | |
| Sauvegarde et reprise | Vérifier la dernière archive, puis restaurer sur un volume neuf selon le [plan de reprise](database-backup-and-recovery.md). | Date, checksum et enveloppe conformes. La pile isolée relit le dossier et les PDF fictifs. | NOT TESTED | |
| Certificat bientôt expiré | Lancer le contrôle TLS sur la pile fictive avec un seuil de durée supérieur à la durée résiduelle. Suivre la procédure de rotation sur cette pile. | Alerte explicite. Après rotation, les deux postes valident l’identité et la chaîne. | NOT TESTED | |
| Mise à jour en échec | Essayer la nouvelle version sur une restauration isolée et simuler un échec de démarrage. Reprendre avec l’ancienne version et son archive sur un volume neuf. | L’ancien jeu d’images et la sauvegarde d’avant mise à jour permettent la reprise. | NOT TESTED | |

## Impression A5

Imprimante ____________________  Pilote / version ____________________  Bac ____________________

Imprimer un exemplaire de chaque PDF fictif. Sélectionner **A5 (148 × 210 mm)** et **Taille réelle / 100 %** dans le lecteur et le pilote. Vérifier l’orientation sur l’aperçu selon le PDF. Désactiver l’ajustement automatique à la page.

| Exigence | Vérification | Résultat attendu | Statut | Opérateur / date |
| --- | --- | --- | --- | --- |
| Papier et pilote | Vérifier que le pilote expose A5 et que le bac contient le bon papier. | Taille et orientation cohérentes avec l’aperçu. | NOT TESTED | |
| Facture | Imprimer une facture émise fictive. Vérifier l’en-tête, les lignes, les montants et les bords. | Alignement correct. Aucun contenu coupé. | NOT TESTED | |
| Dossier recto | Imprimer la page clinique d’un dossier fictif. Vérifier l’en-tête, les marges et les zones de texte. | Alignement correct. Aucun contenu coupé. | NOT TESTED | |
| Dossier verso | Imprimer la page financière du même dossier. Vérifier les lignes et les totaux. | Tableau lisible. Aucun contenu coupé. | NOT TESTED | |
| Duplex | Sur une imprimante compatible, imprimer recto-verso et choisir le bord de retournement qui conserve l’orientation. Sinon, consigner le test de retournement manuel. | Le verso se lit à l’endroit et correspond au bon recto. | NOT TESTED | |
| Ordonnance | Imprimer une ordonnance finalisée fictive. Vérifier l’en-tête, le texte et les bords. | Texte lisible et en-tête aligné. Aucun contenu coupé. | NOT TESTED | |

## Registre des blocages

| Exigence en échec | Observation | Correction et responsable | Date de nouvel essai | Résultat |
| --- | --- | --- | --- | --- |
| | | | | |
| | | | | |
| | | | | |

Autorisation d’ouverture ____________________  Date ____________________
