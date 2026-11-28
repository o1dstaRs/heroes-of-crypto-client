import { Artifact } from "@heroesofcrypto/common";
import { Box } from "@mui/joy";
import React from "react";

import { images } from "../../generated/image_imports";
import { DoctrineIcon } from "../DoctrineIcon";
import { SYNERGY_KEY_TO_IMAGE } from "../LeftSideBar/SynergiesConstants";
import type { DraftUpgradeSource, projectPremiumDraft } from "./premiumDraftProjection";
import { t } from "../../i18n/i18n";

type Projection = ReturnType<typeof projectPremiumDraft>;

const UPGRADE_IMAGE_KEYS: Record<string, string> = {
    Placement: "board_augment_256",
    Armor: "armor_augment_256",
    Might: "might_augment_256",
    Empower: "empower_augment_256",
    Sniper: "sniper_augment_256",
    Movement: "movement_augment_256",
};
const UPGRADE_EFFECTS: Record<string, string> = {
    Placement: "deeper deployment zone and more stack slots",
    Armor: "physical armor and magic defense for the army",
    Might: "melee damage",
    Empower: "magic damage",
    Sniper: "ranged damage and reach",
    Movement: "movement steps for the army",
};
const image = (key: string): string | undefined => (images as Record<string, string>)[key];

const Chip: React.FC<{
    src?: string;
    label: React.ReactNode;
    title: string;
    /** Planned, not yet chosen: drawn with a dashed frame and dimmed art. */
    projected?: boolean;
    testId?: string;
}> = ({ src, label, title, projected, testId }) => (
    <Box
        title={title}
        aria-label={title}
        role="img"
        data-build-chip={testId}
        data-projected={projected ? "true" : undefined}
        sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.3,
            minWidth: 0,
            py: "2px",
            pl: "2px",
            pr: 0.5,
            borderRadius: "4px",
            border: `1px ${projected ? "dashed" : "solid"} ${projected ? "#c9a46a99" : "#6b553a"}`,
            bgcolor: projected ? "transparent" : "#2a2116",
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1.1,
            whiteSpace: "nowrap",
        }}
    >
        {src && (
            <Box
                component="img"
                src={src}
                alt=""
                sx={{ width: 22, height: 22, flexShrink: 0, borderRadius: "3px", opacity: projected ? 0.72 : 1 }}
            />
        )}
        <span>{label}</span>
    </Box>
);

const Group: React.FC<{ name: string; children: React.ReactNode }> = ({ name, children }) => (
    <Box
        role="group"
        aria-label={name}
        sx={{ display: "flex", alignItems: "center", gap: 0.4, flexWrap: "wrap", minWidth: 0 }}
    >
        {children}
    </Box>
);

const sourceLabel = (source: DraftUpgradeSource | undefined) =>
    source === "selected" ? "Your upgrades" : "Premium's upgrade plan";

/**
 * The army's build at a glance, directly above the board: doctrine, artifacts (a Tier-2 Premium recommends
 * while you choose is shown dashed), the upgrade plan the board is drawn with, and the synergies the picks
 * unlock or are one creature away from.
 */
export const DraftBuildStrip: React.FC<{
    plan: Projection;
    doctrine?: number;
    /** Premium's top Tier-2 artifact while this player is choosing one. */
    projectedTier2?: number;
}> = ({ plan, doctrine, projectedTier2 }) => {
    const pickedTier2 = plan.artifacts.some((artifact) => artifact.tier === 2);
    const projectedArtifact =
        !pickedTier2 && projectedTier2 ? Artifact.getTier2ArtifactProperties(projectedTier2) : undefined;
    const synergies = plan.synergies.filter((item) => item.count > 0);
    const projectedUpgrades = plan.upgradeSource === "planned";
    if (!doctrine && !plan.artifacts.length && !projectedArtifact && !plan.upgrades.length && !synergies.length)
        return null;
    return (
        <Box
            data-draft-build-strip
            sx={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                columnGap: 1,
                rowGap: 0.5,
                mb: 0.8,
                color: "#e9d3b5",
            }}
        >
            {(!!doctrine || plan.artifacts.length > 0 || projectedArtifact) && (
                <Group name="Artifacts">
                    {!!doctrine && (
                        <Box title={t("Doctrine")} sx={{ display: "inline-flex" }}>
                            <DoctrineIcon doctrineId={doctrine} size={26} />
                        </Box>
                    )}
                    {plan.artifacts.map((artifact) => (
                        <Chip
                            key={artifact.tier}
                            testId={`artifact-t${artifact.tier}`}
                            src={image(artifact.imageKey)}
                            label={<span style={{ color: "#bfa78f" }}>T{artifact.tier}</span>}
                            title={`Tier ${artifact.tier}: ${artifact.name}. ${Artifact.formatArtifactDescription(artifact)}`}
                        />
                    ))}
                    {projectedArtifact && (
                        <Chip
                            testId="artifact-t2"
                            projected
                            src={image(projectedArtifact.imageKey)}
                            label={<span style={{ color: "#bfa78f" }}>T2?</span>}
                            title={`Premium's Tier-2 pick: ${projectedArtifact.name}. ${Artifact.formatArtifactDescription(projectedArtifact)}`}
                        />
                    )}
                </Group>
            )}
            {plan.upgrades.length > 0 && (
                <Group name={sourceLabel(plan.upgradeSource)}>
                    {plan.upgrades.map((upgrade) => (
                        <Chip
                            key={upgrade.kind}
                            testId={`upgrade-${upgrade.kind}`}
                            projected={projectedUpgrades}
                            src={image(UPGRADE_IMAGE_KEYS[upgrade.kind] ?? "")}
                            label={upgrade.value}
                            title={`${projectedUpgrades ? "Planned" : "Selected"}: ${upgrade.kind} ${upgrade.value}${UPGRADE_EFFECTS[upgrade.kind] ? `, ${UPGRADE_EFFECTS[upgrade.kind]}` : ""}.${projectedUpgrades ? " The board is drawn as this plan would leave it." : ""}`}
                        />
                    ))}
                </Group>
            )}
            {synergies.length > 0 && (
                <Group name="Synergies">
                    {synergies.map((item) => {
                        const src = item.variant
                            ? (SYNERGY_KEY_TO_IMAGE as Record<string, string>)[
                                  `${item.faction}:${item.variant}:${Math.max(1, item.level)}`
                              ]
                            : undefined;
                        const toNext = item.next && item.count < 6 ? item.next.unitsAway : 0;
                        return (
                            <Chip
                                key={item.faction}
                                testId={`synergy-${item.faction}`}
                                projected={!item.level}
                                src={src}
                                label={item.level ? `L${item.level}` : `${item.count}/2`}
                                title={`${item.faction} ${item.label}: ${item.level ? `level ${item.level}, ${item.effect}` : `not active yet, ${item.count} of 2 creatures`}.${toNext ? ` ${toNext} more for level ${item.next!.level}.` : ""}`}
                            />
                        );
                    })}
                </Group>
            )}
        </Box>
    );
};
