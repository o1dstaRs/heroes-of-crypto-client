import React from "react";

import { useAuthContext } from "../ui/auth/context/auth_context";

const WalletRuntimeProvider = React.lazy(() =>
    import("./WalletRuntimeProvider").then((module) => ({ default: module.WalletRuntimeProvider })),
);

type Props = {
    children: React.ReactNode;
};

export const WalletProvider = ({ children }: Props) => {
    const { authenticated } = useAuthContext();

    // Every live online route used to mount Wagmi, RainbowKit, WalletConnect and React Query even
    // after ordinary email/Google/wallet authentication had completed. Nothing below this boundary
    // currently consumes wallet hooks during matchmaking, draft or battle; the wallet runtime is
    // needed only by the signed-out LoginWalletButton. Passing authenticated players straight through
    // avoids downloading/initialising those providers and releases them immediately after sign-in.
    if (authenticated) return <>{children}</>;

    return (
        // WalletConnect, RainbowKit, Wagmi, and their modal adapters are substantial. Keep that runtime
        // behind both the route boundary and the signed-out state that can actually render its button.
        <React.Suspense fallback={null}>
            <WalletRuntimeProvider>{children}</WalletRuntimeProvider>
        </React.Suspense>
    );
};
