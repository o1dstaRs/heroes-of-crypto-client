import type { KnowledgeAiLanguage } from "./knowledge-ai-client";

/**
 * Labels of the Knowledge Base AI answer panel, in both languages. The panel speaks the language of the
 * answer, not of the page: a Russian question asked on the English page gets a Russian answer, and its
 * status line, source list, disclaimer and errors switch to Russian with it.
 */
export interface KnowledgeAiPanelCopy {
    title: string;
    stop: string;
    sources: string;
    disclaimer: string;
    thinking: string;
    searching: string;
    reading: string;
    listing: string;
    answering: string;
    done: string;
    cached: string;
    stopped: string;
    errorGeneric: string;
    errorRate: string;
    errorBusy: string;
    errorBudget: string;
    errorLong: string;
}

export const KNOWLEDGE_AI_PANEL_COPY: Readonly<Record<KnowledgeAiLanguage, KnowledgeAiPanelCopy>> = {
    en: {
        title: "AI answer",
        stop: "Stop",
        sources: "Sources",
        disclaimer:
            "Written by an AI from the game's own rules and data; it can still make mistakes — follow the links to verify.",
        thinking: "Searching the knowledge base…",
        searching: "Searching",
        reading: "Reading",
        listing: "Listing",
        answering: "Answering…",
        done: "Done",
        cached: "Done · cached",
        stopped: "Stopped",
        errorGeneric: "The AI assistant is unavailable right now. The regular search below still works.",
        errorRate: "Too many questions in a row. Try again in {seconds} s.",
        errorBusy: "The AI assistant is busy with other questions. Try again in a few seconds.",
        errorBudget: "The AI assistant has reached today's question limit. The regular search below still works.",
        errorLong: "That question is too long. Keep it to a few sentences.",
    },
    ru: {
        title: "Ответ ИИ",
        stop: "Остановить",
        sources: "Источники",
        disclaimer:
            "Ответ составлен ИИ по правилам и данным игры и всё же может содержать ошибки — проверяйте по ссылкам.",
        thinking: "Ищу ответ в базе знаний…",
        searching: "Ищу",
        reading: "Читаю",
        listing: "Собираю список",
        answering: "Отвечаю…",
        done: "Готово",
        cached: "Готово · из кеша",
        stopped: "Остановлено",
        errorGeneric: "ИИ-помощник сейчас недоступен. Обычный поиск ниже работает как обычно.",
        errorRate: "Слишком много вопросов подряд. Попробуйте снова через {seconds} с.",
        errorBusy: "ИИ-помощник занят другими вопросами. Попробуйте через несколько секунд.",
        errorBudget: "Дневной лимит вопросов к ИИ исчерпан. Обычный поиск ниже работает.",
        errorLong: "Вопрос слишком длинный. Сократите его до нескольких предложений.",
    },
};
