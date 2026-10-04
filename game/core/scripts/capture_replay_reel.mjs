#!/usr/bin/env bun
/**
 * Record a Heroes of Crypto replay and finish it as a 1080x1920 reel.
 *
 * The ranked board does not restretch to fill a phone window. It stays bottom-aligned
 * and leaves a black band above it (see boardFitVerticalShift). This script records
 * the live page at 1080x1920, waits until the results card appears, then builds an
 * upload-ready mp4: the fight sped to fit a short, the board lifted over a blurred
 * copy of itself, and a hook burned in. The hook is one line from Qwen3.8 27B
 * running on the RDNA node. src/scripts/reel_hook.ts in the private
 * heroes-of-crypto-server repo asks that server over SSH. It does not start
 * ZINC on this machine. The facts underneath the hook are scraped from the
 * results card, and the model is told not to invent anything else.
 *
 * Sign in once. The replay API is not public, and the Chrome profile stays outside
 * the repo, under ~/Library/Caches/heroes-replay-reel.
 *
 *   bun game/core/scripts/capture_replay_reel.mjs --login
 *   bun game/core/scripts/capture_replay_reel.mjs --latest
 *   bun game/core/scripts/capture_replay_reel.mjs --url 'https://test.heroesofcrypto.io/game/<id>/replay?team=1'
 *   bun game/core/scripts/capture_replay_reel.mjs --self-test
 *
 * PLAYWRIGHT_LOC can point at a playwright package if it is not installed here.
 * HOC_SERVER_ROOT points at the heroes server checkout. ZINC_HOOK_TOOL overrides
 * the hook script. ZINC_MODEL_ID overrides the model id sent to ZINC.
 * --no-zinc keeps the factual hook.
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, copyFile, access, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WIDTH = 1080;
const HEIGHT = 1920;
const BATTLEFIELD_HEIGHT_RATIO = (1013 / 1342) * 1.03;
const CACHE_ROOT = path.join(os.homedir(), "Library", "Caches", "heroes-replay-reel");
const DEFAULT_ORIGIN = "https://test.heroesofcrypto.io";

const usage = `Usage: bun game/core/scripts/capture_replay_reel.mjs [options]

  --login              Open Chrome so you can sign in. The session is reused later.
  --latest             Open /portal and record the first replay that is available.
  --url <url>          Record this replay URL. Wins over --latest.
  --origin <url>       Site origin for --latest and --login. Default: ${DEFAULT_ORIGIN}
  --max-seconds <n>    Fit the fight into about this many seconds (default 36, max speed 5x).
  --hold <seconds>     How long to keep the results card (default 3.2).
  --timeout <seconds>  Give up if the replay never finishes (default 720).
  --headed             Show the browser while recording.
  --no-zinc            Do not ask Qwen for a hook. Use the names and the result only.
  --hook <text>        Use this hook instead of the model.
  --out <dir>          Where to write the mp4. Default: ${CACHE_ROOT}/out
  --self-test          Build a fake board frame and check the ffmpeg finish step.
`;

class Stop extends Error {
    constructor(message, code = 1) {
        super(message);
        this.code = code;
    }
}

function die(message, code = 1) {
    throw new Stop(message, code);
}

function parseArgs(argv) {
    const opts = {
        login: false,
        latest: false,
        url: "",
        origin: DEFAULT_ORIGIN,
        maxSeconds: 36,
        hold: 3.2,
        timeout: 720,
        headed: false,
        zinc: true,
        hook: "",
        out: path.join(CACHE_ROOT, "out"),
        selfTest: false,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => {
            const value = argv[i + 1];
            if (!value || value.startsWith("--")) die(`Missing value for ${arg}`);
            i += 1;
            return value;
        };
        if (arg === "--help" || arg === "-h") {
            console.log(usage);
            process.exit(0);
        } else if (arg === "--login") opts.login = true;
        else if (arg === "--latest") opts.latest = true;
        else if (arg === "--url") opts.url = next();
        else if (arg === "--origin") opts.origin = next().replace(/\/$/, "");
        else if (arg === "--max-seconds") opts.maxSeconds = Number(next());
        else if (arg === "--hold") opts.hold = Number(next());
        else if (arg === "--timeout") opts.timeout = Number(next());
        else if (arg === "--headed") opts.headed = true;
        else if (arg === "--no-zinc") opts.zinc = false;
        else if (arg === "--hook") opts.hook = next();
        else if (arg === "--out") opts.out = path.resolve(next());
        else if (arg === "--self-test") opts.selfTest = true;
        else if (arg.startsWith("http://") || arg.startsWith("https://")) opts.url = arg;
        else die(`Unknown argument: ${arg}\n\n${usage}`);
    }
    if (!opts.login && !opts.selfTest && !opts.url && !opts.latest) opts.latest = true;
    if (!Number.isFinite(opts.maxSeconds) || opts.maxSeconds < 8) die("--max-seconds must be at least 8");
    if (!Number.isFinite(opts.hold) || opts.hold < 0 || opts.hold > 12) die("--hold must be between 0 and 12");
    if (!Number.isFinite(opts.timeout) || opts.timeout < 15) die("--timeout must be at least 15 seconds");
    return opts;
}

function loadPlaywright() {
    const require = createRequire(import.meta.url);
    const tries = [
        process.env.PLAYWRIGHT_LOC,
        "playwright",
        path.join(os.homedir(), "muse-main", "site", "node_modules", "playwright"),
        path.join(os.homedir(), ".openclaw", "workspace", "node_modules", "playwright"),
    ].filter(Boolean);
    for (const candidate of tries) {
        try {
            return require(candidate);
        } catch {
            // try the next place a local playwright install is likely to live
        }
    }
    die(
        "Playwright is not installed. Set PLAYWRIGHT_LOC to a playwright package, or run:\n  npx -p playwright node game/core/scripts/capture_replay_reel.mjs ...",
    );
}

function run(command, args, { timeoutMs = 120000 } = {}) {
    return new Promise((resolve) => {
        const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
            child.kill("SIGKILL");
        }, timeoutMs);
        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({ code: code ?? 1, stdout, stderr });
        });
        child.on("error", (error) => {
            clearTimeout(timer);
            resolve({ code: 1, stdout, stderr: `${stderr}\n${error.message}` });
        });
    });
}

async function exists(file) {
    try {
        await access(file);
        return true;
    } catch {
        return false;
    }
}

function formulaBoardRect(width, height) {
    const legacy = Math.max(0, Math.min(width, height));
    const sidebar = Math.max(0, Math.round(((width - legacy) / 2) * 0.85));
    const boardW = Math.max(1, width - 2 * sidebar);
    const boardH = Math.max(1, legacy * BATTLEFIELD_HEIGHT_RATIO);
    const w = Math.round(boardW / 2) * 2;
    const h = Math.round(boardH / 2) * 2;
    const x = Math.max(0, Math.round((width - w) / 2));
    const y = Math.max(0, Math.round(height - h));
    return { x, y, w: Math.min(w, width - x), h: Math.min(h, height - y) };
}

async function detectBoardRect(pngPath) {
    const fallback = formulaBoardRect(WIDTH, HEIGHT);
    const probed = await run(
        "ffmpeg",
        ["-hide_banner", "-i", pngPath, "-vf", "cropdetect=18:2:0", "-f", "null", "-"],
        { timeoutMs: 20000 },
    );
    const matches = [...probed.stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
    const last = matches.at(-1);
    if (!last) return fallback;
    const rect = {
        w: Number(last[1]),
        h: Number(last[2]),
        x: Number(last[3]),
        y: Number(last[4]),
    };
    const closeToFormula = Math.abs(rect.h - fallback.h) < fallback.h * 0.2 && rect.w > WIDTH * 0.7;
    const notTheWholeFrame = rect.h < HEIGHT * 0.92 && rect.y > 40;
    if (!closeToFormula || !notTheWholeFrame) return fallback;
    rect.w -= rect.w % 2;
    rect.h -= rect.h % 2;
    return rect;
}

async function resolveFont(workDir) {
    const candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        path.join(SCRIPT_DIR, "../public/fonts/hoc-forge/HoCForge-Regular.ttf"),
    ];
    for (const candidate of candidates) {
        if (await exists(candidate)) {
            const dest = path.join(workDir, "reel-font.ttf");
            await copyFile(candidate, dest);
            return dest;
        }
    }
    die("No caption font found. Install Arial or keep HoCForge-Regular.ttf in the client.");
}

function fightSpeed(fightSeconds, maxSeconds) {
    if (fightSeconds <= maxSeconds) return 1;
    return Math.min(5, fightSeconds / maxSeconds);
}

function factualHook(facts) {
    if (facts.winner && facts.loser) return `${facts.winner} beats ${facts.loser}`;
    if (facts.winner && facts.laps) return `${facts.winner} wins in ${facts.laps} laps`;
    if (facts.result === "DRAW") return "Neither side breaks";
    if (facts.result === "VOIDED" || facts.result === "UNSCORED") return facts.result === "VOIDED" ? "Match voided" : "No result";
    if (facts.result === "VICTORY" && facts.laps) return `Decided in ${facts.laps} laps`;
    return "Ranked replay";
}

function kickerLine(facts, hook) {
    const laps = facts.laps ? `${facts.laps} LAPS` : "";
    if (!laps || hook.toUpperCase().includes(laps)) return facts.result === "DRAW" ? "DRAW" : "";
    return laps;
}

async function zincHookTool() {
    if (process.env.ZINC_HOOK_TOOL) return process.env.ZINC_HOOK_TOOL;
    const root = process.env.HOC_SERVER_ROOT || path.resolve(SCRIPT_DIR, "../../../../heroes-of-crypto-server");
    const tool = path.join(root, "src", "scripts", "reel_hook.ts");
    if (await exists(tool)) return tool;
    return "";
}

function cleanHook(raw) {
    const withoutLog = raw
        .split(/\r?\n/)
        .map((line) => line.replace(/^.*Output \(\d+ tokens\):\s*/, "").trim())
        .filter((line) => line && !/^(info|warn|error)\b/i.test(line) && !line.includes("tok/s"));
    const line = (withoutLog.at(-1) || "")
        .replace(/<\|im_end\|>/g, "")
        .replace(/<\/?think>/gi, "")
        .replace(/^["'`]+|["'`]+$/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!line || line.length < 3 || line.length > 90) return "";
    if (/<\/?(think|channel)|token/i.test(line)) return "";
    return line;
}

async function zincHook(facts) {
    const tool = await zincHookTool();
    const model = process.env.ZINC_MODEL_ID || "qwen38-27b-q4k-m";
    if (!tool) {
        console.warn("The reel-hook tool is missing. Using the names and the result.");
        return "";
    }
    const factsPath = path.join(os.tmpdir(), `hoc-reel-facts-${process.pid}.json`);
    await writeFile(factsPath, JSON.stringify(facts));
    console.log(`Asking ${model} through ZINC on the RDNA node...`);
    const args = [tool, "--ensure", "--facts", factsPath, "--model", model];
    const result = await run(process.execPath, args, { timeoutMs: 300000 });
    const hook = cleanHook(result.stdout);
    if (result.code === 0 && hook) return hook;
    console.warn(result.stderr.trim() || "Zinc did not return a usable hook. Using the names and the result.");
    return "";
}

const REEL_INIT = `(() => {
    const style = document.createElement("style");
    style.id = "hoc-reel-style";
    style.textContent = [
        ".Sidebar { display: none !important; }",
        "[data-testid='matchup-overlay-fight'] { display: none !important; }",
        "button[aria-label='Exit replay'], button[aria-label='Выйти из повтора'] { display: none !important; }",
    ].join("\\n");
    const mount = () => {
        const root = document.documentElement;
        if (!root || document.getElementById("hoc-reel-style")) return;
        root.appendChild(style);
    };
    mount();
    document.addEventListener("DOMContentLoaded", mount);
    const hideTurnBand = () => {
        if (!document.body) return;
        for (const el of document.body.querySelectorAll("div")) {
            if (el.offsetWidth < 400 || el.offsetHeight < 48 || el.offsetHeight > 420) continue;
            const cs = getComputedStyle(el);
            if (cs.position !== "fixed") continue;
            const backdrop = cs.backdropFilter || cs.webkitBackdropFilter || "";
            if (backdrop.includes("brightness")) el.style.setProperty("display", "none", "important");
        }
    };
    setInterval(hideTurnBand, 1000);
})();`;

function pageProbe() {
    const text = document.body?.innerText || "";
    const finished = !!document.querySelector('[aria-label="Close fight results"]');
    const board = !!document.querySelector('button[aria-label="Exit replay"], button[aria-label="Выйти из повтора"]');
    const login = /Sign in to continue/i.test(text);
    const unavailable = /Replay unavailable/i.test(text);
    return { finished, board, login, unavailable };
}

function scrapeFacts() {
    const usernameNear = (el) => {
        let node = el;
        while (node) {
            const label = node.querySelector?.('[aria-label^="Show "][aria-label$=" details"]');
            if (label) {
                return (label.getAttribute("aria-label") || "").replace(/^Show /, "").replace(/ details$/, "");
            }
            node = node.parentElement;
        }
        return "";
    };
    const texts = (exact) => {
        const found = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            if (node.textContent.trim() === exact && node.parentElement) found.push(node.parentElement);
        }
        return found;
    };
    const text = document.body?.innerText || "";
    const lapsMatch = text.match(/(\d+)\s+LAPS/i);
    const green = text.match(/GREEN LOST\s+(\d+)%/);
    const red = text.match(/RED LOST\s+(\d+)%/);
    let result = "";
    if (/\bVOIDED\b/.test(text)) result = "VOIDED";
    else if (/\bUNSCORED\b/.test(text)) result = "UNSCORED";
    else if (/\bDRAW\b/.test(text)) result = "DRAW";
    else if (/\bVICTORY\b/.test(text)) result = "VICTORY";
    return {
        result,
        winner: texts("WINNER").map(usernameNear).find(Boolean) || "",
        loser: texts("DEFEATED").map(usernameNear).find(Boolean) || "",
        laps: lapsMatch ? Number(lapsMatch[1]) : null,
        greenLostPct: green ? Number(green[1]) : null,
        redLostPct: red ? Number(red[1]) : null,
        cardText: text.slice(0, 6000),
    };
}

