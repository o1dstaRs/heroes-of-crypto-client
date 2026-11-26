#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly VALIDATOR="$SCRIPT_DIR/validate_ai_meta_summary.ts"
readonly DEFAULT_COHORTS="ranked-draft,uniform-mixed,ranged-heavy,ground-melee,flyer-heavy,caster-support,cross-archetype"
readonly DEFAULT_FULL_GAMES=150000
readonly DEFAULT_SMOKE_GAMES=72
readonly DEFAULT_SEED=85000717
readonly DEFAULT_WORKERS=12
readonly DEFAULT_PARALLEL=1

usage() {
    cat <<'EOF'
Heroes of Crypto AI meta cohort runner and report guard

Usage:
  run-ai-meta.sh run [options]
  run-ai-meta.sh smoke [options]
  run-ai-meta.sh render <run-directory|summary.json> [options]
  run-ai-meta.sh inspect <run-directory|summary.json> [options]
  run-ai-meta.sh run-sharded [options]

Run/smoke options:
  --client-root PATH     Client repository or common-package root (auto-detected)
  --repo-root PATH       Alias for --client-root
  --out PATH             Fresh output directory (timestamped sim-out path by default)
  --games N              Fights per cohort (run: 150000; smoke: 72; divisible by 6)
  --seed N               Deterministic base seed (default: 85000717)
  --workers N            Total fight workers (default: 12)
  --parallel N           Cohorts run concurrently (default: 1; keeps all 12 workers on v0.8+a13)
  --cohorts CSV          Ordered cohort subset (default: all seven)
  --fight-profile ID     Required: ranked-current-a19-work (native current setup), a19-bot-seat (production bot seat), or a19-work
                         (a19-work = a19 with finite search budgets instead of wall-clock move deadlines)
  --legacy-oracle        Explicit outcome-only study; no Premium snapshot (also permits a13/a19)
  --skip-tests           Skip the focused cohort/reaggregation/report test files

Run-sharded options (plus --client-root, --out, --games, --seed, --cohorts, --fight-profile, --skip-tests):
  --processes N          Concurrent single-worker Bun processes (default: 8)
  --workers-per-process N Fight workers in each Bun process (default: 1)
  --window N             Pairs per process (default: 12)
  --bun-dir PATH         Directory containing the bun binary to use (prepended to PATH)
  Shards are written to <out>.shards and merged into <out>; wall-clock profiles need a fixed host and --processes.

Render/inspect options:
  --client-root PATH     Client repository or common-package root (auto-detected)
  --repo-root PATH       Alias for --client-root
  --report PATH          HTML path (default: <run-directory>/ai-meta-report.html)
  --top N                Findings shown per category by inspect (default: 3)
  --allow-legacy-water   Render/inspect: accept an old map-2 run with a non-live warning

Safety:
  * run/smoke refuse a non-empty output directory.
  * render refuses an existing report path.
  * new operations preserve existing runs; failed shards retry only missing registered pairs.
  * report rendering starts only after the complete summary and raw gzip files validate.
  * new runs default to premium-ranked-v4 and must build/audit premium.sqlite before completing.
  * snapshots are development artifacts; this command never publishes them to production.

Set HOC_CLIENT_DIR instead of --client-root to provide the default repository location.
Live maps: 1 NORMAL, 3 LAVA_CENTER, 4 BLOCK_CENTER. Map 2 WATER_CENTER is disabled.
EOF
}

die() {
    printf 'error: %s\n' "$*" >&2
    exit 2
}

note() {
    printf '[ai-meta] %s\n' "$*"
}

require_value() {
    local option="$1"
    local value="${2-}"
    [[ -n "$value" ]] || die "$option requires a value"
}

is_nonnegative_integer() {
    [[ "$1" =~ ^[0-9]+$ ]]
}

