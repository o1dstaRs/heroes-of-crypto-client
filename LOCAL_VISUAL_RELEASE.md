# Test visual release — 2026-11-07

## Current coordinated candidate

The user approved a coordinated test client and API rollout on 2026-11-08. Client #205 and published
server main now use common `b61c2bfa7faa85e0141eba35a43e639edf5d8bc3`. Artifact IDs, tier lists,
ordering, exclusions, power values, roster and execution behavior follow current main.

The client includes protected test release `6905e984c6359fee0666fb1005dca2382be9706e` in its ancestry.
Its website-only hunks remain excluded from #205, while the shared-engine conflict uses the matching
published main pin. Preserve the restored main portraits, combat timing, footer and Start over controls.

Deploy the matching API with the guarded server deployer's `--services test`, then deploy #205 using
`--client-only --client-test --no-site`. Keep the website in #217, production and the independent
knowledge service outside this rollout. These approved coordinated steps supersede the original
visual-only API boundary below.

## Original visual-only rollout

The test deployment keeps the existing API, account data, AI and recommendation service.
The client pins common 832a54e5b23fd8e1f47f7514ffb906291a6c5f2c, the engine running on the test API.
Local creature art, animation settings, portrait contours, sidebar effects, restored aiming graphics,
nearest blocking obstacle targeting and homepage art are versioned here.

Restore the files listed by game/core/asset-release-archives.json using ANIMATION_RELEASE.md.
Download archives from https://drive.google.com/drive/folders/1zSPXuiVGXuZW_GQ5KkCmDd68pA1_G7Fy
and the shared baseline folder linked by that manifest. Archive 11 is the v3 portrait contour package.
Never build this release with another developer's old asset directory: the checksum gate must pass.

That original rollout used the guarded server deployer with --client-only --client-test and left
testapi and knowledgeai unchanged. The test-only release-floor check requires every later client deploy
to contain the last verified client release; merge this client branch before deploying another branch.
The floor lives outside dist and is advanced only after a successful deployment.
Manual rollback remains available from the deployment's named snapshot; it must be an intentional action.
