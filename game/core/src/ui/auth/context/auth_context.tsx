import { createContext, useContext } from "react";
import { JWTContextType } from "./types";

export const AuthContext = createContext({} as JWTContextType);

export const useAuthContext = () => {
    const context = useContext(AuthContext);

    if (!context) throw new Error("useAuthContext context must be use inside AuthProvider");

    return context;
};
