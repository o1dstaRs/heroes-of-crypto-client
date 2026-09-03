import React, { Suspense } from "react";

const UpNextOverlayRuntime = React.lazy(() =>
    import("./UpNextOverlayRuntime").then(({ UpNextOverlay }) => ({ default: UpNextOverlay })),
);

export const UpNextOverlay: React.FC = () => (
    <Suspense fallback={null}>
        <UpNextOverlayRuntime />
    </Suspense>
);
