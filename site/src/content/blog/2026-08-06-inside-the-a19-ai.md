---
title: "A19 — Inside the Heroes of Crypto v0.8 AI"
date: "2026-08-06"
tags:
    - AI research
    - game AI
    - simulation
    - strategy
excerpt: "A19 is the promoted v0.8 AI: a 64-unit-turn, paired-rollout search with qualified placement, productive-action safeguards, and a stable fallback policy."
---

A19 is the production AI behind Heroes of Crypto v0.8. The public version number stays `v0.8` so ranked seats, saved games, and replays remain compatible, but the deployed strategy and search profile are now A19.

It is not a new rules engine and it does not learn during a live match. A19 keeps the authoritative game engine and the native v0.8 policy, then applies a tightly bounded search only when an alternative action earns the right to replace the policy's legal baseline.

## What changed from A13

The most visible change is search depth. A13 tested short twelve-unit-turn futures. A19 evaluates a sixty-four-unit-turn horizon while preserving the same practical guardrails: a legal incumbent, a small candidate set, paired deterministic rollouts, and a fixed decision budget.

That longer window gives the AI more room to see consequences that do not resolve immediately: a screen that buys another volley, an advancing stack that opens a later attack, a delayed Armageddon problem, or a placement that matters after the first exchange.

## A small search around a dependable policy

The native v0.8 policy remains candidate zero. A19 generates a limited number of legal alternatives around it: one movement choice, up to six melee target-and-stand-cell pairs, four shots, two area throws, and available spells. It then keeps a shortlist of three actions: the incumbent plus the two strongest challengers.

Every finalist receives two paired rollouts. Each candidate in a rollout shares the same deterministic seed, so the comparison is less likely to reward a move merely because it received luckier dice. Both armies use the real engine for the projected sixty-four unit turns, and the score comes from the resulting authoritative state.

A challenger normally needs to clear a `0.03` value margin before it replaces the incumbent. The live search remains operation-bounded, with a `175 ms` decision deadline and a circuit breaker instead of an unbounded battle tree.

## Placement is part of the strategy

A19 does not treat deployment as an afterthought. Its placement composition uses a clear order of precedence:

1. an exact lower-side opening for the pinned F184 fixture when that precise known setup applies;
2. a far-flank plan for the qualified Frenzied Boar and Battle Mage pattern;
3. compact, level-4-aware placement;
4. generic ranked placement based on the army, map, and legal cells;
5. plain v0.8 placement as the safe fallback.

The policy only uses the information it is meant to have: its own army, the map, and legal deployment cells. Every strategy instance is fresh for the match, so a previous game cannot leak placement state into the next one.

## Productive play without reckless overrides

A19 keeps the native action unless search finds a better legal replacement. It adds several safeguards to make that comparison more useful in real battles:

- favoring productive alternatives instead of replacing an attack or meaningful advance with a passive action;
- preserving fast-flyer cohesion when a lone rush would weaken the army's actual plan;
- resolving terminal results exactly rather than treating a finished battle as an approximate evaluation leaf;
- using stricter handling for aggressive wait ties and Abomination mirror situations;
- allowing a narrowly scoped Abomination defend line only when it creates a real upcoming-Armageddon survival edge.

These are not broad permissions for the AI to stall. The special defend policy applies to a precise one-versus-one Abomination situation, and the normal candidate gates remain in force everywhere else.

## Why the profile is trustworthy to change

A19 is promoted rather than simply renamed. The production profile records the qualified H64 finalist it derives from, its sealed search environment, placement composition, and source-byte ledger for the registry, search factory, battle engine routing, and tournament control.

That structure makes upgrades auditable. A candidate can be measured in research, validated independently, and promoted with the exact behavior identity still visible. A13 remains available as an explicit rollback profile, rather than being silently overwritten.

## What A19 still cannot know

Sixty-four unit turns are deeper tactical lookahead, not perfect play. Candidate caps can still omit a clever setup move. Two paired rollouts reduce noise but cannot fully represent rare misses, steals, resistances, or extreme luck. The value model evaluates the board through features, not a complete human-style story about every possible ability and synergy interaction.

That is why the system keeps a legal incumbent, a margin before overrides, deterministic replayable simulations, and source-pinned validation. A19 aims to be more versatile and more deliberate without pretending that every battle is solved.

## The direction from here

The next gains come from better evidence, not blindly searching longer. Decision provenance can show which candidates were considered and why an override happened. Repeatedly strong search choices can be distilled into the fast native policy. Extra simulation can focus on close decisions, volatile states, and high-impact endgames instead of taxing every turn equally.

A19 is the current foundation: a stronger, auditable v0.8 AI that can place with intent, look further ahead, and still fall back to a stable policy when the evidence is not strong enough.
