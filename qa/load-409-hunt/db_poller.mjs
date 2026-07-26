// High-frequency (100ms) Arango watcher for the 409 desync window.
// Watches: (a) each test player's inGameId; (b) the game doc {status, finished} of any game a test
// player is/was in. Emits JSONL transitions with ms timestamps so the desync window
// (fight over -> inGameId released) is measurable independently of browser/server logs.
// Usage: node db_poller.mjs <accounts.json> <out.jsonl>
import fs from "node:fs";

const ARANGO = process.env.ARANGO_URL || "http://127.0.0.1:8529";
const DB = process.env.ARANGO_DB || "cryptopulse_hunt409";
const AUTH = "Basic " + Buffer.from("root:" + (process.env.ARANGO_PASSWORD || "ChangeMe")).toString("base64");
const POLL_MS = Number(process.env.POLL_MS || 100);

const { accounts } = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const OUT = process.argv[3];
const ids = accounts.map((a) => a.id);

const emit = (obj) => fs.appendFileSync(OUT, JSON.stringify({ t: new Date().toISOString(), ...obj }) + "\n");

const aql = async (query, bindVars) => {
    const res = await fetch(`${ARANGO}/_db/${DB}/_api/cursor`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: AUTH },
        body: JSON.stringify({ query, bindVars, batchSize: 1000 }),
    });
    if (!res.ok) throw new Error(`aql ${res.status}: ${await res.text()}`);
    return (await res.json()).result;
};

const playerState = new Map(); // id -> inGameId
const gameState = new Map(); // gameId -> `${status}:${finished}`
const watchedGames = new Set();

emit({ ev: "poller_start", ids, pollMs: POLL_MS });
let consecutiveErrors = 0;
for (;;) {
    const t0 = Date.now();
    try {
        const players = await aql(
            "FOR p IN PlayersTest1 FILTER p._key IN @ids RETURN {id: p._key, inGameId: p.inGameId}",
            { ids },
        );
        for (const p of players) {
            const prev = playerState.get(p.id);
            if (prev !== p.inGameId) {
                emit({ ev: "player_inGameId", id: p.id, from: prev ?? null, to: p.inGameId });
                playerState.set(p.id, p.inGameId);
                if (p.inGameId) watchedGames.add(p.inGameId);
            }
        }
        if (watchedGames.size) {
            const games = await aql(
                "FOR g IN GamesTest1 FILTER g._key IN @gids RETURN {id: g._key, status: g.status, finished: g.finished, turn: g.turn}",
                { gids: [...watchedGames] },
            );
            for (const g of games) {
                const key = `${g.status}:${g.finished}:${g.turn}`;
                const prev = gameState.get(g.id);
                if (prev !== key) {
                    emit({ ev: "game_state", id: g.id, from: prev ?? null, to: key });
                    gameState.set(g.id, key);
                    // Terminal + released: stop watching to keep the query small.
                    if (g.finished === true && ![...playerState.values()].includes(g.id)) {
                        watchedGames.delete(g.id);
                    }
                }
            }
        }
        consecutiveErrors = 0;
    } catch (e) {
        consecutiveErrors += 1;
        emit({ ev: "poll_error", err: String(e).slice(0, 200), consecutiveErrors });
        if (consecutiveErrors > 100) process.exit(1);
    }
    const dt = Date.now() - t0;
    await new Promise((r) => setTimeout(r, Math.max(10, POLL_MS - dt)));
}
