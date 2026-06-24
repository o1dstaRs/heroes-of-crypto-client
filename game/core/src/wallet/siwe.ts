type BuildSiweMessageOptions = {
    domain: string;
    address: string;
    uri: string;
    nonce: string;
    chainId: number;
    statement?: string;
    issuedAt?: Date;
    expirationTime?: Date;
};

export const buildSiweMessage = (options: BuildSiweMessageOptions): string => {
    const statement = options.statement ?? "Sign in to Heroes of Crypto";
    const issuedAt = (options.issuedAt ?? new Date()).toISOString();

    const lines: string[] = [
        `${options.domain} wants you to sign in with your Ethereum account:`,
        options.address,
        "",
        statement,
        "",
        `URI: ${options.uri}`,
        "Version: 1",
        `Chain ID: ${options.chainId}`,
        `Nonce: ${options.nonce}`,
        `Issued At: ${issuedAt}`,
    ];

    if (options.expirationTime) {
        lines.push(`Expiration Time: ${options.expirationTime.toISOString()}`);
    }

    return lines.join("\n");
};

export type WalletUser = {
    id?: string;
    username?: string;
    email?: string;
    isActive?: boolean;
    wins?: number;
    losses?: number;
    totalGamesPlayed?: number;
    matchMakingQueueAddedTime?: number;
    inGameId?: string;
    matchMakingCooldownTill?: number;
    walletAddresses?: string[];
    isNew?: boolean;
};

export type SignMessageFn = (message: string) => Promise<string>;
