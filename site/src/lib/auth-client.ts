import {
    ConfirmCode,
    NewPlayer,
    RequestCode,
    ResetPassword,
    ResponseMe,
} from "@heroesofcrypto/common/src/generated/protobuf/v1/messages_reexports";

type AuthAction = "login" | "register" | "verify" | "forgot-password" | "reset-password";

const isProd =
    import.meta.env.PROD ||
    import.meta.env.VITE_IS_PROD === "true" ||
    import.meta.env.VITE_IS_PROD === true;

const authBaseUrl =
    import.meta.env.VITE_HOST_AUTH_API ||
    import.meta.env.VITE_AUTH_API ||
    (isProd ? "https://auth.heroesofcrypto.io" : "http://localhost:3001");

const gameClientUrl =
    import.meta.env.VITE_GAME_CLIENT ||
    import.meta.env.VITE_HOST_GAME_CLIENT ||
    (isProd ? "https://beta.heroesofcrypto.io/game" : "https://beta.heroesofcrypto.io");

const endpoints = {
    login: isProd ? "/v1/login" : "/v1/auth/login",
    register: isProd ? "/v1/register" : "/v1/auth/register",
    confirmCode: isProd ? "/v1/confirm-verification-code" : "/v1/auth/confirm-verification-code",
    requestCode: isProd ? "/v1/request-verification-code" : "/v1/auth/request-verification-code",
    requestPasswordReset: isProd ? "/v1/request-password-reset" : "/v1/auth/request-password-reset",
    resetPassword: isProd ? "/v1/reset-password" : "/v1/auth/reset-password",
};

const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,50}$/;
const usernamePattern = /^[a-zA-Z0-9]{3,42}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hexPattern = /^[0-9a-fA-F]+$/;

function requestId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function absoluteEndpoint(path: string) {
    return `${authBaseUrl.replace(/\/$/, "")}${path}`;
}

function hexToBytes(hex: string) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
}

async function responseMessage(response: Response) {
    const text = await response.text();
    if (text && text !== "Bad Request") {
        return `Request failed: ${text}`;
    }

    if (response.status === 400) {
        return "Request failed: Invalid inputs";
    }

    return `Request failed with status ${response.status}`;
}

async function postProto(path: string, body: Uint8Array, parseResponse = false) {
    const response = await fetch(absoluteEndpoint(path), {
        method: "POST",
        headers: {
            "Content-Type": "application/octet-stream",
            "x-request-id": requestId(),
        },
        body,
    });

    if (!response.ok) {
        throw new Error(await responseMessage(response));
    }

    const authorization = response.headers.get("authorization");
    const newToken = response.headers.get("x-new-token");
    const token = authorization || newToken;

    if (token) {
        localStorage.setItem("accessToken", token);
    }

    if (!parseResponse) {
        return null;
    }

    const responseBytes = new Uint8Array(await response.arrayBuffer());
    const user = ResponseMe.deserializeBinary(responseBytes).toObject();
    localStorage.setItem("hocAuthUser", JSON.stringify(user));
    return user;
}

function setStatus(form: HTMLFormElement, message: string, kind: "error" | "success" | "info") {
    const status = form.querySelector<HTMLElement>("[data-auth-status]");
    if (!status) return;

    status.textContent = message;
    status.dataset.kind = kind;
    status.hidden = false;
}

function setSubmitting(form: HTMLFormElement, submitting: boolean) {
    const submit = form.querySelector<HTMLButtonElement>("button[type='submit']");
    if (submit) submit.disabled = submitting;
    form.toggleAttribute("aria-busy", submitting);
}

function value(form: HTMLFormElement, name: string) {
    const input = form.elements.namedItem(name);
    return input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement ? input.value.trim() : "";
}

