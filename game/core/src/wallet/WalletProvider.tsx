import React from "react";

const WalletRuntimeProvider = React.lazy(() =>
    import("./WalletRuntimeProvider").then((module) => ({ default: module.WalletRuntimeProvider })),
);

type Props = {
    children: React.ReactNode;
};

export const WalletProvider = ({ children }: Props) => {
    return (
        // WalletConnect, RainbowKit, Wagmi, and their modal adapters are substantial. The offline
        // sandbox never mounts this boundary, so keep that runtime out of its initial download.
        <React.Suspense fallback={null}>
            <WalletRuntimeProvider>{children}</WalletRuntimeProvider>
        </React.Suspense>
    );
};
