// Ghost load generator: keeps M never-connecting vs-AI matches alive on the isolated server.
// Each ghost account logs in (hand-encoded NewPlayer protobuf: email=2, password=3), then loops:
// try POST /v1/mm/vs-ai?difficulty=X -> 200 = new match started (server drives BOTH sides:
// pick daemon auto-picks, placement deadline auto-places, AI-takeover plays the human's turns);
// 409 = still in its previous match (expected steady state). These 409s are EXPECTED and logged
// separately — they never count as repro evidence (only the connected test tabs' clicks do).
// Usage: node ghosts.mjs <accounts.json> <server> <out.jsonl> [difficultyCsv]
import fs from "node:fs";

const { accounts, password } = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const SERVER = process.argv[3] || "http://127.0.0.1:3021";
const OUT = process.argv[4];
const DIFFS = (process.argv[5] || "normal,hard,brutal").split(",");
const LOOP_MS = Number(process.env.GHOST_LOOP_MS || 45000);

const emit = (obj) => fs.appendFileSync(OUT, JSON.stringify({ t: new Date().toISOString(), ...obj }) + "\n");

const pbString = (field, str) => {
    const bytes = new TextEncoder().encode(str);
    if (bytes.length > 127) throw new Error("varint>1 byte not needed here");
    return Uint8Array.from([(field << 3) | 2, bytes.length, ...bytes]);
};
const loginBody = (email) => {
    const e = pbString(2, email);
    const p = pbString(3, password);
    const out = new Uint8Array(e.length + p.length);
    out.set(e, 0);
    out.set(p, e.length);
    return out;
};
const headers = (token) => ({
    "Content-Type": "application/octet-stream",
    "x-request-id": crypto.randomUUID(),
    ...(token ? { Authorization: token } : {}),
});

const login = async (email) => {
    const res = await fetch(`${SERVER}/v1/auth/login`, { method: "POST", headers: headers(), body: loginBody(email) });
    if (!res.ok) throw new Error(`login ${email}: ${res.status}`);
    const token = res.headers.get("authorization");
    if (!token) throw new Error(`login ${email}: no auth header`);
    return token;
};

const ghosts = accounts.map((a, i) => ({ ...a, token: "", diff: DIFFS[i % DIFFS.length] }));
emit({ ev: "ghosts_start", count: ghosts.length, server: SERVER });

for (;;) {
    for (const g of ghosts) {
        try {
            if (!g.token) g.token = await login(g.email);
            const res = await fetch(`${SERVER}/v1/mm/vs-ai?difficulty=${g.diff}`, {
                method: "POST",
                headers: headers(g.token),
            });
            if (res.ok) {
                emit({ ev: "ghost_match_started", id: g.id, diff: g.diff });
            } else if (res.status === 409) {
                emit({ ev: "ghost_still_in_game", id: g.id });
            } else if (res.status === 401) {
                g.token = "";
                emit({ ev: "ghost_token_expired", id: g.id });
            } else {
                emit({ ev: "ghost_unexpected", id: g.id, status: res.status, body: (await res.text()).slice(0, 120) });
            }
            await res.arrayBuffer().catch(() => {});
        } catch (e) {
            emit({ ev: "ghost_error", id: g.id, err: String(e).slice(0, 160) });
        }
        await new Promise((r) => setTimeout(r, 400));
    }
    await new Promise((r) => setTimeout(r, LOOP_MS));
}
