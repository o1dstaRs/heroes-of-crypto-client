import type { GameAction } from "@heroesofcrypto/common";

import { PlayInputSource } from "../api/play_protocol";

/**
 * Tags an action the client produced without the player's input, so the ranked transport can report it in
 * PlayAction.input_source for the server's integrity evidence (phase 1; evidence only, never enforcement):
 * "auto_unit" for a mindless "AI Driven" unit its owner never steers, "client_ai" for the autobattle toggle.
 *
 * The tag is a NON-enumerable property on a copy, so the action stays deep-equal to the untagged one for the
 * engine, the animation sequences and every test that compares actions. It travels with the object to the
 * transport; a spread copy on the way drops it, which only costs a tag the server can also derive for mindless
 * units (isMindlessAiUnit).
 */
export type AutoPlaySource = "auto_unit" | "client_ai";

const AUTO_PLAYED_ACTION_FLAG = "__hocAutoPlayed";

type AutoPlayedMarkedAction = GameAction & {
    [AUTO_PLAYED_ACTION_FLAG]?: AutoPlaySource;
};

export const markAutoPlayedAction = <T extends GameAction>(action: T, source: AutoPlaySource): T =>
    Object.defineProperty({ ...action }, AUTO_PLAYED_ACTION_FLAG, { value: source, enumerable: false });

export const autoPlayedSource = (action: GameAction): AutoPlaySource | undefined =>
    (action as AutoPlayedMarkedAction)[AUTO_PLAYED_ACTION_FLAG];

/** The wire tag for an auto-played action; undefined for the player's own input. */
export const autoPlayedInputSource = (action: GameAction): number | undefined => {
    const source = autoPlayedSource(action);
    return source === "auto_unit"
        ? PlayInputSource.AUTO_UNIT
        : source === "client_ai"
          ? PlayInputSource.CLIENT_AI
          : undefined;
};
