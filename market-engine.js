import { getLoadedEconomyConfig } from './economy-config.js';

export const MARKET_STORAGE_KEY = 'market_turn';
export const GAME_TURN_KEY = 'game_turn';
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

function resolveEconomyConfig(economyConfig) {
  const cfg = economyConfig || getLoadedEconomyConfig();
  if (!cfg || !cfg.rates) {
    throw new Error('Economy config belum dimuat dari economy.config.json');
  }
  return cfg;
}

export function getConfigMarketRates(economyConfig) {
  const cfg = resolveEconomyConfig(economyConfig);
  const diamondToGold = Number(cfg.rates.diamondToGold);
  const goldToCurrency = Number(cfg.rates.goldToCurrency);
  const diamondToCurrency = Number(cfg.rates.diamondToCurrency);
  const diamondToUsdt = Number(cfg.rates.diamondToUsdt);
  const currencyToGold = goldToCurrency > 0 ? 1 / goldToCurrency : 0;
  return {
    version: cfg.version,
    diamondToGold,
    goldToCurrency,
    diamondToCurrency,
    diamondToUsdt,
    currencyToGold
  };
}

export function computePercentChange(prevPrice, nextPrice) {
  if (!Number.isFinite(prevPrice) || prevPrice <= 0) return 0;
  return Number((((nextPrice - prevPrice) / prevPrice) * 100).toFixed(2));
}

export function createInitialMarketState(economyConfig) {
  const rates = getConfigMarketRates(economyConfig);
  return {
    version: rates.version,
    turn: 1,
    diamondToGold: rates.diamondToGold,
    goldToCurrency: rates.goldToCurrency,
    diamondToCurrency: rates.diamondToCurrency,
    syncedMatchesCount: null,
    history: [
      {
        turn: 1,
        diamondToGold: rates.diamondToGold,
        goldToCurrency: rates.goldToCurrency,
        prevDiamondToGold: rates.diamondToGold,
        prevGoldToCurrency: rates.goldToCurrency,
        diamondChangePct: 0,
        goldChangePct: 0,
        cause: 'Economy v2 Aktif (Kurs Tetap Config)',
        timestamp: new Date().toISOString()
      }
    ]
  };
}

function normalizeMarketState(parsed, economyConfig) {
  if (!parsed || typeof parsed !== 'object') return null;
  const rates = getConfigMarketRates(economyConfig);

  // Jika data localStorage berasal dari versi ekonomi lama (sebelum Economy v2 / rate lama), sinkronkan ulang ke economy.config.json
  if (parsed.version !== rates.version) {
    return null;
  }

  const turn = Number.isFinite(Number(parsed.turn)) && Number(parsed.turn) >= 1
    ? Math.floor(Number(parsed.turn))
    : 1;

  const history = Array.isArray(parsed.history)
    ? parsed.history
        .filter(item => item && Number.isFinite(Number(item.turn)))
        .slice(-MAX_MARKET_HISTORY)
        .map(item => ({
          ...item,
          diamondToGold: rates.diamondToGold,
          goldToCurrency: rates.goldToCurrency,
          prevDiamondToGold: rates.diamondToGold,
          prevGoldToCurrency: rates.goldToCurrency,
          diamondChangePct: 0,
          goldChangePct: 0
        }))
    : [];

  if (history.length === 0) {
    history.push({
      turn,
      diamondToGold: rates.diamondToGold,
      goldToCurrency: rates.goldToCurrency,
      prevDiamondToGold: rates.diamondToGold,
      prevGoldToCurrency: rates.goldToCurrency,
      diamondChangePct: 0,
      goldChangePct: 0,
      cause: 'Economy v2 Aktif (Kurs Tetap Config)',
      timestamp: new Date().toISOString()
    });
  }

  return {
    version: rates.version,
    turn,
    diamondToGold: rates.diamondToGold,
    goldToCurrency: rates.goldToCurrency,
    diamondToCurrency: rates.diamondToCurrency,
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

function stepStateOneTurn(state, cause = 'Next Turn', economyConfig = null) {
  const rates = getConfigMarketRates(economyConfig);
  const nextTurn = state.turn + 1;

  const entry = {
    turn: nextTurn,
    diamondToGold: rates.diamondToGold,
    goldToCurrency: rates.goldToCurrency,
    prevDiamondToGold: rates.diamondToGold,
    prevGoldToCurrency: rates.goldToCurrency,
    diamondChangePct: 0,
    goldChangePct: 0,
    cause,
    timestamp: new Date().toISOString()
  };

  const nextHistory = [...(state.history || []), entry].slice(-MAX_MARKET_HISTORY);
  return {
    ...state,
    version: rates.version,
    turn: nextTurn,
    diamondToGold: rates.diamondToGold,
    goldToCurrency: rates.goldToCurrency,
    diamondToCurrency: rates.diamondToCurrency,
    history: nextHistory
  };
}

export function loadMarketState({ customStorage, syncGameTurn = true, economyConfig = null } = {}) {
  const storage = getSafeStorage(customStorage);
  let state = null;

  if (storage) {
    try {
      const raw = storage.getItem(MARKET_STORAGE_KEY);
      if (raw) {
        state = normalizeMarketState(JSON.parse(raw), economyConfig);
      }
    } catch {
      state = null;
    }
  }

  let didChange = false;
  if (!state) {
    state = createInitialMarketState(economyConfig);
    didChange = true;
  }

  let advancedByGameTurn = 0;
  if (syncGameTurn && storage) {
    const externalTurn = Number(storage.getItem(GAME_TURN_KEY));
    if (Number.isFinite(externalTurn) && externalTurn > state.turn) {
      const steps = Math.min(MAX_MARKET_HISTORY, Math.floor(externalTurn - state.turn));
      for (let i = 0; i < steps; i++) {
        state = stepStateOneTurn(state, 'Turn Game Bertambah', economyConfig);
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

export function advanceMarketTurn(cause = 'Next Turn', { customStorage, matchDelta = 0, economyConfig = null } = {}) {
  const storage = getSafeStorage(customStorage);
  const { state: currentState } = loadMarketState({ customStorage: storage, syncGameTurn: true, economyConfig });
  let nextState = stepStateOneTurn(currentState, cause, economyConfig);

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

export function syncMarketWithMatches(totalMatches, { customStorage, economyConfig = null } = {}) {
  const storage = getSafeStorage(customStorage);
  const { state: loadedState, advancedByGameTurn } = loadMarketState({ customStorage: storage, syncGameTurn: true, economyConfig });

  const safeTotal = Number.isFinite(Number(totalMatches)) ? Math.max(0, Math.floor(Number(totalMatches))) : 0;
  let state = loadedState;
  let advancedByMatches = 0;

  if (state.syncedMatchesCount === null || state.syncedMatchesCount === undefined) {
    state = { ...state, syncedMatchesCount: safeTotal };
    state = saveMarketState(state, storage);
  } else if (safeTotal > state.syncedMatchesCount) {
    const steps = Math.min(MAX_MARKET_HISTORY, safeTotal - state.syncedMatchesCount);
    for (let i = 0; i < steps; i++) {
      state = stepStateOneTurn(state, 'Selesai Match', economyConfig);
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
  return `Market Turn #${entry.turn} - Kurs tetap sesuai economy.config.json (1 Diamond = ${Number(entry.diamondToGold).toLocaleString('id-ID')} Gold)`;
}
