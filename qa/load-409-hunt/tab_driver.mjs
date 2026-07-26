// Same-tab "Play Again vs AI" race driver.
// Rides full vs-AI matches (active pick clicking -> Ready Placement -> __hocSetAI autobattle fight),
// then clicks "Play Again vs AI" the INSTANT the end overlay's button renders (120ms poll), records
// every POST /v1/mm/vs-ai attempt (status+latency; the client itself retries 4x with backoff), any
// user-visible failure (overlay error text = retry chain exhausted = REPRO R1), and the navigation
// to the next game. Wedge-recovers with page.reload() (the known Pixi-teardown issue) — a reload
// never masks the race: the click/attempt evidence is already recorded by then.
//
// Usage: node tab_driver.mjs <link> <outdir> <cycles> <tag>
import fs from "node:fs";
import path from "node:path";
import { chromium } from "/Users/zolotukhin/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";

const LINK = process.argv[2];
const OUT = process.argv[3];
const CYCLES = Number(process.argv[4] || 10);
const TAG = process.argv[5] || "tab";
fs.mkdirSync(OUT, { recursive: true });

const LOG = path.join(OUT, `${TAG}.log`);
const CYCLES_JSONL = path.join(OUT, `${TAG}.cycles.jsonl`);
const log = (...a) => {
    const line = `${new Date().toISOString()} [${TAG}] ${a.join(" ")}`;
    console.log(line);
    fs.appendFileSync(LOG, line + "\n");
};
const record = (obj) => fs.appendFileSync(CYCLES_JSONL, JSON.stringify(obj) + "\n");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// --- network capture: every vs-ai creation attempt ---------------------------------------------
let vsAiEvents = []; // {t, status, ms}
const pendingReq = new Map();
const attach = (p) => {
    p.on("request", (req) => {
        if (req.url().includes("/v1/mm/vs-ai")) pendingReq.set(req, Date.now());
    });
    p.on("response", async (res) => {
        const req = res.request();
        if (!req.url().includes("/v1/mm/vs-ai")) return;
        const started = pendingReq.get(req) ?? Date.now();
        pendingReq.delete(req);
        const ev = { t: new Date(started).toISOString(), status: res.status(), ms: Date.now() - started };
        vsAiEvents.push(ev);
        log(`vs-ai attempt -> ${ev.status} (${ev.ms}ms)`);
    });
    p.on("requestfailed", (req) => {
        if (!req.url().includes("/v1/mm/vs-ai")) return;
        const started = pendingReq.get(req) ?? Date.now();
        pendingReq.delete(req);
        vsAiEvents.push({ t: new Date(started).toISOString(), status: -1, ms: Date.now() - started, err: req.failure()?.errorText });
        log(`vs-ai attempt FAILED ${req.failure()?.errorText}`);
    });
    p.on("console", (m) => {
        const t = m.text();
        if (/409|already in game|Failed to write|error/i.test(t)) {
            fs.appendFileSync(path.join(OUT, `${TAG}.console.log`), `${new Date().toISOString()} ${t.slice(0, 400)}\n`);
        }
    });
    p.on("pageerror", (e) => fs.appendFileSync(path.join(OUT, `${TAG}.console.log`), `${new Date().toISOString()} PAGEERROR ${e.message}\n`));
};
let page = await ctx.newPage();
attach(page);

// A wedged Pixi teardown can hard-lock the renderer: page.evaluate then never settles. EVERY
// page-side call must therefore be raced against a timeout, and repeated timeouts trigger a hard
// recovery (reload; if the renderer is truly dead, a brand-new page in the same context — the auth
// token lives in context localStorage — pointed back at the same URL).
const withTimeout = (p, ms, fallback = null) =>
    Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);
let probeTimeouts = 0;
const hardRecover = async (why) => {
    log(`HARD RECOVER (${why})`);
    const url = page.url();
    const reloaded = await withTimeout(
        page.reload({ waitUntil: "domcontentloaded", timeout: 15000 }).then(() => true).catch(() => false),
        20000,
        false,
    );
    const alive = reloaded && (await withTimeout(page.evaluate(() => 1).catch(() => null), 4000)) === 1;
    if (!alive) {
        log("HARD RECOVER: reload insufficient — replacing the page");
        await withTimeout(page.close().catch(() => {}), 5000);
        page = await ctx.newPage();
        attach(page);
        await page
            .goto(url.includes("/game/") ? url : LINK, { waitUntil: "domcontentloaded", timeout: 60000 })
            .catch((e) => log("HARD RECOVER goto failed:", e.message));
    }
    probeTimeouts = 0;
};

