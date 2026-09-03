import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@mui/joy";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";

import { useAuthContext } from "../auth/context/auth_context";
import { hocSoftButtonSx } from "../hocTheme";

const shortAddress = (address: string): string => `${address.slice(0, 6)}…${address.slice(-4)}`;

type Props = {
    busy: boolean;
    onBusyChange: (busy: boolean) => void;
    onError: (message: string) => void;
};

export const LoginWalletButton = ({ busy, onBusyChange, onError }: Props) => {
    const { authenticated, loginWithWallet } = useAuthContext();
    const { openConnectModal } = useConnectModal();
    const { address, isConnected } = useAccount();
    const { signMessageAsync } = useSignMessage();
    const [userClickedConnect, setUserClickedConnect] = useState(false);
    const attemptedRef = useRef<string | null>(null);

    const signInWithWallet = useCallback(
        (walletAddress: string) => {
            onError("");
            onBusyChange(true);
            loginWithWallet(walletAddress, (message) => signMessageAsync({ message }))
                .catch((error: unknown) => onError((error as Error)?.message ?? "Wallet sign-in failed"))
                .finally(() => onBusyChange(false));
        },
        [loginWithWallet, onBusyChange, onError, signMessageAsync],
    );

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
    }, [address, authenticated, busy, isConnected, signInWithWallet, userClickedConnect]);

    return (
        <Button fullWidth variant="soft" disabled={busy} onClick={handleConnectClick} sx={hocSoftButtonSx}>
            {busy
                ? "Waiting for signature…"
                : isConnected && address
                  ? `Sign in with ${shortAddress(address)}`
                  : "Connect Wallet"}
        </Button>
    );
};
