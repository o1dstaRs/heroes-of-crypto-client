# Deploying Heroes of Crypto

Run these commands from the client repository on a machine with the canonical art, Bun, Git, SSH and rsync. The server checkout defaults to `../heroes-of-crypto-server`; override it with `HOC_SERVER_LOC`.

```bash
bun run deploy:plan          # local routing/command preview; no build or network requests
bun run deploy:check         # local release prerequisites; no build or network requests
bun run deploy:test          # shared assistant + test APIs + test game + test website
bun run deploy:prod          # shared assistant + production APIs + production game + website
bun run deploy:all           # shared assistant → test → production; stop on any failure
```

`deploy:plan` and `deploy:check` also accept `test`, `prod` or `all` as the last argument. A plan prints unmet prerequisites without applying anything; the check exits unsuccessfully when prerequisites are unmet. Checks use cached remote refs; a real deployment fetches again.

`bun run deploy` is an alias for `bun run deploy:all`.

The commands reuse the server's `deploy/deploy.ts`. They retain its snapshots, frozen remote install, service health checks and rollback. Rollback is per component; a failed later component does not automatically undo earlier successful components. CI tests the coordinator but does not publish its private-art stubs.

## Release preparation

The game and website build against the client's common submodule. Ranked APIs and Knowledge AI install the Git dependency in the server's `package.json` and `bun.lock`. Building the client does not update the server's rules.

1. Commit only the intended changes in common. Fetch/rebase its main branch and push those commits.
2. Commit any pending server source changes locally before running the pin helper. It will not stash a shared working tree.
3. Run `bun run deploy:pin-common`. It fetches/rebases common and server, sets the server dependency to the published common SHA, and installs dependencies to update the lockfile. It does not commit or push.
4. Verify the server with `bun run typecheck` and the relevant tests. Commit its `package.json` and `bun.lock` together with any remaining server changes, then fetch/rebase and push main.
5. Record the identical common checkout in the client's submodule pin. Commit only your client changes, run `bun run check`, then fetch/rebase and push main.
6. Run `bun run deploy:all`.

Include server source fixes in step 2; changing only its common dependency cannot apply a server-only fix. In particular, the automatic extra-time fix belongs in the ranked server's `play_session.ts` as well as the sandbox client.

Deploy refuses dirty repositories, unpublished commits, a drifted common checkout, mutable common pins, and mismatched manifest/lockfile pins. It never commits, pushes, stashes or switches branches. Root and server must be on main; a detached common checkout is allowed when its pinned commit is published on remote main.

It fetches/rebases the current main branches before each deployment phase and rechecks the common pin. If a peer advances a repository after validation, it stops; rerun the release so test and production receive the same validated revisions. Commit or pin updates are deliberate preparation steps rather than silent changes during deployment.

## Public routing

| Component                | Test                              | Production                                |
| ------------------------ | --------------------------------- | ----------------------------------------- |
| Game client              | `https://test.heroesofcrypto.io`  | `https://app.heroesofcrypto.io`           |
| Website, codex and arena | `https://test.heroesofcrypto.io`  | `https://heroesofcrypto.io`               |
| Auth API                 | test `/v1/*` → `testapi:3010`     | `auth.heroesofcrypto.io` → `authapi:3001` |
| Matchmaking API          | test `/v1/*` → `testapi:3010`     | `mm.heroesofcrypto.io` → `mmapi:3002`     |
| Ranked game API          | test `/v1/*` → `testapi:3010`     | `game.heroesofcrypto.io` → `gameapi:3003` |
| Transaction API          | test `/v1/*` → `testapi:3010`     | `tx.heroesofcrypto.io` → `txapi:3004`     |
| Knowledge AI             | test `/ai/*` → `knowledgeai:3020` | the same isolated service on test         |

Test has one hostname: nginx sends game routes to the `website` process on port 8080 and site routes to `/var/www/heroesofcrypto-test`. Production serves the game from `/root/game/dist` through port 8080 and the site from `/var/www/heroesofcrypto`. The test server deploy and test client/site deploy are separate calls because the server deployer requires `--client-test` to be client-only. Production uses its combined `--with-client` phase.

Both release modes optimize for production; test mode changes endpoints, Google sign-in ID and website links. The game and Astro wrappers clear inherited public environment values before loading the requested `.env.test` or `.env.production`. The coordinator validates the resolved values, including `.env.local` overrides, before contacting a server. Game and website must use the same complete OAuth ID for that environment, and their matching auth server must use it as `HOC_GOOGLE_CLIENT_ID`.

## Assets and builds

Set `HOC_IMAGES_LOC` to the canonical local WebP directory and `HOC_ANIMATIONS_LOC` to the animation directory containing `output`. Normal core builds copy and verify those images and animation atlases, generate the image imports, and include the versioned public audio and fonts. The website build verifies its art, builds pages and creates `knowledge-graph.json`. No asset should be manually copied to a public server URL.

Real deployment installs frozen dependencies locally, builds common, runs the client `check` gate, and invokes the server deployer for each phase. The deployer runs server lint, typecheck and non-DB unit tests, builds the appropriate game/site modes, installs the pinned common dependency on the host, and checks the deployed services and pages. Development-mode builds and CI stub builds cannot be released through the coordinator.

## Shared assistant configuration

The assistant runs on the test host in `/root/hoc-knowledge-ai` with its own `/root/ecosystem.test.config.cjs` entry and private `/root/heroes-of-crypto-knowledge.env`. Deploying it updates the service used by both environments, including when you select `deploy:test`.

The game's Ask Premium and the website's knowledge search use `https://test.heroesofcrypto.io/ai/knowledge`. Production's app hostname has no `/ai/` nginx proxy. Using the shared endpoint avoids sending those requests to the static game server.

The private assistant environment must allow all its browser origins:

```dotenv
HOC_KNOWLEDGE_CORS_ORIGINS=https://heroesofcrypto.io,https://app.heroesofcrypto.io,https://beta.heroesofcrypto.io,https://test.heroesofcrypto.io
```

The coordinator checks the public assistant health route and an authenticated-request CORS preflight for every origin immediately after deploying it. These checks do not ask the model a question or consume generation credits. A missing proxy or allowlist entry stops the release before the game/API phases. It does not overwrite private host environment files.

Premium statistical evidence also requires the assistant's existing `HOC_PREMIUM_ENABLED`, evidence snapshot and `HOC_PREMIUM_AUTH_URL` configuration. The entitlement URL must validate the environment that issued the token. The current shared service has one entitlement URL; separate test/prod token issuers require separate assistants or server-side issuer routing for evidence in both environments. A public health/CORS check verifies transport, not a paid entitlement or answer quality.

The existing host ecosystem and nginx configuration must already be installed. The coordinator updates application releases, not host provisioning, certificates, secrets or databases.

## Connection overrides

```bash
export HOC_SERVER_LOC="../heroes-of-crypto-server"
export HOC_DEPLOY_TEST_HOST="5.161.212.53"
export HOC_DEPLOY_PROD_HOST="46.62.203.149"
export HOC_DEPLOY_USER="root"
```

The coordinator isolates the deployer's `DEPLOY_*` variables per phase; generic values left in a shell cannot accidentally send a test site to a production directory. Test and production must use different hosts. Custom remote directory layouts should be changed in `scripts/deployment.ts` alongside their host nginx/ecosystem configuration.

The existing deployer refuses to reload game APIs during live matches by default. To use its restart-safe session restoration deliberately, append `--allow-live-games` to a deploy command.
