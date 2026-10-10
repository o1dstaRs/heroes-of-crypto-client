import { Box, Typography } from "@mui/joy";
import React from "react";

import type { PremiumEvidence } from "../../api/premium_client";

const metricLabels: Record<string, string> = {
    damageHp: "Damage taken (HP)",
    damageHpWithSource: "Damage taken from known sources (HP)",
    damageHpWithoutSource: "Damage taken from unknown sources (HP)",
    healingHp: "Healing received (HP)",
    resurrectionHp: "HP restored by resurrection",
    regenerationHp: "HP restored by regeneration",
    damageDealtHpWithSource: "Damage dealt with a recorded source (HP)",
    lethalDamageCallsWithSource: "Times attributed damage reduced a stack to zero HP",
    zeroChangeDamageCalls: "Damage attempts with no HP change",
    hpGainOutsideFunnels: "Other HP gains, including stat and creature-count changes",
    hpLossOutsideFunnels: "Other HP losses, including stat and creature-count changes",
    stacks: "Stacks, including splits",
    activations: "Activations",
    completedTurns: "Completed turns",
    waits: "Waits",
    effectSkips: "Turns skipped due to effects",
    explicitMoves: "Explicit movement actions",
    reportedDamageReceivedHp: "Damage taken reported in combat events (HP)",
    attributedDamageDealtHp: "Attributed damage dealt reported in combat events (HP)",
    spellHealingGivenHp: "Spell healing given (HP)",
    spellResurrectionGivenHp: "Spell resurrection given (HP)",
    devourHealingHp: "Devour Essence healing (HP)",
    waterShieldAbsorbedHp: "Water Shield absorption (HP)",
    fleshShieldRedirectedHp: "Flesh Shield redirected damage taken (HP)",
    poisonHp: "Poison damage taken (HP)",
    fireWallHp: "Fire-wall damage taken (HP)",
    deathsBeforeFirstAction: "Deaths before the first recorded action",
    hourglassCompletions: "Hourglass turn completions",
    defends: "Defend actions",
    timeoutSkips: "Turns skipped after a timeout",
    manualSkips: "Manually skipped turns",
    otherSkips: "Other skipped turns",
    positiveMorale: "Positive morale events",
    negativeMorale: "Negative morale events",
    reportedRouteCells: "Cells listed in explicit movement routes",
    systemMoves: "System relocations",
    offensiveStacks: "Stacks with a recorded offensive action",
    stacksWithoutRecordedOffense: "Stacks without a recorded offensive action",
    firstOffenseLapTotal: "First-offense lap total across attacking stacks",
    activationsThroughFirstOffense: "Activations through first offense across attacking stacks",
    primaryEnemyTargetIncidences: "Distinct primary targets counted separately for each stack",
    openingMeasuredStacks: "Stacks with measured opening positions",
    openingEnemyDistanceMeasuredStacks: "Stacks with measured opening enemy distance",
    openingNearestEnemyCellTotal: "Total opening enemy distance across measured stacks",
    openingAdjacentAlliedStackTotal: "Adjacent ally counts summed across opening stacks",
    reportedCreatureLosses: "Reported creature losses, including losses later resurrected",
    reportedMissesReceived: "Reported missed attacks received",
    spellHealingReceivedHp: "Spell healing received (HP)",
    spellResurrectionReceivedHp: "Spell resurrection received (HP)",
    waterShieldTriggers: "Water Shield triggers",
    spellTargetOutcomes: "Recorded spell target outcomes",
    abilityTransfersGiven: "Abilities transferred from this unit",
    abilityTransfersReceived: "Abilities transferred to this unit",
    armageddonHp: "Armageddon damage taken (HP)",
    recordedActions: "Recorded actions, including waits and skips",
    spellCasts: "Spells cast",
    effectsAppliedReceived: "Effect applications received",
    effectsResistedReceived: "Effect applications resisted",
    summonedCreatures: "Creatures summoned, including reinforcements",
};

export const EvidenceText: React.FC<{ evidence?: PremiumEvidence }> = ({ evidence }) =>
    !evidence ? (
        <Typography level="body-xs" sx={{ color: "#ceb399" }}>
            Policy guidance · evidence snapshot unavailable
        </Typography>
    ) : "metrics" in evidence ? (
        <Box sx={{ color: "#ceb399" }}>
            <Typography level="body-xs">
                {evidence.independentFamilies
                    ? `${evidence.independentFamilies} matched training families · observed unit averages`
                    : "No matching measurements in this snapshot."}
            </Typography>
            {evidence.independentFamilies > 0 &&
                Object.entries(evidence.metrics).map(([key, metric]) => (
                    <Typography key={key} level="body-xs" sx={{ mt: 0.5 }}>
                        {metricLabels[key] ?? metric.description}:{" "}
                        {metric.mean === null
                            ? "unknown"
                            : metric.mean > 0 && metric.mean < 0.01
                              ? "<0.01"
                              : metric.mean.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </Typography>
                ))}
        </Box>
    ) : (
        <Typography level="body-xs" sx={{ color: "#ceb399" }}>
            {evidence.independentFamilies
                ? `${evidence.independentFamilies} matched training families · ${evidence.scoreRate === null ? "observed score unavailable" : `observed score ${Math.round(evidence.scoreRate * 100)}% · 95% interval ${evidence.interval95.map((n) => `${Math.round(n * 100)}%`).join("–")}`}`
                : "No exact matches in this snapshot."}
            {evidence.independentFamilies > 0 && " · Association, not a win prediction."}
        </Typography>
    );
