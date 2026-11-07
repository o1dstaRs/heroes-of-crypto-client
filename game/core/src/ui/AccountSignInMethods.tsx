import { Alert, Box, Button, Divider, FormControl, FormLabel, Input, Sheet, Stack, Typography } from "@mui/joy";
import React, { useCallback, useEffect, useState } from "react";

import { useAuthContext } from "./auth/context/auth_context";
import type { GoogleAuthStatus } from "./auth/context/types";
import { GoogleSignInButton } from "./auth/GoogleSignInButton";
import { hocColors, hocInputSx, hocPanelSx, hocPrimaryButtonSx } from "./hocTheme";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,50}$/;
const passwordRequirements =
    "Password must be 8-50 characters and include uppercase, lowercase, number, and special character";

const messageFromError = (error: unknown, fallback: string): string => {
    if (typeof error === "string") {
        return error;
    }
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
};

interface AccountSignInMethodsProps {
    compact?: boolean;
}

export const AccountSignInMethods: React.FC<AccountSignInMethodsProps> = ({ compact = false }) => {
    const { authenticated, user, requestEmailLink, confirmEmailLink, getGoogleAuthStatus, linkGoogle, unlinkGoogle } =
        useAuthContext();
    const [googleStatus, setGoogleStatus] = useState<GoogleAuthStatus>({
        linked: false,
        email: "",
        hasPasswordLogin: false,
    });
    const [busy, setBusy] = useState(false);
    const [loadingMethods, setLoadingMethods] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [emailCodeSent, setEmailCodeSent] = useState(false);

    const accountEmail = user?.email?.trim() || googleStatus.email;
    const canUnlinkGoogle = googleStatus.hasPasswordLogin;

    const loadAuthMethods = useCallback(async () => {
        if (!authenticated) {
            setGoogleStatus({ linked: false, email: "", hasPasswordLogin: false });
            return;
        }
        setLoadingMethods(true);
        const [googleResult] = await Promise.allSettled([getGoogleAuthStatus()]);
        if (googleResult.status === "fulfilled") {
            setGoogleStatus(googleResult.value);
        }
        setLoadingMethods(false);
    }, [authenticated, getGoogleAuthStatus]);

    useEffect(() => {
        void loadAuthMethods();
    }, [loadAuthMethods]);

    useEffect(() => {
        if (!email && accountEmail) {
            setEmail(accountEmail);
        }
    }, [accountEmail, email]);

    const handleGoogleCredential = async (credential: string) => {
        setError("");
        setNotice("");
        setBusy(true);
        try {
            const status = await linkGoogle(credential);
            setGoogleStatus(status);
            setNotice(`Google sign-in linked${status.email ? ` as ${status.email}` : ""}`);
        } catch (err: unknown) {
            setError(messageFromError(err, "Failed to link Google sign-in"));
        } finally {
            setBusy(false);
        }
    };

    const handleGoogleUnlink = async () => {
        if (!canUnlinkGoogle) {
            setError("Add another sign-in method before unlinking Google");
            return;
        }
        setError("");
        setNotice("");
        setBusy(true);
        try {
            setGoogleStatus(await unlinkGoogle());
            setNotice("Google sign-in unlinked");
        } catch (err: unknown) {
            setError(messageFromError(err, "Failed to unlink Google sign-in"));
        } finally {
            setBusy(false);
        }
    };

    const handleRequestEmail = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        setNotice("");

        if (!emailPattern.test(email)) {
            setError("Enter a valid email");
            return;
        }
        if (!passwordPattern.test(password)) {
            setError(passwordRequirements);
            return;
        }

        setBusy(true);
        try {
            await requestEmailLink(email);
            setEmailCodeSent(true);
            setNotice("Verification code sent");
        } catch (err: unknown) {
            setError(messageFromError(err, "Failed to send verification code"));
        } finally {
            setBusy(false);
        }
    };

    const handleConfirmEmail = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        setNotice("");

        if (!emailPattern.test(email)) {
            setError("Enter a valid email");
            return;
        }
        if (!passwordPattern.test(password)) {
            setError(passwordRequirements);
            return;
        }
        if (!code.trim()) {
            setError("Enter the verification code");
            return;
        }

        setBusy(true);
        try {
            await confirmEmailLink(email, password, code.trim());
            setGoogleStatus(await getGoogleAuthStatus());
            setEmailCodeSent(false);
            setPassword("");
            setCode("");
            setNotice("Email login enabled");
        } catch (err: unknown) {
            setError(messageFromError(err, "Failed to add email"));
        } finally {
            setBusy(false);
        }
    };

    if (!authenticated) {
        return null;
    }

    return (
        <Sheet
            variant="outlined"
            sx={{
                width: "100%",
                p: compact ? 1 : 1.25,
                borderRadius: "md",
                ...hocPanelSx,
            }}
        >
            <Stack spacing={compact ? 0.85 : 1.1}>
                <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography level="title-sm" textColor={hocColors.parchment}>
                            Account
                        </Typography>
                        <Typography level="body-xs" textColor={hocColors.muted} noWrap>
                            {accountEmail || "Email account"}
                        </Typography>
                    </Box>
                </Box>

                {!compact && !googleStatus.hasPasswordLogin && (
                    <Box component="form" onSubmit={emailCodeSent ? handleConfirmEmail : handleRequestEmail}>
                        <Stack spacing={0.75}>
                            <Typography level="body-xs" textColor={hocColors.muted}>
                                {accountEmail ? "Add password login" : "Add email login"}
                            </Typography>
                            <FormControl size="sm">
                                <FormLabel sx={{ color: hocColors.mutedStrong }}>Email</FormLabel>
                                <Input
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    placeholder="you@example.com"
                                    disabled={busy || emailCodeSent || Boolean(accountEmail)}
                                    sx={hocInputSx}
                                />
                            </FormControl>
                            <FormControl size="sm">
                                <FormLabel sx={{ color: hocColors.mutedStrong }}>Password</FormLabel>
                                <Input
                                    type="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder="8+ characters"
                                    disabled={busy}
                                    sx={hocInputSx}
                                />
                            </FormControl>
                            {emailCodeSent && (
                                <FormControl size="sm">
                                    <FormLabel sx={{ color: hocColors.mutedStrong }}>Code</FormLabel>
                                    <Input
                                        value={code}
                                        onChange={(event) => setCode(event.target.value)}
                                        placeholder="verification code"
                                        disabled={busy}
                                        sx={hocInputSx}
                                    />
                                </FormControl>
                            )}
                            <Button type="submit" size="sm" variant="solid" disabled={busy} sx={hocPrimaryButtonSx}>
                                {emailCodeSent ? "Confirm Email" : "Send Code"}
                            </Button>
                            {emailCodeSent && (
                                <Button
                                    size="sm"
                                    variant="plain"
                                    color="neutral"
                                    disabled={busy}
                                    onClick={() => {
                                        setEmailCodeSent(false);
                                        setCode("");
                                    }}
                                    sx={{ color: hocColors.mutedStrong }}
                                >
                                    Change Email
                                </Button>
                            )}
                        </Stack>
                    </Box>
                )}

                {!compact && <Divider sx={{ borderColor: hocColors.orangeBorder }} />}

                {!compact && (
                    <Stack spacing={0.75}>
                        <Typography level="body-xs" textColor={hocColors.muted}>
                            Google sign-in
                        </Typography>
                        {loadingMethods ? (
                            <Typography level="body-xs" textColor="rgba(239, 228, 204, 0.52)">
                                Loading sign-in methods...
                            </Typography>
                        ) : googleStatus.linked ? (
                            <Box
                                sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}
                            >
                                <Typography level="body-xs" textColor={hocColors.mutedStrong} noWrap>
                                    {googleStatus.email || "Google account"}
                                </Typography>
                                <Button
                                    size="sm"
                                    variant="plain"
                                    color="neutral"
                                    onClick={() => void handleGoogleUnlink()}
                                    disabled={busy || !canUnlinkGoogle}
                                    sx={{ color: hocColors.mutedStrong }}
                                >
                                    Unlink
                                </Button>
                            </Box>
                        ) : (
                            <GoogleSignInButton
                                action="link"
                                disabled={busy}
                                onCredential={(credential) => void handleGoogleCredential(credential)}
                            />
                        )}
                    </Stack>
                )}

                {notice && (
                    <Alert size="sm" variant="soft" color="success">
                        {notice}
                    </Alert>
                )}
                {error && (
                    <Alert size="sm" variant="soft" color="danger">
                        {error}
                    </Alert>
                )}
            </Stack>
        </Sheet>
    );
};