const shot = async (name) => withTimeout(page.screenshot({ path: path.join(OUT, `${TAG}_${name}.png`) }).catch(() => {}), 8000);
const gameIdFromUrl = () => (page.url().match(/\/game\/([0-9a-f-]+)/i) || [])[1] || "";

// One DOM probe per poll: classify the phase + grab the essentials, cheaply.
// Raced against a timeout; repeated timeouts = wedged renderer -> hard recovery.
const probe = async () => {
    const res = await withTimeout(rawProbe(), 8000, "TIMEOUT");
    if (res === "TIMEOUT") {
        probeTimeouts += 1;
        if (probeTimeouts >= 5) await hardRecover(`${probeTimeouts} consecutive probe timeouts`);
        return null;
    }
    probeTimeouts = 0;
    return res;
};
const rawProbe = () =>
    page
        .evaluate(() => {
            const w = window;
            const vs = typeof w.__hocVisibleState === "function" ? w.__hocVisibleState() : null;
            // NOTE: offsetParent is null inside position:fixed overlays (the end screen!) — use
            // rect+computed style for visibility instead.
            const visible = (el) => {
                const r = el.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) return false;
                const cs = getComputedStyle(el);
                return cs.display !== "none" && cs.visibility !== "hidden";
            };
            const buttons = [...document.querySelectorAll("button")]
                .filter((b) => !b.disabled && visible(b))
                .map((b) => (b.innerText || "").trim())
                .filter(Boolean);
            // The end-overlay actions are text-only DIVs (FightFinishedOverlay ActionButton = Box),
            // NOT <button>s — find them via text-node XPath + cursor:pointer.
            const xp = (s) =>
                document.evaluate(
                    `//div[contains(text(), "${s}")]`,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null,
                ).singleNodeValue;
            const playAgainEl = xp("Play Again vs AI");
            const playAgainBtn = !!playAgainEl && getComputedStyle(playAgainEl).cursor === "pointer";
            const startingEl = xp("Starting");
            const bodyText = document.body ? document.body.innerText : "";
            return {
                url: location.href,
                hasSetAI: typeof w.__hocSetAI === "function",
                hasFinished: vs ? !!vs.hasFinished : null,
                vsDump: vs ? JSON.stringify(vs) : "",
                playAgainVisible: playAgainBtn,
                starting: !!startingEl,
                errorText: /already in game|Unable to start an AI match|response was incomplete|Request failed with status code/i.test(
                    bodyText,
                )
                    ? (bodyText.match(
                          /.{0,60}(already in game|Unable to start an AI match|response was incomplete|Request failed with status code \d+).{0,20}/i,
                      ) || [""])[0]
                    : "",
                readyPlacement: buttons.find((t) => /^Ready Placement$/i.test(t)) || "",
                buttons: buttons.slice(0, 30),
                pickish: /doctrine|bundle|Ban phase|Artifact|Pick /i.test(bodyText),
            };
        })
        .catch(() => null);

// Click a visible enabled button whose text matches; returns clicked text or "".
const clickButton = (re) =>
    withTimeout(rawClickButton(re), 5000, "");
const rawClickButton = (re) =>
    page
        .evaluate((reSrc) => {
            const re2 = new RegExp(reSrc, "i");
            const bad = /back to lobby|exit|surrender|abandon|logout|replay|close/i;
            const visible = (el) => {
                const r = el.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) return false;
                const cs = getComputedStyle(el);
                return cs.display !== "none" && cs.visibility !== "hidden";
            };
            const btn = [...document.querySelectorAll("button")].find(
                (b) => !b.disabled && visible(b) && re2.test(b.innerText || "") && !bad.test(b.innerText || ""),
            );
            if (!btn) return "";
            const t = (btn.innerText || "").trim();
            btn.click();
            return t;
        }, re.source)
        .catch(() => "");

