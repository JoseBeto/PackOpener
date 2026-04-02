"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordSessionPackOpen = exports.saveSessionStats = exports.loadSessionStats = exports.SESSION_STATS_EVENT = exports.SESSION_STATS_KEY = void 0;
const rarityLadder_1 = require("./rarityLadder");
exports.SESSION_STATS_KEY = 'po_session_stats_v1';
exports.SESSION_STATS_EVENT = 'po-session-stats-changed';
function createDefaultSessionStats() {
    return {
        startedAt: Date.now(),
        packsOpened: 0,
        netCoins: 0,
        hitCards: 0,
        ultraHitCards: 0,
        majorHitCards: 0,
        topTierHitCards: 0,
        bestPullRank: 0,
        bestPullName: '',
        bestPullSetId: '',
    };
}
function normalizeSessionStats(input) {
    const fallback = createDefaultSessionStats();
    if (!input || typeof input !== 'object')
        return fallback;
    const raw = input;
    return {
        startedAt: typeof raw.startedAt === 'number' && Number.isFinite(raw.startedAt) ? raw.startedAt : fallback.startedAt,
        packsOpened: typeof raw.packsOpened === 'number' && Number.isFinite(raw.packsOpened) ? Math.max(0, Math.floor(raw.packsOpened)) : 0,
        netCoins: typeof raw.netCoins === 'number' && Number.isFinite(raw.netCoins) ? Math.round(raw.netCoins) : 0,
        hitCards: typeof raw.hitCards === 'number' && Number.isFinite(raw.hitCards) ? Math.max(0, Math.floor(raw.hitCards)) : 0,
        ultraHitCards: typeof raw.ultraHitCards === 'number' && Number.isFinite(raw.ultraHitCards) ? Math.max(0, Math.floor(raw.ultraHitCards)) : 0,
        majorHitCards: typeof raw.majorHitCards === 'number' && Number.isFinite(raw.majorHitCards) ? Math.max(0, Math.floor(raw.majorHitCards)) : 0,
        topTierHitCards: typeof raw.topTierHitCards === 'number' && Number.isFinite(raw.topTierHitCards) ? Math.max(0, Math.floor(raw.topTierHitCards)) : 0,
        bestPullRank: typeof raw.bestPullRank === 'number' && Number.isFinite(raw.bestPullRank) ? Math.max(0, Math.floor(raw.bestPullRank)) : 0,
        bestPullName: typeof raw.bestPullName === 'string' ? raw.bestPullName : '',
        bestPullSetId: typeof raw.bestPullSetId === 'string' ? raw.bestPullSetId : '',
    };
}
function loadSessionStats() {
    if (typeof window === 'undefined')
        return createDefaultSessionStats();
    try {
        const raw = window.sessionStorage.getItem(exports.SESSION_STATS_KEY);
        if (!raw)
            return createDefaultSessionStats();
        return normalizeSessionStats(JSON.parse(raw));
    }
    catch {
        return createDefaultSessionStats();
    }
}
exports.loadSessionStats = loadSessionStats;
function saveSessionStats(stats) {
    if (typeof window === 'undefined')
        return;
    try {
        window.sessionStorage.setItem(exports.SESSION_STATS_KEY, JSON.stringify(stats));
        window.dispatchEvent(new CustomEvent(exports.SESSION_STATS_EVENT));
    }
    catch {
        // ignore storage failures
    }
}
exports.saveSessionStats = saveSessionStats;
function recordSessionPackOpen(pack, setId, currencyDelta) {
    const current = loadSessionStats();
    let bestRank = current.bestPullRank;
    let bestName = current.bestPullName;
    let bestSetId = current.bestPullSetId;
    let hitCards = current.hitCards;
    let ultraHitCards = current.ultraHitCards;
    let majorHitCards = current.majorHitCards;
    let topTierHitCards = current.topTierHitCards;
    for (const card of pack) {
        const rank = (0, rarityLadder_1.getCardRankBySet)(card, setId);
        if (rank >= 46)
            hitCards += 1;
        if (rank >= 68)
            ultraHitCards += 1;
        if (rank >= 82)
            majorHitCards += 1;
        if (rank >= 95)
            topTierHitCards += 1;
        if (rank > bestRank) {
            bestRank = rank;
            bestName = card.name || '';
            bestSetId = setId;
        }
    }
    const next = {
        ...current,
        packsOpened: current.packsOpened + 1,
        netCoins: current.netCoins + Math.round(currencyDelta),
        hitCards,
        ultraHitCards,
        majorHitCards,
        topTierHitCards,
        bestPullRank: bestRank,
        bestPullName: bestName,
        bestPullSetId: bestSetId,
    };
    saveSessionStats(next);
    return next;
}
exports.recordSessionPackOpen = recordSessionPackOpen;
