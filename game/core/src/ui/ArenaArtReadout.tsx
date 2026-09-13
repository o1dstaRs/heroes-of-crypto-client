/*
 * -----------------------------------------------------------------------------
 * This file is part of the game core of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import { CircularProgress, Stack, Tooltip, Typography } from "@mui/joy";
import React from "react";

import { tf, useTranslation } from "../i18n/i18n";
import { isAssetPrefetchComplete, useAssetPrefetchProgress } from "./assetPrefetch";
import { hocColors } from "./hocTheme";

/**
 * How much of a match's art this tab has already downloaded (see assetPrefetch.ts): a progress ring with the
 * percentage while it downloads, a check once it is all in. A player on a slow connection can see whether the
 * board will show their units the moment a match starts.
 */
export const ArenaArtReadout = (): React.ReactElement | null => {
    const { t } = useTranslation();
    const progress = useAssetPrefetchProgress();
    if (progress.total === 0) {
        return null;
    }
    const ready = isAssetPrefetchComplete(progress);
    const percent = Math.min(100, Math.floor((progress.settled / progress.total) * 100));
    return (
        <Tooltip
            title={
                ready
                    ? t("Battle art is downloaded: units appear on the board the moment a match starts.")
                    : t(
                          "Downloading battle art in the background so units appear on the board the moment a match starts.",
                      )
            }
            size="sm"
            variant="soft"
        >
            <Stack
                component="span"
                role="status"
                direction="row"
                spacing={0.7}
                alignItems="center"
                aria-label={ready ? t("Battle art ready") : tf("Battle art {percent}%", { percent })}
                sx={{
                    minHeight: 38,
                    px: 1.15,
                    borderRadius: "10px",
                    color: hocColors.parchment,
                    bgcolor: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(220,177,88,0.3)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035)",
                }}
            >
                {ready ? (
                    <CheckCircleRoundedIcon sx={{ color: hocColors.green, fontSize: 19 }} />
                ) : (
                    <CircularProgress
                        determinate
                        value={percent}
                        size="sm"
                        sx={{
                            "--CircularProgress-size": "18px",
                            "--CircularProgress-trackThickness": "3px",
                            "--CircularProgress-progressThickness": "3px",
                            "--CircularProgress-progressColor": hocColors.gold,
                            "--CircularProgress-trackColor": "rgba(220,177,88,0.2)",
                        }}
                    />
                )}
                {!ready && (
                    <Typography level="body-sm" sx={{ color: "inherit", fontWeight: 800 }}>
                        {percent}%
                    </Typography>
                )}
                <Typography
                    level="body-xs"
                    sx={{
                        display: { xs: "none", sm: "block" },
                        color: hocColors.muted,
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                    }}
                >
                    {t("Battle art")}
                </Typography>
            </Stack>
        </Tooltip>
    );
};
