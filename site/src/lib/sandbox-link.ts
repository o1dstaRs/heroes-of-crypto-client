export function sandboxLinkHref(config: {
    development?: boolean;
    sandbox?: string;
    host?: string;
    client?: string;
}): string {
    if (config.development) return "/sandbox";
    const target = new URL(
        [config.sandbox, config.host, config.client].find((value) => value?.trim())?.trim() ??
            "https://app.heroesofcrypto.io/",
    );
    target.pathname = target.pathname.replace(/\/play\/?$/, "/");
    return target.href;
}
