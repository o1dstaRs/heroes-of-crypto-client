import React from "react";
import SplashScreen from "../../SplashScreen";

import { AuthContext } from "./auth_context";
import { JWTContextType } from "./types";

// ----------------------------------------------------------------------

type Props = {
    children: React.ReactNode;
};

export function AuthConsumer({ children }: Props) {
    return (
        <AuthContext.Consumer>
            {(auth: JWTContextType) => (auth.loading ? <SplashScreen /> : children)}
        </AuthContext.Consumer>
    );
}
