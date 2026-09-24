# Audit juridique et RGPD — v1 (24/09/2026)

Périmètre : site fascismwontget.me, serveur (Node, Mongo, Redis), infrastructure (Docker, tunnel
Cloudflare, sauvegardes), mentions légales. Méthode : chaque affirmation des mentions légales
comparée au code et à la configuration réels. Ceci n'est pas un avis d'avocat : les points
« à décider » méritent une vérification par un professionnel si le site prend de l'ampleur.

## 1. Affirmations inexactes corrigées

| Affirmation d'origine | Réalité constatée | Correction |
|---|---|---|
| « Un seul cookie est utilisé : le cookie de session » | 3 cookies (session 30 j, `reg` pendant l'inscription, `gstate` 10 min pendant la connexion Google) + 11 clés de stockage local | Liste exacte des cookies et du stockage local, tous strictement nécessaires ou de préférence (exemptés de consentement) |
| « ni cookie publicitaire ni mesure d'audience » | Une mesure d'audience existe (sans cookie) : phrase contradictoire | Reformulé |
| Sans compte : « seuls ton pseudo et tes actions de jeu sont traités, le temps de la partie » | Pseudo, votes et chat sont journalisés 12 mois | Renvoi explicite vers le journal des parties |
| Mot de passe « stocké uniquement sous forme chiffrée argon2 » | Haché (argon2), pas chiffré | « seule une empreinte argon2 est conservée » |
| Données du compte | Manquaient : secret de double authentification, succès, avertissements et sanctions, durée des sessions (30 j) | Ajoutés |
| Journal « anonymisé au bout de 12 mois » | Seuls pseudos et comptes étaient retirés : le **texte du chat restait indéfiniment** (il peut contenir des données personnelles) | Code : le texte du chat est effacé à l'anonymisation |
| Dossiers de modération | Messages et identités conservés sans limite | Code : 12 mois après clôture, messages et identités supprimés (décision et audit gardés) ; durée indiquée dans les mentions |
| Journaux techniques | Non mentionnés ; nginx enregistrait **l'IP réelle** des visiteurs, journaux Docker sans rotation | Code : journal d'accès sans IP ni référent (sondes de santé exclues), rotation 3 × 10 Mo sur tous les conteneurs ; mentionné |
| Sauvegardes | Non mentionnées (quotidiennes, locales, 14 jours) | Mentionnées : une donnée supprimée peut y subsister 14 jours |
| Transferts hors UE | Non mentionnés (Cloudflare, Resend, Google, services de push) | Section ajoutée (DPF / clauses contractuelles types) |
| Propriété intellectuelle : « propriété de l'éditeur » | Code sous AGPL-3.0, règles sous CC BY-NC-SA 4.0, polices sous OFL | Licences indiquées |
| Titre « Mentions légales » | La page porte aussi la politique de confidentialité | « Mentions légales et confidentialité » |
| llms.txt : « un seul cookie de session » | idem | Corrigé |

Déjà corrigé par ailleurs : Google Fonts (transfert d'IP vers Google non mentionné) remplacé par
des polices servies par le site (commit SEO).

## 2. Affirmations vérifiées exactes

- Mesure d'audience : empreinte SHA-256 salée par jour, sel jamais écrit, HyperLogLog, 400 jours
  (≈ 13 mois), Do Not Track et refus respectés, robots exclus — conforme à l'exemption CNIL.
- Contact : messages supprimés automatiquement après 3 ans (index TTL Mongo).
- Suppression de compte en libre-service : compte, amitiés, sessions, lien avec les parties.
- Notifications : abonnements gardés en mémoire seulement, textes sans rôle.
- Modération : dossiers pseudonymisés, chaque consultation (`show`) et levée d'identité
  (`reveal`) tracée ; sanction notifiée au joueur ; bannissement définitif réservé à l'admin.
- Limites anti-abus : IP gardée au plus 24 h dans Redis.
- Administration des parties : vue anonyme (sans pseudo, compte ni message).
- Aucun traceur publicitaire, aucune revente.

## 3. Points à décider (non modifiés)

1. **Identité de l'éditeur (LCEN art. 6).** Les mentions invoquent l'anonymat de l'éditeur non
   professionnel (art. 6-III-2). Ce régime suppose que l'éditeur a communiqué son identité à son
   **hébergeur**, qui la tient à disposition de la justice. Or le site est auto-hébergé : il n'y a
   pas d'hébergeur tiers, et la section « Hébergement » ne donne ni nom, ni adresse, ni téléphone
   (art. 6-III-1). En l'état, la mention est fragile. Options :
   - a) publier nom et moyen de contact de l'éditeur-hébergeur (le plus simple, mais expose
     l'identité) ;
   - b) héberger chez un prestataire (OVH, Scaleway, Hetzner…) qui détient l'identité : l'anonymat
     redevient valable, et on indique ses coordonnées ;
   - c) garder tel quel en connaissance de cause (risque faible en pratique, mais la mention
     n'est pas exacte).
2. **Conservation des données de connexion.** Un service qui héberge des contenus d'utilisateurs
   (le chat) peut être tenu de conserver 1 an les données permettant d'identifier leurs auteurs
   (décret n° 2021-1362). Le site a fait le choix inverse (minimisation : pas d'IP dans les
   journaux). À trancher : rester minimal, ou conserver l'IP de l'auteur de chaque message 1 an,
   à part et avec accès restreint.
3. **Conditions d'utilisation.** Il n'y a pas de CGU. Or les sanctions (chat coupé,
   bannissement) s'appuient sur des règles de conduite, et le règlement européen sur les services
   numériques (DSA, art. 14) demande que la politique de modération figure dans les conditions
   d'un service d'hébergement. Recommandé : une page courte (règles de conduite, sanctions,
   recours, âge minimum, absence de garantie).
4. **Âge minimum.** Chat ouvert, thème adulte : recommandé de fixer 15 ans (majorité numérique en
   France) ou d'indiquer l'accord parental, dans les CGU.
5. **Modérateurs bénévoles.** Ils accèdent à des données pseudonymisées sous l'autorité de
   l'éditeur (art. 29 RGPD) : leur faire accepter un engagement de confidentialité écrit
   (même un message signé suffit).
6. **Contournement d'un bannissement.** Supprimer son compte efface sa sanction (cohérent avec
   les mentions). Si c'est gênant, garder une empreinte de l'email banni, en le mentionnant.
