import type { Reputation, ReputationBand, ReputationLogEntry, ReputationRules } from "../../api/reputation_client";
import { t, tf } from "../../i18n/i18n";

/**
 * How the client words Reputation (integrity phase 4). The server decides every number; this only turns them into text
 * in the player's language.
 */

export const reputationBandLabel = (band: ReputationBand): string => {
    switch (band) {
        case "honorable":
            return t("Honorable");
        case "good":
            return t("Good");
        case "probation":
            return t("Probation");
        default:
            return t("Restricted");
    }
};

/** "+1", "−12", "0": points as the change log shows them. */
export const reputationPoints = (points: number): string =>
    points > 0 ? `+${points}` : points < 0 ? `−${Math.abs(points)}` : "0";

/** One change in the log, in words. */
export const reputationLogText = (entry: ReputationLogEntry): string => {
    const name = entry.opponentUsername;
    let text: string;
    switch (entry.kind) {
        case "match_completed":
            text = name ? tf("Finished a ranked match vs {name}", { name }) : t("Finished a ranked match");
            break;
        case "abandon":
            text = name ? tf("Abandoned a ranked match vs {name}", { name }) : t("Abandoned a ranked match");
            break;
        case "low_participation":
            text = name
                ? tf("Played under 60% of your own turns vs {name}", { name })
                : t("Played under 60% of your own turns");
            break;
        case "missed_accept":
            text = t("Didn't confirm a found match in time");
            break;
        case "report_early":
            text = t("A report against you is being reviewed");
            break;
        case "report_upheld":
            text = t("A report against you was upheld");
            break;
        case "ai_assistance":
            text = t("Confirmed AI assistance: Reputation capped at 20");
            break;
        case "win_trading":
            text = t("Confirmed win trading or multi-accounting: Reputation capped at 0");
            break;
        default:
            text = t("Adjusted by a reviewer");
    }
    if (entry.reverted) {
        return `${text} · ${t("points returned")}`;
    }
    if (entry.kind === "match_completed" && entry.points === 0) {
        return `${text} · ${tf("daily limit of {count} reached", { count: 5 })}`;
    }
    return entry.note && entry.kind === "adjust" ? `${text}: ${entry.note}` : text;
};

/** Where a score sits on the 0–100 bar, for the marker. */
export const reputationBarPct = (score: number): number => Math.max(0, Math.min(100, score));

/** The account bonuses the player has earned, with the ones still open. */
export const reputationAccountLines = (
    reputation: Pick<Reputation, "parts">,
    rules: ReputationRules,
): { label: string; points: number; earned: boolean }[] => [
    {
        label: tf("Account age (+1 a week, up to {max})", { max: rules.ageWeeksMax }),
        points: reputation.parts.accountAge,
        earned: reputation.parts.accountAge > 0,
    },
    { label: t("Verified email"), points: rules.identityPoints.email, earned: reputation.parts.email > 0 },
    { label: t("Google sign-in"), points: rules.identityPoints.google, earned: reputation.parts.google > 0 },
    {
        label: t("A linked wallet with 90+ days of on-chain history"),
        points: rules.identityPoints.wallet,
        earned: reputation.parts.wallet > 0,
    },
];

/** What a Restricted player can't do, once the limits apply; empty otherwise. */
export const reputationLimitsText = (
    reputation: Pick<Reputation, "restricted" | "score">,
    rules: ReputationRules,
): string => {
    if (!reputation.restricted) {
        return "";
    }
    return rules.enforced
        ? tf(
              "Below {n}, wagers, prediction bets and arena chat are closed. Finished ranked matches raise your Reputation.",
              {
                  n: rules.bands.probation,
              },
          )
        : tf("Below {n}, wagers, prediction bets and arena chat will close once these limits start.", {
              n: rules.bands.probation,
          });
};
