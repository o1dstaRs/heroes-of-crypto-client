import { Alert, Box, Button, Sheet, Stack, Typography } from "@mui/joy";
import React, { useRef, useState, useSyncExternalStore } from "react";

import { axiosAuthInstance, endpoints } from "../../api/axios";
import { tf, useTranslation } from "../../i18n/i18n";
import { hocColors, hocPanelSx, hocPrimaryButtonSx } from "../hocTheme";
import { useAuthContext } from "./context/auth_context";
import { GoogleSignInButton } from "./GoogleSignInButton";

const isOpaqueValue = (value: unknown): value is string =>
    typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);

const subscribeToFragment = (notify: () => void) => {
    window.addEventListener("hashchange", notify);
    return () => window.removeEventListener("hashchange", notify);
};
const currentFragment = () => window.location.hash;

export default function DesktopSignIn() {
    const fragment = useSyncExternalStore(subscribeToFragment, currentFragment);
    return <BrowserSignIn key={fragment} fragment={fragment} />;
}

function BrowserSignIn({ fragment }: { fragment: string }) {
    const { authenticated, loading, loginWithGoogle, user } = useAuthContext();
    const { t } = useTranslation();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [returnURL, setReturnURL] = useState("");
    const submitting = useRef(false);
    const params = new URLSearchParams(fragment.slice(1));
    const challenge = params.get("challenge");
    const state = params.get("state");
    const valid = isOpaqueValue(challenge) && isOpaqueValue(state);

    const continueOnMac = async (credential?: string) => {
        if (!valid || submitting.current) return;
        submitting.current = true;
        setBusy(true);
        setError("");
        try {
            if (credential) await loginWithGoogle(credential);
            if (currentFragment() !== fragment) return;
            const { data } = await axiosAuthInstance.post<{ code?: string }>(
                endpoints.auth.desktopGrant,
                { challenge },
                { headers: { "x-request-id": crypto.randomUUID() } },
            );
            if (!isOpaqueValue(data.code)) throw new Error("The sign-in service returned an invalid response.");
            if (currentFragment() !== fragment) return;
            const callback = new URL("io.heroesofcrypto.skirmish:/sign-in");
            callback.search = new URLSearchParams({ state, code: data.code }).toString();
            setReturnURL(callback.toString());
            window.location.replace(callback.toString());
        } catch (err: unknown) {
            setError(
                typeof err === "string"
                    ? err
                    : "Couldn’t finish signing in. Try again here or start a new sign-in from the Mac app.",
            );
        } finally {
            submitting.current = false;
            setBusy(false);
        }
    };

    return (
        <Box
            component="main"
            sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", p: 2, bgcolor: hocColors.black }}
        >
            <Sheet variant="outlined" sx={{ ...hocPanelSx, width: "100%", maxWidth: 380, borderRadius: "md", p: 3 }}>
                <Stack spacing={2}>
                    <Typography level="h2" component="h1" textColor={hocColors.parchment}>
                        Heroes of Crypto
                    </Typography>
                    <Typography textColor={hocColors.sidebarTitle}>
                        {t(valid ? "Sign in to the Mac app" : "Start sign-in from the Heroes of Crypto Mac app.")}
                    </Typography>
                    {valid &&
                        (loading ? (
                            <Typography role="status" textColor={hocColors.sidebarTitle}>
                                {t("Checking your session…")}
                            </Typography>
                        ) : (
                            <>
                                {returnURL && (
                                    <Button component="a" href={returnURL} sx={hocPrimaryButtonSx}>
                                        {t("Return to Heroes of Crypto")}
                                    </Button>
                                )}
                                {!returnURL && authenticated && user?.username && (
                                    <Button
                                        disabled={busy}
                                        onClick={() => void continueOnMac()}
                                        sx={hocPrimaryButtonSx}
                                    >
                                        {tf("Continue as {player}", { player: user.username })}
                                    </Button>
                                )}
                                {!returnURL && (
                                    <GoogleSignInButton
                                        action="login"
                                        disabled={busy}
                                        onCredential={(credential) => void continueOnMac(credential)}
                                    />
                                )}
                            </>
                        ))}
                    {busy && <Typography role="status">{t("Returning to the Mac app…")}</Typography>}
                    {error && <Alert color="danger">{t(error)}</Alert>}
                </Stack>
            </Sheet>
        </Box>
    );
}
