import type { PremiumSearchMatchVersion } from "./premiumSearchFreshness";
import type { PresenceActivityKind } from "../social/presenceActivity";

export interface PremiumSandboxState {
    left: number;
    right: number;
    started: boolean;
    finished: boolean;
    lap: number;
    map: number;
    visibleQueue: { name: string; team: "green" | "red"; amount: number }[];
}

export interface PremiumBriefingPlan {
    title: string;
    subtitle: string;
    question?: string;
    steps?: { title: string; text: string }[];
}

const concise =
    "Give three short strategy bullets (max 130 words): overall plan, main threat, and what to preserve. Name units; no follow-up questions.";
const evidence =
    "Use authorized AI context and current mechanics. Query premium_gameplay_evidence for relevant unit or matchup data; disclose weak or old support. Never invent win odds or hidden enemy information.";

export function premiumBriefingPlan(
    stage?: PremiumSearchMatchVersion["stage"],
    sandbox?: PremiumSandboxState,
    location?: PresenceActivityKind,
): PremiumBriefingPlan {
    // A menu has no battlefield. In particular, the ranked arena must never read the manager's
    // empty (or previous) sandbox and tell the player to place two armies before queueing.
    if (location && location !== "sandbox" && location !== "coop") {
        if (location === "arena") {
            return {
                title: "Ranked arena",
                subtitle: "Ranked · choose your next match",
                steps: [
                    {
                        title: "Choose your scouting doctrine",
                        text: "Pick A, B or C before you queue. Each doctrine trades draft visibility for upgrade points.",
                    },
                    {
                        title: "Choose how to play",
                        text: "Queue for a ranked opponent or start a game against AI.",
                    },
                    {
                        title: "Get advice during the match",
                        text: "Premium follows your draft, army setup, placement and battle. Open it there for advice based on the information visible to you.",
                    },
                ],
            };
        }
        return {
            title: "Premium guide",
            subtitle: "Guidance for your next match",
            steps: [
                {
                    title: "Choose a game",
                    text: "Use the ranked arena to find an opponent or play against AI, or join a custom-game lobby.",
                },
                {
                    title: "Advice follows your match",
                    text: "During a game, Premium can explain your draft, army setup, placement and battle using the information visible to you.",
                },
            ],
        };
    }
    if (sandbox) {
        if (!sandbox.started) {
            const empty = sandbox.left + sandbox.right === 0;
            const missing = sandbox.left === 0 || sandbox.right === 0;
            return {
                title: empty ? "Set up a fight" : missing ? "Add the other army" : "Before you start",
                subtitle: "Sandbox · try armies and formations",
                steps: [
                    {
                        title: empty ? "Pick your creatures" : "Build both armies",
                        text: "Choose creatures from the roster and place them on each side of the board.",
                    },
                    {
                        title: "Try a standard matchup",
                        text: "Ranked normally drafts six creature stacks per side: two level 1, two level 2, one level 3 and one level 4. Sandbox lets you try other lineups.",
                    },
                    {
                        title: "Start when ready",
                        text: "Set the stack sizes, artifacts and upgrades, then start the fight. Suggested moves can help you compare actions during combat.",
                    },
                ],
            };
        }
        const prefix = `Give a conditional practice ${sandbox.finished ? "review" : "plan"} for both armies: three short bullets, max 130 words. This is a client-supplied sandbox queue, not a complete live board. Use current mechanics and relevant Premium evidence. Do not infer positions, effects, spell charges, missing units or win odds. ${sandbox.finished ? "The fight is finished; suggest a lesson, not an action." : ""} Map ${sandbox.map}, round ${sandbox.lap}. Partial visible queue: `;
        const queue: string[] = [];
        for (const unit of sandbox.visibleQueue.slice(0, 24)) {
            const next = `${unit.team}:${unit.name}(${unit.amount})`;
            if (prefix.length + [...queue, next].join("; ").length > 600) break;
            queue.push(next);
        }
        return {
            title: sandbox.finished ? "Practice review" : "Practice strategy",
            subtitle: "Sandbox · based on the visible turn queue",
            question: prefix + (queue.join("; ") || "no named stacks available"),
        };
    }
    const phases = {
        draft: {
            title: "Draft plan",
            instruction:
                "Compare the currently legal offers in the context of my army and the revealed opponent. Describe the army plan and the biggest remaining role gap.",
        },
        setup: {
            title: "Army setup",
            instruction:
                "Explain the army's plan through its actual artifacts, faction bonuses and legal upgrade budget. Distinguish selected upgrades from proposed changes.",
        },
        board: {
            title: "Placement plan",
            instruction:
                "Explain how to deploy my current army to support its damage dealers and support units against revealed threats. Use my visible formation and leave hidden enemy positions unknown.",
        },
        fight: {
            title: "Battle strategy",
            instruction:
                "Use the current visible armies, actual artifacts and effects. Explain engagement, target priorities, protection and resources rather than only the acting unit's next move. If it is not my turn, give a conditional plan.",
        },
        finished: {
            title: "Battle review",
            instruction:
                "Review only the final visible position and explain one practical lesson for a future game. Do not reconstruct unobserved turns or issue a next-turn command.",
        },
    };
    const phase = stage
        ? phases[stage]
        : {
              title: "Match plan",
              instruction: "Explain the plan for the current authorized stage of my match and its legal choices.",
          };
    return {
        title: phase.title,
        subtitle: "For your current match",
        question: `${concise} ${phase.instruction} ${evidence}`,
    };
}

export function premiumSandboxVersion(state: PremiumSandboxState): string {
    return JSON.stringify([
        state.left,
        state.right,
        state.started,
        state.finished,
        state.lap,
        state.map,
        state.visibleQueue,
    ]);
}
