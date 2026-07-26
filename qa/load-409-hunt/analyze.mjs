// Join per-cycle browser records + DB watcher + server log into desync-window measurements.
// Usage: node analyze.mjs <serverLog> <dbWatchJsonl> <cyclesJsonl...>
import fs from "node:fs";

const [serverLogPath, dbWatchPath, ...cycleFiles] = process.argv.slice(2);

// --- server log: gameId -> fight_finished wall time ---------------------------------------------
const finishByGame = new Map();
const noopByGame = new Map();
const failByGame = new Map();
for (const line of fs.readFileSync(serverLogPath, "utf8").split("\n")) {
    let m = line.match(/^(\S+) \[PLAY-LIFECYCLE\] game ([0-9a-f-]+): fight_finished/);
    if (m && !finishByGame.has(m[2])) finishByGame.set(m[2], Date.parse(m[1]));
    m = line.match(/^(\S+) .*\[FIGHT-RESULT\] game ([0-9a-f-]+): result write was a no-op/);
    if (m) noopByGame.set(m[2], Date.parse(m[1]));
    m = line.match(/^(\S+) Failed to write game result for ([0-9a-f-]+)/);
    if (m) failByGame.set(m[2], (failByGame.get(m[2]) || []).concat(Date.parse(m[1])));
}

// --- db watch: game finished + player release times ----------------------------------------------
const dbFinishedByGame = new Map();
const releaseByGame = new Map(); // gameId -> t when some player's inGameId left this game
for (const line of fs.readFileSync(dbWatchPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const e = JSON.parse(line);
    if (e.ev === "game_state" && /:true:/.test(e.to) && !dbFinishedByGame.has(e.id)) {
        dbFinishedByGame.set(e.id, Date.parse(e.t));
    }
    if (e.ev === "player_inGameId" && e.from && !releaseByGame.has(e.from)) {
        releaseByGame.set(e.from, Date.parse(e.t));
    }
}

const fmt = (ms) => (ms == null || Number.isNaN(ms) ? "n/a" : (ms / 1000).toFixed(2) + "s");
const rows = [];
for (const f of cycleFiles) {
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const c = JSON.parse(line);
        const g = c.gameId;
        const tFinishSrv = finishByGame.get(g);
        const tDbFin = dbFinishedByGame.get(g);
        const tRelease = releaseByGame.get(g);
        const tBtn = c.tButtonSeen ? Date.parse(c.tButtonSeen) : null;
        const tClick = c.tFirstClick ? Date.parse(c.tFirstClick) : null;
        const tNav = c.tNav ? Date.parse(c.tNav) : null;
        rows.push({
            tag: c.tag,
            cycle: c.cycle,
            game: g.slice(0, 8),
            writeWindow: tFinishSrv && tDbFin ? tDbFin - tFinishSrv : null, // fight_finished -> doc finished
            releaseWindow: tFinishSrv && tRelease ? tRelease - tFinishSrv : null, // -> inGameId released
            overlayLead: tFinishSrv && tBtn ? tBtn - tFinishSrv : null, // overlay vs server finish
            clickAfterBtn: tBtn && tClick ? tClick - tBtn : null,
            clickToNav: tClick && tNav ? tNav - tClick : null,
            attempts: (c.attempts || []).map((a) => a.status).join(","),
            // Race-relevant 409s only: attempts fired AT/AFTER the overlay button was seen. Entry-path
            // 409s (driver joining an account already in a game) are a harness artifact, not the race.
            n409: (c.attempts || []).filter((a) => a.status === 409 && tBtn && Date.parse(a.t) >= tBtn - 1000).length,
            reproR1: c.reproR1 || false,
            errors: (c.errorTexts || []).join(" | "),
            noop: noopByGame.has(g),
            writeFails: (failByGame.get(g) || []).length,
            notes: (c.notes || []).join(","),
        });
    }
}
rows.sort((a, b) => a.tag.localeCompare(b.tag) || a.cycle - b.cycle);
console.log(
    "tag cyc game     writeWin relWin  ovLead  clickΔ  clk→nav attempts(409s) R1 noop fails notes",
);
for (const r of rows) {
    console.log(
        `${r.tag} ${String(r.cycle).padStart(3)} ${r.game} ${fmt(r.writeWindow).padStart(8)} ${fmt(r.releaseWindow).padStart(7)} ${fmt(r.overlayLead).padStart(7)} ${fmt(r.clickAfterBtn).padStart(7)} ${fmt(r.clickToNav).padStart(7)} ${(r.attempts || "-").padEnd(14)} ${r.reproR1 ? "R1!" : " . "} ${r.noop ? "NOOP" : "  . "} ${r.writeFails} ${r.notes}${r.errors ? " ERR:" + r.errors : ""}`,
    );
}
const with409 = rows.filter((r) => r.n409 > 0).length;
const repro = rows.filter((r) => r.reproR1 || /R3/.test(r.notes)).length;
// SHARP cycles: the click landed within 60s of the server-side finish (a live-overlay click that
// genuinely raced the release). Cold clicks (after reload recovery) still complete a Play Again
// cycle but exercise the race weakly — report both.
const sharp = rows.filter(
    (r) => r.overlayLead != null && r.clickAfterBtn != null && r.overlayLead + r.clickAfterBtn < 60000,
).length;
const windows = rows.map((r) => r.releaseWindow).filter((x) => x != null);
windows.sort((a, b) => a - b);
const pct = (p) => (windows.length ? fmt(windows[Math.min(windows.length - 1, Math.floor((p / 100) * windows.length))]) : "n/a");
console.log(
    `\ncycles=${rows.length} sharp=${sharp} raceHits(>=1x409)=${with409} REPRO=${repro} releaseWindow p50=${pct(50)} p90=${pct(90)} max=${windows.length ? fmt(windows[windows.length - 1]) : "n/a"}`,
);