physical_path() {
    local path="$1"
    if [[ -d "$path" ]]; then
        (cd -- "$path" && pwd -P)
        return
    fi
    local parent
    parent="$(dirname -- "$path")"
    local name
    name="$(basename -- "$path")"
    [[ -d "$parent" ]] || die "parent directory does not exist: $parent"
    printf '%s/%s\n' "$(cd -- "$parent" && pwd -P)" "$name"
}

resolve_common_root() {
    local requested="${1-}"
    local candidate=""
    if [[ -n "$requested" ]]; then
        candidate="$(physical_path "$requested")"
        if [[ -f "$candidate/game/heroes-of-crypto-common/package.json" ]]; then
            printf '%s\n' "$candidate/game/heroes-of-crypto-common"
            return
        fi
        if [[ -f "$candidate/src/simulation/measure_ai_meta_cohorts.ts" && -f "$candidate/package.json" ]]; then
            printf '%s\n' "$candidate"
            return
        fi
        die "--repo-root is neither the client root nor heroes-of-crypto-common: $requested"
    fi

    candidate="$(pwd -P)"
    while [[ "$candidate" != "/" ]]; do
        if [[ -f "$candidate/game/heroes-of-crypto-common/package.json" ]]; then
            printf '%s\n' "$candidate/game/heroes-of-crypto-common"
            return
        fi
        if [[ -f "$candidate/src/simulation/measure_ai_meta_cohorts.ts" && -f "$candidate/package.json" ]]; then
            printf '%s\n' "$candidate"
            return
        fi
        candidate="$(dirname -- "$candidate")"
    done

    die "cannot find heroes-of-crypto-common; pass --repo-root PATH"
}

trim_space() {
    local value="$1"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    printf '%s' "$value"
}

