// Seed N active, login-ready players in the isolated Arango DB (HOC_ARANGODB_DB env).
// Reuses the server's own persistence helpers from the sibling server checkout; run with bun from anywhere:
//   HOC_ARANGODB_HOST=... HOC_ARANGODB_DB=cryptopulse_hunt409 ... bun seed_accounts.ts <count> <prefix> <out.json>
// Mirrors simple_client/create_vs_ai_match.ts's seedPlayer (email/password login, active, free).
import path from "node:path";
import { pathToFileURL } from "node:url";

// The server repo is a sibling checkout of this one (or named explicitly via HOC_SERVER_LOC) —
// resolved relative to this file so no per-user absolute path is baked into the script.
const serverRoot = process.env.HOC_SERVER_LOC
    ? path.resolve(process.env.HOC_SERVER_LOC)
    : path.resolve(import.meta.dir, "../../../heroes-of-crypto-server");
const fromServer = (module: string) => import(`${pathToFileURL(serverRoot).href}/${module}`);
const { Player } = await fromServer("generated/protobuf/v1/player_pb.js");
const { default: config } = await fromServer("configuration/index.ts");
const { saveDocument } = await fromServer("src/db/arango.ts");
const { DBSchemaV1 } = await fromServer("src/db/db_schema.ts");
const { hashPassword } = await fromServer("src/session/password.ts");

const COUNT = Number(process.argv[2] || 1);
const PREFIX = process.argv[3] || "hunt409";
const OUT = process.argv[4] || "";
const PASSWORD = "Password1!";

const seedPlayer = async (email: string, username: string): Promise<string> => {
    const player = new Player();
    const playerId = crypto.randomUUID();
    player.setId(playerId);
    player.setUsername(username);
    player.setEmail(email);
    player.setIsActive(true);
    player.setPasswordHash(await hashPassword(PASSWORD));
    const doc = player.toObject() as Record<string, unknown>;
    doc._key = playerId;
    doc.inGameId = "";
    doc.matchMakingQueueId = "";
    doc.matchMakingQueueAddedTime = 0;
    doc.matchMakingCooldownTill = 0;
    doc.matchMakingNoAcceptPenaltyLevel = 0;
    await saveDocument(config.arangoDB.collectionNames.players, doc as never, DBSchemaV1["players"].rule);
    return playerId;
};

const ts = Date.now();
const accounts: { id: string; email: string; username: string }[] = [];
for (let i = 0; i < COUNT; i += 1) {
    const email = `${PREFIX}-${ts}-${i}@e2e.local`;
    const username = `${PREFIX}${ts % 1000000}x${i}`;
    const id = await seedPlayer(email, username);
    accounts.push({ id, email, username });
}
const payload = JSON.stringify({ password: PASSWORD, accounts }, null, 2);
if (OUT) await Bun.write(OUT, payload);
console.log(payload);
process.exit(0);
