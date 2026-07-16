// FAULT-INJECTION DEMO (explicitly NOT part of the load-repro protocol; run after the bound):
// simulates a delayed result-write release by re-pinning the player's inGameId to the finished
// game right as the end overlay appears, then drives the same-tab "Play Again vs AI" click.
// Expected per current client (e241fc0): 4x 409 over ~5-7s -> user-visible overlay error; a later
// manual re-click succeeds after the pin is lifted. This documents the exact user experience when
// tryWriteGameResult's release genuinely lags — the W5 scenario — without needing the
// hard-to-reach organic timing.
// Usage: node fault_inject_demo.mjs <link> <outdir> <playerId> <pinSeconds>
import fs from "node:fs";
import path from "node:path";
import { chromium } from "/Users/zolotukhin/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";

const LINK = process.argv[2];
const OUT = process.argv[3];
const PLAYER_ID = process.argv[4];
const PIN_SECONDS = Number(process.argv[5] || 20);
fs.mkdirSync(OUT, { recursive: true });
const ARANGO = "http://127.0.0.1:8529";
const DB = process.env.ARANGO_DB || "cryptopulse_hunt409";
const AUTH = "Basic " + Buffer.from("root:ChangeMe").toString("base64");

const log = (...a) => {
    const line = `${new Date().toISOString()} [inject] ${a.join(" ")}`;
    console.log(line);
    fs.appendFileSync(path.join(OUT, "inject.log"), line + "\n");
};
const aql = async (query, bindVars) => {
    const res = await fetch(`${ARANGO}/_db/${DB}/_api/cursor`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: AUTH },
        body: JSON.stringify({ query, bindVars }),
    });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()).result;
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("response", (res) => {
    if (res.request().url().includes("/v1/mm/vs-ai")) log(`vs-ai attempt -> ${res.status()}`);
});
const withTimeout = (p, ms, fb = null) => Promise.race([p, new Promise((r) => setTimeout(() => r(fb), ms))]);
const probe = () =>
    withTimeout(
        page
            .evaluate(() => {
                const xp = (s) =>
                    document.evaluate(`//div[contains(text(), "${s}")]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
                        .singleNodeValue;
                const el = xp("Play Again vs AI");
                const w = window;
                const body = document.body ? document.body.innerText : "";
                return {
                    hasSetAI: typeof w.__hocSetAI === "function",
                    playAgain: !!el && getComputedStyle(el).cursor === "pointer",
                    err: (body.match(/.{0,80}(already in game|Request failed with status code \d+|Unable to start).{0,20}/i) || [""])[0],
                    buttons: [...document.querySelectorAll("button")].map((b) => b.innerText.trim()).filter(Boolean).slice(0, 12),
                    ready: [...document.querySelectorAll("button")].some((b) => /Ready Placement/i.test(b.innerText || "")),
                };
            })
            .catch(() => null),
        4000,
    );
const clickDiv = (label) =>
    withTimeout(
        page
            .evaluate((s) => {
                const el = document.evaluate(`//div[contains(text(), "${s}")]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
                    .singleNodeValue;
                if (!el || getComputedStyle(el).cursor !== "pointer") return false;
                el.click();
                return true;
            }, label)
            .catch(() => false),
        4000,
        false,
    );
const clickBtn = (re) =>
    withTimeout(
        page
            .evaluate((src) => {
                const re2 = new RegExp(src, "i");
                const btn = [...document.querySelectorAll("button")].find((b) => !b.disabled && re2.test(b.innerText || ""));
                if (!btn) return false;
                btn.click();
                return true;
            }, re.source)
            .catch(() => false),
        4000,
        false,
    );
const clickCard = () =>
    withTimeout(
        page
            .evaluate(() => {
                const cards = [...document.querySelectorAll("div")].filter((d) => {
                    if (!d.querySelector("img")) return false;
                    const r = d.getBoundingClientRect();
                    if (r.width < 50 || r.width > 220 || r.height < 50 || r.height > 220 || r.top < 60) return false;
                    return getComputedStyle(d).cursor === "pointer";
                });
                if (!cards.length) return false;
                cards[0].click();
                return true;
            })
            .catch(() => false),
        4000,
        false,
    );

log("goto", LINK);
await page.goto(LINK, { waitUntil: "domcontentloaded", timeout: 60000 });

// Ride one match to the end overlay.
let aiOn = false;
const start = Date.now();
let finished = false;
while (Date.now() - start < 25 * 60 * 1000) {
    await page.waitForTimeout(aiOn ? 200 : 450);
    const st = await probe();
    if (!st) continue;
    if (st.playAgain) {
        finished = true;
        break;
    }
    if (st.hasSetAI && !aiOn) {
        await withTimeout(page.evaluate(() => window.__hocSetAI(true)).catch(() => {}), 4000);
        aiOn = true;
        log("fight up, autobattle on");
        continue;
    }
    if (!aiOn) {
        if (st.ready) await clickBtn(/^Ready Placement$/);
        else if (!(await clickBtn(/(choose|pick bundle|confirm|continue|select|pick)/))) await clickCard();
    }
}
if (!finished) {
    log("FAIL: never reached end overlay");
    process.exit(2);
}
const gameId = (page.url().match(/\/game\/([0-9a-f-]+)/i) || [])[1];
log("END OVERLAY LIVE for game", gameId);

// INJECT: re-pin inGameId to the finished game (simulated stuck release).
await aql(`UPDATE @id WITH { inGameId: @g } IN PlayersTest1`, { id: PLAYER_ID, g: gameId });
log(`INJECTED: inGameId re-pinned to ${gameId} for ${PIN_SECONDS}s`);
const unpinAt = Date.now() + PIN_SECONDS * 1000;

// Click Play Again NOW: expect the client's 4-attempt chain to exhaust into a visible error.
await clickDiv("Play Again vs AI");
log("clicked Play Again (pin active)");
let sawError = "";
while (Date.now() < unpinAt + 40000) {
    await page.waitForTimeout(300);
    if (Date.now() >= unpinAt) {
        // Lift the pin exactly once.
        const p = (await aql(`RETURN DOCUMENT(PlayersTest1, @id).inGameId`, { id: PLAYER_ID }))[0];
        if (p === gameId) {
            await aql(`UPDATE @id WITH { inGameId: "" } IN PlayersTest1`, { id: PLAYER_ID });
            log("PIN LIFTED (inGameId cleared)");
        }
    }
    const st = await probe();
    if (!st) continue;
    if (st.err && !sawError) {
        sawError = st.err.trim();
        log(`USER-VISIBLE ERROR: "${sawError}"`);
        await page.screenshot({ path: path.join(OUT, "inject_error.png") }).catch(() => {});
    }
    const gid = (page.url().match(/\/game\/([0-9a-f-]+)/i) || [])[1];
    if (gid && gid !== gameId) {
        log(`RECOVERED: navigated to new game ${gid} (after re-click or in-chain retry)`);
        await page.screenshot({ path: path.join(OUT, "inject_recovered.png") }).catch(() => {});
        break;
    }
    // Simulate the user re-clicking after seeing the error.
    if (sawError && st.playAgain) {
        await clickDiv("Play Again vs AI");
        log("re-clicked Play Again");
        await page.waitForTimeout(3000);
    }
}
log("DEMO DONE", JSON.stringify({ sawError }));
await browser.close();
