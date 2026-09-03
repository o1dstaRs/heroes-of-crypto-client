import React, { Suspense } from "react";

import type { IWindowSize } from "../scenes/VisibleState";

const PlacementStepPreviewRuntime = React.lazy(() => import("./PlacementStepPreviewRuntime"));

export const PlacementStepPreview: React.FC<{ windowSize: IWindowSize }> = (props) => (
    <Suspense fallback={null}>
        <PlacementStepPreviewRuntime {...props} />
    </Suspense>
);

export default PlacementStepPreview;
