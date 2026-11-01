# Heroes of Crypto. The web3 turn-based strategy game for the browser.

<p align="center">
  <a href="https://github.com/o1dstaRs/heroes-of-crypto-client/actions/workflows/ci.yml">
    <img src="https://github.com/o1dstaRs/heroes-of-crypto-client/actions/workflows/ci.yml/badge.svg" alt="Client CI">
  </a>
  <a href="https://github.com/o1dstaRs/heroes-of-crypto-common/actions/workflows/ci.yml">
    <img src="https://github.com/o1dstaRs/heroes-of-crypto-common/actions/workflows/ci.yml/badge.svg" alt="Common CI">
  </a>
  <a href="https://bun.sh/">
    <img src="https://img.shields.io/badge/Bun-1.4.4-fa9b3b.svg?logo=bun&logoColor=white" alt="Bun">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License">
  </a>
</p>

For a detailed overview of the game mechanics, roadmap, and the vision behind Heroes of Crypto, please check out our [Whitepaper](https://heroes-of-crypto.gitbook.io/heroes-of-crypto-ai).
This repository contains the PixiJS 8 and React game client in `game/core`, the Astro marketing site in
`site`, and the headless model/MCP adapter in `game/mcp`.

**Depends on** the shared libraries in `game/heroes-of-crypto-common`. This package provides code shared between the client and server — protobuf definitions and generated code, shared TypeScript types, networking helpers, serialization utilities, and the game constants and rules. See the common repo at https://github.com/o1dstaRs/heroes-of-crypto-common

## Build & Test

Requires Bun 1.4.4 or newer

Prerequisites:

```bash
# Initialize the shared rules package after cloning.
git submodule update --init --recursive
bun install
bun run build:common
```

Generated protocol sources are checked in. Follow the shared package's
[agent instructions](game/heroes-of-crypto-common/AGENTS.md) before changing them: its current
`build:proto` script deletes generated files before failing and must not be used.

Env variables:

```bash
# Canonical Google Drive game-art folders. Use $HOME, not "~": inside double quotes the tilde
# stays literal, and the build scripts do not expand it either.
export HOC_IMAGES_LOC="$HOME/Google Drive/My Drive/heroesofcrypto/images"
export HOC_ANIMATIONS_LOC="$HOME/Google Drive/My Drive/heroesofcrypto/animations"

# Public Google OAuth web client ID. Use the same value in .env and .env.production.
VITE_GOOGLE_CLIENT_ID=1234567890-example.apps.googleusercontent.com
```

The matching auth server must use the same value as `HOC_GOOGLE_CLIENT_ID`; the marketing-site production
build uses it in `site/.env.production` too. Configure the Google OAuth web client with
`http://localhost:5173`, `https://beta.heroesofcrypto.io`, and `https://heroesofcrypto.io` as authorized
JavaScript origins. Add `http://localhost:4321` when testing the Astro site locally.

Most important commands to execute from the root folder (you need [bun](https://bun.com/) installed):

-   `bun run build` -> Full project build: runs lint fixers, lint and image-policy checks, then builds common, core, site, and MCP.
-   `bun run build:common` -> Build the shared heroes-of-crypto-common package (game/heroes-of-crypto-common).
-   `bun run build:core` -> Build the core client package (game/core).
-   `bun run build:game` -> Build the game packages via Bun workspaces (runs workspace build for @heroesofcrypto/common and @heroesofcrypto/core).
-   `bun run build:ws` -> Build common, core, site, and MCP, in that order.
-   `bun run check` -> Run lint, image-policy and path-case checks, type checking, and all workspace tests.
-   `bun run lint` -> Run the full lint suite and style checks (ESLint, Stylelint, package.json sorting, `bun fmt --check`).
-   `bun run lint:fix` -> Run all lint fixers (ESLint --fix, SCSS fixes, package.json sorting, `bun fmt`).
-   `bun run start` -> Start the game locally.
-   `bun run start:site` -> Start the marketing site locally.

Release builds and coordinated test/production deployment are documented in [DEPLOYMENT.md](DEPLOYMENT.md). Start with `bun run deploy:plan`; `bun run deploy:all` deploys the shared assistant, test game/APIs/site, then production through the server's existing health checks and rollback.

## Contribution

We welcome contributions to the Heroes of Crypto game client! Whether you’re a seasoned developer or just getting started, there are many ways you can help improve the project.

Agents using the shared working tree must follow [AGENTS.md](AGENTS.md), including its mainline workflow
and verification requirements. The fork workflow below is for external contributors.

### How to Contribute

1. Fork the Repository: Start by forking the repository to your GitHub account.
2. Clone the Repository: Clone your forked repository to your local machine
3. Create a Branch: Create a new branch for your feature or bug fix.
4. Make Your Changes: Make your changes in the codebase. Please follow the existing code style and include tests where applicable.
5. Commit Your Changes: Commit your changes with a clear and concise commit message.
6. Push to Your Fork: Push your changes to your forked repository.
7. Submit a Pull Request: Go to the original repository on GitHub and submit a pull request from your forked repository. Please provide a detailed description of your changes and the problem they solve or the feature they add.

### Guidelines

-   Code Style: Please follow the existing code style. If you’re unsure, look at the existing code for examples.
-   Testing: Ensure that your changes do not break existing tests and that they pass all the tests. Add new tests for your changes where applicable.
-   Documentation: Update the documentation to reflect your changes, especially in the README.md if your changes require setup or usage instructions.
-   Commit Messages: Write clear and meaningful commit messages. Use the imperative mood in the subject line (e.g., “Fix bug” and not “Fixed bug”).

### Reporting Issues

If you find any bugs or have feature requests, please open an issue on GitHub. When opening an issue, please include as much detail as possible to help us understand and reproduce the issue.

### Community

Join our [Discord](https://discord.com/invite/dCkEV8YRaH) community to discuss the project, ask questions, and collaborate with other contributors.

We appreciate your interest in contributing to the Heroes of Crypto game client and look forward to your contributions!

---

<img src="https://cdn-images-1.medium.com/max/1600/1*C87EjxGeMPrkTuVRVWVg4w.png" width="225"></img>
