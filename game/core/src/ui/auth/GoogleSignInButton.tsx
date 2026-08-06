import { Box, Typography } from "@mui/joy";
import React, { useEffect, useId, useRef, useState } from "react";

import { hocColors } from "../hocTheme";
import { loadGoogleIdentityServices, renderGoogleIdentityButton } from "./googleIdentityServices";

type GoogleSignInButtonProps = {
    action: "login" | "signup" | "link";
    disabled?: boolean;
    onCredential: (credential: string) => void;
};

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ action, disabled, onCredential }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const callbackRef = useRef(onCredential);
    const state = `hoc-google-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const [error, setError] = useState(GOOGLE_CLIENT_ID ? "" : "Google sign-in is not configured");

    callbackRef.current = onCredential;

    useEffect(() => {
        const parent = containerRef.current;
        if (!parent || !GOOGLE_CLIENT_ID) {
            return;
        }

        let dispose: (() => void) | undefined;
        let cancelled = false;
        void loadGoogleIdentityServices()
            .then((api) => {
                if (cancelled) {
                    return;
                }
                dispose = renderGoogleIdentityButton(api, parent, {
                    clientId: GOOGLE_CLIENT_ID,
                    state,
                    action,
                    width: parent.clientWidth || 320,
                    onCredential: (credential) => callbackRef.current(credential),
                });
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Could not load Google sign-in");
                }
            });

        return () => {
            cancelled = true;
            dispose?.();
        };
    }, [action, state]);

    if (error) {
        return (
            <Typography level="body-xs" textColor={hocColors.muted} textAlign="center">
                {error}
            </Typography>
        );
    }

    return (
        <Box
            ref={containerRef}
            aria-disabled={disabled || undefined}
            sx={{
                width: "100%",
                minHeight: 40,
                display: "flex",
                justifyContent: "center",
                opacity: disabled ? 0.55 : 1,
                pointerEvents: disabled ? "none" : "auto",
            }}
        />
    );
};
