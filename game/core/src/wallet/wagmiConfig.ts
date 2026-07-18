import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";

import { mainnet } from "wagmi/chains";

import { readEnvString } from "../ui/env";

const WC_PROJECT_ID_PATTERN = /^[0-9a-f]{32}$/i;
const INJECTED_ONLY_WALLETS = [{ groupName: "Installed", wallets: [injectedWallet] }];

export const normalizeWalletConnectProjectId = (value: string | undefined): string | undefined => {
    const candidate = value?.trim();
    if (!candidate || !WC_PROJECT_ID_PATTERN.test(candidate) || /^0{32}$/.test(candidate)) {
        return undefined;
    }
    return candidate;
};

export const createWagmiConfig = (projectId: string | undefined) => {
    const walletConnectProjectId = normalizeWalletConnectProjectId(projectId);

    return getDefaultConfig({
        appName: "Heroes of Crypto",
        projectId: walletConnectProjectId ?? "",
        wallets: walletConnectProjectId ? undefined : INJECTED_ONLY_WALLETS,
        chains: [mainnet],
        ssr: false,
    });
};

export const wagmiConfig = createWagmiConfig(readEnvString("VITE_WC_PROJECT_ID", "WC_PROJECT_ID"));
