import type { RankedAppealState, RankedConductLock, RankedLockGame } from "../../api/ranked_conduct_client";
import { t, tf } from "../../i18n/i18n";

/**
 * How the client words a ranked lock (docs/ranked-match-integrity.html §7, phase 3). The server decides the lock; this
 * only turns its numbers into text in the player's language and a countdown.
 */

/** "23:41:10" under a day, "6d 04:12:09" beyond one. Never negative. */
export const lockClock = (untilMs: number, nowMs: number): string => {
    const total = Math.max(0, Math.ceil((untilMs - nowMs) / 1000));
    const days = Math.floor(total / 86_400);
    const hours = Math.floor((total % 86_400) / 3_600);
    const minutes = Math.floor((total % 3_600) / 60);
    const seconds = total % 60;
    const clock = [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
    return days > 0 ? `${days}d ${clock}` : clock;
};

export const lockActive = (lock: RankedConductLock | null | undefined, nowMs: number): lock is RankedConductLock =>
    !!lock && lock.until > nowMs;

export const lockLengthText = (level: 1 | 2 | 3): string =>
    level === 1 ? t("24 hours") : level === 2 ? t("7 days") : t("30 days");

/** Why a lock happened, in one sentence. `count` is the number of matches behind it. */
export const lockReasonText = (reason: string, count: number): string => {
    switch (reason) {
        case "in_a_row":
            return tf("You abandoned {count} ranked matches in a row.", { count });
        case "rolling":
            return tf("You abandoned {count} of your recent ranked matches.", { count });
        case "repeat":
            return t("You abandoned a ranked match within 30 days of a 7-day lock.");
        default:
            return t("Your ranked suspension for leaving matches is now a timed lock.");
    }
};

/** How one of the lock's matches ended for this player. */
export const lockGameText = (game: RankedLockGame): string => {
    if (game.phase === "draft") {
        return t("left the draft");
    }
    if (game.phase === "placement") {
        return t("left during placement");
    }
    return tf("left at {pct}% casualties, lap {lap}", {
        pct: Math.max(0, Math.min(100, Math.floor(game.boardBp / 100))),
        lap: game.lap,
    });
};

/** Where an appeal already sent stands. */
export const appealStateText = (appeal: RankedAppealState): string => {
    switch (appeal.status) {
        case "pending":
            return t("We got your appeal. A person will review it and reply in your notifications.");
        case "upheld":
            return t("Your appeal was reviewed and the lock stays.");
        case "no_basis":
            return t("Your appeal was reviewed and we found no reason to lift the lock.");
        default:
            return t("Your appeal was accepted.");
    }
};

/** An appeal draft the server will take: trimmed length within the published bounds. */
export const appealDraftValid = (message: string, minChars: number, maxChars: number): boolean => {
    const length = message.trim().length;
    return length >= minChars && length <= maxChars;
};

/**
 * A `system` notification the server tagged with a kind (a lock, an appeal decision), in the player's language.
 * Undefined for anything else or malformed params, so the tray falls back to the English body the server sent.
 */
export const systemNoticeText = (
    systemKind: string | undefined,
    params: Record<string, unknown> | undefined,
): string | undefined => {
    const values = params ?? {};
    if (systemKind === "ranked_lock") {
        const level = values.level;
        if (level !== 1 && level !== 2 && level !== 3) {
            return undefined;
        }
        const count = typeof values.count === "number" ? values.count : 0;
        return tf(
            "Ranked locked for {length}. {cause} vs AI, sandbox and casual lobbies stay open. Something went wrong? Send an appeal from the Ranked Arena.",
            { length: lockLengthText(level), cause: lockReasonText(String(values.reason), count) },
        );
    }
    if (systemKind === "appeal_decision") {
        let text: string;
        switch (values.decision) {
            case "lifted":
                text = t("Your appeal was reviewed and your ranked lock is lifted. The abandons stay on your record.");
                break;
            case "forgiven":
                text = t("Your appeal was reviewed: your ranked lock is lifted and those abandons no longer count.");
                break;
            case "upheld":
                text = t("Your appeal was reviewed and your ranked lock stays.");
                break;
            case "no_basis":
                text = t("Your appeal was reviewed and we found no reason to lift your ranked lock.");
                break;
            default:
                return undefined;
        }
        const note = typeof values.note === "string" ? values.note.trim() : "";
        return note ? `${text} ${tf("Reviewer's note: {note}", { note })}` : text;
    }
    if (systemKind === "report_actioned") {
        return t("A player you reported was penalised. Thanks for telling us.");
    }
    if (systemKind === "report_weight_muted") {
        const until = typeof values.until === "number" && values.until > 0 ? values.until : 0;
        return until
            ? tf(
                  "Several of your recent reports were found to have no basis, so your reports count for nothing until {date}.",
                  { date: new Date(until).toISOString().slice(0, 10) },
              )
            : undefined;
    }
    return undefined;
};
