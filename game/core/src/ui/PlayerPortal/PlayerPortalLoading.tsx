import { Box, Sheet, Skeleton, Stack } from "@mui/joy";
import { CssVarsProvider } from "@mui/joy/styles";
import React from "react";

import { t } from "../../i18n/i18n";
import { hocJoyTheme, hocPanelSx } from "../hocTheme";
import "./profilePresentation.css";

export const portalScrollSx = {
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(220,177,88,0.68) rgba(7,5,4,0.72)",
    "&::-webkit-scrollbar": { width: "8px", height: "8px" },
    "&::-webkit-scrollbar-track": { borderRadius: "999px", background: "rgba(7,5,4,0.72)" },
    "&::-webkit-scrollbar-thumb": {
        border: "2px solid rgba(7,5,4,0.9)",
        borderRadius: "999px",
        background: "rgba(220,177,88,0.68)",
    },
    "&::-webkit-scrollbar-thumb:hover": { background: "rgba(239,212,154,0.84)" },
    "&::-webkit-scrollbar-corner": { background: "transparent" },
    "@media (forced-colors: active)": { scrollbarColor: "auto" },
} as const;

export const portalRevealSx = {
    "@keyframes hocPortalReveal": { from: { opacity: 0 }, to: { opacity: 1 } },
    animation: "hocPortalReveal 180ms ease-out both",
    "@media (prefers-reduced-motion: reduce)": { animation: "none" },
} as const;

const skeletonSx = {
    bgcolor: "rgba(220,177,88,0.07)",
    "@media (prefers-reduced-motion: reduce)": { "&, &::before, &::after": { animation: "none" } },
} as const;

export const PortalAvatarPlaceholder: React.FC<{ size?: number | string | Record<string, number> }> = ({
    size = { xs: 84, sm: 96 },
}) => (
    <Skeleton
        aria-hidden
        variant="circular"
        animation={false}
        sx={{ ...skeletonSx, width: size, height: size, flexShrink: 0, border: "1px solid rgba(220,177,88,0.09)" }}
    />
);

/** The profile route also needs the shared theme for its portaled hover cards. */
export const PlayerPortalFrame: React.FC<{ busy?: boolean; children: React.ReactNode }> = ({ busy, children }) => (
    <CssVarsProvider theme={hocJoyTheme}>
        <Box
            component="main"
            className="hoc-profile-surface"
            aria-label={t("Player Profile")}
            aria-busy={busy}
            sx={{
                position: "fixed",
                inset: 0,
                overflowY: "auto",
                overflowX: "hidden",
                ...portalScrollSx,
            }}
        >
            <div className="hoc-profile-shell">{children}</div>
        </Box>
    </CssVarsProvider>
);

export const PlayerPortalReputationSkeleton: React.FC = () => (
    <Sheet aria-hidden variant="outlined" sx={{ p: 2, ...hocPanelSx, bgcolor: "rgba(12,8,5,0.91)", minHeight: 142 }}>
        <Skeleton variant="rectangular" width={190} height={26} sx={skeletonSx} />
        <Skeleton variant="rectangular" width="55%" height={14} sx={{ ...skeletonSx, mt: 1.5 }} />
        <Skeleton variant="rectangular" height={10} sx={{ ...skeletonSx, mt: 2 }} />
    </Sheet>
);

/** Reserve the first history rows while the profile request completes. */
export const PlayerPortalContentSkeleton: React.FC = () => (
    <Stack spacing={1} aria-label={t("Loading your profile…")}>
        <Skeleton aria-hidden variant="rectangular" width={118} height={23} sx={{ ...skeletonSx, mb: 0.75 }} />
        {Array.from({ length: 3 }, (_, index) => (
            <Skeleton
                key={index}
                aria-hidden
                variant="rectangular"
                height={90}
                sx={{ ...skeletonSx, borderRadius: "9px" }}
            />
        ))}
    </Stack>
);

export const PlayerPortalLoadingPage: React.FC = () => (
    <PlayerPortalFrame busy>
        <header className="hoc-profile-header" aria-hidden="true">
            <div className="hoc-profile-identity">
                <div className="hoc-profile-emblem">
                    <PortalAvatarPlaceholder size="100%" />
                </div>
                <Stack spacing={1}>
                    <Skeleton variant="rectangular" width={154} height={28} sx={skeletonSx} />
                    <Skeleton variant="rectangular" width={172} height={15} sx={skeletonSx} />
                </Stack>
            </div>
        </header>
        <PlayerPortalContentSkeleton />
    </PlayerPortalFrame>
);
