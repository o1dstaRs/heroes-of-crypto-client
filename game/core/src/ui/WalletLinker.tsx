import React from "react";

const WalletLinkerRuntime = React.lazy(() =>
    import("./WalletLinkerRuntime").then((module) => ({ default: module.WalletLinker })),
);

interface WalletLinkerProps {
    compact?: boolean;
}

export const WalletLinker: React.FC<WalletLinkerProps> = ({ compact = false }) => (
    // The account panel is conditional inside the sidebar. Keep its wallet adapters and forms out of
    // fight/sandbox startup when the panel is not rendered.
    <React.Suspense fallback={null}>
        <WalletLinkerRuntime compact={compact} />
    </React.Suspense>
);