normalize_cohorts() {
    local csv="$1"
    local -a requested=()
    IFS=',' read -r -a requested <<< "$csv"
    ((${#requested[@]} > 0)) || die "--cohorts cannot be empty"

    local seen=","
    local -a normalized=()
    local raw cohort
    for raw in "${requested[@]}"; do
        cohort="$(trim_space "$raw")"
        [[ -n "$cohort" ]] || die "--cohorts contains an empty entry"
        case "$cohort" in
            ranked-draft|uniform-mixed|ranged-heavy|ground-melee|flyer-heavy|caster-support|cross-archetype) ;;
            *) die "unknown cohort '$cohort'; expected one of: $DEFAULT_COHORTS" ;;
        esac
        [[ "$seen" != *",$cohort,"* ]] || die "duplicate cohort '$cohort'"
        seen+="$cohort,"
        normalized+=("$cohort")
    done
    local joined
    (IFS=','; joined="${normalized[*]}"; printf '%s\n' "$joined")
}

cohort_count() {
    local csv="$1"
    local without_commas="${csv//,/}"
    printf '%d\n' "$(( ${#csv} - ${#without_commas} + 1 ))"
}

reserve_output_directory() {
    local output="$1"
    [[ ! -L "$output" ]] || die "output directory may not be a symlink: $output"
    if [[ -e "$output" ]]; then
        [[ -d "$output" ]] || die "output path exists and is not a directory: $output"
        if [[ -n "$(find "$output" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
            die "output directory is not empty; choose a fresh path (nothing was changed): $output"
        fi
    else
        mkdir -p -- "$output"
    fi
    (cd -- "$output" && pwd -P)
}

resolve_summary() {
    local target="$1"
    if [[ -d "$target" ]]; then
        printf '%s/ai-meta.summary.json\n' "$(cd -- "$target" && pwd -P)"
    else
        [[ -f "$target" ]] || die "summary or run directory does not exist: $target"
        printf '%s\n' "$(physical_path "$target")"
    fi
}

run_focused_tests() {
    local common_root="$1"
    note "running focused cohort, reaggregation, and report tests"
    (
        cd -- "$common_root"
        bun test \
            ./test/simulation/ai_meta_cohorts.test.ts \
            ./test/simulation/reaggregate_ai_meta_summary.test.ts \
            ./test/simulation/render_ai_meta_report.test.ts \
            ./test/simulation/ai_meta_outputs.test.ts \
            ./test/simulation/premium_evidence_snapshot.test.ts
    )
}

validator() {
    local common_root="$1"
    shift
    (
        cd -- "$common_root"
        bun "$VALIDATOR" "$@" --common-root "$common_root"
    )
}

run_operation() {
    local operation="$1"
    shift

    local repo_root="${HOC_CLIENT_DIR-}"
    local output=""
    local games="$DEFAULT_FULL_GAMES"
    [[ "$operation" == "smoke" ]] && games="$DEFAULT_SMOKE_GAMES"
    local seed="$DEFAULT_SEED"
    local workers="$DEFAULT_WORKERS"
    local parallel="$DEFAULT_PARALLEL"
    local parallel_set=0
    local cohorts="$DEFAULT_COHORTS"
    local fight_profile=""
    local skip_tests=0

    while (($#)); do
        case "$1" in
            --repo-root|--client-root)
                require_value "$1" "${2-}"
                repo_root="$2"
                shift 2
                ;;
            --out)
                require_value "$1" "${2-}"
                output="$2"
                shift 2
                ;;
            --games)
                require_value "$1" "${2-}"
                games="$2"
                shift 2
                ;;
            --seed)
                require_value "$1" "${2-}"
                seed="$2"
                shift 2
                ;;
            --workers)
                require_value "$1" "${2-}"
                workers="$2"
                shift 2
                ;;
            --parallel)
                require_value "$1" "${2-}"
                parallel="$2"
                parallel_set=1
                shift 2
                ;;
            --cohorts)
                require_value "$1" "${2-}"
                cohorts="$2"
                shift 2
                ;;
            --fight-profile)
                require_value "$1" "${2-}"
                fight_profile="$2"
                shift 2
                ;;
            --skip-tests)
                skip_tests=1
                shift
                ;;
            --legacy-oracle)
                export AI_META_OUTPUT_MODE=legacy-oracle
                shift
                ;;
            -h|--help)
                usage
                return
                ;;
            --*) die "unknown option for $operation: $1" ;;
            *) die "unexpected positional argument for $operation: $1" ;;
        esac
    done

    cohorts="$(normalize_cohorts "$cohorts")"
    local cohort_total
    cohort_total="$(cohort_count "$cohorts")"
    if ((parallel_set == 0 && cohort_total < parallel)); then
        parallel="$cohort_total"
    fi

    is_nonnegative_integer "$games" || die "--games must be an integer"
    ((games >= 6 && games % 6 == 0)) || die "--games must be at least 6 and divisible by 6 (two seats x three live maps)"
    is_nonnegative_integer "$seed" || die "--seed must be a non-negative safe integer"
    ((seed <= 9007199254740991)) || die "--seed exceeds JavaScript's safe integer range"
    is_nonnegative_integer "$workers" && ((workers >= 1)) || die "--workers must be a positive integer"
    is_nonnegative_integer "$parallel" && ((parallel >= 1)) || die "--parallel must be a positive integer"
    ((parallel <= cohort_total)) || die "--parallel cannot exceed selected cohort count ($cohort_total)"
    ((parallel <= workers)) || die "--parallel cannot exceed --workers"
    case "$fight_profile" in
        a13|a19|a19-work|a19-bot-seat|ranked-current-a19-work) ;;
        "") die "--fight-profile is required; choose a19-bot-seat or a19-work" ;;
        *) die "unsupported --fight-profile" ;;
    esac

    local common_root
    common_root="$(resolve_common_root "$repo_root")"
    command -v bun >/dev/null 2>&1 || die "bun is required"
    validator "$common_root" source
    (cd -- "$common_root" && bun src/simulation/ai_meta_outputs.ts --preflight "$fight_profile")

    if [[ -z "$output" ]]; then
        local stamp
        stamp="$(date -u '+%Y%m%dT%H%M%SZ')"
        output="$common_root/sim-out/ai-meta-${operation}-${stamp}"
    fi
    output="$(reserve_output_directory "$output")"

    if ((skip_tests == 0)); then
        run_focused_tests "$common_root"
    else
        note "focused tests explicitly skipped"
    fi
    [[ -z "$(find "$output" -mindepth 1 -maxdepth 1 -print -quit)" ]] || \
        die "output directory changed before simulation start; refusing to overwrite: $output"

    note "$operation: $cohort_total cohorts x $games fights, seed $seed, $workers workers, $parallel parallel, profile $fight_profile"
    note "output reserved at $output"
    if ((games % 72 != 0)); then
        note "note: $games balances the three maps but does not give equal 12-archetype cross-map cells (multiple of 72)"
    fi

    (
        cd -- "$common_root"
        bun src/simulation/measure_ai_meta_cohorts.ts \
            "$games" "$seed" "$output" "$workers" "$cohorts" "$parallel" "$fight_profile"
    )

    local summary="$output/ai-meta.summary.json"
    local report="$output/ai-meta-report.html"
    validator "$common_root" validate "$summary" \
        --expect-games "$games" --expect-seed "$seed" --expect-cohorts "$cohorts" \
        --expect-fight-profile "$fight_profile" --require-synergies

    [[ ! -e "$report" && ! -L "$report" ]] || die "report path already exists; refusing to overwrite: $report"
    note "validated raw run; rendering standalone HTML"
    (
        cd -- "$common_root"
        bun src/simulation/render_ai_meta_report.ts "$summary" "$report"
    )
    validator "$common_root" validate "$summary" \
        --expect-games "$games" --expect-seed "$seed" --expect-cohorts "$cohorts" --report "$report" \
        --expect-fight-profile "$fight_profile" --require-synergies
    if [[ "$operation" == "smoke" ]]; then
        note "smoke output is structural only; artifact and augment support is too sparse for balance findings"
    else
        validator "$common_root" findings "$summary" --top 3
    fi
    note "report: $report"
}

