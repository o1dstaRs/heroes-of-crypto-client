import React from "react";

const AugmentStepPreviewRuntime = React.lazy(() =>
    import("./AugmentStepPreviewRuntime").then((module) => ({ default: module.AugmentStepPreview })),
);

/** Dev-preview boundary that keeps the draft component system out of ordinary startup. */
export const AugmentStepPreview: React.FC = () => (
    <React.Suspense fallback={null}>
        <AugmentStepPreviewRuntime />
    </React.Suspense>
);

export default AugmentStepPreview;
