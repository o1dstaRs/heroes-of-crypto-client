import { useConnectModal } from "@rainbow-me/rainbowkit";

import { Box, Button, Typography } from "@mui/joy";
import React, { useEffect, useRef, useState } from "react";

import { useAccount, useSignMessage } from "wagmi";

import { useAuthContext } from "./auth/context/auth_context";

const shortAddress = (address: string): string => `${address.slice(0, 6)}…${address.slice(-4)}`;

export const WalletLinker: React.FC = () => {
    const { authenticated, getWallets, linkWallet, unlinkWallet } = useAuthContext();
    const { address, isConnected } = useAccount();
    const { signMessageAsync } = useSignMessage();
    const { openConnectModal } = useConnectModal();

    const [linked, setLinked] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const loadedRef = useRef(false);

    useEffect(() => {
        if (authenticated && !loadedRef.current) {
            loadedRef.current = true;
            getWallets()
                .then(setLinked)
                .catch(() => undefined);
        }
    }, [authenticated, getWallets]);

    const isLinked = !!address && linked.some((a) => a.toLowerCase() === address.toLowerCase());

    const handleLink = async (walletAddress: string) => {
        setError("");
        setBusy(true);
        try {
            const addresses = await linkWallet(walletAddress, (message) => signMessageAsync({ message }));
            setLinked(addresses);
        } catch (err) {
            setError((err as Error)?.message ?? "Failed to link wallet");
        } finally {
            setBusy(false);
        }
    };

    const handleUnlink = async () => {
        if (!address) {
            return;
        }
        setError("");
        setBusy(true);
        try {
            const addresses = await unlinkWallet(address);
            setLinked(addresses);
        } catch (err) {
            setError((err as Error)?.message ?? "Failed to unlink wallet");
        } finally {
            setBusy(false);
        }
    };

    const handleConnectClick = () => {
        setError("");
        if (!isConnected) {
            openConnectModal?.();
            return;
        }
        if (address && !isLinked) {
            void handleLink(address);
        }
    };

    if (!authenticated) {
        return null;
    }

    const label = busy
        ? "Working…"
        : !isConnected
          ? "Connect Wallet"
          : isLinked
            ? `Linked ${shortAddress(address as string)}`
            : `Link ${shortAddress(address as string)}`;

    return (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                {isConnected && isLinked && (
                    <Button size="sm" variant="plain" color="neutral" onClick={handleUnlink} disabled={busy}>
                        Unlink
                    </Button>
                )}
                <Button size="sm" variant="soft" color="primary" onClick={handleConnectClick} disabled={busy}>
                    {label}
                </Button>
            </Box>
            {error && (
                <Typography level="body-xs" textColor="danger">
                    {error}
                </Typography>
            )}
        </Box>
    );
};