function validate(action: AuthAction, form: HTMLFormElement) {
    const email = value(form, "email");
    const password = value(form, "password");

    if (["login", "register", "verify", "forgot-password", "reset-password"].includes(action) && !emailPattern.test(email)) {
        return "Email must be a valid email address";
    }

    if (action === "register" && !usernamePattern.test(value(form, "username"))) {
        return "Username must be 3-42 letters or numbers";
    }

    if (["login", "register", "reset-password"].includes(action) && !passwordPattern.test(password)) {
        return "Password must be 8-50 characters and include uppercase, lowercase, number, and special character";
    }

    if (action === "reset-password" && value(form, "confirmPassword") !== password) {
        return "Passwords must match";
    }

    if (action === "verify" && value(form, "code").length < 6) {
        return "Code must be at least 6 characters";
    }

    if (action === "reset-password") {
        const token = value(form, "token");
        if (token.length !== 64 || !hexPattern.test(token)) {
            return "Token must be a 64-character hexadecimal string";
        }
    }

    return "";
}

async function submitAuthForm(form: HTMLFormElement) {
    const action = form.dataset.authAction as AuthAction;
    const successMessage = form.dataset.successMessage || "Success";
    const validationError = validate(action, form);

    if (validationError) {
        setStatus(form, validationError, "error");
        return;
    }

    setSubmitting(form, true);

    try {
        if (action === "login") {
            const request = new NewPlayer({ email: value(form, "email"), password: value(form, "password") });
            await postProto(endpoints.login, request.serializeBinary(), true);
        }

        if (action === "register") {
            const request = new NewPlayer({
                username: value(form, "username"),
                email: value(form, "email"),
                password: value(form, "password"),
            });
            await postProto(endpoints.register, request.serializeBinary(), true);
        }

        if (action === "verify") {
            const request = new ConfirmCode({ email: value(form, "email"), code: value(form, "code") });
            await postProto(endpoints.confirmCode, request.serializeBinary());
        }

        if (action === "forgot-password") {
            const request = new RequestCode({ email: value(form, "email") });
            await postProto(endpoints.requestPasswordReset, request.serializeBinary());
        }

        if (action === "reset-password") {
            const request = new ResetPassword({
                email: value(form, "email"),
                password: value(form, "password"),
                token: hexToBytes(value(form, "token")),
            });
            await postProto(endpoints.resetPassword, request.serializeBinary());
        }

        setStatus(form, successMessage, "success");
        form.dispatchEvent(new CustomEvent("hoc-auth-success", { bubbles: true, detail: { action } }));
    } catch (error) {
        setStatus(form, error instanceof Error ? error.message : String(error), "error");
    } finally {
        setSubmitting(form, false);
    }
}

function fillQueryDefaults(form: HTMLFormElement) {
    const params = new URLSearchParams(window.location.search);
    for (const name of ["email", "token", "code"]) {
        const queryValue = params.get(name);
        const input = form.elements.namedItem(name);
        if (queryValue && input instanceof HTMLInputElement) {
            input.value = queryValue;
        }
    }
}

function bindAuthForm(form: HTMLFormElement) {
    fillQueryDefaults(form);

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        void submitAuthForm(form);
    });
}

function bindPasswordToggles() {
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-password-toggle]")) {
        button.addEventListener("click", () => {
            const target = button.dataset.passwordToggle;
            const input = target ? document.getElementById(target) : null;
            if (!(input instanceof HTMLInputElement)) return;

            input.type = input.type === "password" ? "text" : "password";
            const show = button.dataset.showLabel || "Show";
            const hide = button.dataset.hideLabel || "Hide";
            button.textContent = input.type === "password" ? show : hide;
        });
    }
}

function bindResendCode() {
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-auth-request-code]")) {
        button.addEventListener("click", async () => {
            const form = button.closest("form");
            if (!(form instanceof HTMLFormElement)) return;

            const email = value(form, "email");
            if (!emailPattern.test(email)) {
                setStatus(form, "Email must be a valid email address", "error");
                return;
            }

            button.disabled = true;
            try {
                const request = new RequestCode({ email });
                await postProto(endpoints.requestCode, request.serializeBinary());
                setStatus(form, button.dataset.successMessage || "Verification code requested.", "info");
            } catch (error) {
                setStatus(form, error instanceof Error ? error.message : String(error), "error");
            } finally {
                button.disabled = false;
            }
        });
    }
}

function bindContinueLinks() {
    for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-game-client-link]")) {
        link.href = gameClientUrl;
    }
}

for (const form of document.querySelectorAll<HTMLFormElement>("form[data-auth-action]")) {
    bindAuthForm(form);
}

bindPasswordToggles();
bindResendCode();
bindContinueLinks();
