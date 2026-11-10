import { Box } from "@mui/joy";
import React from "react";
import { DraftBanSummary } from "./DraftBanSummary";
import { DraftBanSidebar } from "./DraftBanSidebar";

export type DraftBanPlacement = "inline" | "left" | "right" | "top" | "bottom";

export const DRAFT_BAN_PREVIEW_OPTIONS = [
    { value: "left", label: "1 · Слева" },
    { value: "right", label: "2 · Справа" },
    { value: "top", label: "3 · Над армиями" },
    { value: "bottom", label: "4 · Под карточками" },
] as const;

export const draftBanPreviewPlacement = (search: string): Exclude<DraftBanPlacement, "inline"> => {
    const requested = new URLSearchParams(search).get("bans");
    return DRAFT_BAN_PREVIEW_OPTIONS.find((option) => option.value === requested)?.value ?? "right";
};

/** Detached preview treatments share one board; none consumes the creature grid's height. */
export const DraftBanPlacementPreview: React.FC<{
    placement: Exclude<DraftBanPlacement, "inline">;
    banned: readonly number[];
    doctrine: number;
}> = ({ placement, banned, doctrine }) => {
    const sidebar = placement === "left" || placement === "right";
    if (sidebar) return <DraftBanSidebar banned={banned} doctrine={doctrine} side={placement} />;
    return (
        <Box
            data-testid="draft-ban-placement"
            data-placement={placement}
            sx={{
                position: "absolute",
                zIndex: 6,
                left: "22px",
                right: "22px",
                height: placement === "top" ? { xs: "40px", md: "58px" } : "58px",
                ...(placement === "top" ? { top: { xs: "72px", md: "132px" } } : { bottom: "106px" }),
                ...(placement === "top"
                    ? { "& li": { width: { xs: "22.4px", md: "35.2px" }, height: { xs: "28px", md: "44px" } } }
                    : {}),
            }}
        >
            <DraftBanSummary banned={banned} doctrine={doctrine} layout="strip" />
        </Box>
    );
};
