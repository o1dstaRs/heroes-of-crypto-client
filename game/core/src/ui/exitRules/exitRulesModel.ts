import type { PlayExitResolution, PlaySnapshot } from "../../api/play_protocol";

/**
 * How leaving counts, as the exit dialogs, the Alt meter, the away-time toast and the results banner read it. The
 * server decides (exit_resolver.ts); this only presents its numbers. docs/ranked-match-integrity.html §3-§6.
 */

export type ExitRulesPhase = "draft" | "placement" | "fight";

/** What leaving right now would count as, for this player. */
export type LeaveOutcome = "concede" | "abandon" | "unscored" | "casual";

export interface IExitRulesInfo {
    ranked: boolean;
    enforced: boolean;
    enforceAtMs: number;
}

export interface IExitStanding extends IExitRulesInfo {
    phase: ExitRulesPhase;
    boardBp: number;
    xpDestroyed: number;
    xpTotal: number;
    unlocked: boolean;
    calibrating: boolean;
    absenceUsedMs: number;
    absenceBudgetMs: number;
    missedTurns: number;
    connected: boolean;
    leaveOutcome: LeaveOutcome;
}

export const DEFAULT_ABSENCE_BUDGET_MS = 5 * 60 * 1000;

export const leaveOutcomeFor = (
    ranked: boolean,
    phase: ExitRulesPhase,
    unlocked: boolean,
    calibrating: boolean,
): LeaveOutcome => {
    if (!ranked) {
        return "casual";
    }
    if (phase === "fight" && unlocked) {
        return "concede";
    }
    return calibrating ? "unscored" : "abandon";
};

export const exitStandingFromSnapshot = (snapshot: PlaySnapshot, viewerPlayerId: string | undefined): IExitStanding => {
    const viewer = snapshot.players.find((player) => player.playerId === viewerPlayerId);
    const phase: ExitRulesPhase = snapshot.fightStarted ? "fight" : "placement";
    const ranked = snapshot.exitRulesRanked === true;
    const unlocked = snapshot.exitUnlocked === true;
    const calibrating = viewer?.calibrating === true;
    return {
        ranked,
        enforced: snapshot.exitRulesEnforced === true,
        enforceAtMs: Math.max(0, snapshot.exitRulesEnforceAtMs ?? 0),
        phase,
        boardBp: Math.max(0, snapshot.casualtyBp ?? 0),
        xpDestroyed: Math.max(0, snapshot.boardXpDestroyed ?? 0),
        xpTotal: Math.max(0, snapshot.boardXpTotal ?? 0),
        unlocked,
        calibrating,
        absenceUsedMs: Math.max(0, viewer?.absenceUsedMs ?? 0),
        absenceBudgetMs:
            snapshot.absenceBudgetMs && snapshot.absenceBudgetMs > 0
                ? snapshot.absenceBudgetMs
                : DEFAULT_ABSENCE_BUDGET_MS,
        missedTurns: Math.max(0, viewer?.consecutiveMissedTurns ?? 0),
        connected: viewer?.connected === true,
        leaveOutcome: leaveOutcomeFor(ranked, phase, unlocked, calibrating),
    };
};

/** Whole percent of the board destroyed, never rounded up across the 50% line. */
export const casualtyPercent = (bp: number): number => Math.max(0, Math.min(100, Math.floor(bp / 100)));

export const formatXp = (xp: number): string => Math.max(0, Math.round(xp)).toLocaleString("en-US");

/** m:ss, rounding up so "0:00 left" only shows when nothing is left. */
export const formatAwayClock = (ms: number): string => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
};

export const formatRulesDate = (ms: number, language: string): string =>
    new Date(ms).toLocaleDateString(language === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "long" });

/**
 * Whether the away-time notice should show for this snapshot: in a ranked match, while connected, when away time grew
 * by at least a grace period since it was last shown, or a turn was just missed.
 */
export const awayNoticeDue = (
    standing: IExitStanding,
    lastShown: { absenceUsedMs: number; missedTurns: number },
    minGrowthMs = 10_000,
): boolean =>
    standing.ranked &&
    standing.connected &&
    (standing.phase === "fight" || standing.phase === "placement") &&
    (standing.absenceUsedMs - lastShown.absenceUsedMs >= minGrowthMs ||
        (standing.missedTurns > lastShown.missedTurns && standing.absenceUsedMs > lastShown.absenceUsedMs));

export type ExitBannerKind =
    | "void"
    | "preview-concede"
    | "preview-abandon"
    | "preview-unscored"
    | "double"
    | "casual-self"
    | "casual-opponent"
    | "concede-self"
    | "concede-opponent"
    | "concede-observer"
    | "abandon-self"
    | "abandon-opponent"
    | "abandon-observer"
    | "unscored-self"
    | "unscored-opponent"
    | "unscored-observer";

export type ExitBannerCause = "absence" | "afk" | "";

/** Which results-screen sentence describes this exit, from the viewer's side. */
export const exitBannerFor = (
    exit:
        | Pick<PlayExitResolution, "kind" | "cause" | "leaverPlayerId" | "scored" | "enforced" | "ranked">
        | undefined
        | null,
    viewerPlayerId: string | undefined,
): { kind: ExitBannerKind; cause: ExitBannerCause; mine: boolean } | undefined => {
    if (!exit || !exit.kind) {
        return undefined;
    }
    const mine = !!viewerPlayerId && exit.leaverPlayerId === viewerPlayerId;
    const observer = !viewerPlayerId;
    const cause: ExitBannerCause = exit.cause === "absence" ? "absence" : exit.cause === "afk" ? "afk" : "";
    const as = (kind: ExitBannerKind) => ({ kind, cause, mine });
    if (exit.kind === "void") {
        return as("void");
    }
    if (exit.cause === "double") {
        return as("double");
    }
    if (!exit.ranked) {
        return as(mine ? "casual-self" : "casual-opponent");
    }
    if (!exit.enforced) {
        return as(exit.kind === "concede" ? "preview-concede" : exit.scored ? "preview-abandon" : "preview-unscored");
    }
    const who = observer ? "observer" : mine ? "self" : "opponent";
    if (exit.kind === "concede") {
        return as(`concede-${who}`);
    }
    return as(exit.scored ? `abandon-${who}` : `unscored-${who}`);
};
