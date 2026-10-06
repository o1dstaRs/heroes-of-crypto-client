import { Box, Sheet, Skeleton, Stack } from "@mui/joy";
import { CssVarsProvider } from "@mui/joy/styles";
import React from "react";

import { t } from "../../i18n/i18n";
import { hocColors, hocJoyTheme, hocPanelSx } from "../hocTheme";

const profileBackgroundUrl = new URL("../../../images/background_dark.webp", import.meta.url).toString();

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

export const portalHeaderSx = {
    mb: 2,
    p: { xs: 1.5, sm: 2 },
    borderRadius: "18px",
    ...hocPanelSx,
    bgcolor: "rgba(9,6,4,0.85)",
    borderColor: "rgba(255,143,0,0.25)",
    boxShadow: "0 18px 48px rgba(0,0,0,0.42)",
    backdropFilter: "blur(16px)",
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

export const PortalAvatarPlaceholder: React.FC<{ size?: number | Record<string, number> }> = ({
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
            aria-label={t("Player Profile")}
            aria-busy={busy}
            sx={{
                position: "fixed",
                inset: 0,
                bgcolor: hocColors.black,
                overflowY: "auto",
                overflowX: "hidden",
                ...portalScrollSx,
                px: { xs: 1.5, md: 3 },
                py: { xs: 1.5, md: 2.5 },
                backgroundImage: `linear-gradient(112deg, rgba(7,5,4,0.97), rgba(7,5,4,0.89) 52%, rgba(7,5,4,0.96)), url(${profileBackgroundUrl})`,
                backgroundPosition: "center top",
                backgroundSize: "cover",
                backgroundAttachment: "fixed",
            }}
        >
            {children}
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

/** Reserve the overview and strategy panels instead of replacing the page with a centered spinner. */
export const PlayerPortalContentSkeleton: React.FC = () => (
    <Stack spacing={2} aria-label={t("Loading your profile…")}>
        <Box
            aria-hidden
            sx={{
                display: "grid",
                gridTemplateColumns: {
                    xs: "repeat(2, minmax(0, 1fr))",
                    sm: "repeat(3, minmax(0, 1fr))",
                    lg: "repeat(4, minmax(0, 1fr))",
                },
                gap: 1.25,
            }}
        >
            {Array.from({ length: 4 }, (_, index) => (
                <Sheet key={index} sx={{ p: 1.5, borderRadius: "12px", bgcolor: "rgba(0,0,0,0.3)" }}>
                    <Skeleton variant="rectangular" width={50} height={30} sx={{ ...skeletonSx, mx: "auto" }} />
                    <Skeleton
                        variant="rectangular"
                        width={60}
                        height={14}
                        sx={{ ...skeletonSx, mt: 0.5, mx: "auto" }}
                    />
                </Sheet>
            ))}
        </Box>
        <PlayerPortalReputationSkeleton />
        <Sheet
            aria-hidden
            variant="outlined"
            sx={{ p: { xs: 1.5, sm: 2.25 }, ...hocPanelSx, borderRadius: "16px", bgcolor: "rgba(12,8,5,0.91)" }}
        >
            <Skeleton variant="rectangular" width={155} height={20} sx={{ ...skeletonSx, mb: 2 }} />
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr", lg: "1fr 1fr 1fr" } }}>
                {Array.from({ length: 3 }, (_, column) => (
                    <Stack key={column} spacing={0.75}>
                        <Skeleton variant="rectangular" width="60%" height={30} sx={skeletonSx} />
                        {Array.from({ length: 6 }, (_, row) => (
                            <Skeleton
                                key={row}
                                variant="rectangular"
                                height={84}
                                sx={{ ...skeletonSx, borderRadius: "9px" }}
                            />
                        ))}
                    </Stack>
                ))}
            </Box>
        </Sheet>
    </Stack>
);

export const PlayerPortalLoadingPage: React.FC = () => (
    <PlayerPortalFrame busy>
        <Box sx={{ maxWidth: 1480, mx: "auto" }}>
            <Sheet component="header" variant="outlined" sx={portalHeaderSx}>
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.5}
                    justifyContent="space-between"
                    alignItems={{ xs: "stretch", sm: "center" }}
                >
                    <Stack direction="row" spacing={1.35} alignItems="center" aria-hidden>
                        <PortalAvatarPlaceholder />
                        <Stack spacing={1}>
                            <Skeleton variant="rectangular" width={150} height={30} sx={skeletonSx} />
                            <Skeleton variant="rectangular" width={170} height={16} sx={skeletonSx} />
                            <Skeleton variant="rectangular" width={185} height={18} sx={skeletonSx} />
                        </Stack>
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} aria-hidden>
                        {[126, 126, 126, 154].map((width, index) => (
                            <Skeleton
                                key={index}
                                variant="rectangular"
                                height={36}
                                sx={{ ...skeletonSx, width: { xs: "100%", sm: width }, borderRadius: "6px" }}
                            />
                        ))}
                    </Stack>
                </Stack>
            </Sheet>
            <PlayerPortalContentSkeleton />
        </Box>
    </PlayerPortalFrame>
);
