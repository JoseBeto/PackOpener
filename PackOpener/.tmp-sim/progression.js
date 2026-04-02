"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exchangeCardForCurrency = exports.claimDailyCheckIn = exports.getMissionStatuses = exports.applyPackProgression = exports.getCardExchangeValue = exports.getCardPullReward = exports.applyPeriodResets = exports.saveProgressionState = exports.loadProgressionState = exports.claimSetCompletionMilestones = exports.normalizeProgressionState = exports.createDefaultProgressionState = exports.getMsUntilNextWeeklyReset = exports.getMsUntilNextDailyReset = exports.getPackOpenCost = exports.DAILY_CHECKIN_REWARD = exports.PACK_OPEN_COST = exports.PREMIUM_PACK_OPEN_COST = exports.STANDARD_PACK_OPEN_COST = exports.PROGRESSION_EVENT = exports.PROGRESSION_STORAGE_KEY = void 0;
const showcase_1 = require("./showcase");
exports.PROGRESSION_STORAGE_KEY = 'po_progression_v1';
exports.PROGRESSION_EVENT = 'po-progression-changed';
exports.STANDARD_PACK_OPEN_COST = 100;
exports.PREMIUM_PACK_OPEN_COST = 200;
exports.PACK_OPEN_COST = exports.STANDARD_PACK_OPEN_COST;
exports.DAILY_CHECKIN_REWARD = 1000;
function getPackOpenCost(packType) {
    return packType === 'premium' ? exports.PREMIUM_PACK_OPEN_COST : exports.STANDARD_PACK_OPEN_COST;
}
exports.getPackOpenCost = getPackOpenCost;
function getMsUntilNextDailyReset(now = new Date()) {
    const nextUtcMidnight = new Date(now.getTime());
    nextUtcMidnight.setUTCMinutes(0, 0, 0);
    nextUtcMidnight.setUTCHours(24);
    return Math.max(0, nextUtcMidnight.getTime() - now.getTime());
}
exports.getMsUntilNextDailyReset = getMsUntilNextDailyReset;
function getMsUntilNextWeeklyReset(now = new Date()) {
    const nextUtcMonday = new Date(now.getTime());
    nextUtcMonday.setUTCMinutes(0, 0, 0);
    nextUtcMonday.setUTCHours(0);
    const isoDay = nextUtcMonday.getUTCDay() === 0 ? 7 : nextUtcMonday.getUTCDay();
    const daysUntilNextMonday = 8 - isoDay;
    nextUtcMonday.setUTCDate(nextUtcMonday.getUTCDate() + daysUntilNextMonday);
    return Math.max(0, nextUtcMonday.getTime() - now.getTime());
}
exports.getMsUntilNextWeeklyReset = getMsUntilNextWeeklyReset;
const DAILY_MISSIONS = [
    { id: 'daily-open-3', kind: 'daily', label: 'Open 3 packs', target: 3, reward: 150, metric: 'packsOpened' },
    { id: 'daily-good-2', kind: 'daily', label: 'Pull 2 good cards', target: 2, reward: 120, metric: 'goodPulls' },
    { id: 'daily-elite-1', kind: 'daily', label: 'Pull 1 elite hit', target: 1, reward: 180, metric: 'elitePulls' },
];
const WEEKLY_MISSIONS = [
    { id: 'weekly-open-20', kind: 'weekly', label: 'Open 20 packs', target: 20, reward: 900, metric: 'packsOpened' },
    { id: 'weekly-good-10', kind: 'weekly', label: 'Pull 10 good cards', target: 10, reward: 700, metric: 'goodPulls' },
    { id: 'weekly-elite-4', kind: 'weekly', label: 'Pull 4 elite hits', target: 4, reward: 800, metric: 'elitePulls' },
    { id: 'weekly-sets-5', kind: 'weekly', label: 'Open packs from 5 sets', target: 5, reward: 600, metric: 'distinctSetsOpened' },
];
const SET_COMPLETION_MILESTONES = [
    { threshold: 0.25, reward: 200 },
    { threshold: 0.5, reward: 400 },
    { threshold: 0.75, reward: 700 },
    { threshold: 1, reward: 1200 },
];
function getSetMilestoneKey(setId, threshold) {
    return `${setId}:${Math.round(threshold * 100)}`;
}
function toDailyKey(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
function toWeekKey(date) {
    const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
function fromDateKey(key) {
    if (!key)
        return null;
    const dailyMatch = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dailyMatch) {
        return new Date(Date.UTC(Number(dailyMatch[1]), Number(dailyMatch[2]) - 1, Number(dailyMatch[3]), 0));
    }
    // Legacy key support from older daily half-day format.
    const periodMatch = key.match(/^(\d{4})-(\d{2})-(\d{2})-([AB])$/);
    if (periodMatch) {
        const hour = periodMatch[4] === 'B' ? 12 : 0;
        return new Date(Date.UTC(Number(periodMatch[1]), Number(periodMatch[2]) - 1, Number(periodMatch[3]), hour));
    }
    return null;
}
function diffDaysFromKeys(previousKey, nextKey) {
    const prevRaw = fromDateKey(previousKey);
    const nextRaw = fromDateKey(nextKey);
    if (!prevRaw || !nextRaw)
        return null;
    // Compare by UTC day boundaries to support both current daily and legacy half-day keys.
    const prev = new Date(Date.UTC(prevRaw.getUTCFullYear(), prevRaw.getUTCMonth(), prevRaw.getUTCDate()));
    const next = new Date(Date.UTC(nextRaw.getUTCFullYear(), nextRaw.getUTCMonth(), nextRaw.getUTCDate()));
    if (!prev || !next)
        return null;
    const diff = Math.floor((next.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
    return Number.isFinite(diff) ? diff : null;
}
function isGodPackLike(pack) {
    if (!pack.length)
        return false;
    return pack.every((card) => (0, showcase_1.getRarityRank)(card.rarity, card.special) >= 5);
}
function makeMissionMap(defs) {
    return defs.reduce((acc, mission) => {
        acc[mission.id] = { progress: 0, completed: false, claimed: false };
        return acc;
    }, {});
}
function cloneMissionMap(map) {
    return Object.entries(map).reduce((acc, [id, m]) => {
        acc[id] = { progress: m.progress, completed: m.completed, claimed: m.claimed };
        return acc;
    }, {});
}
function createDefaultProgressionState(date = new Date()) {
    const dayKey = toDailyKey(date);
    return {
        currency: 1000,
        collection: {},
        setMilestonesClaimed: {},
        stats: {
            lifetimePacksOpened: 0,
            lifetimeGoodPulls: 0,
            lifetimeElitePulls: 0,
            totalCoinsEarned: 0,
            godPacksOpened: 0,
            checkInStreak: 0,
            lastCheckInKey: dayKey,
        },
        daily: {
            key: toDailyKey(date),
            checkInClaimed: false,
            missions: makeMissionMap(DAILY_MISSIONS),
        },
        weekly: {
            key: toWeekKey(date),
            missions: makeMissionMap(WEEKLY_MISSIONS),
            distinctSetsOpened: [],
        },
    };
}
exports.createDefaultProgressionState = createDefaultProgressionState;
function normalizeProgressionState(input, now = new Date()) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
    const fallback = createDefaultProgressionState(now);
    if (!input || typeof input !== 'object')
        return fallback;
    const raw = input;
    const next = {
        currency: typeof raw.currency === 'number' && Number.isFinite(raw.currency) ? Math.max(0, Math.floor(raw.currency)) : fallback.currency,
        collection: raw.collection && typeof raw.collection === 'object' ? { ...raw.collection } : {},
        setMilestonesClaimed: raw.setMilestonesClaimed && typeof raw.setMilestonesClaimed === 'object'
            ? Object.entries(raw.setMilestonesClaimed).reduce((acc, [key, value]) => {
                if (typeof key === 'string' && typeof value === 'boolean')
                    acc[key] = value;
                return acc;
            }, {})
            : {},
        stats: {
            lifetimePacksOpened: Math.max(0, Math.floor(((_a = raw.stats) === null || _a === void 0 ? void 0 : _a.lifetimePacksOpened) || 0)),
            lifetimeGoodPulls: Math.max(0, Math.floor(((_b = raw.stats) === null || _b === void 0 ? void 0 : _b.lifetimeGoodPulls) || 0)),
            lifetimeElitePulls: Math.max(0, Math.floor(((_c = raw.stats) === null || _c === void 0 ? void 0 : _c.lifetimeElitePulls) || 0)),
            totalCoinsEarned: Math.max(0, Math.floor(((_d = raw.stats) === null || _d === void 0 ? void 0 : _d.totalCoinsEarned) || 0)),
            godPacksOpened: Math.max(0, Math.floor(((_e = raw.stats) === null || _e === void 0 ? void 0 : _e.godPacksOpened) || 0)),
            checkInStreak: Math.max(0, Math.floor(((_f = raw.stats) === null || _f === void 0 ? void 0 : _f.checkInStreak) || 0)),
            lastCheckInKey: typeof ((_g = raw.stats) === null || _g === void 0 ? void 0 : _g.lastCheckInKey) === 'string' ? raw.stats.lastCheckInKey : fallback.stats.lastCheckInKey,
        },
        daily: {
            key: typeof ((_h = raw.daily) === null || _h === void 0 ? void 0 : _h.key) === 'string' ? raw.daily.key : fallback.daily.key,
            checkInClaimed: Boolean((_j = raw.daily) === null || _j === void 0 ? void 0 : _j.checkInClaimed),
            missions: makeMissionMap(DAILY_MISSIONS),
        },
        weekly: {
            key: typeof ((_k = raw.weekly) === null || _k === void 0 ? void 0 : _k.key) === 'string' ? raw.weekly.key : fallback.weekly.key,
            missions: makeMissionMap(WEEKLY_MISSIONS),
            distinctSetsOpened: Array.isArray((_l = raw.weekly) === null || _l === void 0 ? void 0 : _l.distinctSetsOpened)
                ? raw.weekly.distinctSetsOpened.filter((v) => typeof v === 'string').slice(0, 64)
                : [],
        },
    };
    for (const mission of DAILY_MISSIONS) {
        const src = (_o = (_m = raw.daily) === null || _m === void 0 ? void 0 : _m.missions) === null || _o === void 0 ? void 0 : _o[mission.id];
        if (src) {
            next.daily.missions[mission.id] = {
                progress: Math.max(0, Math.floor(src.progress || 0)),
                completed: Boolean(src.completed),
                claimed: Boolean(src.claimed),
            };
        }
    }
    for (const mission of WEEKLY_MISSIONS) {
        const src = (_q = (_p = raw.weekly) === null || _p === void 0 ? void 0 : _p.missions) === null || _q === void 0 ? void 0 : _q[mission.id];
        if (src) {
            next.weekly.missions[mission.id] = {
                progress: Math.max(0, Math.floor(src.progress || 0)),
                completed: Boolean(src.completed),
                claimed: Boolean(src.claimed),
            };
        }
    }
    return applyPeriodResets(next, now);
}
exports.normalizeProgressionState = normalizeProgressionState;
function claimSetCompletionMilestones(state, setId, completionRatio) {
    const completion = Math.max(0, Math.min(1, completionRatio || 0));
    const claimed = { ...state.setMilestonesClaimed };
    const claimedThresholds = [];
    let reward = 0;
    for (const milestone of SET_COMPLETION_MILESTONES) {
        if (completion < milestone.threshold)
            continue;
        const key = getSetMilestoneKey(setId, milestone.threshold);
        if (claimed[key])
            continue;
        claimed[key] = true;
        reward += milestone.reward;
        claimedThresholds.push(Math.round(milestone.threshold * 100));
    }
    if (reward <= 0) {
        return {
            nextState: state,
            reward: 0,
            claimedThresholds: [],
        };
    }
    return {
        nextState: {
            ...state,
            currency: state.currency + reward,
            setMilestonesClaimed: claimed,
            stats: {
                ...state.stats,
                totalCoinsEarned: state.stats.totalCoinsEarned + reward,
            },
        },
        reward,
        claimedThresholds,
    };
}
exports.claimSetCompletionMilestones = claimSetCompletionMilestones;
function loadProgressionState(now = new Date()) {
    if (typeof window === 'undefined')
        return createDefaultProgressionState(now);
    try {
        const raw = window.localStorage.getItem(exports.PROGRESSION_STORAGE_KEY);
        if (!raw)
            return createDefaultProgressionState(now);
        return normalizeProgressionState(JSON.parse(raw), now);
    }
    catch {
        return createDefaultProgressionState(now);
    }
}
exports.loadProgressionState = loadProgressionState;
function saveProgressionState(state) {
    if (typeof window === 'undefined')
        return;
    try {
        window.localStorage.setItem(exports.PROGRESSION_STORAGE_KEY, JSON.stringify(state));
        window.dispatchEvent(new CustomEvent(exports.PROGRESSION_EVENT));
    }
    catch {
        // ignore storage errors for private mode or quota issues
    }
}
exports.saveProgressionState = saveProgressionState;
function applyPeriodResets(state, now = new Date()) {
    const dayKey = toDailyKey(now);
    const weekKey = toWeekKey(now);
    let next = state;
    if (next.daily.key !== dayKey) {
        next = {
            ...next,
            daily: {
                key: dayKey,
                checkInClaimed: false,
                missions: makeMissionMap(DAILY_MISSIONS),
            },
        };
    }
    if (next.weekly.key !== weekKey) {
        next = {
            ...next,
            weekly: {
                key: weekKey,
                missions: makeMissionMap(WEEKLY_MISSIONS),
                distinctSetsOpened: [],
            },
        };
    }
    return next;
}
exports.applyPeriodResets = applyPeriodResets;
function getCardPullReward(rarity, special) {
    const rank = (0, showcase_1.getRarityRank)(rarity, special);
    if (rank >= 10)
        return 500;
    if (rank >= 9)
        return 400;
    if (rank >= 8)
        return 320;
    if (rank >= 7)
        return 240;
    if (rank >= 6)
        return 190;
    if (rank >= 5)
        return 145;
    if (rank >= 4)
        return 35;
    return 0;
}
exports.getCardPullReward = getCardPullReward;
function getCardCoinReward(card) {
    return getCardPullReward(card.rarity, card.special);
}
function getCardExchangeValue(rarity, special) {
    const rank = (0, showcase_1.getRarityRank)(rarity, special);
    if (rank >= 9)
        return 200;
    if (rank >= 8)
        return 150;
    if (rank >= 7)
        return 120;
    if (rank >= 6)
        return 90;
    if (rank >= 5)
        return 70;
    return 30;
}
exports.getCardExchangeValue = getCardExchangeValue;
function isGoodPull(card) {
    const rarity = (card.rarity || '').toLowerCase();
    const special = (card.special || '').toLowerCase();
    const rarityCompact = rarity.replace(/[^a-z0-9]/g, '');
    const specialCompact = special.replace(/[^a-z0-9]/g, '');
    const isDoubleRareHit = rarity.includes('double rare') ||
        special.includes('doublerare') ||
        rarityCompact === 'rr' ||
        specialCompact === 'rr';
    return (0, showcase_1.getRarityRank)(card.rarity, card.special) >= 5 || isDoubleRareHit;
}
function isElitePull(card) {
    return (0, showcase_1.getRarityRank)(card.rarity, card.special) >= 7;
}
function applyMissionProgress(defs, missions, metrics) {
    const nextMissions = cloneMissionMap(missions);
    let earned = 0;
    for (const mission of defs) {
        const current = nextMissions[mission.id] || { progress: 0, completed: false, claimed: false };
        const nextProgress = Math.min(mission.target, current.progress + (metrics[mission.metric] || 0));
        const completed = current.completed || nextProgress >= mission.target;
        let claimed = current.claimed;
        if (completed && !claimed) {
            claimed = true;
            earned += mission.reward;
        }
        nextMissions[mission.id] = {
            progress: nextProgress,
            completed,
            claimed,
        };
    }
    return { missions: nextMissions, earned };
}
function applyPackProgression(state, setId, pack, packType = 'standard', now = new Date()) {
    const base = applyPeriodResets(state, now);
    const packCost = getPackOpenCost(packType);
    if (base.currency < packCost) {
        return {
            nextState: base,
            currencyDelta: 0,
            packCost,
            cardReward: 0,
            missionReward: 0,
            totalReward: 0,
            newCardFlags: pack.map(() => false),
            newCardsCount: 0,
            notAffordable: true,
        };
    }
    const collection = { ...base.collection };
    const newCardFlags = [];
    const seenThisPack = {};
    for (const card of pack) {
        const key = `${setId}:${card.id}`;
        const ownedBefore = collection[key] || 0;
        const seenCount = seenThisPack[key] || 0;
        const isNew = ownedBefore + seenCount === 0;
        newCardFlags.push(isNew);
        seenThisPack[key] = seenCount + 1;
    }
    for (const [key, count] of Object.entries(seenThisPack)) {
        collection[key] = (collection[key] || 0) + count;
    }
    const cardReward = pack.reduce((sum, card) => sum + getCardCoinReward(card), 0);
    const packsOpened = 1;
    const goodPulls = pack.filter(isGoodPull).length;
    const elitePulls = pack.filter(isElitePull).length;
    const weeklySetList = base.weekly.distinctSetsOpened.includes(setId)
        ? base.weekly.distinctSetsOpened
        : [...base.weekly.distinctSetsOpened, setId].slice(0, 64);
    const dailyMetrics = {
        packsOpened,
        goodPulls,
        elitePulls,
        distinctSetsOpened: 0,
    };
    const weeklyMetrics = {
        packsOpened,
        goodPulls,
        elitePulls,
        distinctSetsOpened: base.weekly.distinctSetsOpened.includes(setId) ? 0 : 1,
    };
    const dailyUpdate = applyMissionProgress(DAILY_MISSIONS, base.daily.missions, dailyMetrics);
    const weeklyUpdate = applyMissionProgress(WEEKLY_MISSIONS, base.weekly.missions, weeklyMetrics);
    const missionReward = dailyUpdate.earned + weeklyUpdate.earned;
    const totalReward = cardReward + missionReward;
    const currencyDelta = totalReward - packCost;
    const nextState = {
        ...base,
        currency: Math.max(0, base.currency + currencyDelta),
        collection,
        stats: {
            lifetimePacksOpened: base.stats.lifetimePacksOpened + 1,
            lifetimeGoodPulls: base.stats.lifetimeGoodPulls + goodPulls,
            lifetimeElitePulls: base.stats.lifetimeElitePulls + elitePulls,
            totalCoinsEarned: base.stats.totalCoinsEarned + totalReward,
            godPacksOpened: base.stats.godPacksOpened + (isGodPackLike(pack) ? 1 : 0),
            checkInStreak: base.stats.checkInStreak,
            lastCheckInKey: base.stats.lastCheckInKey,
        },
        daily: {
            ...base.daily,
            missions: dailyUpdate.missions,
        },
        weekly: {
            ...base.weekly,
            missions: weeklyUpdate.missions,
            distinctSetsOpened: weeklySetList,
        },
    };
    return {
        nextState,
        currencyDelta,
        packCost,
        cardReward,
        missionReward,
        totalReward,
        newCardFlags,
        newCardsCount: newCardFlags.filter(Boolean).length,
        notAffordable: false,
    };
}
exports.applyPackProgression = applyPackProgression;
function getMissionStatuses(state) {
    const daily = DAILY_MISSIONS.map((mission) => {
        const progress = state.daily.missions[mission.id] || { progress: 0, completed: false, claimed: false };
        return {
            ...mission,
            progress: Math.min(mission.target, progress.progress),
            completed: progress.completed,
            claimed: progress.claimed,
        };
    });
    const weekly = WEEKLY_MISSIONS.map((mission) => {
        const progress = state.weekly.missions[mission.id] || { progress: 0, completed: false, claimed: false };
        return {
            ...mission,
            progress: Math.min(mission.target, progress.progress),
            completed: progress.completed,
            claimed: progress.claimed,
        };
    });
    return { daily, weekly };
}
exports.getMissionStatuses = getMissionStatuses;
function claimDailyCheckIn(state, now = new Date()) {
    const base = applyPeriodResets(state, now);
    if (base.daily.checkInClaimed) {
        return {
            nextState: base,
            claimed: false,
            reward: 0,
        };
    }
    const nextState = {
        ...base,
        currency: base.currency + exports.DAILY_CHECKIN_REWARD,
        stats: {
            ...base.stats,
            totalCoinsEarned: base.stats.totalCoinsEarned + exports.DAILY_CHECKIN_REWARD,
            checkInStreak: (() => {
                const delta = diffDaysFromKeys(base.stats.lastCheckInKey, base.daily.key);
                if (delta === 1)
                    return base.stats.checkInStreak + 1;
                if (delta === 0)
                    return base.stats.checkInStreak;
                return 1;
            })(),
            lastCheckInKey: base.daily.key,
        },
        daily: {
            ...base.daily,
            checkInClaimed: true,
        },
    };
    return {
        nextState,
        claimed: true,
        reward: exports.DAILY_CHECKIN_REWARD,
    };
}
exports.claimDailyCheckIn = claimDailyCheckIn;
function exchangeCardForCurrency(state, setId, cardId, rarity, special, options, now = new Date()) {
    const base = applyPeriodResets(state, now);
    const key = `${setId}:${cardId}`;
    const owned = base.collection[key] || 0;
    const allowMissingCollection = Boolean(options === null || options === void 0 ? void 0 : options.allowMissingCollection);
    if (owned <= 0 && !allowMissingCollection) {
        return {
            nextState: base,
            success: false,
            reward: 0,
        };
    }
    const reward = getCardExchangeValue(rarity, special);
    const nextCollection = { ...base.collection };
    if (owned > 1)
        nextCollection[key] = owned - 1;
    else if (owned === 1)
        delete nextCollection[key];
    const nextState = {
        ...base,
        currency: base.currency + reward,
        collection: nextCollection,
        stats: {
            ...base.stats,
            totalCoinsEarned: base.stats.totalCoinsEarned + reward,
        },
    };
    return {
        nextState,
        success: true,
        reward,
    };
}
exports.exchangeCardForCurrency = exchangeCardForCurrency;
