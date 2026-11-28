import CssBaseline from "@mui/joy/CssBaseline";
import { CssVarsProvider } from "@mui/joy/styles";
import React from "react";
import { createRoot } from "react-dom/client";

import { setLanguage } from "../../i18n/i18n";
import { hocJoyTheme } from "../hocTheme";
import { AuthProvider } from "./context/auth_provider";
import DesktopSignIn from "./DesktopSignIn";

const container = document.getElementById("desktop-sign-in");
if (container) {
    const language = new URLSearchParams(window.location.search).get("lang");
    if (language) setLanguage(language, { persist: false });
    createRoot(container).render(
        <CssVarsProvider theme={hocJoyTheme} defaultMode="dark">
            <CssBaseline />
            <AuthProvider>
                <DesktopSignIn />
            </AuthProvider>
        </CssVarsProvider>,
    );
}
