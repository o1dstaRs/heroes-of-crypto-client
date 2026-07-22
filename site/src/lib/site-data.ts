import { patchNotes } from "./patch-notes";
import { abilityCount, unitCount } from "./units-data";

export const supportedLanguages = ["en", "ru"] as const;

export type Language = (typeof supportedLanguages)[number];

export const pageSlugs = [
    "game",
    "rules",
    "units",
    "abilities",
    "artifacts",
    "research",
    "token",
    "patches",
    "faq",
    "contact-us",
    "terms-of-service",
    "privacy-policy",
] as const;

export type PageSlug = (typeof pageSlugs)[number];

export const links = {
    play: "/play",
    rankedApp: "/play/ranked",
    sandboxApp: "/sandbox",
    lobbiesApp: "/play/lobbies",
    proposal: "https://heroes-of-crypto.gitbook.io/heroes-of-crypto-ai/",
    pool: "https://dexscreener.com/base/0x84b33ed897690bfb627f6cb966ce6a945cf6c6df",
    swap: "https://app.uniswap.org/swap?chain=base&exactField=input&inputCurrency=ETH&outputCurrency=0x48bb4b12098Fc65b261Dfb3584AE95FDCd847343",
    telegram: "https://t.me/HeroesOfCrypto",
    twitter: "https://twitter.com/Heroes0fcrypto",
    discord: "https://discord.gg/dCkEV8YRaH",
    github: "https://github.com/o1dstaRs",
    coinMarketCap: "https://coinmarketcap.com/currencies/heroes-of-crypto-ai/",
};

export const contractAddress = "0x48bb4b12098Fc65b261Dfb3584AE95FDCd847343";

export function localPath(language: Language, slug?: PageSlug | "home") {
    const prefix = language === "ru" ? "/ru" : "";

    if (!slug || slug === "home" || slug === "game") {
        return `${prefix}/`;
    }

    return `${prefix}/${slug}/`;
}

export function languageSwitchPath(pathname: string, targetLanguage: Language) {
    const cleanPath = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;

    if (targetLanguage === "ru") {
        if (cleanPath === "/ru" || cleanPath.startsWith("/ru/")) {
            return `${cleanPath}/`;
        }

        return cleanPath === "/" ? "/ru/" : `/ru${cleanPath}/`;
    }

    const withoutRussianPrefix = cleanPath.replace(/^\/ru(?=\/|$)/, "") || "/";
    return withoutRussianPrefix === "/" ? "/" : `${withoutRussianPrefix}/`;
}

