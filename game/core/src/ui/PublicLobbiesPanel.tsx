import React, { Suspense } from "react";

import type { PublicLobbiesPanelProps } from "./PublicLobbiesPanelRuntime";

const PublicLobbiesPanelRuntime = React.lazy(() =>
    import("./PublicLobbiesPanelRuntime").then(({ PublicLobbiesPanel }) => ({ default: PublicLobbiesPanel })),
);

export { lobbyStatusLabel } from "./lobbyStatusLabel";
export type { PublicLobbiesPanelProps } from "./PublicLobbiesPanelRuntime";

export const PublicLobbiesPanel: React.FC<PublicLobbiesPanelProps> = (props) => (
    <Suspense fallback={null}>
        <PublicLobbiesPanelRuntime {...props} />
    </Suspense>
);
