"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeOneShowcasePull = exports.sortByRarityDesc = exports.addShowcasePulls = exports.getShowcasePulls = exports.isShowcaseEligible = exports.getRarityRank = void 0;
const SHOWCASE_STORAGE_KEY = 'po_showcase_v1';
const rarityRanks = [
    ['godpack', 10],
    ['black white rare', 9],
    ['blackwhiterare', 9],
    ['monochrome', 9],
    ['crown', 9],
    ['three star', 8],
    ['two shiny', 8],
    ['secret', 9],
    ['hyper', 8],
    ['shiny ultra', 6],
    ['special illustration', 7],
    ['specialillustration', 7],
    ['one star', 7],
    ['two star', 6],
    ['one shiny', 6],
    ['holo rare vmax', 6],
    ['holo rare vstar', 6],
    ['holo rare v', 6],
    ['shiny rare vmax', 6],
    ['shiny rare v', 6],
    ['shiny rare', 5],
    ['rare holo lv.x', 6],
    ['ultra', 6],
    ['illustration', 5],
    ['rare holo', 5],
    ['holo rare', 5],
    ['holorare', 5],
    ['radiant rare', 5],
    ['amazing rare', 5],
    ['ace spec', 5],
    ['full art trainer', 5],
    ['rare prime', 5],
    ['legend', 5],
    ['classic collection', 5],
    ['four diamond', 5],
    ['reversemasterball', 4],
    ['three diamond', 4],
    ['double rare', 4],
    ['doublerare', 4],
    ['two diamond', 2],
    ['one diamond', 1],
    ['rare', 3],
    ['uncommon', 2],
    ['common', 1],
];
function rankFromValue(value) {
    if (!value)
        return 0;
    const text = value.toLowerCase();
    const compact = text.replace(/[^a-z0-9]/g, '');
    // Handle shorthand rarity labels seen on some newly-fetched sets.
    if (compact === 'sar' || compact === 'sir')
        return 7;
    if (compact === 'ar')
        return 5;
    if (compact === 'ur')
        return 8;
    if (compact === 'ssr')
        return 8;
    if (compact === 'sr')
        return 6;
    if (compact === 'rr')
        return 4;
    for (const [key, rank] of rarityRanks) {
        if (text.includes(key))
            return rank;
    }
    return 0;
}
function isDoubleRareHit(rarity, special) {
    const r = (rarity || '').toLowerCase();
    const s = (special || '').toLowerCase();
    const rc = r.replace(/[^a-z0-9]/g, '');
    const sc = s.replace(/[^a-z0-9]/g, '');
    return r.includes('double rare') || s.includes('doublerare') || rc === 'rr' || sc === 'rr';
}
function getRarityRank(rarity, special) {
    return Math.max(rankFromValue(rarity), rankFromValue(special));
}
exports.getRarityRank = getRarityRank;
function isShowcaseEligible(card) {
    return getRarityRank(card.rarity, card.special) > 4 || isDoubleRareHit(card.rarity, card.special);
}
exports.isShowcaseEligible = isShowcaseEligible;
function getShowcasePulls() {
    if (typeof window === 'undefined')
        return [];
    try {
        const raw = localStorage.getItem(SHOWCASE_STORAGE_KEY);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return parsed.filter((item) => {
            return (item &&
                typeof item.id === 'string' &&
                typeof item.name === 'string' &&
                typeof item.rarity === 'string' &&
                typeof item.setId === 'string' &&
                typeof item.pulledAt === 'number');
        });
    }
    catch {
        return [];
    }
}
exports.getShowcasePulls = getShowcasePulls;
function addShowcasePulls(setId, cards) {
    if (typeof window === 'undefined')
        return;
    const eligible = cards.filter(isShowcaseEligible);
    if (eligible.length === 0)
        return;
    const nextEntries = eligible.map((card) => {
        var _a, _b;
        return ({
            id: card.id,
            name: card.name,
            rarity: card.rarity || 'Unknown',
            special: card.special,
            image: (_a = card.images) === null || _a === void 0 ? void 0 : _a.small,
            imageLarge: (_b = card.images) === null || _b === void 0 ? void 0 : _b.large,
            setId,
            pulledAt: Date.now(),
        });
    });
    const current = getShowcasePulls();
    const updated = [...nextEntries, ...current].slice(0, 2000);
    localStorage.setItem(SHOWCASE_STORAGE_KEY, JSON.stringify(updated));
}
exports.addShowcasePulls = addShowcasePulls;
function sortByRarityDesc(items) {
    return [...items].sort((a, b) => {
        const rankDiff = getRarityRank(b.rarity, b.special) - getRarityRank(a.rarity, a.special);
        if (rankDiff !== 0)
            return rankDiff;
        const dateDiff = b.pulledAt - a.pulledAt;
        if (dateDiff !== 0)
            return dateDiff;
        return a.name.localeCompare(b.name);
    });
}
exports.sortByRarityDesc = sortByRarityDesc;
function removeOneShowcasePull(setId, cardId) {
    if (typeof window === 'undefined')
        return false;
    const current = getShowcasePulls();
    const index = current.findIndex((item) => item.setId === setId && item.id === cardId);
    if (index < 0)
        return false;
    const updated = [...current.slice(0, index), ...current.slice(index + 1)];
    localStorage.setItem(SHOWCASE_STORAGE_KEY, JSON.stringify(updated));
    return true;
}
exports.removeOneShowcasePull = removeOneShowcasePull;
