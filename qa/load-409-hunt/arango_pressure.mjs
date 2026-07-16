// Targeted ArangoDB pressure: the result-write path's real dependency. Hammers the SAME database
// with transactional writes on a dedicated scratch collection (LoadTest409) so the games/players
// collections' engine (RocksDB) sees realistic lock/queue/IO contention WITHOUT touching game data.
// Usage: node arango_pressure.mjs <workers> <out.log>
const ARANGO = process.env.ARANGO_URL || "http://127.0.0.1:8529";
const DB = process.env.ARANGO_DB || "cryptopulse_hunt409";
const AUTH = "Basic " + Buffer.from("root:" + (process.env.ARANGO_PASSWORD || "ChangeMe")).toString("base64");
const WORKERS = Number(process.argv[2] || 4);
import fs from "node:fs";
const OUT = process.argv[3] || "/dev/null";
const log = (m) => fs.appendFileSync(OUT, `${new Date().toISOString()} ${m}\n`);

const req = async (method, path, body) => {
    const res = await fetch(`${ARANGO}/_db/${DB}${path}`, {
        method,
        headers: { "content-type": "application/json", authorization: AUTH },
        body: body ? JSON.stringify(body) : undefined,
    });
    return res;
};

// Ensure scratch collection exists.
await req("POST", "/_api/collection", { name: "LoadTest409" }).catch(() => {});

let ops = 0;
let errs = 0;
const worker = async (id) => {
    const payload = { blob: "x".repeat(2048), n: 0 };
    for (;;) {
        try {
            // Mixed transactional write batch: insert + update + query, mirroring the shape of
            // journal appends + result writes (multi-step stream transactions).
            const trxRes = await req("POST", "/_api/transaction/begin", {
                collections: { write: ["LoadTest409"] },
            });
            if (!trxRes.ok) {
                errs += 1;
                await new Promise((r) => setTimeout(r, 200));
                continue;
            }
            const trxId = (await trxRes.json()).result.id;
            const h = { "x-arango-trx-id": trxId };
            const ins = await fetch(`${ARANGO}/_db/${DB}/_api/document/LoadTest409`, {
                method: "POST",
                headers: { "content-type": "application/json", authorization: AUTH, ...h },
                body: JSON.stringify({ ...payload, w: id, t: Date.now() }),
            });
            const key = ins.ok ? (await ins.json())._key : null;
            if (key) {
                await fetch(`${ARANGO}/_db/${DB}/_api/document/LoadTest409/${key}`, {
                    method: "PATCH",
                    headers: { "content-type": "application/json", authorization: AUTH, ...h },
                    body: JSON.stringify({ n: 1 }),
                });
            }
            await fetch(`${ARANGO}/_db/${DB}/_api/transaction/${trxId}`, {
                method: "PUT",
                headers: { authorization: AUTH },
            });
            ops += 1;
        } catch {
            errs += 1;
            await new Promise((r) => setTimeout(r, 100));
        }
    }
};

setInterval(() => {
    log(`ops=${ops} errs=${errs}`);
    ops = 0;
    errs = 0;
}, 15000);
for (let i = 0; i < WORKERS; i += 1) void worker(i);
