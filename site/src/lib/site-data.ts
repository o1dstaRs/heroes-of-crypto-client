import { patchNotes } from "./patch-notes";

export const supportedLanguages = ["en", "ru"] as const;

export type Language = (typeof supportedLanguages)[number];

export const pageSlugs = [
    "game",
    "rules",
    "units",
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
            description:
                "Play Heroes of Crypto in your browser: fast tactical battles, 4 factions, 44 units, and 74 abilities. Free to play, no download.",
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
            units: "Units",
            token: "Token",
            patches: "Patches",
            faq: "FAQ",
            contact: "Contact",
            login: "Login",
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
            rankedHint: "Matchmaking with real opponents",
            sandboxHint: "Practice builds, spells, and board states before ranked.",
            startLabel: "Start game",
            modeTitle: "Choose how to play",
            modeBody:
                "Start ranked matchmaking when you want a real opponent, or open the sandbox beta when you want to test armies and board states.",
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
                description: "Terms for accessing Heroes of Crypto AI services.",
            },
            "privacy-policy": {
                title: "Privacy Policy",
                eyebrow: "Legal",
                description: "How Heroes of Crypto AI handles information connected to its services.",
            },
        },
        hero: {
            kicker: "Free browser strategy",
            title: "Heroes of Crypto",
            tagline: "Click play. Build an army. Win the board.",
            body: "A tactical battle game where positioning, faction synergies, and 75+ spells and abilities decide every fight. No download, no wallet gate - click play and choose ranked or the sandbox beta.",
            primaryCta: "Play",
            secondaryCta: "Browse units",
            availability: "Ranked and sandbox beta",
            highlights: ["No download", "No wallet gate", "Ranked or sandbox beta"],
            stats: [
                { value: "4", label: "Factions" },
                { value: "44", label: "Combat units" },
                { value: "74", label: "Abilities" },
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
            body: "Four factions, 44 units, and layer after layer of strategy: faction bonuses, upgradeable placement, magic, auras, and maps that shrink as the fight wears on. No two battles play the same.",
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
                attack: "Attack",
                damage: "Damage",
                armor: "Armor",
                speed: "Speed",
                steps: "Move",
                rangeShots: "Shots",
                magicResist: "Magic resist",
                attackType: "Attack type",
                movement: "Movement",
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
                updated: "14/11/2024",
                intro: "Welcome to Heroes of Crypto AI, an open-source, blockchain-based game developed by Old Stars Gaming (OSG). By registering, accessing, or using our game, associated services, websites, or applications, you agree to these Terms of Service.",
                sections: [
                    {
                        title: "1. Eligibility",
                        body: [
                            "You must be at least 18 years old or have reached the age of majority in your jurisdiction to use the Services.",
                            "You agree to comply with all applicable local, state, and national laws and regulations.",
                        ],
                    },
                    {
                        title: "2. Account Registration and Security",
                        body: [
                            "You must provide accurate and up-to-date account information when using Services that require registration.",
                            "You are responsible for maintaining the security of your account credentials and for activities conducted through your account.",
                            "OSG may suspend or terminate accounts suspected of unauthorized use, fraudulent behavior, or other breaches of these Terms.",
                        ],
                    },
                    {
                        title: "3. User Conduct",
                        body: [
                            "You agree not to use the Services for unlawful purposes or to interfere with the Services, other users, or our systems.",
                            "Prohibited behavior includes exploiting bugs, using unauthorized software, fraudulent transactions, or abusive conduct.",
                        ],
                    },
                    {
                        title: "4. Intellectual Property Rights",
                        body: [
                            "Game mechanics, characters, art, and other assets are protected by intellectual property laws and may not be copied or modified without permission.",
                            "Community contributions may be subject to licensing terms on our GitHub repositories. By contributing, you grant OSG a non-exclusive, worldwide license to use, modify, and distribute those contributions as part of the game.",
                        ],
                    },
                    {
                        title: "5. Purchases, Tokens, and Digital Assets",
                        body: [
                            "Transactions involving $HOCAI tokens, NFTs, and other digital assets are final and non-refundable unless required by applicable law.",
                            "By purchasing or using tokens, you acknowledge the risks associated with cryptocurrencies, including price volatility and regulatory changes.",
                            "OSG does not guarantee any monetary value for $HOCAI tokens or other digital assets.",
                        ],
                    },
                    {
                        title: "6. Community Engagement and Governance",
                        body: [
                            "Heroes of Crypto AI is community-driven. By participating, you agree to contribute in good faith and respect other users.",
                            "OSG may collect feedback or hold community votes, while retaining final decision authority for the Services.",
                        ],
                    },
                    {
                        title: "7. Privacy Policy",
                        body: [
                            "Please read our Privacy Policy to understand how we collect, use, and share information.",
                        ],
                    },
                    {
                        title: "8. Liability and Warranty Disclaimer",
                        body: [
                            "The Services are provided AS IS and AS AVAILABLE without warranties of any kind.",
                            "OSG will not be liable for indirect, incidental, special, consequential, or punitive damages arising from use of the Services.",
                            "You agree to indemnify and hold OSG harmless from claims connected with your breach of these Terms.",
                        ],
                    },
                    {
                        title: "9. Termination",
                        body: [
                            "OSG may suspend or terminate access at any time, with or without notice, if you breach these Terms or engage in harmful conduct.",
                        ],
                    },
                    {
                        title: "10. Changes to the Terms",
                        body: [
                            "OSG may update these Terms from time to time. Continued use after changes take effect constitutes acceptance of the revised Terms.",
                        ],
                    },
                    {
                        title: "11. Governing Law",
                        body: [
                            "These Terms are governed by the laws of the State of Washington, United States. Disputes shall be resolved through arbitration in Seattle, Washington, unless otherwise required by law.",
                        ],
                    },
                    {
                        title: "12. Contact Us",
                        body: ["For questions about these Terms, contact support@heroesofcrypto.io."],
                    },
                ],
            },
            privacy: {
                updated: "14/11/2024",
                intro: "Old Stars Gaming (OSG, we, us, or our) is committed to protecting your privacy. This Privacy Policy describes how we collect, use, disclose, and safeguard information when you use Heroes of Crypto AI and associated services.",
                sections: [
                    {
                        title: "1. Information We Collect",
                        body: [
                            "We may collect personal information such as username, email address, wallet address, and account details.",
                            "We may collect usage data, device information, blockchain data, and communications you provide through support or community interactions.",
                        ],
                    },
                    {
                        title: "2. How We Use Information",
                        body: [
                            "We use information to provide, maintain, and improve the Services, communicate with you, personalize your experience, and comply with legal obligations.",
                        ],
                    },
                    {
                        title: "3. Sharing Information",
                        body: [
                            "We may share information with service providers, legal or regulatory authorities, open-source community channels, or a successor entity in a business transfer.",
                        ],
                    },
                    {
                        title: "4. Security",
                        body: [
                            "We take reasonable measures to protect information, but no internet or blockchain transmission is entirely secure. By using the Services, you acknowledge these risks.",
                        ],
                    },
                    {
                        title: "5. Your Rights and Choices",
                        body: [
                            "Subject to applicable law, you may access or update account information, request deletion by contacting support@heroesofcrypto.io, or opt out of promotional communications.",
                            "Some blockchain data is public and immutable and cannot be altered or deleted.",
                        ],
                    },
                    {
                        title: "6. Children",
                        body: [
                            "The Services are not intended for individuals under 18. We do not knowingly collect personal information from children.",
                        ],
                    },
                    {
                        title: "7. Third-Party Links",
                        body: [
                            "The Services may link to third-party websites or applications. We are not responsible for their privacy practices.",
                        ],
                    },
                    {
                        title: "8. Changes",
                        body: [
                            "We may update this Privacy Policy from time to time by updating the Last Updated date and, where necessary, providing additional notice.",
                        ],
                    },
                    {
                        title: "9. Contact Us",
                        body: ["For privacy questions, contact support@heroesofcrypto.io."],
                    },
                ],
            },
        },
    },
    ru: {
        meta: {
            title: "Heroes of Crypto - браузерная стратегия",
            description:
                "Играйте в Heroes of Crypto в браузере: быстрые тактические бои, 4 фракции, 44 юнита и 74 способности. Бесплатно и без скачивания.",
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
            units: "Юниты",
            token: "Токен",
            patches: "Патчи",
            faq: "Вопросы",
            contact: "Контакты",
            login: "Войти",
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
            rankedHint: "Матчмейкинг против реальных соперников",
            sandboxHint: "Практика армий, заклинаний и состояний поля перед рейтинговыми матчами.",
            startLabel: "Запуск игры",
            modeTitle: "Выберите режим",
            modeBody:
                "Запускайте рейтинговый матч против реального соперника или открывайте песочницу для тестов армий и состояний поля.",
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
                description: "Условия доступа к сервисам Heroes of Crypto AI.",
            },
            "privacy-policy": {
                title: "Политика конфиденциальности",
                eyebrow: "Правовая информация",
                description: "Как Heroes of Crypto AI обрабатывает информацию, связанную с сервисами.",
            },
        },
        hero: {
            kicker: "Бесплатная браузерная стратегия",
            title: "Heroes of Crypto",
            tagline: "Нажмите «Играть». Соберите отряд. Заберите поле.",
            body: "Тактические бои, где позиционирование, фракционные синергии и 75+ заклинаний и способностей решают исход каждой схватки. Без скачивания и без привязки кошелька: нажмите «Играть» и выберите рейтинг или песочницу.",
            primaryCta: "Играть",
            secondaryCta: "Открыть юнитов",
            availability: "Рейтинг и песочница",
            highlights: ["Без скачивания", "Без привязки кошелька", "Рейтинг или песочница"],
            stats: [
                { value: "4", label: "Фракции" },
                { value: "44", label: "Боевых юнита" },
                { value: "74", label: "Способности" },
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
                attack: "Атака",
                damage: "Урон",
                armor: "Броня",
                speed: "Скорость",
                steps: "Ход",
                rangeShots: "Выстрелы",
                magicResist: "Маг. сопр.",
                attackType: "Тип атаки",
                movement: "Перемещение",
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
                updated: "14.11.2024",
                intro: "Добро пожаловать в Heroes of Crypto AI, блокчейн-игру с открытым исходным кодом, разработанную Old Stars Gaming (OSG). Регистрируясь, получая доступ или используя игру, связанные сервисы, сайты или приложения, вы соглашаетесь с этими Условиями использования.",
                sections: [
                    {
                        title: "1. Право на использование",
                        body: [
                            "Для использования Сервисов вам должно быть не менее 18 лет или вы должны достичь возраста совершеннолетия в вашей юрисдикции.",
                            "Вы соглашаетесь соблюдать все применимые местные, региональные и национальные законы и правила.",
                        ],
                    },
                    {
                        title: "2. Аккаунт и безопасность",
                        body: [
                            "Если Сервисы требуют регистрации, вы обязуетесь предоставлять точную и актуальную информацию.",
                            "Вы отвечаете за безопасность учетных данных и действия, совершенные через ваш аккаунт.",
                            "OSG может приостановить или прекратить доступ аккаунтов при подозрении на несанкционированное использование, мошенничество или нарушение этих Условий.",
                        ],
                    },
                    {
                        title: "3. Поведение пользователя",
                        body: [
                            "Вы соглашаетесь не использовать Сервисы в незаконных целях и не мешать работе Сервисов, других пользователей или наших систем.",
                            "Запрещенное поведение включает эксплуатацию ошибок, использование неразрешенного ПО, мошеннические операции и оскорбительное поведение.",
                        ],
                    },
                    {
                        title: "4. Интеллектуальная собственность",
                        body: [
                            "Игровые механики, персонажи, арт и другие ассеты защищены законами об интеллектуальной собственности и не могут копироваться или изменяться без разрешения.",
                            "Вклады сообщества могут регулироваться лицензиями в наших GitHub-репозиториях. Передавая вклад, вы предоставляете OSG неисключительную всемирную лицензию на использование, изменение и распространение такого вклада как части игры.",
                        ],
                    },
                    {
                        title: "5. Покупки, токены и цифровые активы",
                        body: [
                            "Операции с $HOCAI, NFT и другими цифровыми активами являются окончательными и не подлежат возврату, если иное не требуется законом.",
                            "Покупая или используя токены, вы признаете риски криптовалют, включая волатильность цены и регуляторные изменения.",
                            "OSG не гарантирует денежную стоимость $HOCAI или других цифровых активов.",
                        ],
                    },
                    {
                        title: "6. Сообщество и управление",
                        body: [
                            "Heroes of Crypto AI развивается вместе с сообществом. Участвуя, вы соглашаетесь действовать добросовестно и уважать других пользователей.",
                            "OSG может собирать обратную связь или проводить голосования, сохраняя за собой финальное право принятия решений по Сервисам.",
                        ],
                    },
                    {
                        title: "7. Политика конфиденциальности",
                        body: [
                            "Ознакомьтесь с Политикой конфиденциальности, чтобы понять, как мы собираем, используем и передаем информацию.",
                        ],
                    },
                    {
                        title: "8. Ограничение ответственности",
                        body: [
                            "Сервисы предоставляются «как есть» и «по доступности» без каких-либо гарантий.",
                            "OSG не несет ответственности за косвенные, случайные, специальные, последующие или штрафные убытки, возникшие из использования Сервисов.",
                            "Вы соглашаетесь защищать OSG от претензий, связанных с вашим нарушением этих Условий.",
                        ],
                    },
                    {
                        title: "9. Прекращение доступа",
                        body: [
                            "OSG может приостановить или прекратить доступ в любое время, с уведомлением или без него, если вы нарушаете эти Условия или совершаете вредоносные действия.",
                        ],
                    },
                    {
                        title: "10. Изменения Условий",
                        body: [
                            "OSG может периодически обновлять эти Условия. Продолжение использования после вступления изменений в силу означает принятие обновленных Условий.",
                        ],
                    },
                    {
                        title: "11. Применимое право",
                        body: [
                            "Эти Условия регулируются законами штата Вашингтон, США. Споры разрешаются арбитражем в Сиэтле, штат Вашингтон, если иное не требуется законом.",
                        ],
                    },
                    {
                        title: "12. Контакты",
                        body: ["По вопросам этих Условий пишите на support@heroesofcrypto.io."],
                    },
                ],
            },
            privacy: {
                updated: "14.11.2024",
                intro: "Old Stars Gaming (OSG, мы, нас или наш) стремится защищать вашу приватность. Эта Политика описывает, как мы собираем, используем, раскрываем и защищаем информацию при использовании Heroes of Crypto AI и связанных сервисов.",
                sections: [
                    {
                        title: "1. Какую информацию мы собираем",
                        body: [
                            "Мы можем собирать персональную информацию, такую как имя пользователя, email, адрес кошелька и данные аккаунта.",
                            "Мы можем собирать данные об использовании, информацию об устройстве, данные блокчейна и сообщения, которые вы отправляете через поддержку или каналы сообщества.",
                        ],
                    },
                    {
                        title: "2. Как мы используем информацию",
                        body: [
                            "Мы используем информацию для предоставления, поддержки и улучшения Сервисов, связи с вами, персонализации опыта и соблюдения юридических обязательств.",
                        ],
                    },
                    {
                        title: "3. Передача информации",
                        body: [
                            "Мы можем передавать информацию поставщикам услуг, юридическим или регуляторным органам, каналам сообщества с открытым исходным кодом или правопреемнику при передаче бизнеса.",
                        ],
                    },
                    {
                        title: "4. Безопасность",
                        body: [
                            "Мы принимаем разумные меры защиты, но ни передача данных через интернет, ни блокчейн-транзакции не являются полностью безопасными. Используя Сервисы, вы признаете эти риски.",
                        ],
                    },
                    {
                        title: "5. Ваши права и выбор",
                        body: [
                            "В рамках применимого закона вы можете получать доступ к аккаунту, обновлять данные, запросить удаление через support@heroesofcrypto.io или отказаться от промо-коммуникаций.",
                            "Некоторые данные блокчейна являются публичными и неизменяемыми, поэтому их нельзя изменить или удалить.",
                        ],
                    },
                    {
                        title: "6. Дети",
                        body: [
                            "Сервисы не предназначены для лиц младше 18 лет. Мы сознательно не собираем персональную информацию детей.",
                        ],
                    },
                    {
                        title: "7. Сторонние ссылки",
                        body: [
                            "Сервисы могут содержать ссылки на сторонние сайты или приложения. Мы не отвечаем за их практики конфиденциальности.",
                        ],
                    },
                    {
                        title: "8. Изменения",
                        body: [
                            "Мы можем периодически обновлять эту Политику, меняя дату последнего обновления и, при необходимости, предоставляя дополнительное уведомление.",
                        ],
                    },
                    {
                        title: "9. Контакты",
                        body: ["По вопросам приватности пишите на support@heroesofcrypto.io."],
                    },
                ],
            },
        },
    },
} as const;
