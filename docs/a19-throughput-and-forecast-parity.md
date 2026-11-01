# A19 training throughput and forecast recovery audit

Recorded October 31, 2026. The completed staged-batch benchmark establishes faster single-epoch
processing with identical model parameters. The separate forecast-recovery diagnostic closes without
a controller change. The serving default remains **H64 / complementary R2 / K6**, profile
`a19-material-r2-v1`.

This record preserves independently checked findings. Generated source capsules, raw games, model
files and the standalone HTML report remain outside Git. The subsequent staged-learner integration
is linked below and adopted by the common pin; no trained serving policy is promoted.

## Matched GPU epoch benchmark

The separately owned training workflow completed its registered original/staged/staged/original
benchmark on October 28 using the approved RTX 5090. Each arm resets the model and optimizer, trains
one complete epoch and evaluates all 2,142 validation decisions. The staged path gathers admitted
resident tensors while preserving the original batch shapes, strides, masks, labels and order.

| Reversed pair | Original elapsed | Staged elapsed | Original / staged | Less elapsed | Less process CPU |
| ------------- | ---------------: | -------------: | ----------------: | -----------: | ---------------: |
| Original first | 16.565755 s | 3.784474 s | 4.377294× | 77.1548% | 70.2167% |
| Staged first | 13.947160 s | 3.885175 s | 3.589841× | 72.1436% | 69.6585% |

These elapsed measurements include each arm's model setup and staged transfer. Shared CPU loading
uses another 19.161832 seconds before the arms; it is outside every per-arm ratio. The complete
four-arm worker takes 64.823092 seconds. This is **not a measured full 20-epoch fit speedup**, corpus
production speedup, live-game latency result or strength gain.

Both reversed pairs clear the registered 1.2× speed requirement. Training loss and all six validation
metrics agree exactly. An independent CPU-only reload of all four saved dictionaries compares every
value in 20 tensors: **258,595 values per arm, all bit exact**. Its CUDA visibility is empty. The
source hashes, registration identity, timing arithmetic and per-pair gate also reconstruct exactly.

Staged peak allocated CUDA memory is 540.802246 MiB, versus 26.097656 MiB for the original path.
This is the measured storage tradeoff on the admitted corpus, not permission to bypass memory or
source/data admission for a larger fit.

## Natural forecast-recovery diagnostic

Real battles retry the pinned v0.1 policy when an active AI Driven unit makes no productive action,
then end its turn. `SearchDriver` uses generic advance/defend recovery in its future-turn plumbing.
A source difference alone does not establish a naturally reached defect or a useful policy change.

The fixed observation replays all 36 previously completed zero-forecast census boards and their four
canonical draft/mirror games, across Normal, Lava and Block. It does not select armies by outcome,
add a new policy, generate training labels or reopen a strength bank.

| Map | Replayed games | Forecast turns | Active AI Driven turns | Recovery calls |
| --- | -------------: | -------------: | ---------------------: | -------------: |
| Normal | 48 | 592,116 | 17,934 | 0 |
| Lava | 48 | 678,336 | 24,966 | 0 |
| Block | 48 | 541,822 | 3,906 | 0 |
| Total | 144 | 1,812,274 | 46,806 | 0 |

Active AI Driven turns occur on 16 boards and in 64 games. Creature-name counts must not substitute
for the active ability predicate: muting can return a creature to its owner's controller.

Every archived ranked record, complete action/event trace, final result and searched-root count
matches. Three stock/observer control pairs also verify native action-array ownership. Two extra
replays resolve candidate-recording overhead in archived board 5 games 0 and 2: restoring the archived
`captureAllPositions` flag reproduces the extra ranged-helper calls, with unchanged forecast counts,
actions, events, ownership and results. The audit checks 628 frozen inputs and compares all 616
published source files directly with common commit `331c53ba43e0a23375d51198fd46de4b11ef923c`.

Across the census, preflight and recording checks there are **152 full executions and 7,784 actual
root-restoration checks**. Recorded execution elapsed is **159.388631 seconds**; child CPU is
694.989232 seconds. These shared-M4-Max/Bun-1.4.4 receipts exclude authoring, preparation and reporting;
they are not a quiet-host or production speed comparison.

**Decision: close this recovery hypothesis on the fixed sample.** No natural recovery is observed,
so it does not fund the proposed authoritative-retry experiment. Correlated forecast turns do not
prove universal unreachability. Do not expand this sample or introduce synthetic failures to rescue
the failed natural-occurrence gate.

## Evidence identities and remaining admission

The standalone delivery is named `hoc-a19-rollout-policy-parity-20261031/report.html`. It includes map
filters, creature counts, epoch timings, CSV export and local evidence links. Desktop/mobile checks
pass with no script errors, external requests or page overflow. The evidence archive contains 666
entries, including all 628 verified diagnostic inputs.

| Evidence | SHA-256 |
| -------- | ------- |
| Diagnostic registration | `3deff9108d614b772a032d26a9adb582bb6f4bd2423ef8b2ec3a9af027a8aacd` |
| Matched epoch experiment | `a66cf5621412cd4cc490e07196fe98267e90bcb3e83da603d47c7023410ad42a` |
| Common canonical tensor digest | `32f4e41a021c7bc24b08c9593caf98408bb57c5202871714e5b26396ef795cd9` |
| Delivered HTML | `9a5253c7b924eecca0eaa7f57c34c4d50d77a97b4f5fb21f399b447cf86fd21d` |
| Delivered evidence archive | `dd7ac10d89b202ec41be40a6fc1f933404b37dce21b5fd3f04fdf54b7e681aa2` |

The separately owned first-model all-family correction scores 53.58% on 768 development games
(whole-board 95% interval 51.69–55.53%) without extra R8 search during play. That is context from its
completed research record, not a new strength evaluation in this audit. Untouched confirmation and
actual production-CPU timing remain unqualified. Preserve the separate training, finalist and
computation-allocation workflows and their frozen gates; do not duplicate their jobs.

The subsequent mainline integration is documented in
[the common package's staged-batch guide](../game/heroes-of-crypto-common/docs/a19_staged_batches.md).
The learner defaults to automatic staging when its pre-allocation memory budget permits, with an
explicit legacy reference control. This training optimization does not change the general game AI.
Existing frozen research runs keep their original source and are not hot-patched.
