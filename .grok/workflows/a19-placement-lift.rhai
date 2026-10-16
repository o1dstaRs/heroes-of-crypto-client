let meta = #{
    name: "a19-placement-lift",
    description: "Keep trying strategy-dependent a19 placements until one beats current a19 by 20 percentage points in every meta cohort, or the round cap is used",
    when_to_use: "Overnight search for an a19 v0.8 placement that wins more than today's a19 in every army cohort. Measures each idea and does not ship a rule that misses the bar.",
    phases: [
        #{ title: "Read", detail: "What today's a19 placement already does" },
        #{ title: "Design", detail: "Strategy-dependent placement candidates" },
        #{ title: "Screen", detail: "Paired fights per cohort, then a harder rerun if one clears" },
        #{ title: "Report", detail: "Ship only a candidate that cleared every cohort" },
    ],
};

fn trimmed(s) {
    if type_of(s) == "string" {
        s.trim();
        s
    } else {
        ""
    }
}

fn find_cell(rows, name) {
    if type_of(rows) != "array" {
        return ();
    }
    for row in rows {
        if type_of(row) == "map" && row.name == name {
            return row;
        }
    }
    ()
}

fn gap_of(left, right) {
    let gap = left - right;
    if gap < 0 {
        gap = 0 - gap;
    }
    gap
}

fn evaluate(output, min_games) {
    if type_of(output) != "map" {
        return #{ pass: false, notes: "measurer returned no object" };
    }
    let notes = "";
    let pass = true;
    if type_of(output.cohorts) != "array" || type_of(output.angles) != "array" {
        return #{ pass: false, notes: "missing cohort or angle rows" };
    }
    let required_cohorts = [
        "ranked-draft",
        "uniform-mixed",
        "ranged-heavy",
        "ground-melee",
        "flyer-heavy",
        "caster-support",
        "cross-archetype",
    ];
    for name in required_cohorts {
        let row = find_cell(output.cohorts, name);
        if row == () {
            pass = false;
            notes += name + " is missing. ";
        } else if row.games == () || row.delta_pp == () || row.treated_pp == () || row.control_pp == () || row.se_pp == () {
            pass = false;
            notes += name + " is missing a number. ";
        } else {
            if row.games < min_games {
                pass = false;
                notes += name + " has " + row.games.to_string() + " games, need " + min_games.to_string() + ". ";
            }
            if gap_of(row.treated_pp - row.control_pp, row.delta_pp) > 1.5 {
                pass = false;
                notes += name + " delta does not match treated minus control. ";
            }
            if row.control_pp > 80 {
                notes += name + " control is already " + row.control_pp.to_string() + ", so plus 20 percentage points is impossible. ";
            }
            if row.delta_pp < 20 {
                pass = false;
                notes += name + " is " + row.delta_pp.to_string() + "pp, under 20. ";
            }
        }
    }
    let required_angles = ["ground", "splash", "line", "flyers", "spells", "shooters"];
    for name in required_angles {
        let row = find_cell(output.angles, name);
        if row == () || row.games == () || row.delta_pp == () || row.games < min_games || row.delta_pp < 0 {
            pass = false;
            notes += "angle " + name + " regressed or is missing. ";
        }
    }
    #{ pass: pass, notes: notes }
}

let games = 16;
let workers = 12;
if args != () {
    if args.games != () && args.games >= 8 && args.games <= 48 {
        games = args.games;
    }
    if args.workers != () && args.workers >= 1 && args.workers <= 12 {
        workers = args.workers;
    }
}
let min_games = games * 2;
let confirm_games = games * 3;
if confirm_games > 48 {
    confirm_games = 48;
}
let confirm_min = confirm_games * 2;
let max_rounds = 10;
if args != () {
    if args.max_rounds != () && args.max_rounds >= 1 && args.max_rounds <= 16 {
        max_rounds = args.max_rounds;
    }
}
let round_ids = [];
let round_n = 1;
while round_n <= max_rounds {
    round_ids.push(round_n);
    round_n += 1;
}

