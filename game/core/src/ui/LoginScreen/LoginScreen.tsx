import React, { Suspense } from "react";

const LoginScreenRuntime = React.lazy(() =>
    import("./LoginScreenRuntime").then(({ LoginScreen }) => ({ default: LoginScreen })),
);

export const LoginScreen: React.FC = () => (
    <Suspense fallback={null}>
        <LoginScreenRuntime />
    </Suspense>
);
