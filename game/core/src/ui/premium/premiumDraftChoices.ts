import type { PremiumChoice } from "../../api/premium_client";

/** Keep the AI's ranking, but leave a real decision: one opening bundle and two artifact finalists. */
export function premiumDraftChoices(choices: readonly PremiumChoice[] = []): PremiumChoice[] {
    const counts = new Map<PremiumChoice["kind"], number>();
    const seen = new Set<string>();
    return choices.filter((choice) => {
        const key = `${choice.kind}:${choice.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        const count = counts.get(choice.kind) ?? 0;
        counts.set(choice.kind, count + 1);
        return count < (choice.kind === "bundle" ? 1 : choice.kind === "artifact" ? 2 : Infinity);
    });
}
