import React, { Suspense } from "react";

import type { SceneEntry } from "../../pixi/PixiScene";

const MainRuntime = React.lazy(() => import("./MainRuntime").then(({ Main }) => ({ default: Main })));

export const Main: React.FC<{ entry?: SceneEntry }> = (props) => (
    <Suspense fallback={null}>
        <MainRuntime {...props} />
    </Suspense>
);