async function signedIn(page) {
    return page.evaluate(() => {
        const raw = localStorage.getItem("accessToken") || "";
        const token = raw.replace(/^Bearer\s+/i, "").trim();
        const part = token.split(".")[1];
        if (!part) return false;
        try {
            const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
            const payload = JSON.parse(atob(padded));
            return typeof payload.exp === "number" && payload.exp * 1000 > Date.now() + 60_000;
        } catch {
            return false;
        }
    });
}

async function openBrowser({ headed, recordDir }) {
    const { chromium } = loadPlaywright();
    const profile = path.join(CACHE_ROOT, "profile");
    await mkdir(profile, { recursive: true });
    const context = await chromium.launchPersistentContext(profile, {
        headless: !headed,
        viewport: { width: WIDTH, height: HEIGHT },
        locale: "en-US",
        args: ["--autoplay-policy=no-user-gesture-required", "--disable-dev-shm-usage"],
        ...(recordDir ? { recordVideo: { dir: recordDir, size: { width: WIDTH, height: HEIGHT } } } : {}),
    });
    const page = context.pages()[0] || (await context.newPage());
    await context.addInitScript({ content: REEL_INIT });
    return { context, page };
}

async function login(origin) {
    console.log("Opening Chrome. Sign in on the portal, then leave the window open until this command exits.");
    const { context, page } = await openBrowser({ headed: true, recordDir: "" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${origin}/portal`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
        if (await signedIn(page).catch(() => false)) {
            console.log("Signed in. Later captures will reuse this Chrome profile.");
            await context.close();
            return;
        }
        await page.waitForTimeout(1000);
    }
    await context.close();
    die("Sign-in was not finished within 10 minutes.", 2);
}

async function resolveReplayUrl(page, opts) {
    if (opts.url) return opts.url;
    console.log(`Opening match history at ${opts.origin}/portal`);
    await page.goto(`${opts.origin}/portal`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
        const state = await page.evaluate(pageProbe).catch(() => null);
        if (state?.login) {
            die(`The portal needs a sign-in. Run:\n  bun game/core/scripts/capture_replay_reel.mjs --login`, 2);
        }
        const button = page.locator('button[aria-label="Replay match"], button[aria-label="Повтор матча"]').first();
        if ((await button.count().catch(() => 0)) > 0) {
            await button.click();
            await page.waitForURL(/\/replay/, { timeout: 20000 });
            return page.url();
        }
        await page.waitForTimeout(500);
    }
    die("No replay button was available on the portal. Open a finished match that still has a replay.", 2);
}

async function capture(opts) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const workDir = path.join(opts.out, stamp);
    await mkdir(workDir, { recursive: true });
    const { context, page } = await openBrowser({ headed: opts.headed, recordDir: workDir });
    let replayHttp = 0;
    page.on("response", (response) => {
        if (response.url().includes("/play-replay/")) replayHttp = response.status();
    });
    const started = Date.now();
    const mark = (name) => ({ name, sec: (Date.now() - started) / 1000 });
    const marks = [];
    let boardShot = "";
    try {
        const url = await resolveReplayUrl(page, opts);
        marks.push({ ...mark("navigate"), url });
        console.log(`Recording ${url}`);
        if (opts.url) await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        const deadline = Date.now() + opts.timeout * 1000;
        let boardAt = 0;
        let doneAt = 0;
        while (Date.now() < deadline) {
            if (replayHttp === 401) {
                die(
                    `This replay is not public (HTTP 401). Sign in once, then rerun:\n  bun game/core/scripts/capture_replay_reel.mjs --login\n  bun game/core/scripts/capture_replay_reel.mjs --url ${JSON.stringify(url)}`,
                    2,
                );
            }
            const state = await page.evaluate(pageProbe).catch(() => null);
            if (state?.login) die("The page is asking you to sign in. Run --login first.", 2);
            if (state?.unavailable) {
                const why =
                    replayHttp === 401
                        ? "The replay API refused the session."
                        : replayHttp
                          ? `The replay API returned HTTP ${replayHttp}.`
                          : "The page says this match has no stored replay.";
                die(`${why} Sign in with --login if this match is yours and the replay should exist.`, 2);
            }
            if (state?.board && !boardAt) {
                boardAt = Date.now();
                marks.push(mark("board"));
                await page.waitForTimeout(1200);
                boardShot = path.join(workDir, "board.png");
                await page.screenshot({ path: boardShot });
                console.log("Board is up. Waiting for the results card.");
            }
            if (state?.finished) {
                doneAt = Date.now();
                marks.push(mark("results"));
                break;
            }
            await page.waitForTimeout(500);
        }
        if (!boardAt) {
            die(
                replayHttp
                    ? `The replay never reached the board (HTTP ${replayHttp}).`
                    : "The replay never reached the board. Try --headed to see what the page is showing.",
                2,
            );
        }
        if (!doneAt) {
            console.warn("The results card did not appear before the timeout. Exporting the fight that was recorded.");
            doneAt = Date.now();
            marks.push(mark("timeout"));
        } else if (opts.hold > 0) {
            await page.waitForTimeout(opts.hold * 1000);
        }
        const facts = await page.evaluate(scrapeFacts).catch(() => ({}));
        facts.url = page.url();
        const clipEnd = (Date.now() - started) / 1000;
        marks.push(mark("close"));
        await writeFile(path.join(workDir, "facts.json"), JSON.stringify({ facts, marks, replayHttp }, null, 2));
        const video = page.video();
        await page.close();
        const rawPath = video ? await video.path() : "";
        await context.close();
        if (!rawPath) die("Playwright did not write a video.");
        return { workDir, rawPath, boardShot, facts, marks, clipEnd };
    } catch (error) {
        await context.close().catch(() => {});
        if (error instanceof Stop) await rm(workDir, { recursive: true, force: true }).catch(() => {});
        throw error;
    }
}

async function renderCaptions(workDir, font, hook, kicker) {
    const py = path.join(workDir, "caption.py");
    const hookPng = path.join(workDir, "hook.png");
    const brandPng = path.join(workDir, "brand.png");
    await writeFile(
        py,
        [
            "from PIL import Image, ImageDraw, ImageFont",
            "import sys",
            "font_path, hook, kicker, hook_path, brand_path = sys.argv[1:6]",
            "W, H = 1080, 1920",
            "hook_font = ImageFont.truetype(font_path, 54)",
            "kicker_font = ImageFont.truetype(font_path, 30)",
            "brand_font = ImageFont.truetype(font_path, 26)",
            "def center(draw, text, font, y, fill):",
            "    box = draw.textbbox((0, 0), text, font=font)",
            "    x = (W - (box[2] - box[0])) // 2",
            "    draw.text((x, y), text, font=font, fill=fill, stroke_width=4, stroke_fill=(0, 0, 0, 255))",
            "plate = Image.new('RGBA', (W, H), (0, 0, 0, 0))",
            "draw = ImageDraw.Draw(plate)",
            "center(draw, hook, hook_font, 230, (246, 216, 124, 255))",
            "if kicker.strip():",
            "    center(draw, kicker, kicker_font, 312, (239, 228, 204, 255))",
            "plate.save(hook_path)",
            "brand = Image.new('RGBA', (W, H), (0, 0, 0, 0))",
            "brand_draw = ImageDraw.Draw(brand)",
            "center(brand_draw, 'HEROES OF CRYPTO', brand_font, H - 110, (246, 216, 124, 235))",
            "brand.save(brand_path)",
            "",
        ].join("\n"),
    );
    const rendered = await run("python3", [py, font, hook, kicker, hookPng, brandPng], { timeoutMs: 20000 });
    if (rendered.code !== 0) die(`Could not draw the caption:\n${rendered.stderr}`);
    return { hookPng, brandPng };
}

async function mediaDuration(file) {
    const probed = await run(
        "ffprobe",
        ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
        { timeoutMs: 15000 },
    );
    const duration = Number(probed.stdout.trim());
    return Number.isFinite(duration) ? duration : 0;
}

async function polish({ rawPath, dest, workDir, start, fightEnd, clipEnd, board, hook, kicker, maxSeconds = 36 }) {
    const font = await resolveFont(workDir);
    const duration = await mediaDuration(rawPath);
    const endCap = duration > 0 ? Math.min(clipEnd, duration - 0.05) : clipEnd;
    const fightCap = Math.min(fightEnd, endCap - 0.3);
    const startCap = Math.max(0, Math.min(start, fightCap - 0.5));
    const fightSeconds = Math.max(0.5, fightCap - startCap);
    const speed = fightSpeed(fightSeconds, maxSeconds);
    const end = Math.max(fightCap + 0.3, endCap);
    const fightOut = fightSeconds / speed;
    const total = fightOut + (end - fightCap);
    const fadeOut = Math.max(0.2, total - 0.4);
    const punch = 1180;
    const captions = await renderCaptions(workDir, font, hook, kicker);
    const filter = [
        `[0:v]trim=start=${startCap.toFixed(3)}:end=${fightCap.toFixed(3)},setpts=(PTS-STARTPTS)/${speed.toFixed(4)},fps=30,crop=${board.w}:${board.h}:${board.x}:${board.y},split[sharp][blur]`,
        `[blur]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,gblur=sigma=8,scale=${WIDTH}:${HEIGHT}:flags=bilinear,eq=brightness=-0.2:saturation=1.2,setsar=1,format=yuv420p[bg]`,
        `[sharp]scale=${punch}:-2:flags=lanczos,setsar=1[fg]`,
        `[bg][fg]overlay=x=(W-w)/2:y=H-h-48:format=auto,setsar=1,format=yuv420p[fight]`,
        `[0:v]trim=start=${fightCap.toFixed(3)}:end=${end.toFixed(3)},setpts=PTS-STARTPTS,fps=30,scale=${WIDTH}:${HEIGHT}:flags=lanczos,setsar=1,format=yuv420p[end]`,
        `[fight][end]concat=n=2:v=1:a=0[cat]`,
        `[cat]eq=contrast=1.05:saturation=1.08,vignette=angle=PI/5,fade=t=in:st=0:d=0.3,fade=t=out:st=${fadeOut.toFixed(3)}:d=0.35,format=yuv420p[graded]`,
        `[1:v]format=rgba[hook]`,
        `[2:v]format=rgba[brand]`,
        `[graded][hook]overlay=0:0:enable='lt(t\\,4.6)':shortest=1:format=auto[hooked]`,
        `[hooked][brand]overlay=0:0:shortest=1:format=auto,format=yuv420p[out]`,
    ].join(";");
    console.log(
        `Finishing the reel at ${speed.toFixed(2)}x ` +
            `(${fightSeconds.toFixed(1)}s of fight -> ${fightOut.toFixed(1)}s, then the results card).`,
    );
    const encoded = await run(
        "ffmpeg",
        [
            "-y",
            "-i",
            rawPath,
            "-loop",
            "1",
            "-i",
            captions.hookPng,
            "-loop",
            "1",
            "-i",
            captions.brandPng,
            "-filter_complex",
            filter,
            "-map",
            "[out]",
            "-an",
            "-t",
            total.toFixed(3),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "18",
            "-preset",
            "veryfast",
            "-movflags",
            "+faststart",
            dest,
        ],
        { timeoutMs: 300000 },
    );
    if (encoded.code !== 0) {
        const tail = encoded.stderr.split("\n").slice(-30).join("\n");
        die(`ffmpeg failed:\n${tail}`);
    }
    return { speed, total };
}

async function selfTest() {
    const ffmpeg = await run("ffmpeg", ["-version"], { timeoutMs: 10000 });
    if (ffmpeg.code !== 0) die("ffmpeg is not available.");
    const workDir = path.join(CACHE_ROOT, "self-test");
    await mkdir(workDir, { recursive: true });
    const raw = path.join(workDir, "raw.mp4");
    const made = await run(
        "ffmpeg",
        [
            "-y",
            "-f",
            "lavfi",
            "-i",
            `color=c=black:s=${WIDTH}x${HEIGHT}:d=6:r=30`,
            "-f",
            "lavfi",
            "-i",
            "color=c=0x8C4A22:s=1080x840:d=6:r=30",
            "-filter_complex",
            "[0][1]overlay=0:1080,format=yuv420p",
            "-t",
            "6",
            raw,
        ],
        { timeoutMs: 30000 },
    );
    if (made.code !== 0) die(`Could not build the self-test frame:\n${made.stderr.split("\n").slice(-15).join("\n")}`);
    const dest = path.join(workDir, "reel.mp4");
    const board = formulaBoardRect(WIDTH, HEIGHT);
    await polish({
        rawPath: raw,
        dest,
        workDir,
        start: 0.2,
        fightEnd: 4,
        clipEnd: 5.8,
        board,
        hook: "The pit closes in",
        kicker: "12 LAPS",
        maxSeconds: 36,
    });
    const probed = await run(
        "ffprobe",
        ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,duration", "-of", "json", dest],
        { timeoutMs: 15000 },
    );
    const info = JSON.parse(probed.stdout);
    const stream = info.streams?.[0];
    if (!stream || stream.width !== WIDTH || stream.height !== HEIGHT) {
        die(`Self-test output was ${stream?.width}x${stream?.height}, expected ${WIDTH}x${HEIGHT}.`);
    }
    const duration = Number(stream.duration);
    if (!(duration > 4 && duration < 8)) die(`Self-test duration ${duration}s was outside 4–8s.`);
    const frame = path.join(workDir, "frame.png");
    const rawFrame = path.join(workDir, "frame.rgb");
    const grabbed = await run(
        "ffmpeg",
        ["-y", "-ss", "1.2", "-i", dest, "-frames:v", "1", frame, "-f", "rawvideo", "-pix_fmt", "rgb24", rawFrame],
        { timeoutMs: 20000 },
    );
    if (grabbed.code !== 0) die("Could not read a frame back from the reel.");
    // The top band must be the blurred board, not the original black plate.
    const bytes = await readFile(rawFrame);
    if (bytes.length < WIDTH * 200 * 3) die("The check frame was shorter than expected.");
    let acc = 0;
    let n = 0;
    for (let y = 80; y < 420; y += 20) {
        for (let x = 80; x < WIDTH - 80; x += 20) {
            const i = (y * WIDTH + x) * 3;
            acc += bytes[i] + bytes[i + 1] + bytes[i + 2];
            n += 1;
        }
    }
    const mean = acc / n / 3;
    if (mean < 8) die(`The top of the reel is still empty (mean luminance ${mean.toFixed(1)}).`);
    console.log(`Self-test passed: ${dest} (${duration.toFixed(2)}s, top luminance ${mean.toFixed(1)}).`);
}

function boardMark(marks) {
    return marks.find((mark) => mark.name === "board")?.sec ?? 0;
}

function resultsMark(marks) {
    return marks.find((mark) => mark.name === "results" || mark.name === "timeout")?.sec ?? 0;
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.selfTest) {
        await selfTest();
        return;
    }
    const ffmpegOk = await run("ffmpeg", ["-version"], { timeoutMs: 10000 });
    if (ffmpegOk.code !== 0) die("ffmpeg is not on PATH. Install it with `brew install ffmpeg`.");
    if (opts.login) {
        await login(opts.origin);
        return;
    }
    const captured = await capture(opts);
    const board = captured.boardShot ? await detectBoardRect(captured.boardShot) : formulaBoardRect(WIDTH, HEIGHT);
    const facts = captured.facts || {};
    let hook = opts.hook.trim();
    if (!hook && opts.zinc && (facts.result || facts.winner || facts.loser)) hook = await zincHook(facts);
    if (!hook) hook = factualHook(facts);
    const kicker = kickerLine(facts, hook);
    const dest = path.join(captured.workDir, "reel.mp4");
    const start = Math.max(0, boardMark(captured.marks) - 0.25);
    const fightEnd = Math.max(start + 0.8, resultsMark(captured.marks) || captured.clipEnd - opts.hold);
    await polish({
        rawPath: captured.rawPath,
        dest,
        workDir: captured.workDir,
        start,
        fightEnd,
        clipEnd: captured.clipEnd,
        board,
        hook,
        kicker,
        maxSeconds: opts.maxSeconds,
    });
    await writeFile(path.join(captured.workDir, "hook.txt"), `${hook}\n${kicker}\n`);
    console.log(`Reel: ${dest}`);
    console.log(`Hook: ${hook}${kicker ? `  ·  ${kicker}` : ""}`);
}

try {
    await main();
} catch (error) {
    if (error instanceof Stop) {
        console.error(error.message);
        process.exit(error.code);
    }
    console.error(error?.stack || error);
    process.exit(1);
}
