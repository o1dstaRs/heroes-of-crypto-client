---
title: "A13 — Inside the Heroes of Crypto v0.8 AI"
date: "2026-07-22"
tags:
    - AI research
    - game AI
    - simulation
    - strategy
excerpt: "A source-audited look at how A13 combines the native v0.8 policy, legal-action search, paired rollouts, and a learned value model to make better tactical decisions."
---

A13 is a Heroes of Crypto AI candidate built on top of the v0.8 policy. It is not a separate game engine or a mysterious black box. It keeps the same authoritative rules, then asks a focused question at important turns: is there a legal move that is clearly better than the native policy's choice?

The answer matters because a good tactical AI should be stronger without becoming erratic, slow, or impossible to understand. A13 was designed as a bounded editor of a dependable base policy rather than an attempt to search every possible battle from the opening move.

## Four layers make one agent

A13 combines four pieces of the live game system:

1. **Native v0.8 policy.** This is the reliable baseline that proposes a legal action from the current board.
2. **Legal-action generator.** It creates a limited set of alternative moves, attacks, throws, shots, and spells that the real engine accepts.
3. **Search driver.** It previews the candidates, keeps the incumbent plus the strongest challengers, then runs short simulated futures.
4. **Value model.** At the end of each future, a compact learned evaluator estimates which army is more likely to win.

The native action is always candidate zero. Search starts with a valid, understandable fallback and only overrides it when an alternative survives the same rules and looks meaningfully stronger.

## How a decision is tested

For a live turn, the system first applies each legal candidate to a snapshot and evaluates the immediate position. It keeps the base policy's action and the two strongest alternatives so the search remains within a practical decision budget.

Each surviving action receives two paired rollouts. Candidates in a rollout share the same deterministic random seed, so one move cannot win simply because it happened to receive luckier dice. Both armies then play the next twelve unit turns using their non-recursive native policies.

At the horizon, the evaluator scores the resulting board. The average of the two paired futures becomes the candidate score. A challenger normally needs to improve the estimated win probability by at least `0.03` before replacing the incumbent. That margin protects the game from nervous flip-flopping over tiny, noisy differences.

## What the evaluator sees

The shipped value profile turns sixty board measurements into a probability-like score. It does not invent new rules or bypass the engine. It reads a compact view of the state, including:

- remaining health, stacks, attack output, ranged pressure, and wounded fractions;
- tempo, queue position, exposed units, and hourglass opportunity;
- space, advancement, army spread, and distance from the safe center;
- composition, including ranged, flying, and caster investment;
- remaining ammunition and the interaction between ranged power and distance.

This makes the model useful for local tactical comparisons, but it also defines its limits: it sees aggregates rather than a complete symbolic plan for every unit, ability, artifact, augment, and synergy combination.

## Search with gameplay guardrails

The real fight engine remains the referee. Every suggested action must be legal under the same movement, targeting, damage, status, queue, and board rules used in ranked games.

The search also preserves gameplay priorities that should not be traded away for a speculative rollout score. It avoids passive obstacle actions when an enemy can be damaged or a productive advance exists. It can let a stronger ranged army wait behind its screen when charging would turn off its advantage. In late fights it weighs Armageddon deadlines, reachable stack kills, wounded targets, regeneration, and delivery damage instead of treating every point of immediate damage as equal.

## What the campaign evidence says

The recorded A13 campaign covered 89,088 games across multiple hosts. Its purpose was to compare candidate policies under controlled seeds and seat swaps, not to promise that one headline win rate will stay fixed forever.

That distinction is important. A measured lift can come from the particular armies, maps, seeds, or opponent policy used in a campaign. Promotion therefore relies on fresh validation seeds and more than one gate: strength, passive behavior, action validity, Armageddon behavior, timing, and reproducibility all matter.

## Where A13 can still be wrong

A short search horizon is tactical, not a complete plan for lap twelve. The best move can be omitted by candidate caps, and two paired rollouts cannot fully represent rare misses, steals, resistances, or extreme luck. The value model can also be uncertain about novel unit, artifact, augment, and synergy combinations.

That is why the native policy remains in the loop, why search has a replacement threshold, and why replay evidence matters. Coverage means the AI can play a scenario through the authoritative system; it does not claim perfect targeting, positioning, or synergy usage in every case.

## Making the next version stronger

The practical path forward is not unlimited search. It is better evidence and better allocation of compute:

- record the incumbent, candidates, rollout scores, override reason, and fallback state for suspicious decisions;
- distill consistently strong search choices into the fast native policy;
- spend extra simulation only when candidate scores are close or the board is unusually volatile;
- preserve candidate diversity across movement, attacks, control, and setup actions;
- add ability-aware features only after out-of-sample validation;
- profile snapshots, pathfinding, legal-action queries, and deterministic simulation so stronger decisions fit the live deadline.

A13 is a step toward an AI that is both more capable and easier to improve. The rules stay authoritative, the base policy stays readable, and search earns the right to intervene one tested decision at a time.
