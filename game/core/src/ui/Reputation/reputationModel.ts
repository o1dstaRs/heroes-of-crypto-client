import type { Reputation, ReputationBand, ReputationRules } from "../../api/reputation_client";
import { t, tf } from "../../i18n/i18n";

/**
 * How the client words Reputation (integrity phase 4). The server decides every number; this only turns them into text
 * in the player's language.
 *
 * There is nothing here for the score's itemization — the changes that made it and the account bonuses behind it —
 * because the portal shows the final score alone (owner, 20 Sep) and the server no longer sends the parts.
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

/** Where a score sits on the 0–100 bar, for the marker. */
export const reputationBarPct = (score: number): number => Math.max(0, Math.min(100, score));

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
