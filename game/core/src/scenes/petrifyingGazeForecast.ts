import { formatCombatRange } from "./combatRange";

export interface PetrifyingGazePreview {
    killsMin: number;
    killsMax: number;
    chanceMin: number;
    chanceMax: number;
}

export interface PetrifyingGazeForecastInput {
    min: number;
    max: number;
    percentageMax: number;
    procChance: number;
    hp: number;
    totalHp: number;
    immune: boolean;
}

/** Additional losses from a single unabsorbed hit, based on the board's current engine state. */
export function petrifyingGazeForecast(
    damage: PetrifyingGazeForecastInput,
    damageTaken: (impact: number) => number = (impact) => impact,
): PetrifyingGazePreview | undefined {
    if (damage.max <= 0 || damage.hp <= 0) return undefined;
    if (damage.immune) return { killsMin: 0, killsMax: 0, chanceMin: 0, chanceMax: 0 };

    const { percentageMax, procChance, hp, totalHp } = damage;
    const percentageMin = Math.floor((percentageMax / 3) * 2);
    // getRandomInt excludes its upper bound, including the gaze's stack-kill roll.
    const percentageTop = Math.max(percentageMin, percentageMax - 1);
    const remaining = (impact: number): number => Math.max(0, Math.ceil((totalHp - damageTaken(impact)) / hp));
    if (remaining(damage.min) === 0) return undefined;

    const stackKills = (impact: number, percentage: number): number =>
        impact <= 0 ? 0 : Math.max(0, Math.min(Math.floor((impact * (percentage / 100)) / hp), remaining(impact) - 1));
    const kills = (impact: number, percentage: number, proc: boolean): number =>
        stackKills(impact, percentage) + (impact > 0 && remaining(impact) > 0 && proc ? 1 : 0);

    // Stack kills rise with damage, but the surviving stack shrinks. Their maximum can be INSIDE
    // the damage band: checking just its ends misses e.g. a hit that leaves exactly two creatures.
    let low = Math.max(1, damage.min);
    let high = Math.max(low, damage.max);
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (Math.floor((middle * (percentageTop / 100)) / hp) >= remaining(middle) - 1) high = middle;
        else low = middle + 1;
    }
    const candidates = [damage.min, damage.max, low, Math.max(damage.min, low - 1)].filter(
        (impact) => impact >= damage.min && impact <= damage.max,
    );

    const chance = (impact: number): number => {
        if (impact <= 0 || remaining(impact) === 0) return 0;
        if (remaining(impact) === 1) return procChance;
        let firstKillingRoll = percentageMin;
        let end = percentageTop + 1;
        while (firstKillingRoll < end) {
            const middle = Math.floor((firstKillingRoll + end) / 2);
            if (Math.floor((impact * (middle / 100)) / hp) >= 1) end = middle;
            else firstKillingRoll = middle + 1;
        }
        const stackKillChance =
            Math.max(0, percentageTop - Math.max(percentageMin, firstKillingRoll) + 1) /
            Math.max(1, percentageMax - percentageMin);
        return (stackKillChance + (1 - stackKillChance) * (procChance / 100)) * 100;
    };
    // Before the last survivor, stack-kill probability increases with damage. Find that boundary
    // separately from the kill-count maximum so a sub-one-unit result still gets the real chance.
    low = Math.max(1, damage.min);
    high = Math.max(low, damage.max);
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (remaining(middle) >= 2) low = middle;
        else high = middle - 1;
    }
    candidates.push(low);

    return {
        killsMin: Math.min(kills(damage.min, percentageMin, false), kills(damage.max, percentageMin, false)),
        killsMax: Math.max(...candidates.map((impact) => kills(impact, percentageTop, procChance > 0))),
        chanceMin: Math.min(chance(damage.min), chance(damage.max)),
        chanceMax: Math.max(...candidates.map(chance)),
    };
}

export function petrifyingGazePreviewText(preview: PetrifyingGazePreview, multipleHits = false): string {
    const chance = formatCombatRange(Number(preview.chanceMin.toFixed(1)), Number(preview.chanceMax.toFixed(1)));
    const kills = formatCombatRange(preview.killsMin, preview.killsMax);
    return `Gaze: ${chance}% · +${kills} kills${multipleHits ? " (first hit)" : ""}`;
}
