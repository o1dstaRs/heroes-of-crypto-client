# ElevenLabs SFX generation and local receipts

Read this when generating new takes or recovering their downloads. For mastering only,
reuse the existing receipts and raw files without calling a generation tool.
All paths and shell commands below are relative to the repository root.

## Connector and prompts

Discover the session's ElevenLabs MCP tools. Use `creative_get_flow_node_types` to verify
available SFX models, then `creative_get_model_guide` and `creative_get_model_schema` for
the effective model. The current combat library uses `eleven_text_to_sound_v2`, node type
`sfx`. Pass both `model_id` and `node_type` to the schema request when required; effective
backend requirements can be more specific than the advertised connector schema.
If unavailable, report that honestly and work with existing local takes or an authorized
source. Do not reset a working connector or invent credentials.

Match prompts and durations in `game/core/audio/combat-sound-design.json` exactly: the
collector associates finished media with roles by prompt equality. Keep prompts unique.
Read prompts as sound descriptions rather than creature appearance descriptions.
Inspect the complete creature art first, as required by the main skill. Make the visible
weapon's physical sound explicit; naming a creature or an enchantment does not communicate
a steel sword, its weight, or its swing to an audio-only model.
For example: “One close dry steel hammer strike, short metallic crack and low body,
immediate onset, no music or background ambience.”

Current node parameters are:

```json
{
    "duration_seconds": 1.0,
    "prompt_influence": 0.7,
    "loop": false
}
```

Use each design entry's duration instead of the example value. Ordinary attack sources
are about 1 second, hurt sources about 0.8 seconds, with slightly longer heavy effects.
Generation duration is an input budget; mastering removes quiet edges.

## Run once, poll, and retain completed takes

1. Create or reuse one flow for the sound assignment. Add one `sfx` node per requested
   unit/role with the exact design prompt, effective model, and schema-checked parameters.
2. Use `creative_run_flow_nodes` on existing node IDs. An estimate-only call can check
   cost and blocking errors without generating. Leave `generations_count` at the connector
   default unless the user requests a count; the current default is four variations.
3. Start with a small pilot, then use batches of at most ten nodes. These batch sizes worked
   for the original library; reduce them if the workspace reports a lower queue allowance.
4. Save the returned flow ID, session IDs, node-to-session results, and generation IDs in
   ignored `game/core/tmp/audio`. Poll `creative_get_flow_run_status` using the returned
   sessions and suggested interval. Smaller status groups, around twenty sessions, avoid
   very large responses. Combine their results by generation ID.
5. Poll until each started session is completed or failed, retaining successes even when
   another variation fails. `has_failures` alone does not establish that all other sessions
   are terminal. Download completed media promptly because URLs expire.

Generation calls spend credits. Never repeat a run merely because polling is slow or a
response is ambiguous. Reconcile the existing flow and session records first. On partial
queue rejection, retain every accepted take and retry only a genuinely missing unit/role
after checking it has no accepted or completed generation. Stop generating when the requested
roles have usable takes; further alternatives require a requested revision or a demonstrated
quality failure. Use a new design prompt or an explicit selection when revising; old takes
with the same prompt remain eligible for automated selection.

Parse the JSON text content if `structuredContent` is absent or empty. Keep full status
responses locally, but share clean flow links rather than OAuth-bearing or signed URLs.

## Receipt shape consumed by the mastering script

Save a pilot as `game/core/tmp/audio/pilot-run.json` and subsequent completed status
results as unique `batch-<label>-complete.json` files. Merge smaller status groups into
one `run`, deduplicating its `generations` and `media` by generation ID. Do not overwrite
previous receipts or re-run accepted generations to recover a file.

The script needs this subset of the real result:

```json
{
    "flow_id": "returned-flow-id",
    "session_ids": ["returned-session-id"],
    "run": {
        "generations": [
            {
                "id": "returned-generation-id",
                "prompt": "exact prompt from combat-sound-design.json",
                "status": "completed"
            }
        ],
        "media": [
            {
                "generation_id": "returned-generation-id",
                "master_url": "temporary download URL from status",
                "url": "temporary download URL from status"
            }
        ]
    }
}
```

Use real IDs, prompts, and returned URLs; this is a shape example, not a fixture.
`media.prompt` is accepted if the corresponding generation lacks a prompt.
The downloader prefers `master_url` and otherwise uses `url`, caches sources under
`tmp/audio/raw/<slug>/<role>/<generation-id>.mp3`, and skips existing downloads.
If a URL expired before download, refresh the existing run's status rather than starting
new generation. If there are no receipts on another machine, recover them from the
original flow/session records; committed provenance alone does not contain download URLs.

Run `python3 game/core/scripts/prepare_combat_audio.py --download-only`, then follow the
skill's mastering and validation steps. Do not commit receipts or temporary URLs.
