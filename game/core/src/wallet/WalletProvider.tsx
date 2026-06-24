import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { WagmiProvider } from "wagmi";

import { wagmiConfig } from "./wagmiConfig";

const queryClient = new QueryClient();

type Props = {
    children: React.ReactNode;
};

export const WalletProvider = ({ children }: Props) => {
    return (
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider theme={darkTheme()}>{children}</RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
};
