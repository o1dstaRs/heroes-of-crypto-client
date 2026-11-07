# Test visual release — 2026-11-07

## Current coordinated candidate

Client #205 and server #70 pin common `33f6441c8009d72e052de7601cdcc5bee2cb02e0` from common #114.
Artifact IDs, tier lists, ordering, exclusions, power values and execution behavior follow current main.
Adopt this candidate with the matching authoritative server engine through the guarded coordinated release.

## Original visual-only rollout

The test deployment keeps the existing API, account data, AI and recommendation service.
The client pins common 832a54e5b23fd8e1f47f7514ffb906291a6c5f2c, the engine running on the test API.
Local creature art, animation settings, portrait contours, sidebar effects, restored aiming graphics,
nearest blocking obstacle targeting and homepage art are versioned here.

Restore the files listed by game/core/asset-release-archives.json using ANIMATION_RELEASE.md.
Download archives from https://drive.google.com/drive/folders/1zSPXuiVGXuZW_GQ5KkCmDd68pA1_G7Fy
and the shared baseline folder linked by that manifest. Archive 11 is the v3 portrait contour package.
Never build this release with another developer's old asset directory: the checksum gate must pass.

Use the guarded server deployer with --client-only --client-test. Do not redeploy testapi or knowledgeai
to publish these visual changes. The test-only release-floor check requires every later client deploy
to contain the last verified client release; merge this client branch before deploying another branch.
The floor lives outside dist and is advanced only after a successful deployment.
Manual rollback remains available from the deployment's named snapshot; it must be an intentional action.