sharded_operation() {
    local repo_root="${HOC_CLIENT_DIR-}"
    local output=""
    local games="$DEFAULT_FULL_GAMES"
    local seed="$DEFAULT_SEED"
    local processes=8
    local workers_per_process=1
    local window=12
    local cohorts="$DEFAULT_COHORTS"
    local fight_profile=""
    local bun_dir=""
    local skip_tests=0

    while (($#)); do
        case "$1" in
            --repo-root|--client-root)
                require_value "$1" "${2-}"
                repo_root="$2"
                shift 2
                ;;
            --out)
                require_value "$1" "${2-}"
                output="$2"
                shift 2
                ;;
            --games)
                require_value "$1" "${2-}"
                games="$2"
                shift 2
                ;;
            --seed)
                require_value "$1" "${2-}"
                seed="$2"
                shift 2
                ;;
            --processes)
                require_value "$1" "${2-}"
                processes="$2"
                shift 2
                ;;
            --workers-per-process)
                require_value "$1" "${2-}"
                workers_per_process="$2"
                shift 2
                ;;
            --window)
                require_value "$1" "${2-}"
                window="$2"
                shift 2
                ;;
            --cohorts)
                require_value "$1" "${2-}"
                cohorts="$2"
                shift 2
                ;;
            --fight-profile)
                require_value "$1" "${2-}"
                fight_profile="$2"
                shift 2
                ;;
            --bun-dir)
                require_value "$1" "${2-}"
                bun_dir="$2"
                shift 2
                ;;
            --skip-tests)
                skip_tests=1
                shift
                ;;
            --legacy-oracle)
                export AI_META_OUTPUT_MODE=legacy-oracle
                shift
                ;;
            -h|--help)
                usage
                return
                ;;
            --*) die "unknown option for run-sharded: $1" ;;
            *) die "unexpected positional argument for run-sharded: $1" ;;
        esac
    done

    cohorts="$(normalize_cohorts "$cohorts")"
    is_nonnegative_integer "$games" || die "--games must be an integer"
    ((games >= 6 && games % 6 == 0)) || die "--games must be at least 6 and divisible by 6 (two seats x three live maps)"
    is_nonnegative_integer "$seed" || die "--seed must be a non-negative safe integer"
    ((seed <= 9007199254740991)) || die "--seed exceeds JavaScript's safe integer range"
    is_nonnegative_integer "$processes" && ((processes >= 1)) || die "--processes must be a positive integer"
    is_nonnegative_integer "$window" && ((window >= 1)) || die "--window must be a positive integer"
    is_nonnegative_integer "$workers_per_process" && ((workers_per_process >= 1)) || die "--workers-per-process must be a positive integer"
    if [[ -n "${AI_META_MAX_WORKERS-}" ]]; then
        ((processes * workers_per_process <= AI_META_MAX_WORKERS)) || die "total workers exceed AI_META_MAX_WORKERS=$AI_META_MAX_WORKERS"
    fi
    case "$fight_profile" in
        a13|a19|a19-work|a19-bot-seat|ranked-current-a19-work) ;;
        "") die "--fight-profile is required; choose a19-bot-seat or a19-work" ;;
        *) die "unsupported --fight-profile" ;;
    esac
    if [[ -n "$bun_dir" ]]; then
        [[ -x "$bun_dir/bun" ]] || die "--bun-dir has no executable bun: $bun_dir"
        export PATH="$bun_dir:$PATH"
    fi

    local common_root
    common_root="$(resolve_common_root "$repo_root")"
    command -v bun >/dev/null 2>&1 || die "bun is required"
    validator "$common_root" source
    (cd -- "$common_root" && bun src/simulation/ai_meta_outputs.ts --preflight "$fight_profile")

    if [[ -z "$output" ]]; then
        local stamp
        stamp="$(date -u '+%Y%m%dT%H%M%SZ')"
        output="$common_root/sim-out/ai-meta-sharded-${stamp}"
    fi
    output="$(reserve_output_directory "$output")"
    local shard_dir="${output}.shards"
    [[ ! -e "$shard_dir" ]] || die "shard directory already exists; choose a fresh --out: $shard_dir"

    if ((skip_tests == 0)); then
        run_focused_tests "$common_root"
    else
        note "focused tests explicitly skipped"
    fi

    note "run-sharded: $(cohort_count "$cohorts") cohorts x $games fights, seed $seed, $processes processes x $workers_per_process workers, window $window pairs, profile $fight_profile"
    note "shards at $shard_dir; merged run at $output"
    if [[ "$fight_profile" != "a19-work" && "$fight_profile" != "a19-bot-seat" && "$fight_profile" != "ranked-current-a19-work" ]]; then
        note "note: $fight_profile is wall-clock bounded; keep --processes and the host fixed for the whole study"
    fi

    ROOT="$common_root" RUN="$shard_dir" GAMES="$games" SEED="$seed" PROFILE="$fight_profile" \
        PROCS="$processes" WORKERS="$workers_per_process" WINDOW="$window" COHORTS="$cohorts" BUN_DIR="$bun_dir" \
        bash "$SCRIPT_DIR/shard_driver.sh" || die "shard driver failed; shards preserved at $shard_dir"

    (
        cd -- "$common_root"
        bun "$SCRIPT_DIR/merge_ai_meta_shards.ts" "$shard_dir" "$output" "$common_root"
    )

    local summary="$output/ai-meta.summary.json"
    local report="$output/ai-meta-report.html"
    validator "$common_root" validate "$summary" \
        --expect-games "$games" --expect-seed "$seed" --expect-cohorts "$cohorts" \
        --expect-fight-profile "$fight_profile" --require-synergies
    [[ ! -e "$report" && ! -L "$report" ]] || die "report path already exists; refusing to overwrite: $report"
    note "validated merged run; rendering standalone HTML"
    (
        cd -- "$common_root"
        bun src/simulation/render_ai_meta_report.ts "$summary" "$report"
    )
    validator "$common_root" validate "$summary" \
        --expect-games "$games" --expect-seed "$seed" --expect-cohorts "$cohorts" --report "$report" \
        --expect-fight-profile "$fight_profile" --require-synergies
    validator "$common_root" findings "$summary" --top 3
    note "report: $report"
}

