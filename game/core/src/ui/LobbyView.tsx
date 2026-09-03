import React, { Suspense } from "react";

const LobbyViewRuntime = React.lazy(() =>
    import("./LobbyViewRuntime").then(({ LobbyView }) => ({ default: LobbyView })),
);

export const LobbyView: React.FC = () => (
    <Suspense fallback={null}>
        <LobbyViewRuntime />
    </Suspense>
);