const PICK_WORDS = /(choose|pick bundle|confirm|continue|select|pick)/i;

// Click an end-overlay action (text-only DIV with cursor:pointer). Returns true if clicked.
const clickOverlayAction = (label) => withTimeout(rawClickOverlayAction(label), 5000, false);
const rawClickOverlayAction = (label) =>
    page
        .evaluate((s) => {
            const el = document.evaluate(
                `//div[contains(text(), "${s}")]`,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null,
            ).singleNodeValue;
            if (!el || getComputedStyle(el).cursor !== "pointer") return false;
            el.click();
            return true;
        }, label)
        .catch(() => false);

// Creature/artifact picks are cursor-pointer <div> cards holding an <img> (PickAndBan/index.tsx),
// not buttons. Click the first selectable-looking card. Returns true if one was clicked.
const clickPickCard = () => withTimeout(rawClickPickCard(), 5000, false);
const rawClickPickCard = () =>
    page
        .evaluate(() => {
            const cards = [...document.querySelectorAll("div")].filter((d) => {
                if (!d.querySelector("img")) return false;
                const r = d.getBoundingClientRect();
                if (r.width < 50 || r.width > 220 || r.height < 50 || r.height > 220) return false;
                if (r.top < 60) return false; // skip header/nav
                const cs = getComputedStyle(d);
                if (cs.display === "none" || cs.visibility === "hidden") return false;
                return cs.cursor === "pointer";
            });
            if (!cards.length) return false;
            cards[0].click();
            return true;
        })
        .catch(() => false);

// Drop stale dev hooks from the previous scene so hook presence means "NEW scene booted".
const dropHooks = () => withTimeout(rawDropHooks(), 4000);
const rawDropHooks = () => page.evaluate(() => {
    try {
        delete window.__hocSetAI;
        delete window.__hocVisibleState;
    } catch (e) { /* ignore */ }
}).catch(() => {});

log("goto", LINK);
await page.goto(LINK, { waitUntil: "domcontentloaded", timeout: 60000 });

