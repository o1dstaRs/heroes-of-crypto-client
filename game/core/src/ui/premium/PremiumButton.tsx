import { Button, type ButtonProps } from "@mui/joy";
import React, { forwardRef } from "react";

import { PremiumIcon } from "../PremiumIcon";

export const PremiumButton = forwardRef<HTMLButtonElement, ButtonProps>(function PremiumButton(
    { startDecorator = <PremiumIcon size={16} />, variant = "solid", sx = [], ...props },
    ref,
) {
    const solid = variant === "solid";
    return (
        <Button
            {...props}
            ref={ref}
            variant={variant}
            startDecorator={startDecorator}
            sx={[
                {
                    minHeight: 36,
                    flexShrink: 0,
                    color: solid ? "var(--hoc-premium-text)" : "var(--hoc-premium-accent)",
                    bgcolor: solid ? "var(--hoc-premium-button)" : "transparent",
                    border: "1px solid",
                    borderColor: variant === "plain" ? "transparent" : "var(--hoc-premium-border)",
                    "&:hover": {
                        color: solid ? "var(--hoc-premium-text)" : "var(--hoc-premium-accent)",
                        bgcolor: solid ? "var(--hoc-premium-button-hover)" : "var(--hoc-premium-subtle)",
                    },
                    "&:active": {
                        color: solid ? "var(--hoc-premium-text)" : "var(--hoc-premium-accent)",
                        bgcolor: solid ? "var(--hoc-premium-button-active)" : "var(--hoc-premium-subtle)",
                    },
                    "&:focus-visible": { outline: "2px solid var(--hoc-premium-accent)", outlineOffset: 3 },
                    "&.Mui-disabled": {
                        color: "var(--hoc-premium-muted)",
                        bgcolor: variant === "plain" ? "transparent" : "var(--hoc-premium-disabled)",
                    },
                },
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
        />
    );
});
