export const MARKET_STORAGE_KEY = 'market_turn';
export const GAME_TURN_KEY = 'game_turn';
export const INITIAL_DIAMOND_TO_GOLD = 1.0;
export const INITIAL_GOLD_TO_CURRENCY = 0.09566;
export const DIAMOND_VOLATILITY = 0.05;
export const GOLD_VOLATILITY = 0.004;
export const MIN_MARKET_PRICE = 0.01;
export const MAX_MARKET_HISTORY = 50;

function getSafeStorage(customStorage) {
  if (customStorage) return customStorage;
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function calculateNextPrice(oldPrice, volatility, randomFn = Math.random) {
  const base = Number.isFinite(Number(oldPrice)) ? Number(oldPrice) : MIN_MARKET_PRICE;
  const raw = base + (randomFn() - 0.48) * volatility;
  return Math.max(MIN_MARKET_PRICE, Number(raw.toFixed(6)));
}

export function computePercentChange(prevPrice, nextPrice) {
  if (!Number.isFinite(prevPrice) || prevPrice <= 0) return 0;
  return Number((((nextPrice - prevPrice) / prevPrice) * 100).toFixed(2));
}

export function createInitialMarketState() {
  return {
    turn: 1,
    diamondToGold: INITIAL_DIAMOND_TO_GOLD,
    goldToCurrency: INITIAL_GOLD_TO_CURRENCY,
    syncedMatchesCount: null,
    history: [
      {
        turn: 1,
        diamondToGold: INITIAL_DIAMOND_TO_GOLD,
        goldToCurrency: INITIAL_GOLD_TO_CURRENCY,
        prevDiamondToGold: INITIAL_DIAMOND_TO_GOLD,
        prevGoldToCurrency: INITIAL_GOLD_TO_CURRENCY,
        diamondChangePct: 0,
        goldChangePct: 0,
        cause: 'Market Dibuka',
        timestamp: new Date().toISOString()
      }
    ]
  };
}

function normalizeMarketState(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;

  const history = Array.isArray(parsed.history)
    ? parsed.history
        .filter(item => item && Number.isFinite(Number(item.diamondToGold)) && Number.isFinite(Number(item.goldToCurrency)))
        .slice(-MAX_MARKET_HISTORY)
    : [];

  const turn = Number.isFinite(Number(parsed.turn)) && Number(parsed.turn) >= 1
    ? Math.floor(Number(parsed.turn))
    : (history.length > 0 ? Number(history[history.length - 1].turn) || 1 : 1);

  const lastHist = history.length > 0 ? history[history.length - 1] : null;
  const diamondToGold = Math.max(
    MIN_MARKET_PRICE,
    Number.isFinite(Number(parsed.diamondToGold))
      ? Number(parsed.diamondToGold)
      : (lastHist ? Number(lastHist.diamondToGold) : INITIAL_DIAMOND_TO_GOLD)
  );
  const goldToCurrency = Math.max(
    MIN_MARKET_PRICE,
    Number.isFinite(Number(parsed.goldToCurrency))
      ? Number(parsed.goldToCurrency)
      : (lastHist ? Number(lastHist.goldToCurrency) : INITIAL_GOLD_TO_CURRENCY)
  );

  if (history.length === 0) {
    history.push({
      turn,
      diamondToGold,
      goldToCurrency,
      prevDiamondToGold: diamondToGold,
      prevGoldToCurrency: goldToCurrency,
      diamondChangePct: 0,
      goldChangePct: 0,
      cause: 'Market Dibuka',
      timestamp: new Date().toISOString()
    });
  }

  return {
    turn,
    diamondToGold,
    goldToCurrency,
    syncedMatchesCount: Number.isFinite(Number(parsed.syncedMatchesCount)) && parsed.syncedMatchesCount !== null
      ? Math.max(0, Math.floor(Number(parsed.syncedMatchesCount)))
      : null,
    history
  };
}

export function saveMarketState(state, customStorage) {
  const storage = getSafeStorage(customStorage);
  if (!storage) return state;

  const trimmed = {
    ...state,
    history: (state.history || []).slice(-MAX_MARKET_HISTORY)
  };
  storage.setItem(MARKET_STORAGE_KEY, JSON.stringify(trimmed));
  storage.setItem(GAME_TURN_KEY, String(trimmed.turn));
  return trimmed;
}

function stepStateOneTurn(state, cause = 'Next Turn', randomFn = Math.random) {
  const prevDiamond = state.diamondToGold;
  const prevGold = state.goldToCurrency;

  const nextDiamond = calculateNextPrice(prevDiamond, DIAMOND_VOLATILITY, randomFn);
  const nextGold = calculateNextPrice(prevGold, GOLD_VOLATILITY, randomFn);
  const nextTurn = state.turn + 1;

  const entry = {
    turn: nextTurn,
    diamondToGold: nextDiamond,
    goldToCurrency: nextGold,
    prevDiamondToGold: prevDiamond,
    prevGoldToCurrency: prevGold,
    diamondChangePct: computePercentChange(prevDiamond, nextDiamond),
    goldChangePct: computePercentChange(prevGold, nextGold),
    cause,
    timestamp: new Date().toISOString()
  };

  const nextHistory = [...(state.history || []), entry].slice(-MAX_MARKET_HISTORY);
  return {
    ...state,
    turn: nextTurn,
    diamondToGold: nextDiamond,
    goldToCurrency: nextGold,
    history: nextHistory
  };
}

export function loadMarketState({ customStorage, syncGameTurn = true, randomFn = Math.random } = {}) {
  const storage = getSafeStorage(customStorage);
  let state = null;

  if (storage) {
    try {
      const raw = storage.getItem(MARKET_STORAGE_KEY);
      if (raw) {
        state = normalizeMarketState(JSON.parse(raw));
      }
    } catch {
      state = null;
    }
  }

  let didChange = false;
  if (!state) {
    state = createInitialMarketState();
    didChange = true;
  }

  let advancedByGameTurn = 0;
  if (syncGameTurn && storage) {
    const externalTurn = Number(storage.getItem(GAME_TURN_KEY));
    if (Number.isFinite(externalTurn) && externalTurn > state.turn) {
      const steps = Math.min(MAX_MARKET_HISTORY, Math.floor(externalTurn - state.turn));
      for (let i = 0; i < steps; i++) {
        state = stepStateOneTurn(state, 'Turn Game Bertambah', randomFn);
      }
      state.turn = Math.floor(externalTurn);
      if (state.history.length > 0) {
        state.history[state.history.length - 1].turn = state.turn;
      }
      advancedByGameTurn = steps;
      didChange = true;
    }
  }

  if (didChange) {
    state = saveMarketState(state, storage);
  }

  return {
    state,
    advancedByGameTurn,
    latestEntry: state.history[state.history.length - 1] || null
  };
}

export function advanceMarketTurn(cause = 'Next Turn', { customStorage, matchDelta = 0, randomFn = Math.random } = {}) {
  const storage = getSafeStorage(customStorage);
  const { state: currentState } = loadMarketState({ customStorage: storage, syncGameTurn: true, randomFn });
  let nextState = stepStateOneTurn(currentState, cause, randomFn);

  if (matchDelta > 0 && Number.isFinite(nextState.syncedMatchesCount)) {
    nextState.syncedMatchesCount += matchDelta;
  }

  nextState = saveMarketState(nextState, storage);
  const latestEntry = nextState.history[nextState.history.length - 1];

  return {
    state: nextState,
    latestEntry
  };
}

export function syncMarketWithMatches(totalMatches, { customStorage, randomFn = Math.random } = {}) {
  const storage = getSafeStorage(customStorage);
  const { state: loadedState, advancedByGameTurn } = loadMarketState({ customStorage: storage, syncGameTurn: true, randomFn });

  const safeTotal = Number.isFinite(Number(totalMatches)) ? Math.max(0, Math.floor(Number(totalMatches))) : 0;
  let state = loadedState;
  let advancedByMatches = 0;

  if (state.syncedMatchesCount === null || state.syncedMatchesCount === undefined) {
    state = { ...state, syncedMatchesCount: safeTotal };
    state = saveMarketState(state, storage);
  } else if (safeTotal > state.syncedMatchesCount) {
    const steps = Math.min(MAX_MARKET_HISTORY, safeTotal - state.syncedMatchesCount);
    for (let i = 0; i < steps; i++) {
      state = stepStateOneTurn(state, 'Selesai Match', randomFn);
    }
    state.syncedMatchesCount = safeTotal;
    state = saveMarketState(state, storage);
    advancedByMatches = steps;
  }

  return {
    state,
    advancedCount: advancedByGameTurn + advancedByMatches,
    latestEntry: state.history[state.history.length - 1] || null
  };
}

export function formatTurnNotification(entry) {
  if (!entry) return '';
  const pct = Number(entry.diamondChangePct || 0);
  const direction = pct >= 0 ? 'naik' : 'turun';
  const absPct = Math.abs(pct).toFixed(1);
  return `Market Turn #${entry.turn} - Diamond ${direction} ${absPct}%`;
}
