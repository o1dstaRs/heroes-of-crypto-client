import React, { Suspense } from "react";

const PopoverRuntime = React.lazy(() => import("./PopoverRuntime"));

const Popover: React.FC = () => (
    <Suspense fallback={null}>
        <PopoverRuntime />
    </Suspense>
);

export default Popover;
