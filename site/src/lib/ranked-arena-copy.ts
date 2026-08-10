export interface RankedArenaCopy {
    eyebrow: string;
    title: string;
    body: string;
    connecting: string;
    live: string;
    partial: string;
    unavailable: string;
    updated: string;
    seasonEndsIn: string;
    refresh: string;
    refreshing: string;
    playersTab: string;
    gamesTab: string;
    leaguesTab: string;
    searchLabel: string;
    searchPlaceholder: string;
    clearSearch: string;
    filterLabel: string;
    sortLabel: string;
    allLeagues: string;
    leagueTemplate: string;
    allStages: string;
    pickStage: string;
    placementStage: string;
    fightStage: string;
    sortRank: string;
    sortRating: string;
    sortGold: string;
    gold: string;
    bansLabel: string;
    bansNone: string;
    marketTitle: string;
    marketBets: string;
    marketPredict: string;
    marketBetOn: string;
    marketSignInHint: string;
    marketPlace: string;
    marketPlacing: string;
    marketCancel: string;
    marketAmountPlaceholder: string;
    marketPreview: string;
    marketPreviewHint: string;
    marketRules: string;
    marketYourBet: string;
    marketToReturn: string;
    marketSignIn: string;
    sortWinRate: string;
    sortWins: string;
    sortStreak: string;
    position: string;
    player: string;
    rating: string;
    record: string;
    winRate: string;
    peakRating: string;
    currentStreak: string;
    lastBattle: string;
    winStreak: string;
    lossStreak: string;
    noStreak: string;
    unranked: string;
    upperDivision: string;
    middleDivision: string;
    lowerDivision: string;
    noDivision: string;
    timeNow: string;
    timeMinutes: string;
    timeHours: string;
    timeDays: string;
    playRanked: string;
    noPlayers: string;
    calibratingHeading: string;
    calibratingProgress: string;
    recalibratingBadge: string;
    noGames: string;
    noLeagues: string;
    rankedGame: string;
    casualGame: string;
    watchLive: string;
    notWatchable: string;
    started: string;
    versus: string;
    aiLabel: string;
    leaguePlayers: string;
    ratingBand: string;
    viewPlayers: string;
    topPlayers: string;
    activePlayers: string;
    calibratingPlayers: string;
    collapsedTitle: string;
    collapsedBody: string;
    errorTitle: string;
    errorBody: string;
    retry: string;
    noJs: string;
    heroLadderEyebrow: string;
    heroLadderTitle: string;
    heroLadderBody: string;
    previousPlayers: string;
    nextPlayers: string;
    viewFullLadder: string;
    showingRanks: string;
    loadingTopPlayers: string;
    viewProfile: string;
    gamesPlayed: string;
    ladderRank: string;
    rankedStatus: string;
    recentForm: string;
    resultWin: string;
    resultLoss: string;
    resultDraw: string;
    resultUnavailable: string;
    showMoreGames: string;
}