export const content = {
    en: {
        meta: {
            title: "Heroes of Crypto - Free Browser Strategy Game",
            description: `Play Heroes of Crypto in your browser: fast tactical battles, 4 factions, ${unitCount} units, and ${abilityCount} abilities. Free to play, no download.`,
        },
        ui: {
            language: "Language",
            english: "EN",
            russian: "RU",
            external: "External link",
            copyright: "Old Stars Gaming. Heroes of Crypto AI.",
        },
        nav: {
            game: "Game",
            rules: "Rules",
            blog: "Blog",
            research: "Research",
            units: "Units",
            abilities: "Abilities",
            artifacts: "Artifacts",
            token: "Token",
            patches: "Patches",
            faq: "FAQ",
            contact: "Contact",
            login: "Login",
            logout: "Log out",
            profile: "Profile",
            proposal: "Proposal",
            terms: "Terms",
            privacy: "Privacy",
        },
        play: {
            startCta: "Play",
            rankedCta: "Play ranked",
            sandboxCta: "Play sandbox beta",
            rankedLabel: "Ranked",
            sandboxLabel: "Sandbox beta",
            rankedBadge: "Ranked",
            sandboxBadge: "Beta",
            lobbiesBadge: "Lobby",
            rankedHint: "Matchmaking with real opponents",
            sandboxHint: "Practice builds, spells, and board states before ranked.",
            lobbiesCta: "Play with friends",
            lobbiesHint: "Create a lobby or join one by link — public or private.",
            lobbiesSectionTitle: "Open lobbies",
            startLabel: "Start game",
            modeTitle: "Choose how to play",
            modeBody:
                "Start ranked matchmaking when you want a real opponent, or open the sandbox beta when you want to test armies and board states.",
            signedInAs: "Signed in as",
            statWins: "Wins",
            statLosses: "Losses",
            statGames: "Games",
            guestPrompt: "You're playing as a guest.",
            guestPromptCta: "Log in to save ranked progress",
            fullProfileCta: "View full profile",
        },
        profile: {
            title: "Your profile",
            subtitle: "Ranked record, favourite armies, and recent matches.",
            guestTitle: "Sign in to see your profile",
            guestBody: "Your ranked stats, favourite combos, and match history live here once you log in.",
            guestCta: "Log in",
            loading: "Loading your profile…",
            errorTitle: "Couldn't load your profile",
            errorBody: "Something went wrong fetching your stats. Please try again.",
            retry: "Retry",
            emptyTitle: "No ranked games yet",
            emptyBody: "Play a ranked match to start building your stats.",
            playCta: "Play ranked",
            lastLoginPrefix: "Last seen",
            statWins: "Wins",
            statLosses: "Losses",
            statWinRate: "Win rate",
            statGames: "Games",
            statCurrentStreak: "Current streak",
            statBestStreak: "Best streak",
            sectionOverview: "Overview",
            sectionFactions: "Factions",
            sectionCreatures: "Creatures",
            sectionCombos: "Favourite combos",
            sectionMatches: "Recent matches",
            gamesLabel: "games",
            resultWin: "Win",
            resultLoss: "Loss",
            resultAbandoned: "Abandoned",
            versus: "vs",
            streakWin: "{}W streak",
            streakLoss: "{}L streak",
            streakNone: "No streak",
            agoNow: "just now",
            agoMinute: "m",
            agoHour: "h",
            agoDay: "d",
            agoMonth: "mo",
            agoYear: "y",
        },
        auth: {
            loginTitle: "Login",
            loginDescription: "Use your Heroes of Crypto account to continue to the game.",
            registerTitle: "Create Account",
            registerDescription: "Create a Heroes of Crypto account for ranked and sandbox play.",
            verifyTitle: "Enter Verification Code",
            verifyDescription: "Enter the confirmation code sent to your email.",
            forgotTitle: "Forgot Password",
            forgotDescription: "Request a reset token by email.",
            resetTitle: "Reset Password",
            resetDescription: "Enter the reset token from your email and choose a new password.",
            username: "Username",
            email: "Email address",
            password: "Password",
            confirmPassword: "Confirm password",
            code: "Verification code",
            token: "Reset token",
            loginAction: "Login",
            registerAction: "Create account",
            verifyAction: "Verify account",
            requestCodeAction: "Resend code",
            forgotAction: "Send reset request",
            resetAction: "Update password",
            showPassword: "Show",
            hidePassword: "Hide",
            noAccount: "Need an account?",
            haveAccount: "Already have an account?",
            forgotPassword: "Forgot password?",
            rememberPassword: "Return to login",
            goRegister: "Register",
            goLogin: "Login",
            goVerify: "Enter code",
            goReset: "Reset with token",
            successLogin: "Login successful.",
            successRegister: "Registration successful. Check your email for a verification code.",
            successVerify: "Account confirmed.",
            successCode: "Verification code requested.",
            successForgot: "Password reset request sent. Check your email for the token.",
            successReset: "Password updated.",
            continueToGame: "Choose play mode",
            termsPrefix: "By signing up, you agree to the",
            termsAnd: "and",
        },
        pages: {
            game: {
                title: "Heroes of Crypto",
                eyebrow: "Browser strategy game",
                description:
                    "Free-to-play tactical battles with factions, spells, abilities, and community-shaped development.",
            },
            rules: {
                title: "How to Play Heroes of Crypto",
                eyebrow: "Game rules",
                description:
                    "A complete, readable guide to Heroes of Crypto rules: draft, placement, turns, attacks, spells, augments, faction synergies, morale, luck, stack power, map narrowing, and Armageddon.",
            },
            units: {
                title: "Units",
                eyebrow: "Roster",
                description:
                    "Browse every combat unit across all factions of Heroes of Crypto — stats, attack types, abilities, and spells.",
            },
            abilities: {
                title: "Abilities",
                eyebrow: "Ability codex",
                description:
                    "Every unit ability in Heroes of Crypto — icon, what it does, and which units carry it. Pulled straight from the game data, so it always matches the live roster.",
            },
            artifacts: {
                title: "Artifacts",
                eyebrow: "Artifact codex",
                description:
                    "Army-wide artifacts you draft in the pick phase — one Tier 1 and one Tier 2 per team. Every artifact, its icon and exactly what it does for your whole army.",
            },
            research: {
                title: "Research",
                eyebrow: "AI research",
                description:
                    "Explore source-audited Heroes of Crypto research on game AI, simulation, tactical decisions, tournament evidence, and engine performance.",
            },
            token: {
                title: "$HOCAI Token",
                eyebrow: "Utility and governance",
                description:
                    "$HOCAI powers in-game transactions, rewards, future staking, and voting on the direction of Heroes of Crypto AI.",
            },
            patches: {
                title: "Patch Notes",
                eyebrow: "Game updates",
                description: "A compact history of game milestones and balance work.",
            },
            faq: {
                title: "FAQ",
                eyebrow: "Quick answers",
                description: "Common questions about the game, token, play modes, and community.",
            },
            "contact-us": {
                title: "Contact Us",
                eyebrow: "Community and support",
                description: "Reach the Heroes of Crypto team for game, token, or community questions.",
            },
            "terms-of-service": {
                title: "Terms of Service",
                eyebrow: "Legal",
                description: "The terms for playing Heroes of Crypto — a free, browser-based strategy game.",
            },
            "privacy-policy": {
                title: "Privacy Policy",
                eyebrow: "Legal",
                description:
                    "What data Heroes of Crypto collects and how your account and gameplay information is handled.",
            },
        },
        hero: {
            kicker: "Free browser strategy",
            title: "Heroes of Crypto",
            tagline: "Click play. Build an army. Win the board.",
            body: "A tactical battle game where positioning, faction synergies, and 75+ spells and abilities decide every fight. No download, no wallet gate - click play and choose ranked or the sandbox beta.",
            primaryCta: "Play",
            secondaryCta: "Read rules",
            availability: "Ranked and sandbox beta",
            highlights: ["No download", "No wallet gate", "Ranked or sandbox beta"],
            stats: [
                { value: "4", label: "Factions" },
                { value: String(unitCount), label: "Combat units" },
                { value: String(abilityCount), label: "Abilities" },
            ],
        },
        socials: [
            { name: "Telegram", href: links.telegram, icon: "/assets/icons/platforms/ic_telegram.svg" },
            { name: "X", href: links.twitter, icon: "/assets/icons/platforms/ic_twitter.svg" },
            { name: "Discord", href: links.discord, icon: "/assets/icons/platforms/ic_discord.svg" },
            { name: "GitHub", href: links.github, icon: "/assets/icons/platforms/ic_github.svg" },
        ],
        features: {
            eyebrow: "Why click play",
            title: "Fast to start. Hard to outsmart.",
            items: [
                {
                    title: "Every move matters",
                    description:
                        "Positioning, attack types, auras, and a shrinking battlefield turn each round into a readable tactical puzzle.",
                    icon: "/assets/icons/home/community_centric.svg",
                },
                {
                    title: "Pick your faction style",
                    description:
                        "Chaos, Life, Might, and Nature bring distinct combat roles, counters, and stacking bonuses for different play styles.",
                    icon: "/assets/icons/home/ai_powered.svg",
                },
                {
                    title: "Swing the fight",
                    description:
                        "75+ spells, abilities, and aura effects can flip the board when you read the moment correctly.",
                    icon: "/assets/icons/home/decentralized.svg",
                },
            ],
        },
        roster: {
            eyebrow: "What's in the game",
            title: "Every army tells a different story",
            body: `Four factions, ${unitCount} units, and layer after layer of strategy: faction bonuses, upgradeable placement, magic, auras, and maps that shrink as the fight wears on. No two battles play the same.`,
            points: ["Faction bonuses", "Upgradeable placement", "Magic and aura effects", "Shrinking maps"],
        },
        units: {
            all: "All",
            level: "Level",
            ability: "Ability",
            abilities: "Abilities",
            spells: "Spells",
            noAbilities: "No special abilities.",
            stats: {
                hp: "Health",
                experience: "Experience",
                attack: "Attack",
                damage: "Damage",
                armor: "Armor",
                speed: "Speed",
                steps: "Move",
                rangeShots: "Shots",
                magicResist: "Magic resist",
                attackType: "Attack type",
                movement: "Movement",
                size: "Size",
                level: "Level",
                faction: "Faction",
            },
        },
        progress: {
            eyebrow: "Play now",
            title: "Choose your mode after Play",
            body: "The Play screen lets you enter ranked matchmaking or use the sandbox beta to test armies, spells, and board states from a desktop browser.",
            cta: "Play",
        },
        token: {
            eyebrow: "HOCAI",
            title: "A small, direct token model",
            body: "$HOCAI is an ERC-20 token on Base L2 for governance, in-game utility, and future rewards. The model keeps most of the supply community-owned from the start.",
            contractLabel: "Contract",
            links: [
                { label: "Swap on Uniswap", href: links.swap },
                { label: "View pool", href: links.pool },
                { label: "CoinMarketCap", href: links.coinMarketCap },
            ],
            allocation: [
                {
                    label: "Community pool",
                    value: 90,
                    description:
                        "Tradeable community allocation connected to liquidity, gameplay utility, and future reward systems.",
                },
                {
                    label: "Development",
                    value: 10,
                    description:
                        "Reserved for continued development, content work, operations, and ecosystem expansion.",
                },
            ],
            utility: [
                "Governance over selected game and ecosystem proposals.",
                "In-game transactions and event participation.",
                "Future staking, rewards, and tournament mechanics.",
                "Player-driven economy for game assets and services.",
            ],
        },
        roadmap: {
            eyebrow: "Now building",
            title: "Roadmap",
            items: [
                {
                    time: "June 2026",
                    title: "Multiplayer foundation",
                    description:
                        "Build the live multiplayer loop: match creation, two-player sessions, server-authoritative turns, reconnects, and a clean handoff between placement and fight phases.",
                },
                {
                    time: "After multiplayer",
                    title: "Ranked matches",
                    description:
                        "Add ranking, matchmaking rules, rating updates, match history, and the first leaderboard surfaces around real multiplayer games.",
                },
                {
                    time: "After ranking",
                    title: "Lobbies and seasons",
                    description:
                        "Open custom lobbies, seasonal resets, and clearer progression hooks so competitive play has structure beyond one-off matches.",
                },
                {
                    time: "Then",
                    title: "Marketplace and player economy",
                    description:
                        "Connect gameplay progression with marketplace, asset, and reward systems once multiplayer and ranking are stable.",
                },
            ],
        },
        faq: [
            {
                question: "What is $HOCAI?",
                answer: "$HOCAI is the utility and governance token for in-game transactions, rewards, staking plans, and voting on future game development.",
            },
            {
                question: "Can I play now?",
                answer: "Yes. Click Play, then choose ranked matchmaking or the sandbox beta from a desktop browser.",
            },
            {
                question: "Is the game open source?",
                answer: "The client and shared game logic live in public GitHub repositories. The project is built with community visibility in mind.",
            },
            {
                question: "What happened to the treasury page?",
                answer: "The treasury section is intentionally not part of this minimal site. This site focuses on the game, token basics, community, and legal pages.",
            },
        ],
        contact: {
            headline: "For game, token, or team questions, use the official channels.",
            emailLabel: "Email",
            email: "support@heroesofcrypto.io",
            formName: "Name or 0x address",
            formEmail: "Email",
            formSubject: "Subject",
            formMessage: "Message",
            formSubmit: "Open email draft",
        },
        patches: patchNotes.en,
        legal: {
            terms: {
                updated: "27/06/2026",
                intro: "Heroes of Crypto is a free, browser-based turn-based strategy game made by Old Stars Gaming ('OSG', 'we', 'us'). These Terms of Service ('Terms') govern your access to and use of the game, our websites, and related services (together, the 'Services'). By creating an account or otherwise using the Services, you agree to these Terms. If you do not agree, please do not use the Services.",
                sections: [
                    {
                        title: "1. Who can play",
                        body: [
                            "You must be at least 18 years old, or the age of majority where you live, to use the Services.",
                            "You are responsible for following any laws that apply to you when you play.",
                        ],
                    },
                    {
                        title: "2. Your account",
                        body: [
                            "You can try sandbox mode without an account. Ranked play and some other features need a free account created with a username, an email address, and a password.",
                            "Keep your login details private and accurate. You are responsible for everything that happens through your account, so do not share it or use anyone else's.",
                            "Email support@heroesofcrypto.io if you think your account has been accessed without your permission.",
                        ],
                    },
                    {
                        title: "3. Your licence to play",
                        body: [
                            "We grant you a personal, limited, non-exclusive, non-transferable, revocable licence to access and play the game for your own non-commercial entertainment.",
                            "You may not sell, rent, or commercialise access to the Services, or use them to build a competing product, except as expressly allowed by the open-source licences referenced below.",
                        ],
                    },
                    {
                        title: "4. The game is free to play",
                        body: [
                            "The Services are free. You do not need to download software or connect a crypto wallet to play, and we do not sell gameplay advantages.",
                            "Any in-game items, ranks, ratings, or currencies exist only inside the game, have no real-world or monetary value, and are not your property.",
                        ],
                    },
                    {
                        title: "5. Beta and changes to the game",
                        body: [
                            "Heroes of Crypto is under active development and is provided on an 'as is' and 'as available' basis. Features, unit rosters, balance, maps, ratings, ladders, and other content can change, be reset, or be removed at any time, with or without notice.",
                            "We do not promise uninterrupted availability or that your progress, ratings, or statistics will be preserved.",
                        ],
                    },
                    {
                        title: "6. Fair play and conduct",
                        body: [
                            "So that matches stay fair, you agree not to use cheats, bots, scripts, or other automation; exploit bugs or unintended mechanics; tamper with the game client or its network traffic; or manipulate matchmaking, ratings, or results (including collusion, account sharing, smurfing, or intentionally losing).",
                            "You also agree not to harass, threaten, impersonate, or abuse other players or staff, and not to choose a username or submit text that is offensive, infringing, or misleading.",
                            "We may remove content, reset ratings, and suspend or permanently ban accounts that break these rules.",
                        ],
                    },
                    {
                        title: "7. Intellectual property and open source",
                        body: [
                            "The game's name, logos, art, characters, audio, and other assets are owned by OSG or its licensors and are protected by intellectual-property laws. You may not copy, modify, or redistribute them without permission.",
                            "Parts of the project are open source and published under the licences stated in our public repositories; your use of that code is governed by those licences. If you contribute code or content, you grant OSG a non-exclusive, worldwide, royalty-free licence to use, modify, and distribute your contribution as part of the Services.",
                        ],
                    },
                    {
                        title: "8. Tokens and digital assets",
                        body: [
                            "Playing Heroes of Crypto never requires buying, holding, or using any cryptocurrency. If the project separately offers the $HOCAI token or other digital assets, that is optional and independent of gameplay.",
                            "Digital assets carry risks, including price volatility, loss of access, and changing regulation. Transactions may be irreversible, OSG does not guarantee any value, and nothing here is financial advice. Only take part if it is lawful where you live and you understand the risks.",
                        ],
                    },
                    {
                        title: "9. Disclaimers",
                        body: [
                            "The Services are provided 'as is' and 'as available' without warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, or that the Services will be uninterrupted, secure, or error-free.",
                        ],
                    },
                    {
                        title: "10. Limitation of liability and indemnity",
                        body: [
                            "To the fullest extent permitted by law, OSG will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of data, ratings, or progress, arising from your use of the Services.",
                            "You agree to indemnify and hold OSG harmless from claims arising out of your misuse of the Services or your breach of these Terms.",
                        ],
                    },
                    {
                        title: "11. Suspension and termination",
                        body: [
                            "You can stop using the Services and close your account at any time. We may suspend or end your access at any time, with or without notice, if you breach these Terms or act in a way that harms the Services or other players.",
                        ],
                    },
                    {
                        title: "12. Changes to these Terms",
                        body: [
                            "We may update these Terms from time to time. We will change the 'Last Updated' date, and significant changes may be announced in-game or on our channels. If you keep using the Services after an update takes effect, you accept the revised Terms.",
                        ],
                    },
                    {
                        title: "13. Governing law",
                        body: [
                            "These Terms are governed by the laws of the State of Washington, United States, without regard to its conflict-of-law rules. Disputes will be resolved through arbitration in Seattle, Washington, unless applicable law requires otherwise.",
                        ],
                    },
                    {
                        title: "14. Contact",
                        body: ["Questions about these Terms? Email support@heroesofcrypto.io."],
                    },
                ],
            },
            privacy: {
                updated: "27/06/2026",
                intro: "Old Stars Gaming ('OSG', 'we', 'us') respects your privacy. This Privacy Policy explains what information we collect when you use Heroes of Crypto and how we use, share, and protect it. You can play sandbox mode without an account; ranked play and some features need a free account.",
                sections: [
                    {
                        title: "1. Information we collect",
                        body: [
                            "Account information: when you register we collect a username, an email address, and a password, which we store only in hashed form.",
                            "Gameplay data: the matches you play, in-game actions, results, ratings, and related statistics needed to run the game and matchmaking.",
                            "Technical data: basic device and browser details, an approximate location derived from your IP address, and server logs, used for security, anti-cheat, and troubleshooting.",
                            "Communications: messages you send us for support or feedback.",
                            "Optional wallet data: only if you choose to connect a crypto wallet for token features do we process your public wallet address. This is never required to play.",
                        ],
                    },
                    {
                        title: "2. How we use information",
                        body: [
                            "We use your information to run, secure, and improve the game; match you with opponents and maintain ratings and ladders; prevent cheating, fraud, and abuse; provide support; and comply with our legal obligations.",
                        ],
                    },
                    {
                        title: "3. Legal bases",
                        body: [
                            "Where data-protection laws such as the GDPR apply, we process your information to perform our contract with you (running the game and your account), for our legitimate interests (security, anti-cheat, and improving the Services), to comply with the law, and, where required, with your consent.",
                        ],
                    },
                    {
                        title: "4. Cookies and local storage",
                        body: [
                            "We store a sign-in/session token and basic preferences in your browser's local storage so you can stay logged in and keep your settings. We do not use these for cross-site advertising and we do not sell them.",
                        ],
                    },
                    {
                        title: "5. How we share information",
                        body: [
                            "We do not sell your personal information. We may share it with service providers that host and operate the game for us, with authorities when the law requires it, and with a successor if the project is transferred.",
                            "Public profile details such as your username and ratings may be visible to other players.",
                        ],
                    },
                    {
                        title: "6. Data retention",
                        body: [
                            "We keep account and gameplay data while your account is active or as needed to operate the Services, then delete or anonymise it unless we are required to keep it for legal reasons.",
                        ],
                    },
                    {
                        title: "7. International transfers",
                        body: [
                            "We may process and store information on servers located in other countries. Where required, we take steps to ensure your information receives an appropriate level of protection.",
                        ],
                    },
                    {
                        title: "8. Your rights and choices",
                        body: [
                            "Subject to applicable law, you can access or update your account information, request a copy or deletion of your data, object to or restrict certain processing, and opt out of non-essential emails. To make a request, email support@heroesofcrypto.io.",
                            "Note that any data recorded on a public blockchain (if you used token features) is public and may not be deletable.",
                        ],
                    },
                    {
                        title: "9. Children",
                        body: [
                            "The Services are intended for people aged 18 and over. We do not knowingly collect personal information from children; if you believe a child has provided us data, contact us and we will delete it.",
                        ],
                    },
                    {
                        title: "10. Third-party links",
                        body: [
                            "Our sites may link to third-party services such as community channels or blockchain explorers. We are not responsible for their content or privacy practices.",
                        ],
                    },
                    {
                        title: "11. Changes to this Policy",
                        body: [
                            "We may update this Policy from time to time. We will revise the 'Last Updated' date, and significant changes may be announced in-game or on our channels.",
                        ],
                    },
                    {
                        title: "12. Contact",
                        body: ["Privacy questions or requests? Email support@heroesofcrypto.io."],
                    },
                ],
            },
        },
    },
    ru: {
        meta: {
            title: "Heroes of Crypto - браузерная стратегия",
            description: `Играйте в Heroes of Crypto в браузере: быстрые тактические бои, 4 фракции, ${unitCount} юнитов и ${abilityCount} способностей. Бесплатно и без скачивания.`,
        },
        ui: {
            language: "Язык",
            english: "EN",
            russian: "RU",
            external: "Внешняя ссылка",
            copyright: "Old Stars Gaming. Heroes of Crypto AI.",
        },
        nav: {
            game: "Игра",
            rules: "Правила",
            blog: "Блог",
            research: "Исследования",
            units: "Юниты",
            abilities: "Способности",
            artifacts: "Артефакты",
            token: "Токен",
            patches: "Патчи",
            faq: "Вопросы",
            contact: "Контакты",
            login: "Войти",
            logout: "Выйти",
            profile: "Профиль",
            proposal: "Документ",
            terms: "Условия",
            privacy: "Приватность",
        },
        play: {
            startCta: "Играть",
            rankedCta: "Играть в рейтинге",
            sandboxCta: "Открыть песочницу",
            rankedLabel: "Рейтинг",
            sandboxLabel: "Песочница",
            rankedBadge: "Рейтинг",
            sandboxBadge: "Бета",
            lobbiesBadge: "Лобби",
            rankedHint: "Матчмейкинг против реальных соперников",
            sandboxHint: "Практика армий, заклинаний и состояний поля перед рейтинговыми матчами.",
            lobbiesCta: "Игра с друзьями",
            lobbiesHint: "Создайте лобби или зайдите по ссылке — открытое или приватное.",
            lobbiesSectionTitle: "Открытые лобби",
            startLabel: "Запуск игры",
            modeTitle: "Выберите режим",
            modeBody:
                "Запускайте рейтинговый матч против реального соперника или открывайте песочницу для тестов армий и состояний поля.",
            signedInAs: "Вы вошли как",
            statWins: "Победы",
            statLosses: "Поражения",
            statGames: "Игры",
            guestPrompt: "Вы играете как гость.",
            guestPromptCta: "Войдите, чтобы сохранять прогресс",
            fullProfileCta: "Открыть профиль",
        },
        profile: {
            title: "Ваш профиль",
            subtitle: "Рейтинговая статистика, любимые армии и недавние матчи.",
            guestTitle: "Войдите, чтобы увидеть профиль",
            guestBody: "Ваша рейтинговая статистика, любимые комбинации и история матчей появятся здесь после входа.",
            guestCta: "Войти",
            loading: "Загрузка профиля…",
            errorTitle: "Не удалось загрузить профиль",
            errorBody: "Что-то пошло не так при загрузке статистики. Попробуйте ещё раз.",
            retry: "Повторить",
            emptyTitle: "Пока нет рейтинговых игр",
            emptyBody: "Сыграйте рейтинговый матч, чтобы начать собирать статистику.",
            playCta: "Играть в рейтинге",
            lastLoginPrefix: "Был(а) в сети",
            statWins: "Победы",
            statLosses: "Поражения",
            statWinRate: "Винрейт",
            statGames: "Игры",
            statCurrentStreak: "Текущая серия",
            statBestStreak: "Лучшая серия",
            sectionOverview: "Обзор",
            sectionFactions: "Фракции",
            sectionCreatures: "Существа",
            sectionCombos: "Любимые комбинации",
            sectionMatches: "Недавние матчи",
            gamesLabel: "игр",
            resultWin: "Победа",
            resultLoss: "Поражение",
            resultAbandoned: "Сдача",
            versus: "против",
            streakWin: "{} побед подряд",
            streakLoss: "{} поражений подряд",
            streakNone: "Нет серии",
            agoNow: "только что",
            agoMinute: "м",
            agoHour: "ч",
            agoDay: "д",
            agoMonth: "мес",
            agoYear: "г",
        },
        auth: {
            loginTitle: "Вход",
            loginDescription: "Используйте аккаунт Heroes of Crypto, чтобы продолжить в игру.",
            registerTitle: "Создать аккаунт",
            registerDescription: "Создайте аккаунт Heroes of Crypto для рейтинговых матчей и песочницы.",
            verifyTitle: "Введите код подтверждения",
            verifyDescription: "Введите код подтверждения, отправленный на ваш email.",
            forgotTitle: "Забыли пароль",
            forgotDescription: "Запросите токен для сброса пароля по email.",
            resetTitle: "Сброс пароля",
            resetDescription: "Введите токен из письма и новый пароль.",
            username: "Имя пользователя",
            email: "Электронная почта",
            password: "Пароль",
            confirmPassword: "Повторите пароль",
            code: "Код подтверждения",
            token: "Токен сброса",
            loginAction: "Войти",
            registerAction: "Создать аккаунт",
            verifyAction: "Подтвердить аккаунт",
            requestCodeAction: "Отправить код еще раз",
            forgotAction: "Отправить запрос",
            resetAction: "Обновить пароль",
            showPassword: "Показать",
            hidePassword: "Скрыть",
            noAccount: "Нужен аккаунт?",
            haveAccount: "Уже есть аккаунт?",
            forgotPassword: "Забыли пароль?",
            rememberPassword: "Вернуться ко входу",
            goRegister: "Регистрация",
            goLogin: "Войти",
            goVerify: "Ввести код",
            goReset: "Сбросить по токену",
            successLogin: "Вход выполнен.",
            successRegister: "Регистрация успешна. Проверьте email для кода подтверждения.",
            successVerify: "Аккаунт подтвержден.",
            successCode: "Код подтверждения запрошен.",
            successForgot: "Запрос на сброс пароля отправлен. Проверьте email для токена.",
            successReset: "Пароль обновлен.",
            continueToGame: "Выбрать режим игры",
            termsPrefix: "Регистрируясь, вы соглашаетесь с",
            termsAnd: "и",
        },
        pages: {
            game: {
                title: "Heroes of Crypto",
                eyebrow: "Браузерная стратегия",
                description:
                    "Бесплатные тактические бои с фракциями, заклинаниями, способностями и развитием вместе с сообществом.",
            },
            rules: {
                title: "Как играть в Heroes of Crypto",
                eyebrow: "Правила игры",
                description:
                    "Подробное и понятное руководство по правилам Heroes of Crypto: драфт, расстановка, ходы, атаки, заклинания, апгрейды, синергии фракций, мораль, удача, сила отряда, сужение карты и Армагеддон.",
            },
            units: {
                title: "Юниты",
                eyebrow: "Ростер",
                description:
                    "Все боевые юниты всех фракций Heroes of Crypto — характеристики, типы атак, способности и заклинания.",
            },
            abilities: {
                title: "Способности",
                eyebrow: "Справочник способностей",
                description:
                    "Все способности юнитов Heroes of Crypto — иконка, описание и носители. Берутся напрямую из игровых данных, поэтому всегда соответствуют актуальному ростеру.",
            },
            artifacts: {
                title: "Артефакты",
                eyebrow: "Справочник артефактов",
                description:
                    "Армейские артефакты, которые вы выбираете в фазе пика — по одному 1-го и 2-го уровня на команду. Все артефакты, их иконки и точное действие на всю вашу армию.",
            },
            research: {
                title: "Исследования",
                eyebrow: "Исследования ИИ",
                description:
                    "Исследования Heroes of Crypto об игровом ИИ, симуляциях, тактических решениях, турнирных данных и производительности движка.",
            },
            token: {
                title: "Токен $HOCAI",
                eyebrow: "Утилити и управление",
                description:
                    "$HOCAI используется для внутриигровых операций, наград, будущего стейкинга и голосования по развитию Heroes of Crypto AI.",
            },
            patches: {
                title: "Патч-ноты",
                eyebrow: "Обновления игры",
                description: "Краткая история игровых обновлений, баланса и ключевых изменений.",
            },
            faq: {
                title: "Частые вопросы",
                eyebrow: "Короткие ответы",
                description: "Частые вопросы об игре, токене, режимах игры и сообществе.",
            },
            "contact-us": {
                title: "Контакты",
                eyebrow: "Сообщество и поддержка",
                description: "Свяжитесь с командой Heroes of Crypto по вопросам игры, токена или сообщества.",
            },
            "terms-of-service": {
                title: "Условия использования",
                eyebrow: "Правовая информация",
                description: "Условия игры в Heroes of Crypto — бесплатную браузерную стратегию.",
            },
            "privacy-policy": {
                title: "Политика конфиденциальности",
                eyebrow: "Правовая информация",
                description: "Какие данные собирает Heroes of Crypto и как обрабатываются данные аккаунта и игры.",
            },
        },
        hero: {
            kicker: "Бесплатная браузерная стратегия",
            title: "Heroes of Crypto",
            tagline: "Нажмите «Играть». Соберите отряд. Заберите поле.",
            body: "Тактические бои, где позиционирование, фракционные синергии и 75+ заклинаний и способностей решают исход каждой схватки. Без скачивания и без привязки кошелька: нажмите «Играть» и выберите рейтинг или песочницу.",
            primaryCta: "Играть",
            secondaryCta: "Читать правила",
            availability: "Рейтинг и песочница",
            highlights: ["Без скачивания", "Без привязки кошелька", "Рейтинг или песочница"],
            stats: [
                { value: "4", label: "Фракции" },
                { value: String(unitCount), label: "Боевых юнитов" },
                { value: String(abilityCount), label: "Способности" },
            ],
        },
        socials: [
            { name: "Telegram", href: links.telegram, icon: "/assets/icons/platforms/ic_telegram.svg" },
            { name: "X", href: links.twitter, icon: "/assets/icons/platforms/ic_twitter.svg" },
            { name: "Discord", href: links.discord, icon: "/assets/icons/platforms/ic_discord.svg" },
            { name: "GitHub", href: links.github, icon: "/assets/icons/platforms/ic_github.svg" },
        ],
        features: {
            eyebrow: "Почему стоит нажать «Играть»",
            title: "Быстрый старт. Глубокая тактика.",
            items: [
                {
                    title: "Каждый ход важен",
                    description:
                        "Позиционирование, типы атак, ауры и сужающееся поле превращают каждый раунд в понятную тактическую задачу.",
                    icon: "/assets/icons/home/community_centric.svg",
                },
                {
                    title: "Выберите стиль фракции",
                    description:
                        "Хаос, Жизнь, Сила и Природа дают разные роли, контрпики и бонусы под разные стили игры.",
                    icon: "/assets/icons/home/ai_powered.svg",
                },
                {
                    title: "Переверните бой",
                    description:
                        "75+ заклинаний, способностей и аур могут изменить всю партию, если вы правильно прочитали момент.",
                    icon: "/assets/icons/home/decentralized.svg",
                },
            ],
        },
        roster: {
            eyebrow: "Что внутри",
            title: "Фракции, способности и контроль поля",
            body: "Хаос, Жизнь, Сила и Природа дают разные наборы юнитов, тактические роли, магию и фракционные бонусы. Улучшения расстановки и синергии добавляют еще один слой решений до начала боя.",
            points: ["Фракционные бонусы", "Улучшаемая расстановка", "Магия и ауры", "Сужающиеся карты"],
        },
        units: {
            all: "Все",
            level: "Уровень",
            ability: "Способность",
            abilities: "Способности",
            spells: "Заклинания",
            noAbilities: "Нет особых способностей.",
            stats: {
                hp: "Здоровье",
                experience: "Опыт",
                attack: "Атака",
                damage: "Урон",
                armor: "Броня",
                speed: "Скорость",
                steps: "Ход",
                rangeShots: "Выстрелы",
                magicResist: "Маг. сопр.",
                attackType: "Тип атаки",
                movement: "Перемещение",
                size: "Размер",
                level: "Уровень",
                faction: "Фракция",
            },
        },
        progress: {
            eyebrow: "Играйте сейчас",
            title: "Выберите режим после запуска",
            body: "Экран игры ведет в рейтинговый матчмейкинг или песочницу для тестов армий, заклинаний и состояний поля с настольного браузера.",
            cta: "Играть",
        },
        token: {
            eyebrow: "HOCAI",
            title: "Простая модель токена",
            body: "$HOCAI - ERC-20 токен в Base L2 для управления, игровой утилити-модели и будущих наград. Большая часть предложения с самого начала принадлежит сообществу.",
            contractLabel: "Контракт",
            links: [
                { label: "Обменять на Uniswap", href: links.swap },
                { label: "Пул", href: links.pool },
                { label: "CoinMarketCap", href: links.coinMarketCap },
            ],
            allocation: [
                {
                    label: "Пул сообщества",
                    value: 90,
                    description:
                        "Торгуемая аллокация сообщества, связанная с ликвидностью, игровой утилити-моделью и будущими наградами.",
                },
                {
                    label: "Разработка",
                    value: 10,
                    description: "Резерв на дальнейшую разработку, контент, операционную работу и развитие экосистемы.",
                },
            ],
            utility: [
                "Голосование по выбранным игровым и экосистемным предложениям.",
                "Внутриигровые операции и участие в событиях.",
                "Будущие механики стейкинга, наград и турниров.",
                "Игровая экономика вокруг игровых предметов и сервисов.",
            ],
        },
        roadmap: {
            eyebrow: "Что строим сейчас",
            title: "Дорожная карта",
            items: [
                {
                    time: "Июнь 2026",
                    title: "Основа мультиплеера",
                    description:
                        "Строим живой мультиплеер: создание матча, две стороны, серверно-авторитетные ходы, переподключение и чистый переход от расстановки к бою.",
                },
                {
                    time: "После мультиплеера",
                    title: "Рейтинговые матчи",
                    description:
                        "Добавим рейтинг, правила матчмейкинга, пересчет очков, историю матчей и первые таблицы лидеров вокруг реальных мультиплеерных игр.",
                },
                {
                    time: "После рейтинга",
                    title: "Лобби и сезоны",
                    description:
                        "Откроем пользовательские лобби, сезонные сбросы и понятную структуру прогресса, чтобы соревновательная игра не ограничивалась одиночными матчами.",
                },
                {
                    time: "Затем",
                    title: "Маркетплейс и экономика игроков",
                    description:
                        "Свяжем игровой прогресс с маркетплейсом, активами и системами наград после стабилизации мультиплеера и рейтинга.",
                },
            ],
        },
        faq: [
            {
                question: "Что такое $HOCAI?",
                answer: "$HOCAI - утилити-токен и токен управления для внутриигровых операций, наград, планов стейкинга и голосования по развитию игры.",
            },
            {
                question: "Можно ли играть сейчас?",
                answer: "Да. Нажмите «Играть», затем выберите рейтинговый матчмейкинг или песочницу с настольного браузера.",
            },
            {
                question: "У игры открытый исходный код?",
                answer: "Клиент и общая игровая логика находятся в публичных GitHub-репозиториях. Проект развивается с учетом прозрачности для сообщества.",
            },
            {
                question: "Где раздел казны?",
                answer: "Раздел казны намеренно не включен в этот минимальный сайт. Сейчас сайт сфокусирован на игре, токене, сообществе и правовых страницах.",
            },
        ],
        contact: {
            headline: "По вопросам игры, токена или команды используйте официальные каналы.",
            emailLabel: "Почта",
            email: "support@heroesofcrypto.io",
            formName: "Имя или 0x адрес",
            formEmail: "Электронная почта",
            formSubject: "Тема",
            formMessage: "Сообщение",
            formSubmit: "Открыть письмо",
        },
        patches: patchNotes.ru,
        legal: {
            terms: {
                updated: "27.06.2026",
                intro: "Heroes of Crypto — это бесплатная браузерная пошаговая стратегия от Old Stars Gaming («OSG», «мы», «нас»). Настоящие Условия использования («Условия») регулируют ваш доступ к игре, нашим сайтам и связанным сервисам (вместе — «Сервисы») и их использование. Создавая аккаунт или иным образом используя Сервисы, вы соглашаетесь с этими Условиями. Если вы не согласны, не используйте Сервисы.",
                sections: [
                    {
                        title: "1. Кто может играть",
                        body: [
                            "Вам должно быть не менее 18 лет или вы должны достичь возраста совершеннолетия в вашей юрисдикции, чтобы использовать Сервисы.",
                            "Вы сами отвечаете за соблюдение применимых к вам законов во время игры.",
                        ],
                    },
                    {
                        title: "2. Ваш аккаунт",
                        body: [
                            "Песочницу можно попробовать без аккаунта. Для рейтинговой игры и некоторых других функций нужен бесплатный аккаунт с именем пользователя, email и паролем.",
                            "Храните данные для входа в секрете и указывайте достоверную информацию. Вы отвечаете за все действия, совершённые через ваш аккаунт, поэтому не передавайте его и не используйте чужой.",
                            "Напишите на support@heroesofcrypto.io, если считаете, что к вашему аккаунту получили доступ без вашего разрешения.",
                        ],
                    },
                    {
                        title: "3. Лицензия на игру",
                        body: [
                            "Мы предоставляем вам персональную, ограниченную, неисключительную, непередаваемую и отзывную лицензию на доступ к игре и игру в неё в личных некоммерческих целях.",
                            "Вы не вправе продавать, сдавать в аренду или коммерциализировать доступ к Сервисам, а также использовать их для создания конкурирующего продукта, кроме случаев, прямо разрешённых лицензиями открытого исходного кода, упомянутыми ниже.",
                        ],
                    },
                    {
                        title: "4. Игра бесплатна",
                        body: [
                            "Сервисы бесплатны. Чтобы играть, не нужно ничего скачивать или подключать криптокошелёк, и мы не продаём игровые преимущества.",
                            "Любые внутриигровые предметы, ранги, рейтинги или валюты существуют только внутри игры, не имеют реальной или денежной стоимости и не являются вашей собственностью.",
                        ],
                    },
                    {
                        title: "5. Бета и изменения игры",
                        body: [
                            "Heroes of Crypto активно разрабатывается и предоставляется «как есть» и «по доступности». Функции, ростер юнитов, баланс, карты, рейтинги, таблицы лидеров и другой контент могут меняться, сбрасываться или удаляться в любое время, с уведомлением или без него.",
                            "Мы не гарантируем бесперебойную доступность и сохранность вашего прогресса, рейтингов или статистики.",
                        ],
                    },
                    {
                        title: "6. Честная игра и поведение",
                        body: [
                            "Чтобы матчи оставались честными, вы соглашаетесь не использовать читы, ботов, скрипты и иную автоматизацию; не эксплуатировать ошибки и непредусмотренные механики; не вмешиваться в игровой клиент или его сетевой трафик; и не манипулировать подбором соперников, рейтингами или результатами (включая сговор, передачу аккаунта, смурфинг или намеренные поражения).",
                            "Вы также соглашаетесь не оскорблять, не угрожать, не выдавать себя за других и не злоупотреблять в адрес игроков или команды, а также не выбирать имя пользователя и не отправлять текст, которые оскорбительны, нарушают права или вводят в заблуждение.",
                            "Мы можем удалять контент, сбрасывать рейтинги, а также временно или навсегда блокировать аккаунты, нарушающие эти правила.",
                        ],
                    },
                    {
                        title: "7. Интеллектуальная собственность и открытый код",
                        body: [
                            "Название игры, логотипы, арт, персонажи, аудио и другие ассеты принадлежат OSG или её лицензиарам и защищены законами об интеллектуальной собственности. Их нельзя копировать, изменять или распространять без разрешения.",
                            "Часть проекта имеет открытый исходный код и публикуется под лицензиями, указанными в наших публичных репозиториях; использование такого кода регулируется этими лицензиями. Передавая код или контент, вы предоставляете OSG неисключительную всемирную безвозмездную лицензию на использование, изменение и распространение вашего вклада в составе Сервисов.",
                        ],
                    },
                    {
                        title: "8. Токены и цифровые активы",
                        body: [
                            "Игра в Heroes of Crypto никогда не требует покупки, хранения или использования какой-либо криптовалюты. Если проект отдельно предлагает токен $HOCAI или другие цифровые активы, это необязательно и не связано с игровым процессом.",
                            "Цифровые активы несут риски, включая волатильность цены, потерю доступа и изменение регулирования. Операции могут быть необратимыми, OSG не гарантирует никакой стоимости, и ничто здесь не является финансовым советом. Участвуйте, только если это законно там, где вы живёте, и вы понимаете риски.",
                        ],
                    },
                    {
                        title: "9. Отказ от гарантий",
                        body: [
                            "Сервисы предоставляются «как есть» и «по доступности» без каких-либо гарантий, явных или подразумеваемых, включая товарную пригодность, пригодность для конкретной цели или бесперебойную, безопасную и безошибочную работу.",
                        ],
                    },
                    {
                        title: "10. Ограничение ответственности и возмещение",
                        body: [
                            "В максимально допустимой законом степени OSG не несёт ответственности за любые косвенные, случайные, специальные, последующие или штрафные убытки, а также за потерю данных, рейтингов или прогресса, возникшие из использования Сервисов.",
                            "Вы соглашаетесь возмещать OSG ущерб и ограждать её от претензий, связанных с вашим неправомерным использованием Сервисов или нарушением этих Условий.",
                        ],
                    },
                    {
                        title: "11. Приостановка и прекращение доступа",
                        body: [
                            "Вы можете в любое время прекратить использование Сервисов и закрыть аккаунт. Мы можем приостановить или прекратить ваш доступ в любое время, с уведомлением или без него, если вы нарушаете эти Условия или действуете во вред Сервисам или другим игрокам.",
                        ],
                    },
                    {
                        title: "12. Изменения Условий",
                        body: [
                            "Мы можем периодически обновлять эти Условия. Мы изменим дату «Последнее обновление», а о существенных изменениях можем сообщить в игре или на наших каналах. Продолжая пользоваться Сервисами после вступления изменений в силу, вы принимаете обновлённые Условия.",
                        ],
                    },
                    {
                        title: "13. Применимое право",
                        body: [
                            "Эти Условия регулируются законами штата Вашингтон, США, без учёта коллизионных норм. Споры разрешаются арбитражем в Сиэтле, штат Вашингтон, если иное не требуется применимым законом.",
                        ],
                    },
                    {
                        title: "14. Контакты",
                        body: ["Вопросы по этим Условиям? Пишите на support@heroesofcrypto.io."],
                    },
                ],
            },
            privacy: {
                updated: "27.06.2026",
                intro: "Old Stars Gaming («OSG», «мы», «нас») уважает вашу приватность. Эта Политика конфиденциальности объясняет, какую информацию мы собираем при использовании Heroes of Crypto и как мы её используем, передаём и защищаем. Песочницу можно использовать без аккаунта; для рейтинговой игры и некоторых функций нужен бесплатный аккаунт.",
                sections: [
                    {
                        title: "1. Какую информацию мы собираем",
                        body: [
                            "Данные аккаунта: при регистрации мы собираем имя пользователя, email и пароль, который храним только в виде хэша.",
                            "Игровые данные: сыгранные матчи, внутриигровые действия, результаты, рейтинги и связанная статистика, необходимые для работы игры и подбора соперников.",
                            "Технические данные: базовые сведения об устройстве и браузере, примерное местоположение по IP-адресу и серверные логи — для безопасности, защиты от читов и диагностики.",
                            "Обращения: сообщения, которые вы отправляете нам в поддержку или как обратную связь.",
                            "Необязательные данные кошелька: только если вы решите подключить криптокошелёк для функций токена, мы обрабатываем ваш публичный адрес кошелька. Это никогда не требуется для игры.",
                        ],
                    },
                    {
                        title: "2. Как мы используем информацию",
                        body: [
                            "Мы используем вашу информацию, чтобы запускать, защищать и улучшать игру; подбирать соперников и вести рейтинги и таблицы лидеров; предотвращать читы, мошенничество и злоупотребления; оказывать поддержку; и выполнять наши юридические обязанности.",
                        ],
                    },
                    {
                        title: "3. Правовые основания",
                        body: [
                            "Там, где применяются законы о защите данных, такие как GDPR, мы обрабатываем вашу информацию для исполнения договора с вами (работа игры и вашего аккаунта), в наших законных интересах (безопасность, защита от читов и улучшение Сервисов), для соблюдения закона и, где требуется, с вашего согласия.",
                        ],
                    },
                    {
                        title: "4. Файлы cookie и локальное хранилище",
                        body: [
                            "Мы храним токен входа/сессии и базовые настройки в локальном хранилище вашего браузера, чтобы вы оставались в системе и сохраняли настройки. Мы не используем их для межсайтовой рекламы и не продаём их.",
                        ],
                    },
                    {
                        title: "5. Как мы передаём информацию",
                        body: [
                            "Мы не продаём вашу персональную информацию. Мы можем передавать её поставщикам услуг, которые размещают и обслуживают игру для нас, органам власти, когда этого требует закон, и правопреемнику при передаче проекта.",
                            "Публичные данные профиля, такие как имя пользователя и рейтинги, могут быть видны другим игрокам.",
                        ],
                    },
                    {
                        title: "6. Хранение данных",
                        body: [
                            "Мы храним данные аккаунта и игровые данные, пока ваш аккаунт активен или пока это нужно для работы Сервисов, затем удаляем или обезличиваем их, если только мы не обязаны хранить их по закону.",
                        ],
                    },
                    {
                        title: "7. Международная передача",
                        body: [
                            "Мы можем обрабатывать и хранить информацию на серверах в других странах. Где требуется, мы принимаем меры, чтобы вашей информации обеспечивался надлежащий уровень защиты.",
                        ],
                    },
                    {
                        title: "8. Ваши права и выбор",
                        body: [
                            "В рамках применимого закона вы можете получать доступ к данным аккаунта и обновлять их, запрашивать копию или удаление ваших данных, возражать против отдельной обработки или ограничивать её, а также отказываться от необязательных писем. Чтобы отправить запрос, пишите на support@heroesofcrypto.io.",
                            "Учтите, что данные, записанные в публичный блокчейн (если вы использовали функции токена), являются публичными и могут не подлежать удалению.",
                        ],
                    },
                    {
                        title: "9. Дети",
                        body: [
                            "Сервисы предназначены для лиц от 18 лет. Мы сознательно не собираем персональную информацию детей; если вы считаете, что ребёнок предоставил нам данные, свяжитесь с нами, и мы их удалим.",
                        ],
                    },
                    {
                        title: "10. Сторонние ссылки",
                        body: [
                            "Наши сайты могут ссылаться на сторонние сервисы, например каналы сообщества или блокчейн-обозреватели. Мы не отвечаем за их содержимое и практики конфиденциальности.",
                        ],
                    },
                    {
                        title: "11. Изменения Политики",
                        body: [
                            "Мы можем периодически обновлять эту Политику. Мы изменим дату «Последнее обновление», а о существенных изменениях можем сообщить в игре или на наших каналах.",
                        ],
                    },
                    {
                        title: "12. Контакты",
                        body: ["Вопросы или запросы по приватности? Пишите на support@heroesofcrypto.io."],
                    },
                ],
            },
        },
    },
} as const;
