import { Box, Typography } from "@mui/joy";
import React from "react";

import type { PremiumDraftAssessment } from "./premiumDraftAssessment";

export const PremiumDraftRoutes: React.FC<Pick<PremiumDraftAssessment, "routes" | "remaining" | "routeWarning">> = ({
    routes,
    remaining,
    routeWarning,
}) => {
    if (!routes.length) return null;
    return (
        <Box aria-label="Possible draft routes" sx={{ mt: 1.25, pt: 1, borderTop: "1px solid #a9582555" }}>
            <Typography level="title-sm" sx={{ color: "#f3c791" }}>
                Remaining routes
            </Typography>
            <Typography level="body-xs" sx={{ color: "#c7ac93", mt: 0.25 }}>
                {remaining}
            </Typography>
            {routeWarning && (
                <Typography level="body-sm" sx={{ color: "#ffc17a", mt: 0.75 }}>
                    {routeWarning}
                </Typography>
            )}
            {routes.map((route) => (
                <Box
                    key={route.faction}
                    sx={{
                        mt: 0.85,
                        p: 0.8,
                        border: "1px solid",
                        borderColor: route.reachable ? "#ab743b66" : "#755b4b66",
                        borderRadius: 6,
                        bgcolor: route.reachable ? "#3b281e77" : "#241d1977",
                    }}
                >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, justifyContent: "space-between" }}>
                        <Typography
                            level="body-xs"
                            sx={{ color: route.reachable ? "#ffe4c6" : "#c6afa0", fontWeight: 600 }}
                        >
                            {route.label}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: "#dcb787", flexShrink: 0 }}>
                            {route.count} / {route.target}
                        </Typography>
                    </Box>
                    <Box
                        aria-label={`${route.count} of ${route.target} distinct creatures`}
                        sx={{ display: "flex", gap: "4px", mt: 0.6 }}
                    >
                        {Array.from({ length: route.target }, (_, index) => (
                            <Box
                                key={index}
                                sx={{
                                    height: 4,
                                    flex: 1,
                                    borderRadius: 2,
                                    bgcolor: index < route.count ? "#e0a45d" : "#6a5140",
                                }}
                            />
                        ))}
                    </Box>
                    <Typography level="body-xs" sx={{ color: route.reachable ? "#dcc3aa" : "#bda599", mt: 0.6 }}>
                        {route.reachable
                            ? `${route.target - route.count} more distinct ${route.faction} creature${route.target - route.count === 1 ? "" : "s"} needed${route.uncertain ? " · future bans hidden" : ""}`
                            : "Blocked by remaining levels, revealed bans or picks."}
                    </Typography>
                    {route.reachable && (
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.4, mt: 0.6 }}>
                            {route.targets.map((unit) => (
                                <Box
                                    component="span"
                                    key={unit.id}
                                    sx={{
                                        border: "1px solid #8c633e66",
                                        borderRadius: 4,
                                        px: 0.55,
                                        py: 0.2,
                                        fontSize: 11,
                                        color: "#f3d8b8",
                                        bgcolor: "#21170d88",
                                    }}
                                >
                                    {unit.name}{" "}
                                    <Box component="span" sx={{ color: "#b79776" }}>
                                        L{unit.level}
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    )}
                </Box>
            ))}
            <Typography level="body-xs" sx={{ color: "#bba38b", mt: 0.75 }}>
                Possible targets under revealed information. Opposing picks can remove them. Only this turn’s offers are
                selectable now.
            </Typography>
        </Box>
    );
};
