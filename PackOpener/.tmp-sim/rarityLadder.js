"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCardRankBySet = exports.getPocketRank = exports.getMainlineRank = exports.supportsMasterBallSet = exports.supportsBallReverseSet = exports.getBallTypes = exports.POCKET_LADDER_DISPLAY = exports.MAINLINE_LADDER_DISPLAY = exports.getSetFamily = void 0;
function getSetFamily(setId) {
    const id = setId.trim().toUpperCase();
    if (/^(A\d+[A-Z]?|B\d+[A-Z]?|P-A)$/.test(id))
        return 'pocket';
    return 'mainline';
}
exports.getSetFamily = getSetFamily;
exports.MAINLINE_LADDER_DISPLAY = 'Holo → Double → Ultra → IR → SIR → Gold';
exports.POCKET_LADDER_DISPLAY = '1◊/2◊ → 3◊ → 4◊ → 1★ → 2★/Shiny → 3★ → Crown';
/**
 * Returns which special reverse variants are available for a given set.
 * - SWSH: Poké Ball
 * - SV: Poké Ball + Master Ball
 * - Ascended Heroes (me02.5): Energy reverse + assigned pattern reverse
 *   (Poké Ball, Love Ball, Friend Ball, Quick Ball, Dusk Ball, Rocket R)
 */
function getBallTypes(setId) {
    const id = setId.trim().toLowerCase();
    const isSV = /^sv\d/.test(id) || id === 'sv03.5' || id.includes('151');
    const isSWSH = /^swsh\d/.test(id);
    const isAscendedHeroes = id === 'me02.5';
    if (isAscendedHeroes) {
        return {
            pokeball: true,
            masterball: false,
            loveball: true,
            friendball: true,
            quickball: true,
            duskball: true,
            rocketr: true,
            energytype: true,
        };
    }
    return {
        pokeball: isSV || isSWSH,
        masterball: isSV,
        loveball: false,
        friendball: false,
        quickball: false,
        duskball: false,
        rocketr: false,
        energytype: false,
    };
}
exports.getBallTypes = getBallTypes;
/** @deprecated use getBallTypes */
const supportsBallReverseSet = (setId) => getBallTypes(setId).pokeball;
exports.supportsBallReverseSet = supportsBallReverseSet;
/** @deprecated use getBallTypes */
const supportsMasterBallSet = (setId) => getBallTypes(setId).masterball;
exports.supportsMasterBallSet = supportsMasterBallSet;
function getMainlineRank(card) {
    const rarity = (card.rarity || '').toLowerCase();
    const special = (card.special || '').toLowerCase();
    const rarityCompact = rarity.replace(/[^a-z0-9]/g, '');
    const specialCompact = special.replace(/[^a-z0-9]/g, '');
    const isShinyUltraTier = rarity.includes('shiny ultra') || special.includes('shinyultra');
    const isShinyRareTier = rarity.includes('shiny rare') || special.includes('shinyrare');
    const isLegacyUltraTier = rarity.includes('holo rare v') ||
        rarity.includes('holo rare vmax') ||
        rarity.includes('holo rare vstar') ||
        rarity.includes('rare holo lv.x') ||
        rarity.includes('radiant rare') ||
        rarity.includes('amazing rare') ||
        rarity.includes('ace spec') ||
        rarity.includes('full art trainer') ||
        rarity.includes('rare prime') ||
        rarity.includes('legend');
    const isLegacyHoloHitTier = rarity.includes('rare holo') || rarity.includes('holo rare') || rarity.includes('classic collection');
    const isMonochromeTier = rarity.includes('black white rare') ||
        rarity.includes('monochrome') ||
        special.includes('blackwhiterare') ||
        special.includes('monochrome');
    const isGoldTier = special.includes('gold') ||
        special.includes('hyper') ||
        special.includes('secret') ||
        rarity.includes('hyper') ||
        rarity.includes('secret') ||
        rarity.includes('crown') ||
        rarityCompact === 'ur' ||
        rarityCompact === 'ssr' ||
        specialCompact === 'ur' ||
        specialCompact === 'ssr' ||
        rarity.includes('mega hyper');
    if (special.includes('godpack'))
        return 100;
    if (isMonochromeTier)
        return 95;
    if (isGoldTier)
        return 95;
    if (special.includes('specialillustration') ||
        rarity.includes('special illustration') ||
        rarityCompact === 'sar' ||
        rarityCompact === 'sir' ||
        specialCompact === 'sar' ||
        specialCompact === 'sir')
        return 90;
    if (isLegacyUltraTier)
        return 74;
    if (isShinyUltraTier)
        return 74;
    if (special.includes('illustration') || rarity.includes('illustration') || rarityCompact === 'ar' || specialCompact === 'ar')
        return 82;
    if (isShinyRareTier)
        return 68;
    if (rarity.includes('ultra') || rarityCompact === 'sr' || specialCompact === 'sr')
        return 68;
    if (isLegacyHoloHitTier)
        return 46;
    if (special.includes('holorare'))
        return 46;
    if (special.includes('reversemasterball'))
        return 52;
    if (special.includes('doublerare') || rarity.includes('double rare') || rarityCompact === 'rr' || specialCompact === 'rr')
        return 58;
    if (special.includes('reversepokeball') ||
        special.includes('reverseloveball') ||
        special.includes('reversefriendball') ||
        special.includes('reversequickball') ||
        special.includes('reverseduskball') ||
        special.includes('reverserocketr'))
        return 49;
    if (special.includes('reverseenergytype'))
        return 47;
    if (card.isReverse)
        return 46;
    if (card.isHolo || rarity.includes('holo'))
        return 40;
    if (rarity.includes('rare'))
        return 30;
    if (rarity.includes('uncommon'))
        return 18;
    return 10;
}
exports.getMainlineRank = getMainlineRank;
function getPocketRank(card) {
    const rarity = (card.rarity || '').toLowerCase();
    const special = (card.special || '').toLowerCase();
    if (special.includes('godpack'))
        return 100;
    if (rarity.includes('crown'))
        return 95;
    if (rarity.includes('three star') || rarity.includes('two shiny'))
        return 90;
    if (rarity.includes('one star'))
        return 82;
    if (rarity.includes('two star') || rarity.includes('one shiny'))
        return 74;
    if (rarity.includes('four diamond'))
        return 58;
    if (rarity.includes('three diamond'))
        return 40;
    if (card.isReverse)
        return 28;
    if (card.isHolo)
        return 24;
    if (rarity.includes('two diamond'))
        return 18;
    return 10;
}
exports.getPocketRank = getPocketRank;
function getCardRankBySet(card, setId) {
    if (!card)
        return 0;
    return getSetFamily(setId) === 'pocket' ? getPocketRank(card) : getMainlineRank(card);
}
exports.getCardRankBySet = getCardRankBySet;
