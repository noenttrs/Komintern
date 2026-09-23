/* Gestion du compte administrateur, réservée au serveur :
 *   docker compose exec server node dist/admin/cli.js <commande>
 *
 *   create <email> <pseudo>   crée un compte admin dédié (mot de passe fort + TOTP générés)
 *   reset-totp <email>        nouveau secret de double authentification
 *   reset-password <email>    nouveau mot de passe fort (déconnecte les sessions)
 *   revoke <email>            retire le rôle admin
 *
 * Le rôle admin ne peut être attribué qu'ici : aucune route du site ne le permet.
 */
import crypto from "crypto";

import { MongoClient } from "mongodb";
import QRCode from "qrcode";

import { hashPassword } from "../auth/passwords";
import { generateTotpSecret, otpauthUri } from "../auth/totp";
import { MongoUserStore } from "../store/users";

function strongPassword(): string {
  return crypto.randomBytes(24).toString("base64url");
}

async function showTotp(secret: string, email: string): Promise<void> {
  const uri = otpauthUri(secret, email);
  console.log("\nDouble authentification : scanne ce QR code avec une application TOTP (Aegis, Google Authenticator, 1Password…)");
  console.log(await QRCode.toString(uri, { type: "terminal", small: true }));
  console.log(`Ou saisis ce secret à la main : ${secret}`);
}

async function main(argv: string[]): Promise<number> {
  const [command, email, ...rest] = argv;
  const url = process.env.MONGO_APP_URL;
  if (url === undefined) {
    console.error("MONGO_APP_URL est requis");
    return 2;
  }
  if (command === undefined || email === undefined) {
    console.log("commandes : create <email> <pseudo> | reset-totp <email> | reset-password <email> | revoke <email>");
    return command === undefined ? 0 : 2;
  }
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 5_000 });
  const users = new MongoUserStore(client.db());
  try {
    const normalized = email.trim().toLowerCase();
    const existing = await users.findByEmail(normalized);
    switch (command) {
      case "create": {
        const displayName = rest.join(" ").trim();
        if (existing !== null) {
          console.error("Un compte existe déjà avec cet email : pour plus de sûreté, l'admin doit être un compte dédié.");
          return 1;
        }
        if (displayName.length < 3) {
          console.error("usage : create <email> <pseudo (3 caractères min.)>");
          return 2;
        }
        const password = strongPassword();
        const secret = generateTotpSecret();
        const user = await users.create({ email: normalized, emailVerified: true, passwordHash: await hashPassword(password), googleSub: null, displayName });
        await users.update(user.id, { role: "admin", totpSecret: secret });
        console.log(`Compte admin créé : ${normalized} (${user.id})`);
        console.log(`Mot de passe (affiché une seule fois, range-le dans un gestionnaire) : ${password}`);
        await showTotp(secret, normalized);
        console.log("\nConnexion : se connecter normalement sur le site, puis Menu → Administration → code TOTP.");
        return 0;
      }
      case "reset-totp": {
        if (existing?.role !== "admin") {
          console.error("Aucun compte admin avec cet email.");
          return 1;
        }
        const secret = generateTotpSecret();
        await users.update(existing.id, { totpSecret: secret });
        await showTotp(secret, normalized);
        return 0;
      }
      case "reset-password": {
        if (existing?.role !== "admin") {
          console.error("Aucun compte admin avec cet email.");
          return 1;
        }
        const password = strongPassword();
        await users.update(existing.id, { passwordHash: await hashPassword(password) });
        console.log(`Nouveau mot de passe : ${password}`);
        console.log("Les sessions ouvertes expirent d'elles-mêmes ; redémarre le serveur pour les couper immédiatement si besoin.");
        return 0;
      }
      case "revoke": {
        if (existing === null) {
          console.error("Compte introuvable.");
          return 1;
        }
        await users.update(existing.id, { role: null, totpSecret: null });
        console.log("Rôle admin retiré.");
        return 0;
      }
      default:
        console.error("commande inconnue");
        return 2;
    }
  } finally {
    await client.close();
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