let idea_schema = #{
    "type": "object",
    "required": ["ideas"],
    "properties": #{
        "ideas": #{
            "type": "array",
            "maxItems": 4,
            "items": #{
                "type": "object",
                "required": ["title", "rule", "cohorts"],
                "properties": #{
                    "title": #{ "type": "string" },
                    "rule": #{ "type": "string" },
                    "cohorts": #{ "type": "string" },
                },
            },
        },
    },
};
let candidate_schema = #{
    "type": "object",
    "required": ["candidates"],
    "properties": #{
        "candidates": #{
            "type": "array",
            "maxItems": 3,
            "items": #{
                "type": "object",
                "required": ["title", "rule"],
                "properties": #{
                    "title": #{ "type": "string" },
                    "rule": #{ "type": "string" },
                },
            },
        },
    },
};
let measure_schema = #{
    "type": "object",
    "required": ["candidate_id", "output_path", "cohorts", "angles"],
    "properties": #{
        "candidate_id": #{ "type": "string" },
        "output_path": #{ "type": "string" },
        "cohorts": #{
            "type": "array",
            "maxItems": 7,
            "items": #{
                "type": "object",
                "required": ["name", "games", "delta_pp", "se_pp", "treated_pp", "control_pp"],
                "properties": #{
                    "name": #{ "type": "string" },
                    "games": #{ "type": "integer" },
                    "delta_pp": #{ "type": "number" },
                    "se_pp": #{ "type": "number" },
                    "treated_pp": #{ "type": "number" },
                    "control_pp": #{ "type": "number" },
                },
            },
        },
        "angles": #{
            "type": "array",
            "maxItems": 6,
            "items": #{
                "type": "object",
                "required": ["name", "games", "delta_pp", "se_pp", "treated_pp", "control_pp"],
                "properties": #{
                    "name": #{ "type": "string" },
                    "games": #{ "type": "integer" },
                    "delta_pp": #{ "type": "number" },
                    "se_pp": #{ "type": "number" },
                    "treated_pp": #{ "type": "number" },
                    "control_pp": #{ "type": "number" },
                },
            },
        },
    },
};
let verdict_schema = #{
    "type": "object",
    "required": ["measurement_holds", "evidence"],
    "properties": #{
        "measurement_holds": #{ "type": "boolean" },
        "evidence": #{ "type": "string" },
    },
};
let port_schema = #{
    "type": "object",
    "required": ["ported", "summary"],
    "properties": #{
        "ported": #{ "type": "boolean" },
        "summary": #{ "type": "string" },
    },
};

let bounds = "Work on the main working tree of this repo. Do not create a git worktree or branch. Do not git stash, commit, push, or revert files you did not create in this run. ";
bounds += "Do not hard-code a home directory. The server repo is the sibling directory heroes-of-crypto-server next to this client repo. ";
bounds += "Read the files with read_file and grep before you answer. Do not answer from memory.\n\n";

let rejected = "These placement arms were already measured. Do not propose them again as a new idea. ";
rejected += "Paying for Placement augment value 2, which extends the zone, lost on a shooter army (ground -25pp, splash -17, line -52, flyers -36, spells -9, shooters +3). ";
rejected += "Putting shooters on corners and also extending the zone still lost to splash, line, and flyers. ";
rejected += "Corners inside the existing zone, skipped when the enemy has Area Throw or Large Caliber, are already in v0.8 placeArmy and in the server post-pass. Control includes that rule, so repeating it scores about zero. ";
rejected += "Do not change the augment spend. Sniper 3, Armor 3, Might 1 stays. Do not change fight targeting, waiting, or search. This run is placement only.\n\n";

