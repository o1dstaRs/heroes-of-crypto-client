import { getDefaultConfig } from "@rainbow-me/rainbowkit";

import { mainnet } from "wagmi/chains";

import { readEnvString } from "../ui/env";

const WC_PROJECT_ID = readEnvString("VITE_WC_PROJECT_ID", "WC_PROJECT_ID") ?? "00000000000000000000000000000000";

export const wagmiConfig = getDefaultConfig({
    appName: "Heroes of Crypto",
    projectId: WC_PROJECT_ID,
    chains: [mainnet],
    ssr: false,
});
