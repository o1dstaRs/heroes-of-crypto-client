import { useConnectModal } from "@rainbow-me/rainbowkit";

import { Alert, Box, Button, Divider, FormControl, FormLabel, Input, Sheet, Stack, Typography } from "@mui/joy";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAccount, useDisconnect, useSignMessage } from "wagmi";

import { useAuthContext } from "./auth/context/auth_context";
import { hocColors, hocInputSx, hocPanelSx, hocPrimaryButtonSx, hocSoftButtonSx } from "./hocTheme";

const shortAddress = (address: string): string => `${address.slice(0, 6)}…${address.slice(-4)}`;
const normalizeAddress = (address: string): string => address.toLowerCase();
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

interface WalletLinkerProps {
    compact?: boolean;
}

export const WalletLinker: React.FC<WalletLinkerProps> = ({ compact = false }) => {
    const { authenticated, user, getWallets, linkWallet, unlinkWallet, requestEmailLink, confirmEmailLink } =
        useAuthContext();
    const { address, isConnected } = useAccount();
    const { signMessageAsync } = useSignMessage();
    const { disconnectAsync } = useDisconnect();
    const { openConnectModal } = useConnectModal();

    const [linked, setLinked] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [loadingWallets, setLoadingWallets] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [connectIntent, setConnectIntent] = useState<"link" | null>(null);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [emailCodeSent, setEmailCodeSent] = useState(false);
    const lastAutoLinkRef = useRef<string | null>(null);

    const hasEmail = !!user?.email?.trim();
    const normalizedLinked = useMemo(() => new Set(linked.map(normalizeAddress)), [linked]);
    const isLinked = !!address && normalizedLinked.has(normalizeAddress(address));
    const canUnlink = hasEmail || linked.length > 1;

    const loadWallets = useCallback(async () => {
        if (!authenticated) {
            setLinked([]);
            return;
        }
        setLoadingWallets(true);
        try {
            setLinked(await getWallets());
        } catch {
            setLinked([]);
        } finally {
            setLoadingWallets(false);
        }
    }, [authenticated, getWallets]);

    useEffect(() => {
        void loadWallets();
    }, [loadWallets]);

    const handleLink = useCallback(
        async (walletAddress: string) => {
            setError("");
            setNotice("");
            setBusy(true);
            try {
                const addresses = await linkWallet(walletAddress, (message) => signMessageAsync({ message }));
                setLinked(addresses);
                setNotice(`Linked ${shortAddress(walletAddress)}`);
            } catch (err: unknown) {
                setError(messageFromError(err, "Failed to link wallet"));
            } finally {
                setBusy(false);
            }
        },
        [linkWallet, signMessageAsync],
    );

    useEffect(() => {
        if (!connectIntent || !isConnected || !address || busy) {
            return;
        }

        const normalizedAddress = normalizeAddress(address);
        if (lastAutoLinkRef.current === normalizedAddress) {
            return;
        }

        lastAutoLinkRef.current = normalizedAddress;
        setConnectIntent(null);

        if (normalizedLinked.has(normalizedAddress)) {
            setNotice(`Using linked wallet ${shortAddress(address)}`);
            return;
        }

        void handleLink(address);
    }, [address, busy, connectIntent, handleLink, isConnected, normalizedLinked]);

    const handleUnlink = async (walletAddress: string) => {
        if (!canUnlink) {
            setError("Add an email or link another wallet before unlinking this wallet");
            return;
        }

        setError("");
        setNotice("");
        setBusy(true);
        try {
            const addresses = await unlinkWallet(walletAddress);
            setLinked(addresses);
            setNotice(`Unlinked ${shortAddress(walletAddress)}`);
        } catch (err: unknown) {
            setError(messageFromError(err, "Failed to unlink wallet"));
        } finally {
            setBusy(false);
        }
    };

    const handleConnectClick = () => {
        setError("");
        setNotice("");
        if (!isConnected) {
            setConnectIntent("link");
            openConnectModal?.();
            return;
        }
        if (address && !isLinked) {
            void handleLink(address);
            return;
        }
        if (address) {
            setNotice(`Using linked wallet ${shortAddress(address)}`);
        }
    };

    const handleSwitchWallet = async () => {
        setError("");
        setNotice("");
        setBusy(true);
        try {
            if (isConnected) {
                await disconnectAsync();
            }
            lastAutoLinkRef.current = null;
            setConnectIntent("link");
            openConnectModal?.();
        } catch (err: unknown) {
            setError(messageFromError(err, "Failed to switch wallet"));
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

    const walletActionLabel = busy
        ? "Working..."
        : !isConnected
          ? "Connect Wallet"
          : isLinked
            ? `Linked ${shortAddress(address as string)}`
            : `Link ${shortAddress(address as string)}`;

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
                            {compact ? "Wallet" : "Account"}
                        </Typography>
                        <Typography level="body-xs" textColor={hocColors.muted} noWrap>
                            {hasEmail ? user?.email : "Wallet account"}
                        </Typography>
                    </Box>
                    <Typography level="body-xs" textColor="rgba(239, 228, 204, 0.5)">
                        {linked.length} wallet{linked.length === 1 ? "" : "s"}
                    </Typography>
                </Box>

                {!compact && !hasEmail && (
                    <Box component="form" onSubmit={emailCodeSent ? handleConfirmEmail : handleRequestEmail}>
                        <Stack spacing={0.75}>
                            <Typography level="body-xs" textColor={hocColors.muted}>
                                Add email login
                            </Typography>
                            <FormControl size="sm">
                                <FormLabel sx={{ color: hocColors.mutedStrong }}>Email</FormLabel>
                                <Input
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    placeholder="you@example.com"
                                    disabled={busy || emailCodeSent}
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

                <Stack spacing={0.75}>
                    <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
                        <Button
                            size="sm"
                            variant="solid"
                            fullWidth={compact}
                            onClick={handleConnectClick}
                            disabled={busy}
                            sx={hocPrimaryButtonSx}
                        >
                            {walletActionLabel}
                        </Button>
                        <Button
                            size="sm"
                            variant={compact ? "soft" : "plain"}
                            onClick={handleSwitchWallet}
                            disabled={busy || !openConnectModal}
                            sx={compact ? hocSoftButtonSx : { color: hocColors.mutedStrong }}
                        >
                            Switch
                        </Button>
                    </Box>

                    {!compact &&
                        (loadingWallets ? (
                            <Typography level="body-xs" textColor="rgba(239, 228, 204, 0.52)">
                                Loading wallets...
                            </Typography>
                        ) : linked.length ? (
                            <Stack spacing={0.5}>
                                {linked.map((walletAddress) => {
                                    const connected =
                                        !!address && normalizeAddress(walletAddress) === normalizeAddress(address);
                                    return (
                                        <Box
                                            key={walletAddress}
                                            sx={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                gap: 1,
                                                minWidth: 0,
                                            }}
                                        >
                                            <Typography level="body-xs" textColor={hocColors.mutedStrong} noWrap>
                                                {shortAddress(walletAddress)}
                                                {connected ? " connected" : ""}
                                            </Typography>
                                            <Button
                                                size="sm"
                                                variant="plain"
                                                color="neutral"
                                                onClick={() => void handleUnlink(walletAddress)}
                                                disabled={busy || !canUnlink}
                                                sx={{ color: hocColors.mutedStrong }}
                                            >
                                                Unlink
                                            </Button>
                                        </Box>
                                    );
                                })}
                            </Stack>
                        ) : (
                            <Typography level="body-xs" textColor="rgba(239, 228, 204, 0.52)">
                                No linked wallet
                            </Typography>
                        ))}
                </Stack>

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
