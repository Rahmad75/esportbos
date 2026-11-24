let cachedConfigPromise = null;
let cachedConfig = null;

export async function loadEconomyConfig() {
  if (cachedConfig) return cachedConfig;
  if (!cachedConfigPromise) {
    cachedConfigPromise = (async () => {
      if (typeof process !== 'undefined' && process.versions && process.versions.node && typeof window === 'undefined') {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const { fileURLToPath } = await import('node:url');
        const dir = path.dirname(fileURLToPath(import.meta.url));
        const raw = fs.readFileSync(path.join(dir, 'economy.config.json'), 'utf8');
        cachedConfig = JSON.parse(raw);
        return cachedConfig;
      }

      const res = await fetch('/economy.config.json', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Gagal memuat economy.config.json (HTTP ${res.status})`);
      }
      cachedConfig = await res.json();
      return cachedConfig;
    })();
  }
  return cachedConfigPromise;
}

export function getLoadedEconomyConfig() {
  return cachedConfig;
}

export function setEconomyConfigForTest(cfg) {
  cachedConfig = cfg;
  cachedConfigPromise = Promise.resolve(cfg);
}

export function getMatchReward(cfg, result) {
  const mr = cfg?.matchReward || {};
  const base = Number(mr.perMatchCurrency);
  const eventBonus = Number(mr.eventBonusCurrency);
  let outcomeBonus = 0;
  if (result === 'win') outcomeBonus = Number(mr.winBonusCurrency);
  else if (result === 'draw') outcomeBonus = Number(mr.drawBonusCurrency);
  else if (result === 'lose') outcomeBonus = Number(mr.lossBonusCurrency);
  return base + outcomeBonus + eventBonus;
}

export function getWeeklySinkBreakdown(cfg) {
  const ws = cfg?.weeklySink || {};
  const playerSalaries = Number(ws.playerSalariesCurrency);
  const staffSalaries = Number(ws.staffSalariesCurrency);
  const stadiumMaintenance = Number(ws.stadiumMaintenanceCurrency);
  const youthAcademy = Number(ws.youthAcademyCurrency);
  const total = playerSalaries + staffSalaries + stadiumMaintenance + youthAcademy;
  return {
    playerSalaries,
    staffSalaries,
    stadiumMaintenance,
    youthAcademy,
    total
  };
}

export function convertCurrencyToGold(cfg, currencyAmount) {
  const amount = Number(currencyAmount);
  if (!Number.isFinite(amount) || amount <= 0) return { grossGold: 0, feeGold: 0, netGold: 0, feePercent: Number(cfg?.fees?.currencyToGoldFeePercent) };
  const rate = Number(cfg.rates.goldToCurrency);
  const feePercent = Number(cfg.fees.currencyToGoldFeePercent);
  const grossGold = amount / rate;
  const feeGold = grossGold * (feePercent / 100);
  const netGold = grossGold - feeGold;
  return { grossGold, feeGold, netGold, feePercent };
}

export function convertGoldToDiamond(cfg, goldAmount) {
  const amount = Number(goldAmount);
  if (!Number.isFinite(amount) || amount <= 0) return { grossDiamond: 0, feeDiamond: 0, netDiamond: 0, feePercent: Number(cfg?.fees?.goldToDiamondFeePercent) };
  const rate = Number(cfg.rates.diamondToGold);
  const feePercent = Number(cfg.fees.goldToDiamondFeePercent);
  const grossDiamond = amount / rate;
  const feeDiamond = grossDiamond * (feePercent / 100);
  const netDiamond = grossDiamond - feeDiamond;
  return { grossDiamond, feeDiamond, netDiamond, feePercent };
}

export function getWithdrawSummary(cfg, diamondAmount) {
  const wd = cfg.withdraw;
  const rates = cfg.rates;
  const grossDiamond = Number(diamondAmount ?? wd.minDiamond);
  const feePercent = Number(wd.feePercent);
  const feeDiamond = grossDiamond * (feePercent / 100);
  const netDiamond = grossDiamond - feeDiamond;
  const netUsdt = netDiamond * Number(rates.diamondToUsdt);
  return {
    minDiamond: Number(wd.minDiamond),
    feePercent,
    grossDiamond,
    feeDiamond,
    netDiamond,
    netUsdt,
    cooldownDays: Number(wd.cooldownDays),
    minAccountAgeDays: Number(wd.minAccountAgeDays),
    maxActiveRequests: Number(wd.maxActiveRequestsPerAccount),
    requireKyc: Boolean(wd.requireKycBeforeFirstWithdraw),
    processingMode: wd.processingMode
  };
}