phase("Read");
let read_prompt = bounds;
read_prompt += "Describe today's a19 v0.8 placement in a short note the designers will not see. Read game/heroes-of-crypto-common/src/ai/versions/v0_8.ts placeArmy, ";
read_prompt += "the placement helpers it calls, game/heroes-of-crypto-common/src/simulation/ai_meta_cohorts_core.ts for AI_META_COHORTS, and the server post-pass seatRangedOnBackCorners in the sibling heroes-of-crypto-server play_session.ts. ";
read_prompt += "Also read prepareMetaPair in ai_meta_cohorts_core.ts and the runMatch options used by game/heroes-of-crypto-common/src/simulation/measure_focus_shot.ts. ";
read_prompt += "Return ideas as an empty list. This call only forces the files to be opened; the designers read them again themselves.";
let read_result = agent(read_prompt, #{
    label: "read:placement",
    capability_mode: "read-only",
    output_schema: idea_schema,
});
if read_result == () || read_result.success != true {
    log("baseline read failed; designers still have to open the files");
} else {
    log("baseline read finished");
}

let winner = ();
let winner_id = "";
let screen_notes = "";
let history = "Nothing has been measured yet.\n";
let stop = false;
for round in round_ids {
    if winner == () && stop == false {
        log("round " + round.to_string() + " of " + max_rounds.to_string());
        phase("Design");
        let design_jobs = [];
        let ranged_prompt = bounds + rejected;
        ranged_prompt += "Round " + round.to_string() + " of " + max_rounds.to_string() + ". You own ranged-heavy and ranked-draft. ";
        ranged_prompt += "Read v0.8 placeArmy before proposing anything. Results so far:\n";
        ranged_prompt += history;
        ranged_prompt += "\nPropose at most 4 NEW placement rules for how a shooter army should occupy the zone it already has, depending on its own shooter count and on the opponent's public roster. ";
        ranged_prompt += "Aim at the cohorts that are still under 20 percentage points. Do not repeat a rule already measured. ";
        ranged_prompt += "Splash (Area Throw, Large Caliber) must not be bunched into one blast. A rule that uses one formation for every opponent is not acceptable. ";
        ranged_prompt += "Each idea needs a title, a concrete rule a programmer can implement in placeArmy, and the cohorts it is meant to help.";
        design_jobs.push(#{
            prompt: ranged_prompt,
            label: "design:ranged:r" + round.to_string(),
            capability_mode: "read-only",
            output_schema: idea_schema,
        });

        let melee_prompt = bounds + rejected;
        melee_prompt += "Round " + round.to_string() + " of " + max_rounds.to_string() + ". You own ground-melee and flyer-heavy. ";
        melee_prompt += "Read v0.8 placeArmy before proposing anything. Results so far:\n";
        melee_prompt += history;
        melee_prompt += "\nPropose at most 4 NEW placement rules for screens, chargers, and flyers. Say how the formation changes when the opponent's public roster has shooters, flyers, or a line attack such as Fire Breath. ";
        melee_prompt += "Aim at the cohorts that are still under 20 percentage points. Do not repeat a rule already measured. ";
        melee_prompt += "Do not spend Placement augment points to open the back edge. Each idea needs a title, a concrete placeArmy rule, and the cohorts it is meant to help.";
        design_jobs.push(#{
            prompt: melee_prompt,
            label: "design:melee-flyer:r" + round.to_string(),
            capability_mode: "read-only",
            output_schema: idea_schema,
        });

        let caster_prompt = bounds + rejected;
        caster_prompt += "Round " + round.to_string() + " of " + max_rounds.to_string() + ". You own caster-support, cross-archetype, and opponent threat branches. ";
        caster_prompt += "Read v0.8 placeArmy before proposing anything. Results so far:\n";
        caster_prompt += history;
        caster_prompt += "\nPropose at most 4 NEW placement rules that put casters and their screens differently against splash, a line attack, flyers, and a shooter wall. ";
        caster_prompt += "Aim at the cohorts that are still under 20 percentage points. Do not repeat a rule already measured. ";
        caster_prompt += "A single formation for every cohort will not clear the bar. ";
        caster_prompt += "Each idea needs a title, a concrete placeArmy rule, and the cohorts it is meant to help.";
        design_jobs.push(#{
            prompt: caster_prompt,
            label: "design:caster-threat:r" + round.to_string(),
            capability_mode: "read-only",
            output_schema: idea_schema,
        });
        let designed = parallel(design_jobs);

        let idea_blob = "";
        let idea_count = 0;
        for r in designed {
            if r != () && r.success == true && type_of(r.output) == "map" && type_of(r.output.ideas) == "array" {
                for idea in r.output.ideas {
                    if type_of(idea) == "map" && type_of(idea.title) == "string" && type_of(idea.rule) == "string" {
                        idea_count += 1;
                        idea_blob += json_encode(idea);
                        idea_blob += "\n";
                    }
                }
            }
        }
        log("round " + round.to_string() + " designers returned " + idea_count.to_string() + " usable ideas");

        let synth_prompt = bounds + rejected;
        synth_prompt += "Round " + round.to_string() + ". Merge the ideas below into at most 3 placement candidates. ";
        synth_prompt += "Drop duplicates, anything already measured, and anything that only repeats the corner rule already shipped. ";
        synth_prompt += "Each candidate must branch on the army's own jobs and on the opponent's public roster. ";
        synth_prompt += "Prefer a rule aimed at the cohorts still under 20 percentage points. ";
        synth_prompt += "Return an empty candidates list if none of the ideas are concrete enough to implement. Results so far:\n";
        synth_prompt += history;
        synth_prompt += "\nIdeas, as JSON lines:\n";
        synth_prompt += idea_blob;
        let synthesized = agent(synth_prompt, #{
            label: "design:merge:r" + round.to_string(),
            capability_mode: "read-only",
            output_schema: candidate_schema,
        });

        let candidates = [];
        if synthesized != () && synthesized.success == true && type_of(synthesized.output) == "map" && type_of(synthesized.output.candidates) == "array" {
            let dropped = 0;
            for c in synthesized.output.candidates {
                if type_of(c) == "map" && type_of(c.title) == "string" && type_of(c.rule) == "string" {
                    if candidates.len() < 3 {
                        candidates.push(c);
                    } else {
                        dropped += 1;
                    }
                }
            }
            if dropped > 0 {
                log("dropped " + dropped.to_string() + " candidates over the cap of 3");
            }
        }

        if candidates.len() == 0 {
            if round == 1 {
                let empty_report = "# a19 placement lift\n\nNo concrete placement candidate survived design, so nothing was measured and nothing was shipped.\n";
                empty_report += "The bar was plus 20 percentage points of paired win rate in every meta cohort, against today's a19, with no threat-angle regression.\n";
                let empty_path = write_scratch_file("a19-placement-lift.md", empty_report);
                complete(#{
                    path: empty_path,
                    report: empty_report,
                    status: "unmeasured",
                    shipped: false,
                });
            }
            stop = true;
            screen_notes += "Round " + round.to_string() + " produced no new candidate. ";
        } else {
            phase("Screen");
            let index = 0;
            for c in candidates {
                index += 1;
                let cid = "r" + round.to_string() + "c" + index.to_string();
    if winner != () {
        screen_notes += cid + " not run because an earlier candidate already cleared the bar. ";
    } else {
        let impl_prompt = bounds + rejected;
        impl_prompt += "Implement placement candidate " + cid + " only. Title: " + c.title + "\nRule: " + c.rule + "\n\n";
        impl_prompt += "Add the placeArmy wrapper in game/heroes-of-crypto-common/src/ai/versions/v0_8_placement_lift.ts. ";
        impl_prompt += "Add or extend game/heroes-of-crypto-common/src/simulation/measure_a19_placement_lift.ts so it can run that candidate. ";
        impl_prompt += "Do not edit v0_8.ts, play_session.ts, or the augment spend. Do not delete earlier candidate functions.\n\n";
        impl_prompt += "Control is createV08A19Strategy() with no wrapper. Treatment uses the same strategy except placeArmy. ";
        impl_prompt += "Both sides otherwise share doctrine, augments, search, and the public-roster setup. sideOrientedPlacement is true. ";
        impl_prompt += "Seeds must not include the arm name, so each pair matches. Draws score 0.5. ";
        impl_prompt += "Build cohort armies with prepareMetaPair from ai_meta_cohorts_core.ts. Do not invent a second cohort sampler. ";
        impl_prompt += "Also run the six fixed threat angles from measure_ranged_placement_angles.ts: ground, splash, line, flyers, spells, shooters.\n\n";
        impl_prompt += "The runner takes --candidate " + cid + " --games N --workers N --output sim-out/a19-placement-lift-" + cid + ".json. ";
        impl_prompt += "It reuses a worker pool of at most 12 and stops those workers when finished. ";
        impl_prompt += "It writes cohorts and angles as rows with name, games, delta_pp, se_pp, treated_pp, control_pp. ";
        impl_prompt += "delta_pp is treated win percent minus control win percent.\n\n";
        impl_prompt += "Smoke one game of " + cid + " and one control game before you return. If a creature name is rejected, fix the level and smoke again. ";
        impl_prompt += "Do not start the full grid. Do not run measure_ai_meta_cohorts.ts.";
        let impl = agent(impl_prompt, #{
            label: "implement:" + cid,
            capability_mode: "all",
        });
        if impl == () || impl.success != true {
            screen_notes += cid + " did not implement. ";
        } else {
            let measure_prompt = bounds;
            measure_prompt += "Run the placement screen for candidate " + cid + " and do not edit source files.\n\n";
            measure_prompt += "From game/heroes-of-crypto-common run: bun src/simulation/measure_a19_placement_lift.ts --candidate " + cid;
            measure_prompt += " --games " + games.to_string() + " --workers " + workers.to_string();
            measure_prompt += " --output sim-out/a19-placement-lift-" + cid + ".json\n\n";
            measure_prompt += "That is " + games.to_string() + " seeds times 2 seats for each of the 7 cohorts and 6 threat angles, both arms. ";
            measure_prompt += "Use at most 12 workers. Do not run measure_ai_meta_cohorts.ts and do not launch a second copy of this run. ";
            measure_prompt += "If the script is missing or a game throws, stop and return empty cohorts and angles.\n\n";
            measure_prompt += "Read the JSON file back with read_file. Return those rows. Do not invent a win rate. ";
            measure_prompt += "output_path is the file you wrote. candidate_id is " + cid + ".";
            let measured = agent(measure_prompt, #{
                label: "measure:" + cid,
                capability_mode: "execute",
                output_schema: measure_schema,
            });
            if measured == () || measured.success != true || type_of(measured.output) != "map" {
                screen_notes += cid + " did not return a table. ";
            } else {
                let gate = evaluate(measured.output, min_games);
                screen_notes += cid + " screen: " + gate.notes + " ";
                if gate.pass == true {
                    let confirm_prompt = bounds;
                    confirm_prompt += "Rerun candidate " + cid + " at the confirmation size. Do not edit source.\n\n";
                    confirm_prompt += "From game/heroes-of-crypto-common run: bun src/simulation/measure_a19_placement_lift.ts --candidate " + cid;
                    confirm_prompt += " --games " + confirm_games.to_string() + " --workers " + workers.to_string();
                    confirm_prompt += " --output sim-out/a19-placement-lift-" + cid + "-confirm.json\n\n";
                    confirm_prompt += "Read that JSON back. Return its rows. candidate_id is " + cid + ". ";
                    confirm_prompt += "output_path is the confirm file. Do not invent numbers and do not reuse the smaller screen file.";
                    let confirmed = agent(confirm_prompt, #{
                        label: "confirm:" + cid,
                        capability_mode: "execute",
                        output_schema: measure_schema,
                    });
                    if confirmed == () || confirmed.success != true || type_of(confirmed.output) != "map" {
                        screen_notes += cid + " confirmation did not return a table. ";
                    } else {
                        let confirm_gate = evaluate(confirmed.output, confirm_min);
                        screen_notes += cid + " confirm: " + confirm_gate.notes + " ";
                        if confirm_gate.pass == true {
                            let verify_prompt = "Check the confirmation file on disk. Do not edit anything and do not rerun the fights.\n\n";
                            verify_prompt += "Open " + confirmed.output.output_path + " with read_file. ";
                            verify_prompt += "measurement_holds is true only if that file exists, both arms are paired by the same seed, and every cohort row shows a delta of at least 20 percentage points. ";
                            verify_prompt += "evidence must quote one cohort row from the file, including its delta. If the file is missing or the quote does not match, measurement_holds is false.";
                            let verdict = agent(verify_prompt, #{
                                label: "verify:" + cid,
                                capability_mode: "read-only",
                                output_schema: verdict_schema,
                            });
                            let evidence = "";
                            let holds = false;
                            if verdict != () && verdict.success == true && type_of(verdict.output) == "map" {
                                holds = verdict.output.measurement_holds == true;
                                evidence = trimmed(verdict.output.evidence);
                            }
                            if holds == true && evidence != "" {
                                winner = confirmed.output;
                                winner_id = cid;
                                winner.rule = c.rule;
                                winner.title = c.title;
                                screen_notes += cid + " cleared the bar. ";
                            } else {
                                screen_notes += cid + " failed verification. ";
                            }
                        }
                    }
                }
            }
        }
    }
            }
            history = screen_notes;
        }
    }
}

