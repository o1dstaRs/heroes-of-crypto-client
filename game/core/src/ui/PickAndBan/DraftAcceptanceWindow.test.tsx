import { afterEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { setLanguage } from "../../i18n/i18n";

mock.module("../GameSystemControls", () => ({ FullscreenCorner: () => null }));
const { DraftAcceptanceWindow } = await import("./DraftAcceptanceWindow");
const { draftShellSx } = await import("./draftShell");

afterEach(() => setLanguage("en"));
const render = (secondsRemaining: number | null): string =>
    renderToStaticMarkup(<DraftAcceptanceWindow secondsRemaining={secondsRemaining} />);

describe("accepted match draft window", () => {
    test("shows who accepted and who is still missing on the draft's own background", () => {
        const html = render(18);
        expect(html).toContain('data-testid="draft-acceptance-window"');
        expect(html).toContain('role="status"');
        expect(html).toContain("Waiting for your opponent to accept");
        expect(html).toContain("You accepted");
        expect(html).toContain("Opponent: waiting to accept");
        expect(html).toContain("The draft will start as soon as your opponent accepts.");
        expect(html).toContain("Acceptance closes in 18s");
        expect(html).not.toContain("until auto-start");
        expect(html).toContain(draftShellSx.backgroundImage);
    });

    test.each([null, -1, Number.NaN, Number.POSITIVE_INFINITY])(
        "missing or invalid acceptance time never invents a countdown: %s",
        (seconds) => {
            const html = render(seconds);
            expect(html).toContain("Waiting for your opponent to accept");
            expect(html).not.toContain("Acceptance closes in");
            expect(html).not.toContain("NaN");
            expect(html).not.toContain("Infinity");
        },
    );

    test("zero waits for the authoritative expiry or draft handoff, rather than claiming the draft started", () => {
        const html = render(0);
        expect(html).toContain("Checking match acceptance…");
        expect(html).toContain("Waiting for your opponent to accept");
        expect(html).not.toContain("Acceptance closes in 0s");
    });

    test("both acceptance states and the countdown are localized", () => {
        setLanguage("ru");
        const html = render(12);
        expect(html).toContain("Ожидаем подтверждения соперника");
        expect(html).toContain("Вы приняли матч");
        expect(html).toContain("Соперник: ожидаем подтверждения");
        expect(html).toContain("На подтверждение осталось 12 с");
        expect(html).not.toContain("Waiting for your opponent to accept");
    });

    test("the accepting click changes surfaces before confirmation resolves and keeps the stream handoff", () => {
        const source = readFileSync(join(import.meta.dir, "../MatchmakingRoute.tsx"), "utf8");
        const accept = source.slice(
            source.indexOf("const handleAccept = async ()"),
            source.indexOf("const navigationLocked"),
        );
        expect(accept.indexOf('setState("accepted")')).toBeLessThan(accept.indexOf("await confirmGame(gameId)"));
        expect(accept).toContain("clearMatchReadyAlert()");
        expect(accept).not.toContain("closeStream()");
        expect(source).toContain('if (state === "accepted" && pendingGameId)');
        expect(source).toContain("<DraftAcceptanceWindow secondsRemaining={secondsRemaining} />");
        expect(source).toContain("if (event.c === 1)");
        expect(source).toContain("navigate(`/game/${event.ps}`)");
    });

    test("a restored confirmed seat waits for the opponent instead of opening an uncreated pick session", () => {
        const source = readFileSync(join(import.meta.dir, "../MatchmakingRoute.tsx"), "utf8");
        const restore = source.slice(
            source.indexOf("getCurrentGame()\n            .then"),
            source.indexOf("const statusText"),
        );
        expect(restore).toContain('acceptedGameIdRef.current = game.confirmed ? game.id : ""');
        expect(restore).toContain('setState(game.confirmed ? "accepted" : "confirming")');
        expect(restore).toContain("openStream()");
        expect(restore).not.toContain("navigate(");
    });
});
