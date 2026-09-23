/* Outil de modération, réservé au serveur : docker compose exec server node dist/moderation/cli.js <commande>
 *   list [open|resolved]        dossiers (pseudonymisés)
 *   show <caseId>               conversation pseudonymisée
 *   reveal <caseId>             identités derrière les pseudonymes (tracé dans l'audit)
 *   resolve <caseId> <note...>  clôture le dossier
 *   ban <userId> <jours>        bannit un compte (0 = lever le bannissement)
 */
import { MongoClient } from "mongodb";

import { MongoGameLogStore } from "../store/gamelog";
import { MongoUserStore } from "../store/users";

async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  const logUrl = process.env.MONGO_LOG_URL;
  const appUrl = process.env.MONGO_APP_URL;
  if (logUrl === undefined || appUrl === undefined) {
    console.error("MONGO_LOG_URL et MONGO_APP_URL sont requis");
    return 2;
  }
  const logClient = new MongoClient(logUrl, { serverSelectionTimeoutMS: 5_000 });
  const appClient = new MongoClient(appUrl, { serverSelectionTimeoutMS: 5_000 });
  const logs = new MongoGameLogStore(logClient.db());
  const users = new MongoUserStore(appClient.db());
  const at = () => new Date();

  try {
    switch (command) {
      case "list": {
        const status = args[0] === "open" || args[0] === "resolved" ? args[0] : undefined;
        for (const c of await logs.listCases(status)) {
          const trigger = c.trigger.type === "flagged_word" ? `mots: ${c.trigger.words.join(", ")}` : `signalement par ${c.trigger.reporter}: ${c.trigger.reason || "-"}`;
          console.log(`${c.id}  ${c.status.padEnd(8)}  ${c.createdAt.toISOString()}  room ${c.roomCode}  ${trigger}`);
        }
        return 0;
      }
      case "show": {
        const c = await logs.getCase(args[0] ?? "");
        if (c === null) {
          console.error("dossier introuvable");
          return 1;
        }
        await logs.audit({ caseId: c.id, action: "show", at: at() });
        console.log(JSON.stringify({ ...c, messages: undefined }, null, 2));
        for (const m of c.messages) {
          console.log(`${m.at.toISOString()}  ${m.flagged ? "⚑" : " "} ${m.pseudonym}: ${m.text}`);
        }
        return 0;
      }
      case "reveal": {
        const caseId = args[0] ?? "";
        if ((await logs.getCase(caseId)) === null) {
          console.error("dossier introuvable");
          return 1;
        }
        await logs.audit({ caseId, action: "reveal", at: at() });
        for (const identity of await logs.getIdentities(caseId)) {
          console.log(`${identity.pseudonym}  pseudo="${identity.pseudo}"  compte=${identity.userId ?? "invité"}  joueur=${identity.playerId}`);
        }
        return 0;
      }
      case "resolve": {
        const caseId = args[0] ?? "";
        const note = args.slice(1).join(" ") || "résolu";
        const ok = await logs.resolveCase(caseId, note);
        await logs.audit({ caseId, action: "resolve", at: at(), detail: note });
        console.log(ok ? "dossier clôturé" : "dossier introuvable ou déjà clôturé");
        return ok ? 0 : 1;
      }
      case "ban": {
        const days = Number(args[1]);
        if (args[0] === undefined || !Number.isFinite(days) || days < 0) {
          console.error("usage : ban <userId> <jours>");
          return 2;
        }
        const until = days === 0 ? null : new Date(Date.now() + days * 24 * 3600 * 1000);
        const user = await users.update(args[0], { bannedUntil: until });
        console.log(user === null ? "compte introuvable" : until === null ? "bannissement levé" : `banni jusqu'au ${until.toISOString()}`);
        return user === null ? 1 : 0;
      }
      default:
        console.log("commandes : list [open|resolved] | show <caseId> | reveal <caseId> | resolve <caseId> <note> | ban <userId> <jours>");
        return command === undefined ? 0 : 2;
    }
  } finally {
    await Promise.allSettled([logClient.close(), appClient.close()]);
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