7. **Sauvegarde hors machine.** `BACKUP_RCLONE_REMOTE` n'est pas défini : pas de copie hors site.
   Si elle est ajoutée, indiquer le prestataire et sa localisation.
8. **Resend.** Vérifier son mécanisme de transfert (certification DPF ou clauses contractuelles
   types dans son DPA) et accepter le DPA dans son tableau de bord.

## 4. Nom du jeu

Aucun symbole interdit n'est utilisé (l'icône est une moustache) et le propos est explicitement
antifasciste et satirique : pas d'apologie au sens de la loi de 1881. Garder le contexte
satirique visible (à propos, llms.txt, données structurées) protège aussi contre les filtres
automatiques des plateformes.

## 5. Registre des traitements (art. 30 RGPD)

Responsable : l'éditeur (voir mentions légales). Sous-traitants : Cloudflare (trafic, emails
reçus), Resend (emails envoyés), Google (connexion facultative), Ko-fi (dons, sur leur site).

| Traitement | Finalité | Base légale | Données | Personnes ayant accès | Durée |
|---|---|---|---|---|---|
| Partie en cours | Faire fonctionner le jeu | Exécution du service | Pseudo, identifiant aléatoire, actions, chat | Serveur | Durée de la room |
| Journal des parties | Signalements, recours, statistiques | Intérêt légitime | Pseudos, lien compte, votes, chat | Admin (vue anonyme) | 12 mois puis anonymisé, texte du chat effacé |
| Modération | Protéger les joueurs | Intérêt légitime | Messages signalés, pseudonymes, identités séparées, sanctions | Modérateurs (pseudonymisé), admin (identités, tracé) | 12 mois après clôture ; sanctions : durée du compte |
| Comptes | Statistiques, amis, connexion | Exécution du service | Email, empreinte du mot de passe, pseudo, id Google, secret 2FA, stats, amis | Admin | Jusqu'à suppression ; session 30 j |
| Contact | Répondre | Intérêt légitime | Email, sujet, message | Admin | 3 ans max |
| Audience | Mesure de fréquentation | Intérêt légitime (exemption CNIL) | Compteurs agrégés (aucune donnée individuelle conservée) | Admin | 13 mois |
| Notifications | Prévenir de son tour | Consentement (autorisation du navigateur) | Adresse d'abonnement push | Serveur | Durée de la room, en mémoire |
| Anti-abus | Sécurité | Intérêt légitime | IP (compteurs) | Serveur | 24 h max |
| Journaux techniques | Diagnostic | Intérêt légitime | Date, page, navigateur (sans IP) | Admin | Rotation 3 × 10 Mo |
| Sauvegardes | Continuité | Intérêt légitime | Toute la base Mongo | Admin | 14 jours |

Violation de données : notification à la CNIL sous 72 h si risque pour les personnes
(art. 33), et aux joueurs concernés si risque élevé (art. 34) ; consigner tout incident ici.
