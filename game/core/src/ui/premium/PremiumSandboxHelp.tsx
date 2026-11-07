import { Box, Typography } from "@mui/joy";
import React from "react";

import type { PremiumBriefingPlan, PremiumSandboxState } from "./premiumBriefing";

export const PremiumSandboxHelp: React.FC<{ plan: PremiumBriefingPlan; sandbox?: PremiumSandboxState }> = ({
    plan,
    sandbox,
}) => (
    <>
        {sandbox && sandbox.left + sandbox.right > 0 && (
            <Typography level="body-xs" sx={{ color: "#ceb399" }}>
                {sandbox.left} green {sandbox.left === 1 ? "stack" : "stacks"} · {sandbox.right} red{" "}
                {sandbox.right === 1 ? "stack" : "stacks"}
            </Typography>
        )}
        <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: 1.6 }}>
            {plan.steps?.map((step, index) => (
                <Box component="li" key={step.title} sx={{ display: "flex", gap: 1.3, alignItems: "baseline" }}>
                    <Typography
                        component="span"
                        sx={{ color: "#ad8158", fontSize: 11, fontVariantNumeric: "tabular-nums" }}
                    >
                        0{index + 1}
                    </Typography>
                    <Box>
                        <Typography level="title-sm" sx={{ color: "#f1dbc4", fontSize: 13 }}>
                            {step.title}
                        </Typography>
                        <Typography level="body-sm" sx={{ mt: 0.4, color: "#c7b09b", lineHeight: 1.6, fontSize: 12 }}>
                            {step.text}
                        </Typography>
                    </Box>
                </Box>
            ))}
        </Box>
    </>
);
