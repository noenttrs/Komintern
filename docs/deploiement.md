# Déploiement : production et version de test

| | Production | Version de test |
|---|---|---|
| Adresse | https://fascismwontget.me | https://dev.fascismwontget.me |
| Branche git | `main` | `dev` |
| Dossier | `/home/nono/Komintern` | `/home/nono/Komintern-dev` (worktree) |
| Conteneurs | `komintern` : server, web, mongo, redis, cloudflared | `komintern-dev` : server-dev, web-dev |
| Données | bases `nazicom`, `nazicom_logs`, Redis n° 0 | bases `nazicom_dev`, `nazicom_dev_logs`, Redis n° 1 |
| Secrets | `.env` | `.env.dev` (créé par `scripts/dev-setup.sh`) |
| Indexation | oui | jamais (`noindex`, `robots.txt` fermé) |

Les deux versions partagent Mongo et Redis, avec des utilisateurs Mongo dédiés : le compte de la
version de test ne peut pas lire les bases de la production (vérifié à la mise en place).

## Cycle d'une nouveauté

1. Développer sur `dev` (dans `/home/nono/Komintern-dev`), pousser.
2. `scripts/deploy-dev.sh` : la version de test est reconstruite depuis `dev`.
3. Tester : les joueurs volontaires utilisent dev.fascismwontget.me (bandeau « Version de test »,
   bouton « Donner mon avis » qui ouvre le formulaire de contact avec le sujet prérempli) ; la suite
   Playwright tourne contre `BASE_URL=https://dev.fascismwontget.me`.
4. Fusionner `dev` dans `main`, puis `scripts/deploy.sh` pour la production.

## Mise en place (déjà faite le 2026-09-28, sauf les étapes manuelles)

- `scripts/dev-setup.sh` : worktree `dev`, `.env.dev`, utilisateurs Mongo `app_dev` / `logger_dev`.
- **À faire dans Cloudflare** (Zero Trust → Networks → Tunnels → le tunnel → Public Hostname) :
  `dev.fascismwontget.me` → Service `HTTP` → `web-dev:8080`.
- **À faire dans la console Google** (connexion Google) : ajouter l'URI de redirection
  `https://dev.fascismwontget.me/api/auth/google/callback` et l'origine `https://dev.fascismwontget.me`.
- Option : réserver l'accès aux testeurs avec Cloudflare Access (application sur
  `dev.fascismwontget.me`, règle « emails », gratuit jusqu'à 50 personnes).

## Remettre la version de test à zéro

Les comptes et parties de test peuvent être effacés à tout moment (c'est annoncé sur le site et dans
les mentions légales) : supprimer les bases `nazicom_dev` et `nazicom_dev_logs` puis la base Redis n° 1,
et relancer `scripts/deploy-dev.sh`.
