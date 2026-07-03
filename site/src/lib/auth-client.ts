import {
    ConfirmCode,
    NewPlayer,
    RequestCode,
    ResetPassword,
    ResponseMe,
} from "@heroesofcrypto/common/src/generated/protobuf/v1/messages_reexports";

type AuthAction = "login" | "register" | "verify" | "forgot-password" | "reset-password";

const sameOrigin = globalThis.location?.origin ?? "";
const host = globalThis.location?.hostname ?? "";

// Resolve prod from the runtime hostname first. Astro doesn't reliably inline the build-time env
// flags (import.meta.env.PROD / VITE_IS_PROD) into this client-side script the way it does in page
// frontmatter, so relying on them pointed account creation at the static site origin (heroesofcrypto.io)
// — which nginx serves as static files and rejects POST with 405 — instead of the auth API. The
// hostname is authoritative: any *.heroesofcrypto.io (or the bare apex) is production.
const isProd =
    host === "heroesofcrypto.io" ||
    host.endsWith(".heroesofcrypto.io") ||
    import.meta.env.PROD === true ||
    import.meta.env.VITE_IS_PROD === "true";

const authBaseUrl =
    import.meta.env.VITE_HOST_AUTH_API ||
    import.meta.env.VITE_AUTH_API ||
    (isProd ? "https://auth.heroesofcrypto.io" : sameOrigin || "http://localhost:3001");

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
const isRussian = typeof document !== "undefined" && document.documentElement.lang === "ru";
const messages = isRussian
    ? {
          requestFailed: (text: string) => `Запрос не выполнен: ${text}`,
          invalidInputs: "Запрос не выполнен: проверьте введенные данные",
          failedStatus: (status: number) => `Запрос не выполнен, статус ${status}`,
          emailInvalid: "Введите корректный email.",
          usernameInvalid: "Имя пользователя должно содержать 3-42 латинские буквы или цифры.",
          passwordInvalid:
              "Пароль должен быть 8-50 символов и включать заглавную букву, строчную букву, цифру и спецсимвол.",
          passwordsMustMatch: "Пароли должны совпадать.",
          codeShort: "Код должен содержать минимум 6 символов.",
          tokenInvalid: "Токен должен быть 64-символьной шестнадцатеричной строкой.",
          success: "Готово.",
          show: "Показать",
          hide: "Скрыть",
          verificationRequested: "Код подтверждения запрошен.",
      }
    : {
          requestFailed: (text: string) => `Request failed: ${text}`,
          invalidInputs: "Request failed: Invalid inputs",
          failedStatus: (status: number) => `Request failed with status ${status}`,
          emailInvalid: "Email must be a valid email address",
          usernameInvalid: "Username must be 3-42 letters or numbers",
          passwordInvalid:
              "Password must be 8-50 characters and include uppercase, lowercase, number, and special character",
          passwordsMustMatch: "Passwords must match",
          codeShort: "Code must be at least 6 characters",
          tokenInvalid: "Token must be a 64-character hexadecimal string",
          success: "Success",
          show: "Show",
          hide: "Hide",
          verificationRequested: "Verification code requested.",
      };

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
        return messages.requestFailed(text);
    }

    if (response.status === 400) {
        return messages.invalidInputs;
    }

    return messages.failedStatus(response.status);
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

    if (
        ["login", "register", "verify", "forgot-password", "reset-password"].includes(action) &&
        !emailPattern.test(email)
    ) {
        return messages.emailInvalid;
    }

    if (action === "register" && !usernamePattern.test(value(form, "username"))) {
        return messages.usernameInvalid;
    }

    if (["login", "register", "reset-password"].includes(action) && !passwordPattern.test(password)) {
        return messages.passwordInvalid;
    }

    if (action === "reset-password" && value(form, "confirmPassword") !== password) {
        return messages.passwordsMustMatch;
    }

    if (action === "verify" && value(form, "code").length < 6) {
        return messages.codeShort;
    }

    if (action === "reset-password") {
        const token = value(form, "token");
        if (token.length !== 64 || !hexPattern.test(token)) {
            return messages.tokenInvalid;
        }
    }

    return "";
}

function localizedAuthPath(path: string): string {
    return typeof document !== "undefined" && document.documentElement.lang === "ru" ? `/ru${path}` : path;
}

// Honour a ?redirect= return URL only when it's a same-site absolute path — guards against
// open-redirects (external URLs, protocol-relative //host).
function safeRedirectTarget(): string {
    const raw = new URLSearchParams(globalThis.location?.search ?? "").get("redirect");
    return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "";
}

// Auth succeeds but nothing was navigating the user onward — the token is stored and the form just
// sat on "success". Route each action to where it should go next (login/verify -> the game).
function redirectAfterAuth(action: AuthAction, email: string): void {
    let target = "";
    if (action === "login" || action === "verify") {
        target = safeRedirectTarget() || localizedAuthPath("/play");
    } else if (action === "register") {
        target = localizedAuthPath(`/auth/verify/${email ? `?email=${encodeURIComponent(email)}` : ""}`);
    } else if (action === "reset-password") {
        target = localizedAuthPath("/auth/login/");
    }
    if (target) {
        // Brief pause so the success status is visible before we navigate.
        globalThis.setTimeout(() => globalThis.location.assign(target), 700);
    }
}

async function submitAuthForm(form: HTMLFormElement) {
    const action = form.dataset.authAction as AuthAction;
    const successMessage = form.dataset.successMessage || messages.success;
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
        redirectAfterAuth(action, value(form, "email"));
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
            const show = button.dataset.showLabel || messages.show;
            const hide = button.dataset.hideLabel || messages.hide;
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
                setStatus(form, messages.emailInvalid, "error");
                return;
            }

            button.disabled = true;
            try {
                const request = new RequestCode({ email });
                await postProto(endpoints.requestCode, request.serializeBinary());
                setStatus(form, button.dataset.successMessage || messages.verificationRequested, "info");
            } catch (error) {
                setStatus(form, error instanceof Error ? error.message : String(error), "error");
            } finally {
                button.disabled = false;
            }
        });
    }
}

for (const form of document.querySelectorAll<HTMLFormElement>("form[data-auth-action]")) {
    bindAuthForm(form);
}

bindPasswordToggles();
bindResendCode();
