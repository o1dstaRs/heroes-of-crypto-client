import React, { Suspense } from "react";

const ObserverPickViewRuntime = React.lazy(() => import("./ObserverPickViewRuntime"));

interface IObserverPickViewProps {
    gameId: string;
    onPickPhaseChange?: (phase: number) => void;
}

export const ObserverPickView: React.FC<IObserverPickViewProps> = (props) => (
    <Suspense fallback={null}>
        <ObserverPickViewRuntime {...props} />
    </Suspense>
);

export default ObserverPickView;
