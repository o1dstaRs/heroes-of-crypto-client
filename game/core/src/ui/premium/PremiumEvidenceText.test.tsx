import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { EvidenceText } from "./PremiumEvidenceText";
import type { PremiumMetricEvidence } from "../../api/premium_client";

// MUI Joy is emotion-backed: without an explicit cache the server render reads a null default cache
// in CI ("null is not an object (evaluating 'cache.registered')"). Same fix as SynergySlots.test.
const emotionCache = createCache({ key: "hoc-ssr-test" });
const renderEvidence = (evidence: PremiumMetricEvidence): string =>
    renderToStaticMarkup(
        <CacheProvider value={emotionCache}>
            <EvidenceText evidence={evidence} />
        </CacheProvider>,
    );

const health: PremiumMetricEvidence = {
    evidenceId: "health-test",
    evidenceKind: "observed-health-metrics",
    independentFamilies: 80,
    status: "supported",
    caveat: "Descriptive averages",
    metrics: {
        healing: { description: "Healing HP", mean: 0, minFamilyMean: 0, maxFamilyMean: 0 },
        damage: { description: "Damage HP received", mean: 25, minFamilyMean: 0, maxFamilyMean: 100 },
        unknown: { description: "Unavailable metric", mean: null, minFamilyMean: null, maxFamilyMean: null },
        rare: { description: "Rare trigger", mean: 0.004, minFamilyMean: 0, maxFamilyMean: 0.1 },
    },
};
test("measurement evidence distinguishes measured zero and unknown without inventing win probability", () => {
    const html = renderEvidence(health);
    expect(html).toContain("80 matched training families");
    expect(html).toContain("Healing HP: 0");
    expect(html).toContain("Unavailable metric: unknown");
    expect(html).toContain("Rare trigger: &lt;0.01");
    expect(html).not.toContain("observed score");
    expect(html).not.toContain("95% interval");
});
test("unsupported measurement and outcome queries do not imply a zero score or a policy recommendation", () => {
    const html = renderEvidence({ ...health, independentFamilies: 0, status: "none" });
    expect(html).toContain("No matching measurements");
    expect(html).not.toContain("Healing HP:");
    const outcome = renderEvidence({
        evidenceId: "empty",
        independentFamilies: 0,
        scoreRate: null,
        interval95: [0, 1],
        status: "none",
        caveat: "unknown",
    });
    expect(outcome).toContain("No exact matches");
    expect(outcome).not.toContain("observed score");
    expect(outcome).not.toContain("recommendation");
});

test("player-facing labels distinguish actual incoming HP, outgoing HP and other stat changes", () => {
    const value = (mean: number) => ({
        description: "Internal measurement",
        mean,
        minFamilyMean: mean,
        maxFamilyMean: mean,
    });
    const html = renderEvidence({
        ...health,
        metrics: {
            damageHp: value(120),
            damageDealtHpWithSource: value(80),
            hpGainOutsideFunnels: value(10),
        },
    });
    expect(html).toContain("Damage taken (HP): 120");
    expect(html).toContain("Damage dealt with a recorded source (HP): 80");
    expect(html).toContain("Other HP gains, including stat and creature-count changes: 10");
    expect(html).not.toContain("Internal measurement");
});
