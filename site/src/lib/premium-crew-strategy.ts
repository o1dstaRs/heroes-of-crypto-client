import { getAuthToken } from "./auth-state";
import { premiumCrewSynergies, type PremiumCrewBoardPlan } from "./premium-crew";
import {
    fetchPremiumLibrarySearch,
    premiumAiBody,
    readPremiumLibrarySearch,
    type PremiumAiEvent,
    type PremiumAiSelection,
} from "./premium-ai";
import type { PremiumCatalog } from "./premium-library";

type Evidence = NonNullable<PremiumAiEvent["packet"]>;
export interface CrewStrategyRequest {
    key: string;
    body: ReturnType<typeof premiumAiBody>;
    selection?: PremiumAiSelection;
}
export type CrewStrategyState = {
    phase: "idle" | "waiting" | "loading" | "ready" | "error";
    text: string;
    evidence: Evidence[];
};

/** Board/setup facts are hypothetical user choices, never authoritative live-match state or battle evidence. */
export function premiumCrewStrategyRequest(
    plan: PremiumCrewBoardPlan,
    catalog: PremiumCatalog,
    lang: "en" | "ru",
    selection?: PremiumAiSelection,
    sourceSha256?: string,
): CrewStrategyRequest | undefined {
    if (plan.own.input.bodies.length !== 6 || (plan.enemy.input.bodies.length && !plan.own.planned)) return;
    const names = (side: typeof plan.own) => side.input.bodies.map((body) => body.name).join(", ");
    const question =
        lang === "ru"
            ? `Моя армия: ${names(plan.own)}. Враг: ${names(plan.enemy) || "не выбран"}. Опиши состав одним предложением, затем 3 коротких пункта: начало и позиции; угрозы и цели; артефакты и синергии. Учитывай контекст поля и текущие правила. До 130 слов, без вступления, пафоса и выдуманных шансов победы.`
            : `My crew: ${names(plan.own)}. Enemy: ${names(plan.enemy) || "not selected"}. Describe the crew in one sentence, then 3 short bullets: opening/positions; threats/targets; artifacts/synergies. Use board context and current rules. Max 130 words. No intro, hype or invented win rates.`;
    const setup = (side: typeof plan.own) =>
        side.input.bodies.map((body, i) => ({
            name: body.name,
            amount: body.amount,
            cell: `${String.fromCharCode(65 + side.positions[i].x)}${side.positions[i].y + 1}`,
            size: `${body.width}x${body.height}`,
        }));
    const ownIds = plan.own.input.bodies.map((body) => body.creature);
    const facts = JSON.stringify({
        context: "hypothetical website crew builder; not a live match",
        map: plan.own.input.map,
        own: setup(plan.own),
        enemy: setup(plan.enemy),
        formation: plan.own.planned ? "game A19 final-placement planner" : "legal role-based starting formation",
        artifacts: plan.own.input.artifacts.map(
            (id, i) => catalog.artifacts[`${i + 1}:${id}`]?.name ?? `Tier ${i + 1}: ${id}`,
        ),
        doctrine: "Battle Trance",
        upgrades: plan.own.input.augments,
        factions: premiumCrewSynergies(ownIds, catalog).map(({ faction, count, level }) => ({ faction, count, level })),
        sourceSha256,
    });
    const context =
        "These are the exact displayed board and assumed setup. Faction variants and enemy artifacts/upgrades are unknown. Do not invent them. Do not move units or imply changes have been applied. Use named coordinates when useful. Cite returned evidence IDs and support for statistics; historical associations are not odds for this matchup. If the enemy is not selected, give our general plan without inventing an opponent.\n";
    // The service accepts a 600-character question and 2,000 characters per history message.
    const history = [
        { role: "user" as const, content: context },
        ...Array.from({ length: Math.ceil(facts.length / 1800) }, (_, i) => ({
            role: "user" as const,
            content: `Board context ${i + 1}: ${facts.slice(i * 1800, (i + 1) * 1800)}`,
        })),
    ];
    const body = premiumAiBody(question, lang, selection, history);
    return { key: JSON.stringify(body), body, selection };
}

/** One automatic request per settled board. Superseded streams can never publish or enter the cache. */
export function createCrewStrategy(options: {
    onChange: (state: CrewStrategyState) => void;
    onAccessLost?: () => void;
    getToken?: () => string | null;
    fetch?: typeof fetchPremiumLibrarySearch;
    delayMs?: number;
}) {
    const tokenFor = options.getToken ?? getAuthToken;
    const send = options.fetch ?? fetchPremiumLibrarySearch;
    const cache = new Map<string, { at: number; state: CrewStrategyState }>();
    let state: CrewStrategyState = { phase: "idle", text: "", evidence: [] };
    let selected: CrewStrategyRequest | undefined;
    let token: string | null = null;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let revision = 0;
    const publish = (next: CrewStrategyState) => {
        state = next;
        options.onChange(state);
    };
    const cancel = () => {
        revision++;
        clearTimeout(timer);
        timer = undefined;
        controller?.abort();
        controller = undefined;
    };
    const run = async (request: CrewStrategyRequest, accessToken: string, version: number) => {
        const pending = new AbortController();
        controller = pending;
        const active = () => version === revision && !pending.signal.aborted && tokenFor() === accessToken;
        const packets = new Map<string, Evidence>();
        let text = "";
        publish({ phase: "loading", text, evidence: [] });
        try {
            const response = await send(request.body, accessToken, pending.signal);
            if (!active()) {
                await response.body?.cancel();
                return;
            }
            if (response.status === 401 || response.status === 403) {
                suspend();
                options.onAccessLost?.();
                return;
            }
            const completed = await readPremiumLibrarySearch(response, request.selection, (kind, event) => {
                if (!active()) return;
                if (kind === "delta") text += event.text ?? "";
                else if (kind === "reset") {
                    text = "";
                    packets.clear();
                } else if (kind === "premium_evidence" && event.packet)
                    packets.set(event.packet.evidenceId, event.packet);
                else return;
                publish({ phase: "loading", text, evidence: [...packets.values()] });
            });
            if (!active()) return;
            const ready: CrewStrategyState = { phase: "ready", text: completed, evidence: [...packets.values()] };
            const key = accessToken + request.key;
            if (cache.size >= 12) cache.delete(cache.keys().next().value!);
            cache.set(key, { at: Date.now(), state: ready });
            publish(ready);
        } catch {
            if (active()) publish({ phase: "error", text: "", evidence: [] });
        } finally {
            if (controller === pending) controller = undefined;
        }
    };
    const update = (request?: CrewStrategyRequest, retry = false) => {
        const nextToken = tokenFor();
        if (!retry && request?.key === selected?.key && token === nextToken) {
            options.onChange(state);
            return;
        }
        cancel();
        if (token !== nextToken) cache.clear();
        token = nextToken;
        selected = request;
        if (!request || !nextToken) {
            publish({ phase: "idle", text: "", evidence: [] });
            return;
        }
        const cached = cache.get(nextToken + request.key);
        if (!retry && cached && Date.now() - cached.at < 15 * 60_000) {
            publish(cached.state);
            return;
        }
        publish({ phase: "waiting", text: "", evidence: [] });
        const version = revision;
        timer = setTimeout(() => {
            timer = undefined;
            void run(request, nextToken, version);
        }, options.delayMs ?? 800);
    };
    const suspend = () => {
        cancel();
        selected = undefined;
        publish({ phase: "idle", text: "", evidence: [] });
    };
    return { update, suspend, retry: () => update(selected, true) };
}
