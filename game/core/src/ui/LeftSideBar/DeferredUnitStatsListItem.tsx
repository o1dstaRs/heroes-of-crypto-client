import ListItem from "@mui/joy/ListItem";
import React from "react";

import type { UnitStatsListItemProps } from "./unitStatsMemo";

const LazyUnitStatsListItem = React.lazy(() =>
    import("./UnitStatsListItem").then(({ UnitStatsListItem }) => ({ default: UnitStatsListItem })),
);

/**
 * The selected-unit card is one of the heaviest UI modules in the battle shell. Keep it out of the
 * initial route while the sidebar is empty, then load it only when the player actually inspects a unit.
 */
export const DeferredUnitStatsListItem: React.FC<UnitStatsListItemProps> = (props) => {
    if (!props.factionType) return <ListItem nested />;

    return (
        <React.Suspense fallback={<ListItem nested />}>
            <LazyUnitStatsListItem {...props} />
        </React.Suspense>
    );
};
