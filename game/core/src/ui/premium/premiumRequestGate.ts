interface PremiumRequest {
    kind: "read" | "apply";
}

/** A pending apply owns the state until it finishes; background polls cannot overwrite it. */
export const createPremiumRequestGate = () => {
    let current: PremiumRequest | undefined;
    return {
        begin(kind: PremiumRequest["kind"]): PremiumRequest | undefined {
            if (current?.kind === "apply" || (kind === "read" && current)) return undefined;
            current = { kind };
            return current;
        },
        isCurrent(request: PremiumRequest): boolean {
            return current === request;
        },
        finish(request: PremiumRequest): boolean {
            if (current !== request) return false;
            current = undefined;
            return true;
        },
        reset(): void {
            current = undefined;
        },
    };
};