let totalRepro = 0;
for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
    const cyc = {
        tag: TAG,
        cycle,
        gameId: "",
        tFightSceneUp: "",
        tFinishSeen: "",
        tButtonSeen: "",
        tFirstClick: "",
        tNav: "",
        nextGameId: "",
        attempts: [],
        reproR1: false,
        errorTexts: [],
        clickRounds: 0,
        wedgeReloads: 0,
        notes: [],
    };
    vsAiEvents = [];
    let aiOn = false;
    let readyClicked = false;
    let lastActionAt = Date.now();
    let lastProgressAt = Date.now();
    const cycleStart = Date.now();
    const CYCLE_CAP_MS = 30 * 60 * 1000;

    // ---- phase A: ride the match to the end overlay -------------------------------------------
    let ended = false;
    while (Date.now() - cycleStart < CYCLE_CAP_MS) {
        const inFight = aiOn; // fight scene reached
        await page.waitForTimeout(inFight ? 120 : 400);
        const st = await probe();
        if (!st) continue;
        if (!cyc.gameId) {
            const gid = gameIdFromUrl();
            if (gid) {
                cyc.gameId = gid;
                log(`cycle ${cycle}: game ${gid}`);
            }
        }

        // End overlay: the ONLY hot path — click the instant the button is up.
        if (st.playAgainVisible) {
            if (!cyc.tButtonSeen) {
                cyc.tButtonSeen = new Date().toISOString();
                if (!cyc.tFinishSeen) cyc.tFinishSeen = cyc.tButtonSeen;
                log(`cycle ${cycle}: END OVERLAY BUTTON VISIBLE`);
            }
            ended = true;
            break;
        }
        if (st.hasFinished && !cyc.tFinishSeen) {
            cyc.tFinishSeen = new Date().toISOString();
            log(`cycle ${cycle}: hasFinished=true (overlay imminent) vs=${st.vsDump}`);
        }
        // Diagnostic + keep-moving: engine says finished but no Play Again button.
        if (cyc.tFinishSeen && !st.playAgainVisible) {
            const sinceFin = Date.now() - Date.parse(cyc.tFinishSeen);
            if (sinceFin > 20000 && !cyc.notes.includes("overlay_missing_dumped")) {
                cyc.notes.push("overlay_missing_dumped");
                log(`cycle ${cycle}: OVERLAY MISSING 20s after hasFinished. vs=${st.vsDump} buttons=${st.buttons.join("|")}`);
                await shot(`c${cycle}_overlay_missing`);
            }
            if (sinceFin > 40000) {
                cyc.notes.push("overlay_missing_reload");
                cyc.wedgeReloads += 1;
                log(`cycle ${cycle}: overlay still missing 40s after hasFinished -> reload (cold-load path)`);
                await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
                cyc.tFinishSeen = new Date().toISOString(); // re-arm the 20/40s clocks post-reload
            }
        }

        // A recovery may have landed us back on a pre-fight screen with a stale aiOn.
        if (aiOn && !st.hasSetAI && (st.pickish || st.readyPlacement)) {
            log(`cycle ${cycle}: scene gone (recovery?) — clearing aiOn`);
            aiOn = false;
        }
        if (st.hasSetAI && !aiOn) {
            await withTimeout(page.evaluate(() => window.__hocSetAI(true)).catch(() => {}), 4000);
            aiOn = true;
            cyc.tFightSceneUp = new Date().toISOString();
            log(`cycle ${cycle}: fight scene up -> __hocSetAI(true)`);
            lastProgressAt = Date.now();
            continue;
        }
        if (aiOn && Date.now() - lastActionAt > 30000) {
            // Re-assert (a reload or scene swap can drop it).
            await withTimeout(page.evaluate(() => window.__hocSetAI && window.__hocSetAI(true)).catch(() => {}), 4000);
            lastActionAt = Date.now();
        }

        if (!aiOn) {
            // Bounced back to the lobby/matchmaking screen (failed auto-start after a rate-limit or
            // restart blip): press the real "Play vs AI" button.
            if (st.buttons.some((b) => /^⚔?\s*Play vs AI$/i.test(b))) {
                const t = await clickButton(/^⚔?\s*Play vs AI$/);
                if (t) {
                    log(`cycle ${cycle}: clicked "${t}" (lobby re-entry)`);
                    lastProgressAt = Date.now();
                    continue;
                }
            }
            // Pre-fight phases: augments modal / placement / pick.
            if (st.readyPlacement && !readyClicked) {
                const t = await clickButton(/^Ready Placement$/);
                if (t) {
                    readyClicked = true;
                    log(`cycle ${cycle}: clicked Ready Placement`);
                    lastProgressAt = Date.now();
                }
            } else if (st.pickish || st.buttons.some((b) => PICK_WORDS.test(b))) {
                const t = await clickButton(PICK_WORDS);
                if (t) {
                    log(`cycle ${cycle}: pick-click "${t.slice(0, 40)}"`);
                    lastProgressAt = Date.now();
                } else if (await clickPickCard()) {
                    log(`cycle ${cycle}: pick-card click`);
                    lastProgressAt = Date.now();
                }
            }
            // Wedge/stall recovery pre-fight: nothing actionable for 90s -> reload. If we've been
            // bounced to the login screen (rate-limit/restart aftershock), go back through the
            // auto-login deep link instead — reloading a param-less URL can never re-auth.
            if (Date.now() - lastProgressAt > 90000) {
                const unauthed = st.buttons.some((b) => /^Sign In$/i.test(b));
                log(
                    `cycle ${cycle}: no pre-fight progress for 90s -> ${unauthed ? "goto LINK (unauthed)" : "reload"} ` +
                        `(buttons: ${st.buttons.join("|").slice(0, 120)})`,
                );
                await shot(`c${cycle}_prefight_stall`);
                cyc.wedgeReloads += 1;
                lastProgressAt = Date.now();
                if (unauthed) {
                    await page.goto(LINK, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
                } else {
                    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
                }
            }
        } else if (Date.now() - lastProgressAt > 8 * 60 * 1000) {
            // In-fight watchdog: autobattle should finish well within this; reload once.
            log(`cycle ${cycle}: fight watchdog -> reload`);
            await shot(`c${cycle}_fight_stall`);
            cyc.wedgeReloads += 1;
            aiOn = false;
            lastProgressAt = Date.now();
            await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
        }
    }
    if (!ended) {
        cyc.notes.push("cycle_timeout_before_end_overlay");
        record(cyc);
        log(`cycle ${cycle}: TIMEOUT before end overlay — reloading and continuing`);
        await shot(`c${cycle}_timeout`);
        await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
        continue;
    }

    // ---- phase B: the race — click Play Again NOW and watch the outcome ------------------------
    const prevGameId = cyc.gameId;
    let navigated = false;
    const raceStart = Date.now();
    const RACE_CAP_MS = 5 * 60 * 1000; // R3 territory beyond this
    while (Date.now() - raceStart < RACE_CAP_MS && !navigated) {
        const clicked = await clickOverlayAction("Play Again vs AI");
        if (clicked) {
            cyc.clickRounds += 1;
            if (!cyc.tFirstClick) {
                cyc.tFirstClick = new Date().toISOString();
                log(`cycle ${cycle}: CLICKED Play Again (round 1)`);
            } else {
                log(`cycle ${cycle}: re-clicked Play Again (round ${cyc.clickRounds})`);
            }
        }
        // Watch for outcome up to 40s per click round (client chain runs ~5-7s; leave margin).
        const roundStart = Date.now();
        while (Date.now() - roundStart < 40000) {
            await page.waitForTimeout(120);
            const gid = gameIdFromUrl();
            if (gid && gid !== prevGameId) {
                navigated = true;
                cyc.tNav = new Date().toISOString();
                cyc.nextGameId = gid;
                break;
            }
            const st = await probe();
            if (!st) continue;
            if (st.errorText && !cyc.errorTexts.includes(st.errorText)) {
                cyc.errorTexts.push(st.errorText);
                cyc.reproR1 = true;
                totalRepro += 1;
                log(`cycle ${cycle}: *** REPRO R1 — user-visible failure: "${st.errorText.trim()}" ***`);
                await shot(`c${cycle}_REPRO_R1`);
                // Real-user behavior: click again (new chain) after a beat.
                await page.waitForTimeout(2500);
                break;
            }
            if (!st.starting && !st.playAgainVisible && Date.now() - roundStart > 15000) {
                // Neither busy nor button — maybe scene swapped without URL change yet; keep waiting.
            }
        }
    }
    cyc.attempts = vsAiEvents;
    if (!navigated) {
        cyc.notes.push("R3_no_navigation_within_5min");
        log(`cycle ${cycle}: *** R3 — never navigated within 5min (stuck) ***`);
        await shot(`c${cycle}_R3_stuck`);
        record(cyc);
        // Try to salvage the run: hard reload to lobby and re-enter.
        await page.goto(LINK, { waitUntil: "domcontentloaded" }).catch(() => {});
        continue;
    }
    log(
        `cycle ${cycle}: navigated ${prevGameId.slice(0, 8)} -> ${cyc.nextGameId.slice(0, 8)}; ` +
            `attempts=${JSON.stringify(cyc.attempts.map((a) => a.status))} clicks=${cyc.clickRounds} reproR1=${cyc.reproR1}`,
    );
    record(cyc);

    // ---- phase C: make sure the NEW game's scene boots (wedge recovery) ------------------------
    await dropHooks();
    let booted = false;
    const bootStart = Date.now();
    while (Date.now() - bootStart < 120000) {
        await page.waitForTimeout(1500);
        const st = await probe();
        if (!st) continue;
        if (st.hasSetAI || st.pickish || st.readyPlacement || st.buttons.some((b) => PICK_WORDS.test(b))) {
            booted = true;
            break;
        }
        if (Date.now() - bootStart > 45000) {
            log(`cycle ${cycle}: new scene not booted after 45s -> reload (wedge recovery)`);
            await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
            await page.waitForTimeout(3000);
        }
    }
    if (!booted) log(`cycle ${cycle}: WARN new game never booted; next cycle will try to recover`);
}

log(`DONE — ${CYCLES} cycles, reproR1 count=${totalRepro}`);
await browser.close();
process.exit(0);
