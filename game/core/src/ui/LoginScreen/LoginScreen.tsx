import { useConnectModal } from "@rainbow-me/rainbowkit";

import { Alert, Box, Button, Divider, FormControl, FormLabel, Input, Sheet, Stack, Typography } from "@mui/joy";
import React, { useEffect, useRef, useState } from "react";

import { useAccount, useSignMessage } from "wagmi";

import { useAuthContext } from "../auth/context/auth_context";
import { hocColors, hocInputSx, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "../hocTheme";

type Mode = "login" | "register" | "verify";

const shortAddress = (address: string): string => `${address.slice(0, 6)}…${address.slice(-4)}`;

export const LoginScreen: React.FC = () => {
    const { login, register, loginWithWallet, confirmCode, requestCode, logout, user, authenticated } =
        useAuthContext();
    const { openConnectModal } = useConnectModal();
    const { address, isConnected } = useAccount();
    const { signMessageAsync } = useSignMessage();

    const [mode, setMode] = useState<Mode>("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [info, setInfo] = useState("");
    const [busy, setBusy] = useState(false);
    const [userClickedConnect, setUserClickedConnect] = useState(false);
    const attemptedRef = useRef<string | null>(null);

    // An authenticated-but-inactive account (registered by email, never verified) must complete
    // email verification before it can enter the app. Show the code-entry step for such an account,
    // and also right after a fresh registration (which starts inactive).
    const mustVerify = user?.is_active === false;
    const showVerify = mustVerify || mode === "verify";
    const verifyEmail = email || user?.email || "";

    const signInWithWallet = (walletAddress: string) => {
        setError("");
        setBusy(true);
        loginWithWallet(walletAddress, (message) => signMessageAsync({ message }))
            .catch((err: unknown) => setError((err as Error)?.message ?? "Wallet sign-in failed"))
            .finally(() => setBusy(false));
    };

    const handleConnectClick = () => {
        if (isConnected && address) {
            attemptedRef.current = address;
            signInWithWallet(address);
            return;
        }
        setUserClickedConnect(true);
        openConnectModal?.();
    };

    useEffect(() => {
        if (
            isConnected &&
            address &&
            userClickedConnect &&
            !busy &&
            !authenticated &&
            attemptedRef.current !== address
        ) {
            attemptedRef.current = address;
            setUserClickedConnect(false);
            signInWithWallet(address);
        }
    }, [isConnected, address, userClickedConnect, busy, authenticated]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        setInfo("");
        setBusy(true);
        try {
            if (mode === "login") {
                await login(email, password);
            } else {
                await register(email, password, username);
                setInfo(`We sent a verification code to ${email}. Enter it below to activate your account.`);
                setMode("verify");
            }
        } catch (err) {
            setError((err as Error)?.message ?? "Something went wrong");
        } finally {
            setBusy(false);
        }
    };

    const handleVerify = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        setInfo("");
        setBusy(true);
        try {
            await confirmCode(verifyEmail, code.trim());
            // On success the account becomes active and the app guard swaps this screen for the game.
        } catch (err) {
            setError((err as Error)?.message ?? "Invalid or expired code");
        } finally {
            setBusy(false);
        }
    };

    const handleResendCode = async () => {
        if (!verifyEmail) {
            return;
        }
        setError("");
        setBusy(true);
        try {
            await requestCode(verifyEmail);
            setInfo(`A new code is on its way to ${verifyEmail}.`);
        } catch (err) {
            setError((err as Error)?.message ?? "Could not resend the code");
        } finally {
            setBusy(false);
        }
    };

    const handleBackToSignIn = async () => {
        setError("");
        setInfo("");
        setCode("");
        // An inactive account is still authenticated; drop its session so the login form returns.
        if (mustVerify) {
            try {
                await logout();
            } catch {
                /* ignore */
            }
        }
        setMode("login");
    };

    return (
        <Box
            sx={{
                position: "fixed",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: hocColors.black,
            }}
        >
            <Sheet
                variant="outlined"
                sx={{
                    width: 380,
                    maxWidth: "92vw",
                    p: 3,
                    borderRadius: "md",
                    ...hocPanelSx,
                }}
            >
                <Stack spacing={2}>
                    <Box>
                        <Typography level="h4" textColor={hocColors.parchment}>
                            Heroes of Crypto
                        </Typography>
                        <Typography level="body-sm" textColor={hocColors.muted}>
                            {showVerify ? "Verify your email to continue" : "Sign in to continue"}
                        </Typography>
                    </Box>

                    {showVerify ? (
                        <Stack spacing={1.5}>
                            <Typography level="body-sm" textColor={hocColors.mutedStrong}>
                                Enter the verification code we sent to {verifyEmail || "your email address"}.
                            </Typography>
                            <form onSubmit={handleVerify}>
                                <Stack spacing={1.5}>
                                    <FormControl>
                                        <FormLabel sx={{ color: hocColors.mutedStrong }}>Verification code</FormLabel>
                                        <Input
                                            value={code}
                                            onChange={(e) => setCode(e.target.value)}
                                            placeholder="Enter code"
                                            required
                                            sx={hocInputSx}
                                        />
                                    </FormControl>
                                    <Button
                                        type="submit"
                                        variant="solid"
                                        disabled={busy || !code.trim()}
                                        sx={hocPrimaryButtonSx}
                                    >
                                        {busy ? "Please wait…" : "Verify & Activate"}
                                    </Button>
                                </Stack>
                            </form>
                            <Button
                                fullWidth
                                variant="soft"
                                disabled={busy || !verifyEmail}
                                onClick={handleResendCode}
                                sx={hocSoftButtonSx}
                            >
                                Resend code
                            </Button>
                            <Button
                                fullWidth
                                variant="plain"
                                disabled={busy}
                                onClick={handleBackToSignIn}
                                sx={{ color: hocColors.muted }}
                            >
                                Back to sign in
                            </Button>
                        </Stack>
                    ) : (
                        <>
                            <Stack direction="row" spacing={1}>
                                <Button
                                    fullWidth
                                    variant={mode === "login" ? "solid" : "soft"}
                                    onClick={() => setMode("login")}
                                    sx={mode === "login" ? hocPrimaryButtonSx : hocSoftButtonSx}
                                >
                                    Sign In
                                </Button>
                                <Button
                                    fullWidth
                                    variant={mode === "register" ? "solid" : "soft"}
                                    onClick={() => setMode("register")}
                                    sx={mode === "register" ? hocPrimaryButtonSx : hocSoftButtonSx}
                                >
                                    Create Account
                                </Button>
                            </Stack>

                            <form onSubmit={handleSubmit}>
                                <Stack spacing={1.5}>
                                    {mode === "register" && (
                                        <FormControl>
                                            <FormLabel sx={{ color: hocColors.mutedStrong }}>Username</FormLabel>
                                            <Input
                                                value={username}
                                                onChange={(e) => setUsername(e.target.value)}
                                                placeholder="username"
                                                required
                                                sx={hocInputSx}
                                            />
                                        </FormControl>
                                    )}
                                    <FormControl>
                                        <FormLabel sx={{ color: hocColors.mutedStrong }}>Email</FormLabel>
                                        <Input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="you@example.com"
                                            required
                                            sx={hocInputSx}
                                        />
                                    </FormControl>
                                    <FormControl>
                                        <FormLabel sx={{ color: hocColors.mutedStrong }}>Password</FormLabel>
                                        <Input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            required
                                            sx={hocInputSx}
                                        />
                                    </FormControl>
                                    <Button type="submit" variant="solid" disabled={busy} sx={hocPrimaryButtonSx}>
                                        {busy ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
                                    </Button>
                                </Stack>
                            </form>

                            <Divider sx={{ color: hocColors.muted, borderColor: hocColors.orangeBorder }}>or</Divider>

                            <Button
                                fullWidth
                                variant="soft"
                                disabled={busy}
                                onClick={handleConnectClick}
                                sx={hocSoftButtonSx}
                            >
                                {busy
                                    ? "Waiting for signature…"
                                    : isConnected && address
                                      ? `Sign in with ${shortAddress(address)}`
                                      : "Connect Wallet"}
                            </Button>
                        </>
                    )}

                    {info && (
                        <Alert variant="soft" color="success">
                            {info}
                        </Alert>
                    )}

                    {error && (
                        <Alert variant="soft" color="danger">
                            {error}
                        </Alert>
                    )}
                </Stack>
            </Sheet>
        </Box>
    );
};
