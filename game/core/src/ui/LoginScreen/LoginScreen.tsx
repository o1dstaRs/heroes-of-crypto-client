import { useConnectModal } from "@rainbow-me/rainbowkit";

import { Alert, Box, Button, Divider, FormControl, FormLabel, Input, Sheet, Stack, Typography } from "@mui/joy";
import React, { useEffect, useRef, useState } from "react";

import { useAccount, useSignMessage } from "wagmi";

import { useAuthContext } from "../auth/context/auth_context";

type Mode = "login" | "register";

const shortAddress = (address: string): string => `${address.slice(0, 6)}…${address.slice(-4)}`;

export const LoginScreen: React.FC = () => {
    const { login, register, loginWithWallet, authenticated } = useAuthContext();
    const { openConnectModal } = useConnectModal();
    const { address, isConnected } = useAccount();
    const { signMessageAsync } = useSignMessage();

    const [mode, setMode] = useState<Mode>("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [userClickedConnect, setUserClickedConnect] = useState(false);
    const attemptedRef = useRef<string | null>(null);

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
        setBusy(true);
        try {
            if (mode === "login") {
                await login(email, password);
            } else {
                await register(email, password, username);
            }
        } catch (err) {
            setError((err as Error)?.message ?? "Something went wrong");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Box
            sx={{
                position: "fixed",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(10, 12, 20, 0.96)",
            }}
        >
            <Sheet
                variant="outlined"
                sx={{
                    width: 380,
                    maxWidth: "92vw",
                    p: 3,
                    borderRadius: "md",
                    bgcolor: "rgba(20, 24, 36, 0.9)",
                    borderColor: "rgba(255,255,255,0.12)",
                    color: "#fff",
                }}
            >
                <Stack spacing={2}>
                    <Box>
                        <Typography level="h4" textColor="#fff">
                            Heroes of Crypto
                        </Typography>
                        <Typography level="body-sm" textColor="rgba(255,255,255,0.6)">
                            Sign in to continue
                        </Typography>
                    </Box>

                    <Stack direction="row" spacing={1}>
                        <Button
                            fullWidth
                            variant={mode === "login" ? "solid" : "soft"}
                            color="primary"
                            onClick={() => setMode("login")}
                        >
                            Sign In
                        </Button>
                        <Button
                            fullWidth
                            variant={mode === "register" ? "solid" : "soft"}
                            color="primary"
                            onClick={() => setMode("register")}
                        >
                            Create Account
                        </Button>
                    </Stack>

                    <form onSubmit={handleSubmit}>
                        <Stack spacing={1.5}>
                            {mode === "register" && (
                                <FormControl>
                                    <FormLabel sx={{ color: "rgba(255,255,255,0.7)" }}>Username</FormLabel>
                                    <Input
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="username"
                                        required
                                    />
                                </FormControl>
                            )}
                            <FormControl>
                                <FormLabel sx={{ color: "rgba(255,255,255,0.7)" }}>Email</FormLabel>
                                <Input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    required
                                />
                            </FormControl>
                            <FormControl>
                                <FormLabel sx={{ color: "rgba(255,255,255,0.7)" }}>Password</FormLabel>
                                <Input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                />
                            </FormControl>
                            <Button type="submit" variant="solid" color="primary" disabled={busy}>
                                {busy ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
                            </Button>
                        </Stack>
                    </form>

                    <Divider sx={{ color: "rgba(255,255,255,0.4)" }}>or</Divider>

                    <Button
                        fullWidth
                        variant="soft"
                        color="neutral"
                        disabled={busy}
                        onClick={handleConnectClick}
                        sx={{ color: "#fff" }}
                    >
                        {busy
                            ? "Waiting for signature…"
                            : isConnected && address
                              ? `Sign in with ${shortAddress(address)}`
                              : "Connect Wallet"}
                    </Button>

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
