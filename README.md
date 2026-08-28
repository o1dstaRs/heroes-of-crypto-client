# Heroes of Crypto. The web3 turn-based strategy game for the browser.

<p align="center">
  <a href="https://github.com/o1dstaRs/heroes-of-crypto-client/actions/workflows/ci.yml">
    <img src="https://github.com/o1dstaRs/heroes-of-crypto-client/actions/workflows/ci.yml/badge.svg" alt="Client CI">
  </a>
  <a href="https://github.com/o1dstaRs/heroes-of-crypto-common/actions/workflows/ci.yml">
    <img src="https://github.com/o1dstaRs/heroes-of-crypto-common/actions/workflows/ci.yml/badge.svg" alt="Common CI">
  </a>
  <a href="https://bun.sh/">
    <img src="https://img.shields.io/badge/Bun-1.4-fa9b3b.svg?logo=bun&logoColor=white" alt="Bun">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License">
  </a>
</p>

For a detailed overview of the game mechanics, roadmap, and the vision behind Heroes of Crypto, please check out our [Whitepaper](https://heroes-of-crypto.gitbook.io/heroes-of-crypto-ai).
This repository primarily contains:

1. The core game client at `game/core`, which implements the game mechanics and the user interface built with [mui](https://mui.com/) React components, and uses PixiJS 8 (pixijs8) as the game engine for rendering, animation, and game loop integration.

**Depends on** the shared libraries in `game/heroes-of-crypto-common`. This package provides code shared between the client and server — protobuf definitions and generated code, shared TypeScript types, networking helpers, serialization utilities, and the game constants and rules. See the common repo at https://github.com/o1dstaRs/heroes-of-crypto-common

## Build & Test

Requires Bun 1.4 or newer

Prerequisites:

```bash
brew install protoc-gen-js
# works just fine with 'libprotoc 33.0'
brew install protobuf
which protoc

# pull the heroes-of-crypto common libraries and build protoc
git pull --recurse-submodules
bun install
bun run --cwd game/heroes-of-crypto-common build:proto
```

Env variables:

```bash
# Canonical Google Drive game-art folders
export HOC_IMAGES_LOC="/Users/zolotukhin/Google Drive/My Drive/heroesofcrypto/images"
export HOC_ANIMATIONS_LOC="/Users/zolotukhin/Google Drive/My Drive/heroesofcrypto/animations"

# Public Google OAuth web client ID. Use the same value in .env and .env.production.
VITE_GOOGLE_CLIENT_ID=1234567890-example.apps.googleusercontent.com
```

The matching auth server must use the same value as `HOC_GOOGLE_CLIENT_ID`; the marketing-site production
build uses it in `site/.env.production` too. Configure the Google OAuth web client with
`http://localhost:5173`, `https://beta.heroesofcrypto.io`, and `https://heroesofcrypto.io` as authorized
JavaScript origins. Add `http://localhost:4321` when testing the Astro site locally.

Most important commands to execute from the root folder (you need [bun](https://bun.com/) installed):

-   `bun run build` -> Full project build: runs lint fixers, lint checks, then builds workspace packages (common + core).
-   `bun run build:common` -> Build the shared heroes-of-crypto-common package (game/heroes-of-crypto-common).
-   `bun run build:core` -> Build the core client package (game/core).
-   `bun run build:game` -> Build the game packages via Bun workspaces (runs workspace build for @heroesofcrypto/common and @heroesofcrypto/core).
-   `bun run build:ws` -> Build workspace pieces by running build:common and build:core.
-   `bun run lint` -> Run the full lint suite and style checks (ESLint, Stylelint, package.json sorting, Prettier checks).
-   `bun run lint:fix` -> Run all lint fixers (ESLint --fix, SCSS fixes, package.json sorting, Prettier write).
-   `bun run start` -> Start the game locally.

## Contribution

We welcome contributions to the Heroes of Crypto game client! Whether you’re a seasoned developer or just getting started, there are many ways you can help improve the project.

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
