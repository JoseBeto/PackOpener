"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulatePack = void 0;
const rarityLadder_1 = require("./rarityLadder");
function rarityToKey(r) {
    if (!r)
        return 'Common';
    const val = r.toLowerCase();
    if (val.includes('secret') || val.includes('hyper') || val.includes('crown') || val.includes('three star'))
        return 'Secret';
    if (val.includes('ultra') ||
        val.includes('ex') ||
        val.includes('vmax') ||
        val.includes('vstar') ||
        val.includes('double rare') ||
        val.includes('two star') ||
        val.includes('one shiny') ||
        val.includes('two shiny'))
        return 'Ultra';
    if (val.includes('rare') ||
        val.includes('holo') ||
        val.includes('holofoil') ||
        val.includes('one star') ||
        val.includes('four diamond') ||
        val.includes('three diamond'))
        return 'Rare';
    if (val.includes('uncommon') || val.includes('unco') || val.includes('two diamond'))
        return 'Uncommon';
    return 'Common';
}
function simulatePack(packDef, pool, opts) {
    const result = [];
    const setId = opts?.setId || '';
    const isPocketSet = (0, rarityLadder_1.getSetFamily)(setId) === 'pocket';
    // Get rarity weight map from packDef or use defaults
    const rarityWeightMap = packDef.rarityWeightMap || new Map([
        ['Secret', 0.026],
        ['Ultra', 0.065],
        ['Rare', 0.186],
        ['Uncommon', 0.213],
        ['Common', 0.257],
    ]);
    // Build rarity buckets from pool
    const buckets = {};
    for (const c of pool) {
        const k = rarityToKey(c.rarity);
        buckets[k] = buckets[k] || [];
        buckets[k].push({ ...c });
    }
    // helper: draw n cards from a bucket without replacement (fallback to random with replacement)
    function draw(bucketName, n) {
        const out = [];
        const bucket = (buckets[bucketName] || []).slice();
        for (let i = 0; i < n; i++) {
            if (bucket.length === 0) {
                // fallback to any card in pool
                const any = pool[Math.floor(Math.random() * pool.length)];
                out.push({ ...any });
            }
            else {
                const idx = Math.floor(Math.random() * bucket.length);
                out.push(bucket.splice(idx, 1)[0]);
            }
        }
        return out;
    }
    // helper: pick a single card by weighted rarity
    function pickByRarity(rarityKey) {
        let targetBucket;
        if (rarityKey) {
            targetBucket = rarityKey;
        }
        else {
            // weight-based selection using database weights
            let roll = Math.random();
            targetBucket = 'Common';
            // Try to match rarity buckets to weights
            const rarities = ['Secret', 'Ultra', 'Rare', 'Uncommon', 'Common'];
            for (const rarity of rarities) {
                const weight = rarityWeightMap.get(rarity) || 0;
                if (roll < weight) {
                    targetBucket = rarity;
                    break;
                }
                roll -= weight;
            }
        }
        const bucket = (buckets[targetBucket] || []).slice();
        if (bucket.length === 0) {
            const any = pool[Math.floor(Math.random() * pool.length)];
            return { ...any };
        }
        const idx = Math.floor(Math.random() * bucket.length);
        return { ...bucket[idx] };
    }
    function pickFromCandidates(candidates, fallback) {
        if (candidates.length > 0) {
            return { ...candidates[Math.floor(Math.random() * candidates.length)] };
        }
        return fallback ? fallback() : pickByRarity();
    }
    const isAscendedHeroesSet = setId.trim().toLowerCase() === 'me02.5';
    const isAscendedHeroesBigHit = (card) => {
        const text = (card.rarity || '').toLowerCase();
        return (text.includes('double rare') ||
            text.includes('ultra rare') ||
            text.includes('mega attack') ||
            text.includes('illustration') ||
            text.includes('special illustration') ||
            text.includes('mega hyper'));
    };
    const isTeamRocketPokemon = (card) => /team rocket/i.test(card.name || '');
    const ascendedAssignedPatterns = ['ReversePokeBall', 'ReverseLoveBall', 'ReverseFriendBall', 'ReverseQuickBall', 'ReverseDuskBall'];
    const ascendedPatternMap = new Map();
    if (isAscendedHeroesSet) {
        const eligible = pool
            .filter((card) => {
            const category = (card.category || '').toLowerCase();
            return category === 'pokemon' && !isAscendedHeroesBigHit(card) && !isTeamRocketPokemon(card);
        })
            .slice()
            .sort((a, b) => (a.id || '').localeCompare(b.id || ''));
        eligible.forEach((card, idx) => {
            ascendedPatternMap.set(card.id, ascendedAssignedPatterns[idx % ascendedAssignedPatterns.length]);
        });
    }
    const getAssignedAscendedHeroesPattern = (card) => {
        if (isTeamRocketPokemon(card))
            return 'ReverseRocketR';
        return ascendedPatternMap.get(card.id) || 'ReversePokeBall';
    };
    function applyMainlineReverseFinish(card) {
        if (isPocketSet || !card.isReverse)
            return;
        const balls = (0, rarityLadder_1.getBallTypes)(setId);
        if (!balls.pokeball)
            return;
        if (isAscendedHeroesSet) {
            const category = (card.category || '').toLowerCase();
            if (category === 'trainer' || category === 'energy' || isAscendedHeroesBigHit(card))
                return;
            if (category !== 'pokemon')
                return;
            // Best available evidence: non-ex Pokémon have two reverse styles in Ascended Heroes:
            // an Energy reverse holo, or an assigned pattern reverse holo.
            // Exact per-card pattern metadata is not in our source data, so the assigned pattern is
            // deterministically simulated from the card id to keep the same card visually consistent.
            if (Math.random() < 0.5) {
                card.special = 'ReverseEnergyType';
            }
            else {
                card.special = getAssignedAscendedHeroesPattern(card);
            }
            return;
        }
        const roll = Math.random();
        // Cumulative thresholds — rarest first
        // Master Ball ~3%  (SV era only)
        // Poké Ball  ~25% (all eligible sets)
        // Standard reverse: remainder
        let threshold = 0;
        if (balls.masterball) {
            threshold += 0.03;
            if (roll < threshold) {
                card.special = 'ReverseMasterBall';
                return;
            }
        }
        threshold += 0.25;
        if (roll < threshold) {
            card.special = 'ReversePokeBall';
        }
        // else standard reverse holo — card.special stays undefined
    }
    const rarityText = (card) => (card.rarity || '').toLowerCase();
    const isSpecialIllustration = (card) => rarityText(card).includes('special illustration');
    const isIllustration = (card) => rarityText(card).includes('illustration') && !isSpecialIllustration(card);
    const isHyper = (card) => rarityText(card).includes('hyper');
    const isSecret = (card) => rarityText(card).includes('secret');
    const isCrown = (card) => rarityText(card).includes('crown');
    const isGoldTier = (card) => isSecret(card) || isHyper(card) || isCrown(card);
    const isDoubleRare = (card) => rarityText(card).includes('double rare') || rarityText(card) === 'double rare';
    const isUltraRare = (card) => rarityText(card).includes('ultra') && !isGoldTier(card);
    const isPocketOneDiamond = (card) => rarityText(card).includes('one diamond');
    const isPocketTwoDiamond = (card) => rarityText(card).includes('two diamond');
    const isPocketThreeDiamond = (card) => rarityText(card).includes('three diamond');
    const isPocketFourDiamond = (card) => rarityText(card).includes('four diamond');
    const isPocketOneStar = (card) => rarityText(card).includes('one star');
    const isPocketTwoStar = (card) => rarityText(card).includes('two star');
    const isPocketThreeStar = (card) => rarityText(card).includes('three star');
    const isPocketOneShiny = (card) => rarityText(card).includes('one shiny');
    const isPocketTwoShiny = (card) => rarityText(card).includes('two shiny');
    const isPocketCrown = (card) => rarityText(card).includes('crown');
    const canBeReverse = (card) => {
        const reverseFlag = card.variants?.reverse;
        return reverseFlag !== false;
    };
    const isBaseRareFamily = (card) => {
        const text = rarityText(card);
        if (!text.includes('rare'))
            return false;
        if (isIllustration(card) || isSpecialIllustration(card) || isDoubleRare(card) || isUltraRare(card) || isHyper(card) || isSecret(card))
            return false;
        return true;
    };
    // decide whether we should use the modern slot-based template
    // support all SV sets (sv01-sv99) and mark newer 2025 eras as modern
    const useSlotTemplate = isPocketSet || /^sv\d+/.test(setId) || packDef.template === 'modern';
    if (!useSlotTemplate) {
        // Default generic pack behavior
        const rarityKeys = Object.keys(packDef.rarityDistribution || {});
        if (rarityKeys.length > 0) {
            const rarityWeights = rarityKeys.map((k) => packDef.rarityDistribution[k]);
            const total = rarityWeights.reduce((a, b) => a + b, 0);
            for (let i = 0; i < packDef.cardsPerPack; i++) {
                let roll = Math.random() * total;
                let chosen = rarityKeys[0];
                let acc = 0;
                for (let j = 0; j < rarityKeys.length; j++) {
                    acc += rarityWeights[j];
                    if (roll <= acc) {
                        chosen = rarityKeys[j];
                        break;
                    }
                }
                const bucket = buckets[chosen] || [];
                if (bucket.length === 0) {
                    result.push(pool[Math.floor(Math.random() * pool.length)]);
                }
                else {
                    result.push(bucket[Math.floor(Math.random() * bucket.length)]);
                }
            }
        }
        else {
            // Fallback: use database weights
            for (let i = 0; i < packDef.cardsPerPack; i++) {
                result.push(pickByRarity());
            }
        }
    }
    else {
        // modern slot-based pack template (SV era and newer)
        // Compact 6-card pack structure:
        // - 3 normal cards (1 common + 2 uncommons)
        // - 1 reverse holo (common/uncommon/rare)
        // - 1 holo-or-better rare slot (uses configured pull rates)
        // - 1 bonus slot (usually reverse, occasional hit)
        // 3 normal cards:
        // - Mainline: 1 common + 2 uncommons
        // - Pocket: 1 one-diamond + 2 two-diamond
        if (isPocketSet) {
            result.push(pickFromCandidates(pool.filter((c) => isPocketOneDiamond(c)), () => pickByRarity('Common')));
            for (let i = 0; i < 2; i++) {
                result.push(pickFromCandidates(pool.filter((c) => isPocketTwoDiamond(c)), () => pickByRarity('Uncommon')));
            }
        }
        else {
            result.push(pickByRarity('Common'));
            for (let i = 0; i < 2; i++)
                result.push(pickByRarity('Uncommon'));
        }
        // Card 9: Reverse holo slot (can be common, uncommon, or rare)
        const reverseWeights = isPocketSet
            ? { oneDiamond: 0.46, twoDiamond: 0.39, threeDiamond: 0.15 }
            : (packDef.slotWeights?.reverse || { Common: 0.6, Uncommon: 0.3, Rare: 0.1 });
        const revRarityKeys = Object.keys(reverseWeights);
        const revRarityVals = revRarityKeys.map((k) => reverseWeights[k]);
        const reverseTotal = revRarityVals.reduce((a, b) => a + b, 0);
        let roll = Math.random() * reverseTotal;
        let chosenRevRarity = revRarityKeys[0];
        let acc = 0;
        for (let i = 0; i < revRarityKeys.length; i++) {
            acc += revRarityVals[i];
            if (roll <= acc) {
                chosenRevRarity = revRarityKeys[i];
                break;
            }
        }
        let reverseCard;
        if (chosenRevRarity === 'Rare') {
            reverseCard = pickFromCandidates(pool.filter((c) => isBaseRareFamily(c) && canBeReverse(c)), () => pickByRarity('Rare'));
        }
        else if (chosenRevRarity === 'oneDiamond') {
            reverseCard = pickFromCandidates(pool.filter((c) => isPocketOneDiamond(c) && canBeReverse(c)), () => pickByRarity('Common'));
        }
        else if (chosenRevRarity === 'twoDiamond') {
            reverseCard = pickFromCandidates(pool.filter((c) => isPocketTwoDiamond(c) && canBeReverse(c)), () => pickByRarity('Uncommon'));
        }
        else if (chosenRevRarity === 'threeDiamond') {
            reverseCard = pickFromCandidates(pool.filter((c) => isPocketThreeDiamond(c) && canBeReverse(c)), () => pickByRarity('Rare'));
        }
        else {
            reverseCard = pickFromCandidates(pool.filter((c) => rarityToKey(c.rarity) === chosenRevRarity && canBeReverse(c)), () => pickByRarity(chosenRevRarity));
        }
        reverseCard.isReverse = true;
        reverseCard.isHolo = true;
        applyMainlineReverseFinish(reverseCard);
        result.push(reverseCard);
        // Card 10: Holo-or-better rare slot (weighted distribution)
        // Mainline custom 6-card model:
        // Holo 53%, Double 28%, Illustration 10%, Ultra 6%, Special Ill 2.5%, Gold 0.5%
        // Pocket custom model:
        // Three Diamond 42%, Four Diamond 31%, One Star 16%, Two Star/Two Shiny 7%, Three Star 3%, Crown 1%
        const rareSlotWeights = isPocketSet
            ? {
                threeDiamond: 0.42,
                fourDiamond: 0.31,
                oneStar: 0.16,
                twoStar: 0.07,
                threeStar: 0.03,
                crown: 0.01
            }
            : (packDef.slotWeights?.rareSlot || {
                holoRare: 0.53,
                doubleRare: 0.28,
                illustrationRare: 0.10,
                ultraRare: 0.06,
                specialIllustrationRare: 0.025,
                goldRare: 0.005
            });
        const rareKeys = Object.keys(rareSlotWeights);
        const rareVals = rareKeys.map((k) => rareSlotWeights[k]);
        const rareTotal = rareVals.reduce((a, b) => a + b, 0);
        roll = Math.random() * rareTotal;
        let chosenRareCategory = rareKeys[0];
        acc = 0;
        for (let i = 0; i < rareKeys.length; i++) {
            acc += rareVals[i];
            if (roll <= acc) {
                chosenRareCategory = rareKeys[i];
                break;
            }
        }
        let rareCard;
        if (chosenRareCategory === 'holoRare') {
            rareCard = pickFromCandidates(pool.filter((c) => isBaseRareFamily(c)), () => pickByRarity('Rare'));
            rareCard.isHolo = true;
            rareCard.isReverse = false;
        }
        else if (chosenRareCategory === 'threeDiamond') {
            rareCard = pickFromCandidates(pool.filter((c) => isPocketThreeDiamond(c)), () => pickByRarity('Rare'));
            rareCard.isHolo = true;
            rareCard.isReverse = false;
        }
        else if (chosenRareCategory === 'fourDiamond') {
            rareCard = pickFromCandidates(pool.filter((c) => isPocketFourDiamond(c)), () => pickByRarity('Ultra'));
            rareCard.isHolo = true;
            rareCard.special = 'DoubleRare';
        }
        else if (chosenRareCategory === 'oneStar') {
            rareCard = pickFromCandidates(pool.filter((c) => isPocketOneStar(c)), () => pickByRarity('Rare'));
            rareCard.isHolo = true;
            rareCard.special = 'Illustration';
        }
        else if (chosenRareCategory === 'twoStar') {
            rareCard = pickFromCandidates(pool.filter((c) => isPocketTwoStar(c) || isPocketOneShiny(c) || isPocketTwoShiny(c)), () => pickByRarity('Ultra'));
            rareCard.isHolo = true;
        }
        else if (chosenRareCategory === 'threeStar') {
            rareCard = pickFromCandidates(pool.filter((c) => isPocketThreeStar(c)), () => pickByRarity('Ultra'));
            rareCard.isHolo = true;
            rareCard.special = 'SpecialIllustration';
        }
        else if (chosenRareCategory === 'crown') {
            rareCard = pickFromCandidates(pool.filter((c) => isPocketCrown(c)), () => pickByRarity('Ultra'));
            rareCard.isHolo = true;
            rareCard.special = 'GoldRare';
        }
        else if (chosenRareCategory === 'doubleRare') {
            rareCard = pickFromCandidates(pool.filter((c) => isDoubleRare(c)), () => pickByRarity('Ultra'));
            rareCard.isHolo = true;
            rareCard.special = 'DoubleRare';
        }
        else if (chosenRareCategory === 'illustrationRare') {
            rareCard = pickFromCandidates(pool.filter((c) => isIllustration(c)), () => pickByRarity('Rare'));
            rareCard.isHolo = true;
            rareCard.special = 'Illustration';
        }
        else if (chosenRareCategory === 'ultraRare') {
            rareCard = pickFromCandidates(pool.filter((c) => isUltraRare(c)), () => pickByRarity('Ultra'));
            rareCard.isHolo = true;
        }
        else if (chosenRareCategory === 'specialIllustrationRare') {
            rareCard = pickFromCandidates(pool.filter((c) => isSpecialIllustration(c)), () => pickFromCandidates(pool.filter((c) => isIllustration(c)), () => pickByRarity('Ultra')));
            rareCard.isHolo = true;
            rareCard.special = 'SpecialIllustration';
        }
        else if (chosenRareCategory === 'hyperRare' || chosenRareCategory === 'goldRare') {
            const secretCandidates = pool.filter((c) => isGoldTier(c));
            if (secretCandidates.length > 0) {
                rareCard = { ...secretCandidates[Math.floor(Math.random() * secretCandidates.length)] };
            }
            else {
                rareCard = pickByRarity('Ultra');
            }
            rareCard.isHolo = true;
            rareCard.special = 'GoldRare';
        }
        else {
            rareCard = pickByRarity('Rare');
            rareCard.isHolo = true;
        }
        result.push(rareCard);
        // Card 11: Bonus slot
        // Mainline: mostly reverse with low chance for additional hit
        // Pocket: mostly lower diamonds with small chance of extra star/crown hit
        const bonusWeights = isPocketSet
            ? {
                reversePocket: 0.89,
                fourDiamond: 0.065,
                oneStar: 0.028,
                twoStar: 0.012,
                threeStar: 0.004,
                crown: 0.001
            }
            : (packDef.slotWeights?.bonusSlot || {
                reverseHolo: 0.915,
                doubleRare: 0.04,
                illustration: 0.028,
                ultra: 0.013,
                specialIllustration: 0.003,
                gold: 0.001
            });
        const bonusKeys = Object.keys(bonusWeights);
        const bonusVals = bonusKeys.map((k) => bonusWeights[k]);
        const bonusTotal = bonusVals.reduce((a, b) => a + b, 0);
        roll = Math.random() * bonusTotal;
        let chosenBonusCategory = bonusKeys[0];
        acc = 0;
        for (let i = 0; i < bonusKeys.length; i++) {
            acc += bonusVals[i];
            if (roll <= acc) {
                chosenBonusCategory = bonusKeys[i];
                break;
            }
        }
        let bonusCard;
        if (chosenBonusCategory === 'reverseHolo') {
            // Another reverse holo, could be any rarity
            const bonusRevWeights = packDef.slotWeights?.bonusReverse || { Common: 0.4, Uncommon: 0.4, Rare: 0.2 };
            const bonusRevKeys = Object.keys(bonusRevWeights);
            const bonusRevVals = bonusRevKeys.map((k) => bonusRevWeights[k]);
            const bonusRevTotal = bonusRevVals.reduce((a, b) => a + b, 0);
            roll = Math.random() * bonusRevTotal;
            let chosenBonusRevRarity = bonusRevKeys[0];
            acc = 0;
            for (let i = 0; i < bonusRevKeys.length; i++) {
                acc += bonusRevVals[i];
                if (roll <= acc) {
                    chosenBonusRevRarity = bonusRevKeys[i];
                    break;
                }
            }
            if (chosenBonusRevRarity === 'Rare') {
                bonusCard = pickFromCandidates(pool.filter((c) => isBaseRareFamily(c) && canBeReverse(c)), () => pickByRarity('Rare'));
            }
            else {
                bonusCard = pickFromCandidates(pool.filter((c) => rarityToKey(c.rarity) === chosenBonusRevRarity && canBeReverse(c)), () => pickByRarity(chosenBonusRevRarity));
            }
            bonusCard.isReverse = true;
            bonusCard.isHolo = true;
            applyMainlineReverseFinish(bonusCard);
        }
        else if (chosenBonusCategory === 'reversePocket') {
            const pocketReverseWeights = { oneDiamond: 0.46, twoDiamond: 0.39, threeDiamond: 0.15 };
            const pocketKeys = Object.keys(pocketReverseWeights);
            const pocketVals = pocketKeys.map((k) => pocketReverseWeights[k]);
            const pocketTotal = pocketVals.reduce((a, b) => a + b, 0);
            roll = Math.random() * pocketTotal;
            let chosenPocketBonus = pocketKeys[0];
            acc = 0;
            for (let i = 0; i < pocketKeys.length; i++) {
                acc += pocketVals[i];
                if (roll <= acc) {
                    chosenPocketBonus = pocketKeys[i];
                    break;
                }
            }
            if (chosenPocketBonus === 'oneDiamond') {
                bonusCard = pickFromCandidates(pool.filter((c) => isPocketOneDiamond(c) && canBeReverse(c)), () => pickByRarity('Common'));
            }
            else if (chosenPocketBonus === 'twoDiamond') {
                bonusCard = pickFromCandidates(pool.filter((c) => isPocketTwoDiamond(c) && canBeReverse(c)), () => pickByRarity('Uncommon'));
            }
            else {
                bonusCard = pickFromCandidates(pool.filter((c) => isPocketThreeDiamond(c) && canBeReverse(c)), () => pickByRarity('Rare'));
            }
            bonusCard.isReverse = true;
            bonusCard.isHolo = true;
        }
        else if (chosenBonusCategory === 'fourDiamond') {
            bonusCard = pickFromCandidates(pool.filter((c) => isPocketFourDiamond(c)), () => pickByRarity('Ultra'));
            bonusCard.isHolo = true;
            bonusCard.special = 'DoubleRare';
        }
        else if (chosenBonusCategory === 'oneStar') {
            bonusCard = pickFromCandidates(pool.filter((c) => isPocketOneStar(c)), () => pickByRarity('Rare'));
            bonusCard.isHolo = true;
            bonusCard.special = 'Illustration';
        }
        else if (chosenBonusCategory === 'twoStar') {
            bonusCard = pickFromCandidates(pool.filter((c) => isPocketTwoStar(c) || isPocketOneShiny(c) || isPocketTwoShiny(c)), () => pickByRarity('Ultra'));
            bonusCard.isHolo = true;
        }
        else if (chosenBonusCategory === 'threeStar') {
            bonusCard = pickFromCandidates(pool.filter((c) => isPocketThreeStar(c)), () => pickByRarity('Ultra'));
            bonusCard.isHolo = true;
            bonusCard.special = 'SpecialIllustration';
        }
        else if (chosenBonusCategory === 'crown') {
            bonusCard = pickFromCandidates(pool.filter((c) => isPocketCrown(c)), () => pickByRarity('Ultra'));
            bonusCard.isHolo = true;
            bonusCard.special = 'GoldRare';
        }
        else if (chosenBonusCategory === 'illustration') {
            bonusCard = pickFromCandidates(pool.filter((c) => isIllustration(c)), () => pickByRarity('Rare'));
            bonusCard.isHolo = true;
            bonusCard.special = 'Illustration';
        }
        else if (chosenBonusCategory === 'doubleRare') {
            bonusCard = pickFromCandidates(pool.filter((c) => isDoubleRare(c)), () => pickByRarity('Ultra'));
            bonusCard.isHolo = true;
            bonusCard.special = 'DoubleRare';
        }
        else if (chosenBonusCategory === 'ultra') {
            bonusCard = pickFromCandidates(pool.filter((c) => isUltraRare(c)), () => pickByRarity('Ultra'));
            bonusCard.isHolo = true;
        }
        else if (chosenBonusCategory === 'specialIllustration') {
            bonusCard = pickFromCandidates(pool.filter((c) => isSpecialIllustration(c)), () => pickFromCandidates(pool.filter((c) => isIllustration(c)), () => pickByRarity('Ultra')));
            bonusCard.isHolo = true;
            bonusCard.special = 'SpecialIllustration';
        }
        else if (chosenBonusCategory === 'secret' || chosenBonusCategory === 'gold') {
            const secretCandidates = pool.filter((c) => isGoldTier(c));
            if (secretCandidates.length > 0) {
                bonusCard = { ...secretCandidates[Math.floor(Math.random() * secretCandidates.length)] };
            }
            else {
                bonusCard = pickByRarity('Ultra');
            }
            bonusCard.isHolo = true;
            bonusCard.special = 'GoldRare';
        }
        else {
            bonusCard = pickByRarity('Rare');
            bonusCard.isHolo = true;
        }
        // Check for god packs (special ultra-rare cards in certain sets)
        const godPackSets = ['sv8pt5', 'sv9', 'sv95', 'sv9pt5', 'sv10', 'sv105', 'sv11', 'sv11pt5', 'sv12'];
        const hasGodPackChance = godPackSets.some(setPattern => setId.includes(setPattern));
        if (hasGodPackChance) {
            const r = Math.random();
            const godPackRate = setId.includes('sv8pt5') || setId.includes('sv95') ? 0.0008 : 0.0003;
            if (r < godPackRate) {
                bonusCard.special = 'GodPack';
            }
        }
        result.push(bonusCard);
    }
    // enforce guarantee: ensure at least `minRareOrAbove` rare or above
    const minRare = packDef.guarantee?.minRareOrAbove || 0;
    const rareOrAbove = result.filter((c) => ['Rare', 'Ultra'].includes(rarityToKey(c.rarity))).length;
    if (rareOrAbove < minRare) {
        const rarePool = (buckets['Rare'] || []).concat(buckets['Ultra'] || []);
        if (rarePool.length > 0) {
            const idx = result.findIndex((c) => !['Rare', 'Ultra'].includes(rarityToKey(c.rarity)));
            if (idx !== -1)
                result[idx] = rarePool[Math.floor(Math.random() * rarePool.length)];
        }
    }
    return result;
}
exports.simulatePack = simulatePack;