existing_operation() {
    local operation="$1"
    shift
    local target=""
    local repo_root="${HOC_CLIENT_DIR-}"
    local report=""
    local top=3
    local allow_legacy_water=0
    local report_explicit=0

    while (($#)); do
        case "$1" in
            --repo-root|--client-root)
                require_value "$1" "${2-}"
                repo_root="$2"
                shift 2
                ;;
            --report)
                require_value "$1" "${2-}"
                report="$2"
                report_explicit=1
                shift 2
                ;;
            --top)
                require_value "$1" "${2-}"
                top="$2"
                shift 2
                ;;
            --allow-legacy-water)
                allow_legacy_water=1
                shift
                ;;
            -h|--help)
                usage
                return
                ;;
            --*) die "unknown option for $operation: $1" ;;
            *)
                [[ -z "$target" ]] || die "$operation accepts exactly one run directory or summary path"
                target="$1"
                shift
                ;;
        esac
    done
    [[ -n "$target" ]] || die "$operation requires a run directory or summary.json"
    is_nonnegative_integer "$top" && ((top >= 1 && top <= 20)) || die "--top must be an integer from 1 to 20"

    local common_root summary run_dir
    common_root="$(resolve_common_root "$repo_root")"
    summary="$(resolve_summary "$target")"
    run_dir="$(dirname -- "$summary")"
    [[ -f "$summary" ]] || die "summary does not exist: $summary"
    [[ -n "$report" ]] || report="$run_dir/ai-meta-report.html"
    report="$(physical_path "$report")"
    command -v bun >/dev/null 2>&1 || die "bun is required"

    if [[ "$operation" == "render" ]]; then
        if ((allow_legacy_water == 1)); then
            validator "$common_root" validate "$summary" --allow-legacy-water
        else
            validator "$common_root" validate "$summary"
        fi
        [[ ! -e "$report" && ! -L "$report" ]] || die "report path already exists; refusing to overwrite: $report"
        note "validated raw run; rendering standalone HTML"
        (
            cd -- "$common_root"
            bun src/simulation/render_ai_meta_report.ts "$summary" "$report"
        )
        if ((allow_legacy_water == 1)); then
            validator "$common_root" validate "$summary" --report "$report" --allow-legacy-water
        else
            validator "$common_root" validate "$summary" --report "$report"
        fi
        note "report: $report"
        return
    fi

    if [[ -f "$report" ]]; then
        if ((allow_legacy_water == 1)); then
            validator "$common_root" validate "$summary" --report "$report" --allow-legacy-water
        else
            validator "$common_root" validate "$summary" --report "$report"
        fi
    elif ((report_explicit == 1)); then
        die "report does not exist: $report"
    else
        note "no HTML report found; validating summary and raw gzip files only"
        if ((allow_legacy_water == 1)); then
            validator "$common_root" validate "$summary" --allow-legacy-water
        else
            validator "$common_root" validate "$summary"
        fi
    fi
    if ((allow_legacy_water == 1)); then
        validator "$common_root" findings "$summary" --top "$top" --allow-legacy-water
    else
        validator "$common_root" findings "$summary" --top "$top"
    fi
}

main() {
    local operation="${1-}"
    case "$operation" in
        run|smoke)
            shift
            run_operation "$operation" "$@"
            ;;
        run-sharded)
            shift
            sharded_operation "$@"
            ;;
        render|inspect)
            shift
            existing_operation "$operation" "$@"
            ;;
        -h|--help|help|"") usage ;;
        *) die "unknown operation '$operation'; expected run, smoke, render, or inspect" ;;
    esac
}

main "$@"