phase("Report");
let ported = false;
let port_summary = "Not shipped. No candidate beat today's a19 by 20 percentage points in every cohort.";
if winner != () {
    let port_prompt = bounds + rejected;
    port_prompt += "The confirmation file cleared the bar. Port candidate " + winner_id + " and nothing else.\n\n";
    port_prompt += "Title: " + winner.title + "\nRule: " + winner.rule + "\n\n";
    port_prompt += "Put that placeArmy behavior into game/heroes-of-crypto-common/src/ai/versions/v0_8.ts so the sim's createV08A19Strategy uses it, ";
    port_prompt += "and into the server post-pass in the sibling heroes-of-crypto-server play_session.ts so both seats use it. ";
    port_prompt += "The lower seat's own placeArmy does not call the base placeArmy, so a submodule-only edit would miss that seat. ";
    port_prompt += "Do not change augment spend, fight targeting, or search. Do not commit, push, or bump the common pin. Do not restart or kill the dev server.\n\n";
    port_prompt += "ported is true only if both files now contain the rule. summary names the files and says the running server still uses its installed common package until a pin bump, while the server post-pass is what a local match will run.";
    let port_result = agent(port_prompt, #{
        label: "port:" + winner_id,
        capability_mode: "all",
        output_schema: port_schema,
    });
    if port_result != () && port_result.success == true && type_of(port_result.output) == "map" && port_result.output.ported == true {
        ported = true;
        port_summary = trimmed(port_result.output.summary);
        if port_summary == "" {
            port_summary = winner_id + " was ported.";
        }
    } else {
        port_summary = winner_id + " cleared the table but the port did not land.";
    }
}

let report = "# a19 placement lift\n\n";
report += "Bar: treatment win rate minus today's a19 win rate is at least 20 percentage points in all seven cohorts ";
report += "(ranked-draft, uniform-mixed, ranged-heavy, ground-melee, flyer-heavy, caster-support, cross-archetype). ";
report += "Draws count as half a win. This is not a 1.2 times ratio. A cohort already above 80% cannot pass, and the bar is not lowered for it. ";
report += "The six threat angles (ground, splash, line, flyers, spells, shooters) must not regress.\n\n";
report += "Screen size was " + games.to_string() + " seeds per seat. Confirmation size was " + confirm_games.to_string() + " seeds per seat. Workers " + workers.to_string() + ". ";
report += "The search stops at " + max_rounds.to_string() + " rounds, or sooner when a candidate clears every cohort.\n\n";
report += screen_notes + "\n\n";
report += port_summary + "\n";
let report_path = write_scratch_file("a19-placement-lift.md", report);
let status = "bar-not-met";
if ported == true {
    status = "shipped";
} else if winner != () {
    status = "measured-not-ported";
}
complete(#{
    path: report_path,
    report: report,
    status: status,
    shipped: ported,
    winner: winner_id,
});