export const rankedArenaCopy = {
    en: {
        eyebrow: "Ranked arena",
        title: "Meet the players defining the meta",
        body: "Follow the strongest commanders, discover battles in progress, and see how every league is taking shape.",
        connecting: "Connecting to the arena",
        live: "Live",
        partial: "Some arena data is unavailable",
        unavailable: "Arena unavailable",
        updated: "Updated {time}",
        seasonEndsIn: "ends in {days}d",
        refresh: "Refresh arena",
        refreshing: "Refreshing arena",
        playersTab: "Full standings",
        gamesTab: "Active games",
        leaguesTab: "Leagues",
        searchLabel: "Search the ranked arena",
        searchPlaceholder: "Search players, games, or leagues",
        clearSearch: "Clear search",
        filterLabel: "Filter",
        sortLabel: "Sort by",
        allLeagues: "All leagues",
        leagueTemplate: "League {n}",
        allStages: "All stages",
        pickStage: "Picking",
        placementStage: "Placement",
        fightStage: "Battle",
        sortRank: "Rank",
        sortRating: "MMR",
        sortGold: "Gold",
        gold: "Gold",
        bansLabel: "Bans",
        bansNone: "—",
        marketTitle: "Prediction market",
        marketBets: "{n} bets",
        marketPredict: "Predict",
        marketBetOn: "Bet on",
        marketSignInHint: "Pick a side to sign in and stake your gold.",
        marketPlace: "Place bet",
        marketPlacing: "Placing…",
        marketCancel: "Cancel",
        marketAmountPlaceholder: "Gold to stake",
        marketPreview: "{stake} on {side} returns {total} (+{profit} profit) at the current pools.",
        marketPreviewHint: "Pick a side and a stake to see the payout.",
        marketRules: "One bet per game, final once placed. No commission — winners split the losing pool. A draw burns every stake.",
        marketYourBet: "Your bet: {amount} on {side}",
        marketToReturn: "Returns {amount}",
        marketSignIn: "Sign in to predict",
        sortWinRate: "Win rate",
        sortWins: "Wins",
        sortStreak: "Streak",
        position: "Position",
        player: "Player",
        rating: "MMR",
        record: "Record",
        winRate: "Win rate",
        peakRating: "Peak MMR",
        currentStreak: "Current streak",
        lastBattle: "Last battle",
        winStreak: "{n} win streak",
        lossStreak: "{n} loss streak",
        noStreak: "No active streak",
        unranked: "Unranked",
        upperDivision: "Upper division",
        middleDivision: "Middle division",
        lowerDivision: "Lower division",
        noDivision: "No division",
        timeNow: "now",
        timeMinutes: "{n}m",
        timeHours: "{n}h",
        timeDays: "{n}d",
        playRanked: "Play ranked",
        noPlayers: "No ranked players match this search yet.",
        calibratingHeading: "In calibration",
        calibratingProgress: "Calibration {played}/{required}",
        recalibratingBadge: "returning",
        noGames: "No active games match this search right now.",
        noLeagues: "No leagues match this search yet.",
        rankedGame: "Ranked game",
        casualGame: "Casual game",
        watchLive: "Watch live",
        notWatchable: "Spectating unavailable",
        started: "Started {time}",
        versus: "vs",
        aiLabel: "AI {version}",
        leaguePlayers: "{n} players",
        ratingBand: "{min}–{max} MMR",
        viewPlayers: "View players",
        topPlayers: "Top {n}",
        activePlayers: "{n} active players",
        calibratingPlayers: "{n} calibrating",
        collapsedTitle: "One shared league is active",
        collapsedBody:
            "The ranked population is still growing, so every active commander currently competes in one league.",
        errorTitle: "The arena could not be reached",
        errorBody: "Live ranked data is temporarily unavailable. Try again in a moment.",
        retry: "Try again",
        noJs: "Enable JavaScript to load live standings, active games, and league populations.",
        heroLadderEyebrow: "Live ranked ladder",
        heroLadderTitle: "Top commanders",
        heroLadderBody: "The sharpest minds currently fighting for the crown.",
        previousPlayers: "Previous ranked players",
        nextPlayers: "Next ranked players",
        viewFullLadder: "Explore the full ladder",
        showingRanks: "Ranks {start}–{end} of {total}",
        loadingTopPlayers: "Summoning the top commanders",
        viewProfile: "View player profile",
        gamesPlayed: "Ranked games",
        ladderRank: "Ladder rank",
        rankedStatus: "Ranked status",
        recentForm: "Last 5 games",
        resultWin: "Win",
        resultLoss: "Loss",
        resultDraw: "Draw",
        resultUnavailable: "No game",
        showMoreGames: "Show {n} more · {remaining} remaining",
    },
    ru: {
        eyebrow: "Рейтинговая арена",
        title: "Игроки, которые определяют мету",
        body: "Следите за сильнейшими командирами, находите идущие бои и наблюдайте, как формируется каждая лига.",
        connecting: "Подключаемся к арене",
        live: "В эфире",
        partial: "Часть данных арены недоступна",
        unavailable: "Арена недоступна",
        updated: "Обновлено {time}",
        seasonEndsIn: "до конца {days}д",
        refresh: "Обновить арену",
        refreshing: "Обновляем арену",
        playersTab: "Полный рейтинг",
        gamesTab: "Активные игры",
        leaguesTab: "Лиги",
        searchLabel: "Поиск по рейтинговой арене",
        searchPlaceholder: "Игроки, игры или лиги",
        clearSearch: "Очистить поиск",
        filterLabel: "Фильтр",
        sortLabel: "Сортировка",
        allLeagues: "Все лиги",
        leagueTemplate: "Лига {n}",
        allStages: "Все стадии",
        pickStage: "Выбор армии",
        placementStage: "Расстановка",
        fightStage: "Бой",
        sortRank: "Место",
        sortRating: "MMR",
        sortGold: "Золото",
        gold: "Золото",
        bansLabel: "Бан",
        bansNone: "—",
        marketTitle: "Рынок прогнозов",
        marketBets: "ставок: {n}",
        marketPredict: "Прогноз",
        marketBetOn: "Ставка на",
        marketSignInHint: "Выберите сторону, чтобы войти и поставить золото.",
        marketPlace: "Сделать ставку",
        marketPlacing: "Ставим…",
        marketCancel: "Отмена",
        marketAmountPlaceholder: "Сколько золота",
        marketPreview: "Ставка {stake} на {side} вернёт {total} (+{profit} прибыли) при текущих пулах.",
        marketPreviewHint: "Выберите сторону и размер ставки, чтобы увидеть выплату.",
        marketRules: "Одна ставка на игру, изменить нельзя. Без комиссии — победители делят проигравший пул. При ничьей всё золото сгорает.",
        marketYourBet: "Ваша ставка: {amount} на {side}",
        marketToReturn: "Вернёт {amount}",
        marketSignIn: "Войдите, чтобы делать прогнозы",
        sortWinRate: "Процент побед",
        sortWins: "Победы",
        sortStreak: "Серия",
        position: "Место",
        player: "Игрок",
        rating: "MMR",
        record: "Результат",
        winRate: "Процент побед",
        peakRating: "Пиковый MMR",
        currentStreak: "Текущая серия",
        lastBattle: "Последний бой",
        winStreak: "Побед подряд: {n}",
        lossStreak: "Поражений подряд: {n}",
        noStreak: "Нет активной серии",
        unranked: "Без рейтинга",
        upperDivision: "Высший дивизион",
        middleDivision: "Средний дивизион",
        lowerDivision: "Нижний дивизион",
        noDivision: "Без дивизиона",
        timeNow: "сейчас",
        timeMinutes: "{n} мин",
        timeHours: "{n} ч",
        timeDays: "{n} дн",
        playRanked: "Играть в рейтинг",
        noPlayers: "По этому запросу рейтинговые игроки не найдены.",
        calibratingHeading: "На калибровке",
        calibratingProgress: "Калибровка {played}/{required}",
        recalibratingBadge: "возвращение",
        noGames: "Сейчас нет активных игр по этому запросу.",
        noLeagues: "По этому запросу лиги не найдены.",
        rankedGame: "Рейтинговая игра",
        casualGame: "Обычная игра",
        watchLive: "Смотреть бой",
        notWatchable: "Просмотр недоступен",
        started: "Начало {time}",
        versus: "против",
        aiLabel: "ИИ {version}",
        leaguePlayers: "Игроков: {n}",
        ratingBand: "MMR {min}–{max}",
        viewPlayers: "Показать игроков",
        topPlayers: "Топ-{n}",
        activePlayers: "Активных игроков: {n}",
        calibratingPlayers: "На калибровке: {n}",
        collapsedTitle: "Сейчас действует одна общая лига",
        collapsedBody:
            "Рейтинговая аудитория ещё растёт, поэтому все активные командиры пока соревнуются в одной лиге.",
        errorTitle: "Не удалось связаться с ареной",
        errorBody: "Рейтинговые данные временно недоступны. Повторите попытку через несколько секунд.",
        retry: "Повторить",
        noJs: "Включите JavaScript, чтобы загрузить рейтинг, активные игры и состав лиг.",
        heroLadderEyebrow: "Рейтинг в реальном времени",
        heroLadderTitle: "Лучшие командиры",
        heroLadderBody: "Сильнейшие стратеги, которые прямо сейчас сражаются за корону.",
        previousPlayers: "Предыдущие игроки рейтинга",
        nextPlayers: "Следующие игроки рейтинга",
        viewFullLadder: "Открыть весь рейтинг",
        showingRanks: "Места {start}–{end} из {total}",
        loadingTopPlayers: "Призываем лучших командиров",
        viewProfile: "Открыть профиль игрока",
        gamesPlayed: "Рейтинговые игры",
        ladderRank: "Место в рейтинге",
        rankedStatus: "Статус в рейтинге",
        recentForm: "Последние 5 игр",
        resultWin: "Победа",
        resultLoss: "Поражение",
        resultDraw: "Ничья",
        resultUnavailable: "Нет игры",
        showMoreGames: "Показать ещё {n} · осталось {remaining}",
    },
} satisfies Record<"en" | "ru", RankedArenaCopy>;

export type RankedArenaLanguage = keyof typeof rankedArenaCopy;
