import { describe, expect, test } from "bun:test";

import { createWagmiConfig, normalizeWalletConnectProjectId } from "./wagmiConfig";

const connectorWalletIds = (projectId: string | undefined): string[] =>
    createWagmiConfig(projectId).connectors.map((connector) => {
        const rainbowKitConnector = connector as typeof connector & { rkDetails?: { id?: string } };
        return rainbowKitConnector.rkDetails?.id ?? connector.id;
    });

describe("WalletConnect project ID configuration", () => {
    test("fails closed to the injected browser wallet for missing or invalid IDs", () => {
        const invalidProjectIds = [
            undefined,
            "",
            "   ",
            "YOUR_PROJECT_ID",
            "00000000000000000000000000000000",
            "not-a-project-id",
            "g".repeat(32),
            "a".repeat(31),
            "a".repeat(33),
        ];

        for (const projectId of invalidProjectIds) {
            expect(normalizeWalletConnectProjectId(projectId)).toBeUndefined();
            expect(connectorWalletIds(projectId)).toEqual(["injected"]);
        }
    });

    test("keeps RainbowKit's default WalletConnect behavior for a valid ID", () => {
        const projectId = "0123456789abcdef0123456789abcdef";

        expect(normalizeWalletConnectProjectId(`  ${projectId.toUpperCase()}  `)).toBe(projectId.toUpperCase());

        const walletIds = connectorWalletIds(projectId);
        expect(walletIds).toContain("walletConnect");
        expect(walletIds).toContain("metaMask");
        expect(walletIds).toContain("rainbow");
    });
});
