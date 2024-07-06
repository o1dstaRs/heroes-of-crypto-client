# Heroes of Crypto. The web3 turn-based strategy game for the browser.

For a detailed overview of the game mechanics, roadmap, and the vision behind Heroes of Crypto, please check out our [Whitepaper](https://heroes-of-crypto.gitbook.io/heroes-of-crypto-ai).

This repository mainly includes:

1. The core game logic `game/core`. Including the game logic and the UI which is built with [mui](https://mui.com/) React components
2. Engine `game/engine`, which is essentially a bundle of [TypeScript](https://github.com/Microsoft/TypeScript) ports:
    - [Box2D](https://github.com/erincatto/Box2D)
    - [LiquidFun](https://github.com/google/liquidfun)
    - [Box2D Lights](https://github.com/libgdx/box2dlights)

## Build & Test

Runs well with node 20.X.X

Env variables:

```bash
# path to the images folder containing the *.webp assets
HOC_IMAGES_LOC=./path/to/images
```

Most important commands to execute from the root folder (you need [yarn](https://yarnpkg.com/) installed):

-   `./scripts/pull_hoc_common.sh && yarn` -> pull and install dependencies
-   `yarn build` -> build all projects
-   `yarn build:engine` -> build only box2d engine and lights
-   `yarn build:game` -> build the game code without its engine
-   `yarn start` -> Run game locally
-   `yarn start:fresh` -> Run game locally after building all libraries
-   `yarn lint` -> Run linters, formatters, etc.
-   `yarn lint:fix` -> Run linters, formatters, etc. and autofix if possible

## The @box2d Ecosystem

Located in `game/engine`.

@box2d is a full-blown ecosystem for [box2d](https://box2d.org/) for the JavaScript/TypeScript world. It can be used both in the browser and
in NodeJS.

Other packages included in the ecosystem:

-   Benchmark: Based on [bench2d](https://github.com/joelgwebber/bench2d)
-   Controllers: From the LiquidFun project
-   Particles: Also from the LiquidFun project
-   Lights: [ported from LibGDX](https://github.com/libgdx/box2dlights)
-   DebugDraw: Debug drawing using a canvas
-   Core: The game itself

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
