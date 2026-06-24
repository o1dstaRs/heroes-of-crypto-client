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
        <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider
                    theme={darkTheme({
                        accentColor: "#ff8f00",
                        accentColorForeground: "#070504",
                        borderRadius: "small",
                        overlayBlur: "small",
                    })}
                >
                    {children}
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
};
