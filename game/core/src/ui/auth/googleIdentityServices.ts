export const GOOGLE_IDENTITY_SCRIPT_URL = "https://accounts.google.com/gsi/client";

export type GoogleCredentialResponse = {
    credential: string;
    select_by?: string;
    state?: string;
};

export type GoogleButtonConfiguration = {
    type: "standard";
    theme: "outline";
    size: "large";
    text: "signin_with" | "signup_with" | "continue_with";
    shape: "rectangular";
    logo_alignment: "left";
    width: number;
    state: string;
};

export type GoogleIdentityApi = {
    initialize: (configuration: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
        auto_select: boolean;
    }) => void;
    renderButton: (parent: HTMLElement, configuration: GoogleButtonConfiguration) => void;
    disableAutoSelect?: () => void;
};

declare global {
    interface Window {
        google?: {
            accounts?: {
                id?: GoogleIdentityApi;
            };
        };
    }
}

let scriptPromise: Promise<GoogleIdentityApi> | null = null;
let initializedClientId = "";
const credentialHandlers = new Map<string, (credential: string) => void>();

const currentApi = (): GoogleIdentityApi | undefined => window.google?.accounts?.id;

const dispatchCredential = (response: GoogleCredentialResponse): void => {
    if (!response.credential) {
        return;
    }
    if (response.state) {
        credentialHandlers.get(response.state)?.(response.credential);
        return;
    }
    if (credentialHandlers.size === 1) {
        credentialHandlers.values().next().value?.(response.credential);
    }
};

export const loadGoogleIdentityServices = (): Promise<GoogleIdentityApi> => {
    const loaded = currentApi();
    if (loaded) {
        return Promise.resolve(loaded);
    }
    if (scriptPromise) {
        return scriptPromise;
    }

    scriptPromise = new Promise<GoogleIdentityApi>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT_URL}"]`);
        const script = existing ?? document.createElement("script");
        const handleLoad = () => {
            const api = currentApi();
            if (api) {
                resolve(api);
            } else {
                scriptPromise = null;
                reject(new Error("Google Identity Services did not initialize"));
            }
        };
        const handleError = () => {
            scriptPromise = null;
            reject(new Error("Could not load Google sign-in"));
        };

        script.addEventListener("load", handleLoad, { once: true });
        script.addEventListener("error", handleError, { once: true });
        if (!existing) {
            script.src = GOOGLE_IDENTITY_SCRIPT_URL;
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);
        }
    });

    return scriptPromise;
};

export const renderGoogleIdentityButton = (
    api: GoogleIdentityApi,
    parent: HTMLElement,
    options: {
        clientId: string;
        state: string;
        action: "login" | "signup" | "link";
        width: number;
        onCredential: (credential: string) => void;
    },
): (() => void) => {
    const clientId = options.clientId.trim();
    if (!clientId) {
        throw new Error("Google sign-in is not configured");
    }
    if (initializedClientId && initializedClientId !== clientId) {
        throw new Error("Google Identity Services was initialized with a different client ID");
    }
    if (!initializedClientId) {
        api.initialize({ client_id: clientId, callback: dispatchCredential, auto_select: false });
        initializedClientId = clientId;
    }

    credentialHandlers.set(options.state, options.onCredential);
    parent.replaceChildren();
    api.renderButton(parent, {
        type: "standard",
        theme: "outline",
        size: "large",
        text:
            options.action === "login" ? "signin_with" : options.action === "signup" ? "signup_with" : "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: Math.max(200, Math.min(400, Math.floor(options.width))),
        state: options.state,
    });

    return () => {
        credentialHandlers.delete(options.state);
        parent.replaceChildren();
    };
};

export const disableGoogleAutoSelect = (): void => {
    currentApi()?.disableAutoSelect?.();
};

export const resetGoogleIdentityServicesForTests = (): void => {
    scriptPromise = null;
    initializedClientId = "";
    credentialHandlers.clear();
};
