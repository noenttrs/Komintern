// Exécuté une seule fois, à la création du volume Mongo (docker-entrypoint-initdb.d).
// Deux utilisateurs applicatifs séparés :
//  - app    : lecture/écriture sur la base de jeu (comptes, amis, stats) ; aucun accès aux logs.
//  - logger : base des logs (parties, modération) ; utilisé par le serveur seul, jamais exposé.

const appDb = db.getSiblingDB("nazicom");
appDb.createUser({
  user: "app",
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: "readWrite", db: "nazicom" }],
});

const logsDb = db.getSiblingDB("nazicom_logs");
logsDb.createRole({
  role: "logWriter",
  privileges: [
    {
      resource: { db: "nazicom_logs", collection: "" },
      actions: ["find", "insert", "update", "createIndex", "listIndexes", "listCollections", "createCollection"],
    },
  ],
  roles: [],
});
logsDb.createUser({
  user: "logger",
  pwd: process.env.MONGO_LOG_PASSWORD,
  roles: [{ role: "logWriter", db: "nazicom_logs" }],
});
