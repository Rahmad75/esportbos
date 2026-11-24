const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ADMIN_EMAILS = [
  'muhammadgazali75@gmail.com',
  'angriyani1977@gmail.com',
  'm.gazali1975@gmail.com'
];

const DEFAULT_MATCH_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const WEEKLY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function round4(val) {
  return Math.round((Number(val) + Number.EPSILON) * 10000) / 10000;
}

function round2(val) {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

function createHttpError(status, message, code = 'ECONOMY_ERROR', details = null) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  if (details) err.details = details;
  return err;
}

function createEconomyService(options = {}) {
  const rootDir = options.rootDir || __dirname;
  const dataDir = options.dataDir || path.join(rootDir, 'data');
  const configPath = options.configPath || path.join(rootDir, 'economy.config.json');
  const firebaseConfigPath = options.firebaseConfigPath || path.join(rootDir, 'firebase-applet-config.json');
  const walletsFile = path.join(dataDir, 'economy-wallets.json');
  const ledgerFile = path.join(dataDir, 'economy-ledger.jsonl');
  const withdrawQueueFile = path.join(dataDir, 'economy-withdraw-queue.json');
  const nowFn = typeof options.nowFn === 'function' ? options.nowFn : () => Date.now();
  const matchCooldownMs = Number.isFinite(options.matchCooldownMs) ? options.matchCooldownMs : DEFAULT_MATCH_COOLDOWN_MS;
  const weeklyCooldownMs = Number.isFinite(options.weeklyCooldownMs) ? options.weeklyCooldownMs : WEEKLY_COOLDOWN_MS;

  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(walletsFile)) {
    fs.writeFileSync(walletsFile, JSON.stringify({}, null, 2), 'utf8');
  }
  if (!fs.existsSync(ledgerFile)) {
    fs.writeFileSync(ledgerFile, '', 'utf8');
  }
  if (!fs.existsSync(withdrawQueueFile)) {
    fs.writeFileSync(withdrawQueueFile, JSON.stringify([], null, 2), 'utf8');
  }

  let nextSeq = computeInitialSeq(ledgerFile);
  const userLocks = new Map();

  function computeInitialSeq(file) {
    try {
      const content = fs.readFileSync(file, 'utf8').trim();
      if (!content) return 1;
      const lines = content.split('\n').filter(Boolean);
      const last = JSON.parse(lines[lines.length - 1]);
      return Number(last?.seq || lines.length) + 1;
    } catch (_) {
      return 1;
    }
  }

  function loadConfig() {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  }

  function loadFirebaseApiKey() {
    try {
      const raw = fs.readFileSync(firebaseConfigPath, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed.apiKey || '';
    } catch (_) {
      return '';
    }
  }

  async function verifyFirebaseIdToken(idToken) {
    if (typeof options.verifyTokenFn === 'function') {
      return options.verifyTokenFn(idToken);
    }
    if (typeof idToken !== 'string' || !idToken.trim()) {
      throw createHttpError(401, 'Token autentikasi Firebase tidak ditemukan.', 'AUTH_MISSING');
    }
    const apiKey = loadFirebaseApiKey();
    if (!apiKey) {
      throw createHttpError(500, 'Konfigurasi Firebase server tidak lengkap.', 'AUTH_CONFIG_ERROR');
    }

    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: idToken.trim() })
    });

    if (!res.ok) {
      throw createHttpError(401, 'Token login tidak valid atau kedaluwarsa.', 'AUTH_INVALID');
    }
    const payload = await res.json();
    const fbUser = Array.isArray(payload.users) ? payload.users[0] : null;
    if (!fbUser || !fbUser.localId) {
      throw createHttpError(401, 'Akun pengguna tidak terverifikasi.', 'AUTH_USER_NOT_FOUND');
    }

    return {
      uid: fbUser.localId,
      email: fbUser.email || '',
      emailVerified: Boolean(fbUser.emailVerified),
      createdAtMs: fbUser.createdAt ? Number(fbUser.createdAt) : null
    };
  }

  function readAllWallets() {
    try {
      const raw = fs.readFileSync(walletsFile, 'utf8');
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function writeAllWallets(wallets) {
    const tmpFile = `${walletsFile}.tmp.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tmpFile, JSON.stringify(wallets, null, 2), 'utf8');
    fs.renameSync(tmpFile, walletsFile);
  }

  function readWithdrawQueue() {
    try {
      const raw = fs.readFileSync(withdrawQueueFile, 'utf8');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function writeWithdrawQueue(queue) {
    const tmpFile = `${withdrawQueueFile}.tmp.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tmpFile, JSON.stringify(queue, null, 2), 'utf8');
    fs.renameSync(tmpFile, withdrawQueueFile);
  }

  function readAllLedgerEntries() {
    try {
      const content = fs.readFileSync(ledgerFile, 'utf8');
      if (!content.trim()) return [];
      return content
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (_) {
      return [];
    }
  }

  // APPEND-ONLY: Tidak ada fungsi edit atau delete pada ledger!
  function appendImmutableLedgerEntry(entry) {
    const seq = nextSeq++;
    const record = {
      id: `LDG-${String(seq).padStart(6, '0')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      seq,
      waktu: new Date(nowFn()).toISOString(),
      user_id: String(entry.user_id),
      akun: String(entry.akun || entry.user_id),
      jenis_transaksi: entry.jenis_transaksi, // 'masuk' | 'keluar'
      kategori: String(entry.kategori),
      mata_uang: entry.mata_uang, // 'currency' | 'gold' | 'diamond'
      jumlah: round4(entry.jumlah),
      fee: round4(entry.fee || 0),
      saldo_sebelum: round4(entry.saldo_sebelum),
      saldo_sesudah: round4(entry.saldo_sesudah),
      ref_id: entry.ref_id ? String(entry.ref_id) : null,
      keterangan: String(entry.keterangan || '')
    };
    fs.appendFileSync(ledgerFile, JSON.stringify(record) + '\n', 'utf8');
    return record;
  }

  function withUserLock(uid, fn) {
    const prev = userLocks.get(uid) || Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => {}).then(() => {
      if (userLocks.get(uid) === tail) {
        userLocks.delete(uid);
      }
    });
    userLocks.set(uid, tail);
    return next;
  }

  function getOrCreateWalletUnlocked(wallets, authUser, cfg) {
    const uid = authUser.uid;
    const authCreatedIso = Number.isFinite(authUser.createdAtMs)
      ? new Date(authUser.createdAtMs).toISOString()
      : null;

    if (wallets[uid]) {
      const existing = wallets[uid];
      if (authUser.email && !existing.akun) {
        existing.akun = authUser.email;
      }
      if (!existing.accountCreatedAt) {
        existing.accountCreatedAt = authCreatedIso || existing.created_at || new Date(nowFn()).toISOString();
      }
      if (typeof existing.kycVerified !== 'boolean') {
        existing.kycVerified = false;
      }
      if (!existing.kycStatus) {
        existing.kycStatus = existing.kycVerified ? 'verified' : 'unverified';
      }
      return existing;
    }

    const starter = cfg.starterBalance;
    const isoNow = new Date(nowFn()).toISOString();
    const wallet = {
      user_id: uid,
      akun: authUser.email || uid,
      diamond: Number(starter.diamonds),
      gold: Number(starter.gold),
      currency: Number(starter.currency),
      matchesToday: 0,
      lastDailyReset: null,
      lastMatchAt: null,
      lastWeeklyClaimAt: null,
      activeWithdrawId: null,
      lastWithdrawAt: null,
      kycVerified: false,
      kycStatus: 'unverified',
      kycSubmittedAt: null,
      kycVerifiedAt: null,
      kycIdentityHash: null,
      accountCreatedAt: authCreatedIso || isoNow,
      totalMatches: 0,
      created_at: isoNow,
      updated_at: isoNow
    };
    wallets[uid] = wallet;
    return wallet;
  }

  function detectTamperedFields(body, forbiddenKeys) {
    if (!body || typeof body !== 'object') return [];
    return forbiddenKeys.filter((k) => Object.prototype.hasOwnProperty.call(body, k));
  }

  async function getWallet(authUser) {
    return withUserLock(authUser.uid, () => {
      const cfg = loadConfig();
      const wallets = readAllWallets();
      const existed = Boolean(wallets[authUser.uid]);
      const wallet = getOrCreateWalletUnlocked(wallets, authUser, cfg);
      if (!existed) {
        writeAllWallets(wallets);
      }
      return {
        wallet: { ...wallet },
        configVersion: cfg.version
      };
    });
  }

  async function getLedger(authUser, opts = {}) {
    const limit = Math.min(Math.max(Number(opts.limit || 100), 1), 500);
    const all = readAllLedgerEntries();
    const mine = all.filter((item) => item.user_id === authUser.uid);
    return mine.slice(-limit).reverse();
  }

  async function claimMatchReward(authUser, body = {}) {
    return withUserLock(authUser.uid, () => {
      const cfg = loadConfig();
      const wallets = readAllWallets();
      const wallet = getOrCreateWalletUnlocked(wallets, authUser, cfg);

      const tampered = detectTamperedFields(body, [
        'reward', 'amount', 'currency', 'diamonds', 'gold', 'balance', 'newBalance', 'user_id', 'uid'
      ]);

      const nowMs = nowFn();
      const todayStr = new Date(nowMs).toISOString().split('T')[0];

      if (wallet.lastDailyReset !== todayStr) {
        wallet.matchesToday = 0;
        wallet.lastDailyReset = todayStr;
      }

      const maxMatchesPerDay = Number(cfg.matchReward.maxMatchesPerDay);
      if (wallet.matchesToday >= maxMatchesPerDay) {
        throw createHttpError(
          429,
          `Batas harian tercapai! Maksimal ${maxMatchesPerDay} match per hari.`,
          'DAILY_MATCH_LIMIT'
        );
      }

      if (wallet.lastMatchAt && matchCooldownMs > 0) {
        const lastMs = new Date(wallet.lastMatchAt).getTime();
        if (Number.isFinite(lastMs) && (nowMs - lastMs) < matchCooldownMs) {
          const remainMinutes = Math.ceil((matchCooldownMs - (nowMs - lastMs)) / 60000);
          throw createHttpError(
            429,
            `Cooldown match aktif. Tunggu ${remainMinutes} menit lagi.`,
            'MATCH_COOLDOWN'
          );
        }
      }

      const allowedResults = ['win', 'draw', 'lose'];
      const result = allowedResults.includes(body?.result) ? body.result : 'lose';
      const opponent = typeof body?.opponent === 'string' ? body.opponent.trim().slice(0, 80) : 'Lawan';
      const matchId = typeof body?.matchId === 'string' && body.matchId.trim()
        ? body.matchId.trim().slice(0, 128)
        : `MCH-${nowMs}`;

      const mr = cfg.matchReward;
      const base = Number(mr.perMatchCurrency);
      const eventBonus = Number(mr.eventBonusCurrency);
      const outcomeBonus = result === 'win'
        ? Number(mr.winBonusCurrency)
        : (result === 'draw' ? Number(mr.drawBonusCurrency) : Number(mr.lossBonusCurrency));
      const reward = round4(base + outcomeBonus + eventBonus);

      const beforeCurrency = round4(wallet.currency);
      const afterCurrency = round4(beforeCurrency + reward);

      wallet.currency = afterCurrency;
      wallet.matchesToday += 1;
      wallet.totalMatches = Number(wallet.totalMatches || 0) + 1;
      wallet.lastMatchAt = new Date(nowMs).toISOString();
      wallet.updated_at = new Date(nowMs).toISOString();

      const ledgerEntry = appendImmutableLedgerEntry({
        user_id: authUser.uid,
        akun: wallet.akun,
        jenis_transaksi: 'masuk',
        kategori: 'match_reward',
        mata_uang: 'currency',
        jumlah: reward,
        fee: 0,
        saldo_sebelum: beforeCurrency,
        saldo_sesudah: afterCurrency,
        ref_id: matchId,
        keterangan: `Hadiah Pertandingan (${result.toUpperCase()} vs ${opponent})`
      });

      writeAllWallets(wallets);

      return {
        wallet: { ...wallet },
        reward,
        matchesToday: wallet.matchesToday,
        maxMatchesPerDay,
        ledgerEntry,
        serverValidation: {
          sourceOfTruth: 'economy.config.json',
          ignoredClientFields: tampered
        }
      };
    });
  }

  async function executeConversion(authUser, body = {}) {
    return withUserLock(authUser.uid, () => {
      const cfg = loadConfig();
      const wallets = readAllWallets();
      const wallet = getOrCreateWalletUnlocked(wallets, authUser, cfg);

      const direction = String(body?.direction || '').trim();
      const amount = Number(body?.amount);
      const tampered = detectTamperedFields(body, [
        'rate', 'fee', 'feePercent', 'amount_to', 'result', 'netOut', 'balance', 'user_id'
      ]);

      if (direction === 'diamond-currency' || direction === 'diamond-gold' || direction === 'gold-currency') {
        throw createHttpError(
          403,
          'Konversi balik ditolak server: Economy v2 hanya mengizinkan konversi satu arah (Currency → Gold → Diamond).',
          'REVERSE_CONVERSION_BLOCKED'
        );
      }

      if (direction !== 'currency-gold' && direction !== 'gold-diamond') {
        throw createHttpError(400, 'Arah konversi tidak valid.', 'INVALID_DIRECTION');
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        throw createHttpError(400, 'Jumlah konversi harus lebih dari 0.', 'INVALID_AMOUNT');
      }

      let fromKey;
      let toKey;
      let grossOut;
      let feePercent;
      let feeOut;
      let netOut;

      if (direction === 'currency-gold') {
        fromKey = 'currency';
        toKey = 'gold';
        const rate = Number(cfg.rates.goldToCurrency);
        feePercent = Number(cfg.fees.currencyToGoldFeePercent);
        grossOut = amount / rate;
        feeOut = round4(grossOut * (feePercent / 100));
        netOut = round4(grossOut - feeOut);
      } else {
        fromKey = 'gold';
        toKey = 'diamond';
        const rate = Number(cfg.rates.diamondToGold);
        feePercent = Number(cfg.fees.goldToDiamondFeePercent);
        grossOut = amount / rate;
        feeOut = round4(grossOut * (feePercent / 100));
        netOut = round4(grossOut - feeOut);
      }

      if (netOut <= 0) {
        throw createHttpError(400, 'Jumlah konversi terlalu kecil setelah biaya.', 'AMOUNT_TOO_SMALL');
      }

      const beforeFrom = round4(wallet[fromKey]);
      if (beforeFrom < amount) {
        throw createHttpError(
          400,
          `Saldo ${fromKey} tidak mencukupi (tersedia: ${beforeFrom}, dibutuhkan: ${amount}).`,
          'INSUFFICIENT_BALANCE'
        );
      }

      const afterFrom = round4(beforeFrom - amount);
      const beforeTo = round4(wallet[toKey]);
      const afterTo = round4(beforeTo + netOut);
      const convRef = `CNV-${nowFn()}`;

      wallet[fromKey] = afterFrom;
      wallet[toKey] = afterTo;
      wallet.updated_at = new Date(nowFn()).toISOString();

      const outEntry = appendImmutableLedgerEntry({
        user_id: authUser.uid,
        akun: wallet.akun,
        jenis_transaksi: 'keluar',
        kategori: 'konversi_keluar',
        mata_uang: fromKey,
        jumlah: round4(amount),
        fee: 0,
        saldo_sebelum: beforeFrom,
        saldo_sesudah: afterFrom,
        ref_id: convRef,
        keterangan: `Konversi ${amount} ${fromKey.toUpperCase()} → ${netOut} ${toKey.toUpperCase()}`
      });

      const inEntry = appendImmutableLedgerEntry({
        user_id: authUser.uid,
        akun: wallet.akun,
        jenis_transaksi: 'masuk',
        kategori: 'konversi_masuk',
        mata_uang: toKey,
        jumlah: netOut,
        fee: feeOut,
        saldo_sebelum: beforeTo,
        saldo_sesudah: afterTo,
        ref_id: convRef,
        keterangan: `Hasil konversi ke ${toKey.toUpperCase()} (fee ${feePercent}% = ${feeOut} ${toKey.toUpperCase()})`
      });

      writeAllWallets(wallets);

      return {
        wallet: { ...wallet },
        conversion: {
          direction,
          amountFrom: round4(amount),
          amountTo: netOut,
          feeAmount: feeOut,
          feePercent
        },
        ledgerEntries: [outEntry, inEntry],
        serverValidation: {
          sourceOfTruth: 'economy.config.json',
          ignoredClientFields: tampered
        }
      };
    });
  }

  async function settleWeeklySink(authUser, body = {}) {
    return withUserLock(authUser.uid, () => {
      const cfg = loadConfig();
      const wallets = readAllWallets();
      const wallet = getOrCreateWalletUnlocked(wallets, authUser, cfg);

      const tampered = detectTamperedFields(body, [
        'expense', 'sink', 'total', 'income', 'netChange', 'balance', 'user_id'
      ]);

      const nowMs = nowFn();
      if (wallet.lastWeeklyClaimAt && weeklyCooldownMs > 0) {
        const lastMs = new Date(wallet.lastWeeklyClaimAt).getTime();
        if (Number.isFinite(lastMs) && (nowMs - lastMs) < weeklyCooldownMs) {
          const sisaHari = Math.ceil((weeklyCooldownMs - (nowMs - lastMs)) / (24 * 60 * 60 * 1000));
          throw createHttpError(
            429,
            `Settlement mingguan sudah dilakukan minggu ini. Tunggu ${sisaHari} hari lagi.`,
            'WEEKLY_COOLDOWN'
          );
        }
      }

      const ws = cfg.weeklySink;
      const sinkItems = [
        { kategori: 'weekly_sink_gaji_pemain', label: 'Gaji Pemain Mingguan', amount: Number(ws.playerSalariesCurrency) },
        { kategori: 'weekly_sink_gaji_staf', label: 'Gaji Staf Mingguan', amount: Number(ws.staffSalariesCurrency) },
        { kategori: 'weekly_sink_stadion', label: 'Maintenance Stadion Mingguan', amount: Number(ws.stadiumMaintenanceCurrency) },
        { kategori: 'weekly_sink_akademi', label: 'Biaya Akademi Muda Mingguan', amount: Number(ws.youthAcademyCurrency) }
      ];
      const totalSink = round4(sinkItems.reduce((sum, item) => sum + item.amount, 0));
      const eventBonus = round4(Number(cfg.matchReward.eventBonusCurrency || 0));

      const availableAfterEvent = round4(wallet.currency + eventBonus);
      if (availableAfterEvent < totalSink) {
        throw createHttpError(
          400,
          `Saldo Currency tidak cukup untuk settlement biaya mingguan (butuh ${totalSink.toLocaleString('id-ID')} Currency, saldo Anda ${wallet.currency.toLocaleString('id-ID')} Currency).`,
          'INSUFFICIENT_BALANCE'
        );
      }

      const settleRef = `WK-${nowMs}`;
      const ledgerEntries = [];
      let runningBalance = round4(wallet.currency);

      if (eventBonus > 0) {
        const before = runningBalance;
        runningBalance = round4(runningBalance + eventBonus);
        ledgerEntries.push(appendImmutableLedgerEntry({
          user_id: authUser.uid,
          akun: wallet.akun,
          jenis_transaksi: 'masuk',
          kategori: 'event_bonus_mingguan',
          mata_uang: 'currency',
          jumlah: eventBonus,
          fee: 0,
          saldo_sebelum: before,
          saldo_sesudah: runningBalance,
          ref_id: settleRef,
          keterangan: 'Bonus Sponsor / Event Mingguan'
        }));
      }

      for (const item of sinkItems) {
        const before = runningBalance;
        runningBalance = round4(runningBalance - item.amount);
        ledgerEntries.push(appendImmutableLedgerEntry({
          user_id: authUser.uid,
          akun: wallet.akun,
          jenis_transaksi: 'keluar',
          kategori: item.kategori,
          mata_uang: 'currency',
          jumlah: item.amount,
          fee: 0,
          saldo_sebelum: before,
          saldo_sesudah: runningBalance,
          ref_id: settleRef,
          keterangan: item.label
        }));
      }

      wallet.currency = runningBalance;
      wallet.lastWeeklyClaimAt = new Date(nowMs).toISOString();
      wallet.updated_at = new Date(nowMs).toISOString();
      writeAllWallets(wallets);

      return {
        wallet: { ...wallet },
        income: eventBonus,
        expense: totalSink,
        netChange: round4(eventBonus - totalSink),
        sinkBreakdown: sinkItems,
        ledgerEntries,
        serverValidation: {
          sourceOfTruth: 'economy.config.json',
          ignoredClientFields: tampered
        }
      };
    });
  }

  function evaluateWithdrawGate(wallet, queue, cfg, requestedDiamond, nowMs) {
    const wd = cfg.withdraw;
    const minDiamond = Number(wd.minDiamond);
    const minAccountAgeDays = Number(wd.minAccountAgeDays);
    const cooldownDays = Number(wd.cooldownDays);
    const maxActiveRequests = Number(wd.maxActiveRequestsPerAccount);
    const requireKyc = Boolean(wd.requireKycBeforeFirstWithdraw);

    const createdMs = new Date(wallet.accountCreatedAt || wallet.created_at || nowMs).getTime();
    const accountAgeDaysExact = Math.max(0, (nowMs - createdMs) / DAY_MS);
    const accountAgeDays = Math.floor(accountAgeDaysExact);

    const activeQueueItems = queue.filter((q) => q.user_id === wallet.user_id && q.status === 'queued');
    const activeCount = Math.max(activeQueueItems.length, wallet.activeWithdrawId ? 1 : 0);

    let cooldownRemainingDays = 0;
    if (wallet.lastWithdrawAt) {
      const lastWdMs = new Date(wallet.lastWithdrawAt).getTime();
      if (Number.isFinite(lastWdMs)) {
        const elapsedMs = nowMs - lastWdMs;
        const cooldownMs = cooldownDays * DAY_MS;
        if (elapsedMs < cooldownMs) {
          cooldownRemainingDays = Math.ceil((cooldownMs - elapsedMs) / DAY_MS);
        }
      }
    }

    const checks = {
      noActiveRequestOk: activeCount < maxActiveRequests,
      cooldownOk: cooldownRemainingDays === 0,
      minAmountOk: Number.isFinite(requestedDiamond) && requestedDiamond >= minDiamond,
      sufficientBalanceOk: round4(wallet.diamond) >= requestedDiamond,
      accountAgeOk: accountAgeDaysExact >= minAccountAgeDays,
      kycOk: !requireKyc || Boolean(wallet.kycVerified)
    };

    return {
      minDiamond,
      minAccountAgeDays,
      cooldownDays,
      maxActiveRequests,
      requireKyc,
      accountAgeDays,
      accountAgeDaysExact: round2(accountAgeDaysExact),
      activeCount,
      activeRequestId: activeQueueItems[0]?.id || wallet.activeWithdrawId || null,
      cooldownRemainingDays,
      kycVerified: Boolean(wallet.kycVerified),
      kycStatus: wallet.kycStatus || (wallet.kycVerified ? 'verified' : 'unverified'),
      checks,
      eligible: Object.values(checks).every(Boolean)
    };
  }

  async function getWithdrawStatus(authUser) {
    return withUserLock(authUser.uid, () => {
      const cfg = loadConfig();
      const wallets = readAllWallets();
      const existed = Boolean(wallets[authUser.uid]);
      const wallet = getOrCreateWalletUnlocked(wallets, authUser, cfg);
      if (!existed) {
        writeAllWallets(wallets);
      }
      const queue = readWithdrawQueue();
      const nowMs = nowFn();
      const gate = evaluateWithdrawGate(wallet, queue, cfg, Number(cfg.withdraw.minDiamond), nowMs);
      const userQueue = queue.filter((q) => q.user_id === authUser.uid).slice(-10).reverse();

      return {
        wallet: { ...wallet },
        gate,
        queue: userQueue
      };
    });
  }

  async function submitKyc(authUser, body = {}) {
    return withUserLock(authUser.uid, () => {
      const cfg = loadConfig();
      const wallets = readAllWallets();
      const wallet = getOrCreateWalletUnlocked(wallets, authUser, cfg);

      const fullName = String(body?.fullName || '').trim();
      const idNumber = String(body?.idNumber || '').trim();
      const idType = String(body?.idType || 'KTP').trim().slice(0, 20);
      const walletAddress = String(body?.walletAddress || '').trim();

      if (fullName.length < 3 || fullName.length > 100) {
        throw createHttpError(400, 'Nama lengkap KYC wajib diisi (3-100 karakter).', 'INVALID_KYC_NAME');
      }
      if (idNumber.length < 6 || idNumber.length > 40) {
        throw createHttpError(400, 'Nomor identitas KYC (KTP/Paspor) tidak valid.', 'INVALID_KYC_ID');
      }
      if (walletAddress.length < 10 || walletAddress.length > 128) {
        throw createHttpError(400, 'Alamat dompet USDT tujuan wajib diisi dengan benar.', 'INVALID_WALLET_ADDRESS');
      }

      const idHash = crypto.createHash('sha256').update(`${idType}:${idNumber}`).digest('hex');
      const nowIso = new Date(nowFn()).toISOString();

      wallet.kycStatus = wallet.kycVerified ? 'verified' : 'pending';
      wallet.kycSubmittedAt = nowIso;
      wallet.kycFullName = fullName;
      wallet.kycIdType = idType;
      wallet.kycIdentityHash = idHash;
      wallet.kycWalletAddress = walletAddress;
      wallet.updated_at = nowIso;

      writeAllWallets(wallets);
      return {
        wallet: { ...wallet },
        message: wallet.kycVerified
          ? 'Akun Anda sudah terverifikasi KYC.'
          : 'Pengajuan KYC diterima server dan menunggu verifikasi Admin.'
      };
    });
  }

  async function adminVerifyKyc(authUser, body = {}) {
    const email = String(authUser.email || '').toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) {
      throw createHttpError(403, 'Hanya Admin/Owner yang dapat memverifikasi KYC.', 'FORBIDDEN');
    }

    const targetUid = String(body?.targetUid || authUser.uid).trim();
    return withUserLock(targetUid, () => {
      const wallets = readAllWallets();
      const targetWallet = wallets[targetUid];
      if (!targetWallet) {
        throw createHttpError(404, 'Wallet user tidak ditemukan.', 'WALLET_NOT_FOUND');
      }
      const nowIso = new Date(nowFn()).toISOString();
      targetWallet.kycVerified = true;
      targetWallet.kycStatus = 'verified';
      targetWallet.kycVerifiedAt = nowIso;
      targetWallet.updated_at = nowIso;
      writeAllWallets(wallets);
      return { wallet: { ...targetWallet } };
    });
  }

  async function adminCompleteWithdraw(authUser, body = {}) {
    const email = String(authUser.email || '').toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) {
      throw createHttpError(403, 'Hanya Admin/Owner yang dapat menyelesaikan antrean withdraw.', 'FORBIDDEN');
    }

    const queue = readWithdrawQueue();
    const withdrawId = String(body?.withdrawId || '').trim();
    const targetItem = withdrawId
      ? queue.find((q) => q.id === withdrawId)
      : queue.find((q) => q.status === 'queued');

    if (!targetItem) {
      throw createHttpError(404, 'Request withdraw dalam antrean tidak ditemukan.', 'WITHDRAW_NOT_FOUND');
    }

    return withUserLock(targetItem.user_id, () => {
      const wallets = readAllWallets();
      const targetWallet = wallets[targetItem.user_id];
      const nowIso = new Date(nowFn()).toISOString();

      targetItem.status = 'completed';
      targetItem.completed_at = nowIso;
      writeWithdrawQueue(queue);

      if (targetWallet) {
        if (targetWallet.activeWithdrawId === targetItem.id) {
          targetWallet.activeWithdrawId = null;
        }
        targetWallet.updated_at = nowIso;
        writeAllWallets(wallets);
      }

      return { withdraw: { ...targetItem }, wallet: targetWallet ? { ...targetWallet } : null };
    });
  }

  async function requestWithdraw(authUser, body = {}) {
    return withUserLock(authUser.uid, () => {
      const cfg = loadConfig();
      const wallets = readAllWallets();
      const wallet = getOrCreateWalletUnlocked(wallets, authUser, cfg);
      const queue = readWithdrawQueue();
      const nowMs = nowFn();

      const tampered = detectTamperedFields(body, [
        'fee', 'feePercent', 'netUsdt', 'netDiamond', 'status', 'instant',
        'balance', 'user_id', 'kycVerified', 'accountAgeDays', 'bypassCooldown', 'bypassGate'
      ]);

      const wd = cfg.withdraw;
      const requestedDiamond = body?.amount !== undefined ? Number(body.amount) : Number(wd.minDiamond);
      const gate = evaluateWithdrawGate(wallet, queue, cfg, requestedDiamond, nowMs);

      // 1. Cek anti-spam: maksimal 1 request aktif per akun
      if (!gate.checks.noActiveRequestOk) {
        throw createHttpError(
          409,
          `Request ditolak server: Maksimal ${gate.maxActiveRequests} request withdraw aktif per akun. Request Anda (${gate.activeRequestId}) masih berada dalam antrean (queue).`,
          'ACTIVE_WITHDRAW_EXISTS',
          { gate }
        );
      }

      // 2. Cek cooldown 30 hari antar withdraw
      if (!gate.checks.cooldownOk) {
        throw createHttpError(
          429,
          `Request ditolak server: Masih dalam masa cooldown withdraw ${gate.cooldownDays} hari. Silakan tunggu ${gate.cooldownRemainingDays} hari lagi.`,
          'WITHDRAW_COOLDOWN',
          { gate }
        );
      }

      // 3. Cek minimum nominal withdraw (25 Diamond)
      if (!gate.checks.minAmountOk) {
        throw createHttpError(
          400,
          `Request ditolak server: Minimum withdraw adalah ${gate.minDiamond} Diamond.`,
          'BELOW_MIN_WITHDRAW',
          { gate }
        );
      }

      // 4. Cek kecukupan saldo Diamond server
      const beforeDiamond = round4(wallet.diamond);
      if (!gate.checks.sufficientBalanceOk) {
        throw createHttpError(
          400,
          `Request ditolak server: Saldo Diamond tidak cukup! Saldo Anda ${beforeDiamond} Diamond, dibutuhkan minimal ${requestedDiamond} Diamond.`,
          'INSUFFICIENT_DIAMOND',
          { gate }
        );
      }

      // 5. Cek umur akun minimal 90 hari
      if (!gate.checks.accountAgeOk) {
        const kurangHari = Math.max(1, Math.ceil(gate.minAccountAgeDays - gate.accountAgeDaysExact));
        throw createHttpError(
          403,
          `Request ditolak server: Umur akun minimal ${gate.minAccountAgeDays} hari untuk withdraw. Umur akun Anda baru ${gate.accountAgeDays} hari (kurang ${kurangHari} hari lagi).`,
          'ACCOUNT_TOO_NEW',
          { gate }
        );
      }

      // 6. Cek kewajiban verifikasi KYC sebelum withdraw pertama
      if (!gate.checks.kycOk) {
        throw createHttpError(
          403,
          'Request ditolak server: Akun belum terverifikasi KYC. Wajib menyelesaikan verifikasi KYC sebelum withdraw pertama.',
          'KYC_REQUIRED',
          { gate }
        );
      }

      const feePercent = Number(wd.feePercent);
      const feeDiamond = round4(requestedDiamond * (feePercent / 100));
      const netDiamond = round4(requestedDiamond - feeDiamond);
      const netUsdt = round2(netDiamond * Number(cfg.rates.diamondToUsdt));
      const wdId = `WD-${nowMs}`;
      const nowIso = new Date(nowMs).toISOString();

      const afterDiamond = round4(beforeDiamond - requestedDiamond);
      wallet.diamond = afterDiamond;
      wallet.activeWithdrawId = wdId;
      wallet.lastWithdrawAt = nowIso;
      wallet.updated_at = nowIso;

      const queuePosition = queue.filter((q) => q.status === 'queued').length + 1;
      const queueRecord = {
        id: wdId,
        user_id: authUser.uid,
        akun: wallet.akun,
        grossDiamond: round4(requestedDiamond),
        feePercent,
        feeDiamond,
        netDiamond,
        netUsdt,
        destinationWallet: wallet.kycWalletAddress || null,
        status: 'queued',
        queuePosition,
        processingMode: wd.processingMode,
        accountAgeDaysAtRequest: gate.accountAgeDays,
        created_at: nowIso
      };
      queue.push(queueRecord);
      writeWithdrawQueue(queue);

      const ledgerEntry = appendImmutableLedgerEntry({
        user_id: authUser.uid,
        akun: wallet.akun,
        jenis_transaksi: 'keluar',
        kategori: 'withdraw_request',
        mata_uang: 'diamond',
        jumlah: round4(requestedDiamond),
        fee: feeDiamond,
        saldo_sebelum: beforeDiamond,
        saldo_sesudah: afterDiamond,
        ref_id: wdId,
        keterangan: `Withdraw ${requestedDiamond} Diamond → Net ${netUsdt} USDT (fee ${feePercent}%, antrean #${queuePosition}, mode: ${wd.processingMode})`
      });

      writeAllWallets(wallets);

      return {
        wallet: { ...wallet },
        withdraw: queueRecord,
        ledgerEntry,
        gate: evaluateWithdrawGate(wallet, queue, cfg, Number(wd.minDiamond), nowMs),
        serverValidation: {
          sourceOfTruth: 'economy.config.json',
          ignoredClientFields: tampered
        }
      };
    });
  }

  function computeServerSpendSpec(cfg, body) {
    const action = String(body?.action || '').trim();
    const dp = cfg.defaultPrices;

    if (action === 'stadion_upgrade') {
      const currentLevel = Number(body?.currentLevel);
      if (![1, 2, 3].includes(currentLevel)) {
        throw createHttpError(400, 'Level stadion tidak valid untuk upgrade.', 'INVALID_LEVEL');
      }
      const range = dp.upgrades.stadiumGold;
      const min = Number(range.min);
      const max = Number(range.max);
      const mid = Math.round((min + max) / 2);
      const costMap = { 1: min, 2: mid, 3: max };
      return {
        mode: 'debit',
        currency: 'gold',
        amount: costMap[currentLevel],
        kategori: 'stadion_upgrade',
        keterangan: `Upgrade Stadion dari Level ${currentLevel} ke Level ${currentLevel + 1}`
      };
    }

    if (action === 'kantor_upgrade') {
      const currentLevel = Number(body?.currentLevel);
      if (![1, 2, 3].includes(currentLevel)) {
        throw createHttpError(400, 'Level fasilitas kantor tidak valid untuk upgrade.', 'INVALID_LEVEL');
      }
      const range = dp.upgrades.stadiumGold;
      const min = Number(range.min);
      const max = Number(range.max);
      const nextStepIdx = currentLevel; // target level 2 -> idx 1, 3 -> idx 2, 4 -> idx 3
      const cost = Math.round(min + ((max - min) * nextStepIdx) / 3);
      return {
        mode: 'debit',
        currency: 'gold',
        amount: cost,
        kategori: 'kantor_upgrade',
        keterangan: `Upgrade Fasilitas Kantor ke Level ${currentLevel + 1}`
      };
    }

    if (action === 'staff_hire') {
      const staffOrder = ['coach', 'physio', 'analyst', 'manager'];
      const staffId = String(body?.staffId || '');
      const tierIndex = staffOrder.indexOf(staffId);
      const currentLevel = Number(body?.currentLevel ?? 0);
      if (tierIndex === -1 || !Number.isInteger(currentLevel) || currentLevel < 0 || currentLevel > 10) {
        throw createHttpError(400, 'Data staff tidak valid.', 'INVALID_STAFF');
      }
      const range = dp.staff.regularGold;
      const min = Number(range.min);
      const max = Number(range.max);
      const baseCost = Math.round(min + ((max - min) * tierIndex) / (staffOrder.length - 1));
      const cost = baseCost * (currentLevel + 1);
      return {
        mode: 'debit',
        currency: 'gold',
        amount: cost,
        kategori: 'rekrut_staf',
        keterangan: `${currentLevel > 0 ? 'Upgrade' : 'Rekrut'} Staf ${staffId} ke Level ${currentLevel + 1}`
      };
    }

    if (action === 'akademi_scout') {
      const academyLevel = Number(body?.academyLevel ?? 1);
      if (![1, 2, 3, 4, 5].includes(academyLevel)) {
        throw createHttpError(400, 'Level akademi tidak valid.', 'INVALID_LEVEL');
      }
      const rookie = dp.players.rookieGold;
      const rMin = Number(rookie.min);
      const rMax = Number(rookie.max);
      const cost = Math.round(rMin + ((rMax - rMin) * (academyLevel - 1)) / 4);
      return {
        mode: 'debit',
        currency: 'gold',
        amount: cost,
        kategori: 'akademi_scout',
        keterangan: `Scout Pemain Muda Akademi Level ${academyLevel}`
      };
    }

    if (action === 'akademi_upgrade') {
      const academyLevel = Number(body?.academyLevel);
      if (![1, 2, 3, 4].includes(academyLevel)) {
        throw createHttpError(400, 'Level akademi tidak valid untuk upgrade.', 'INVALID_LEVEL');
      }
      const upg = dp.upgrades.academyGold;
      const uMin = Number(upg.min);
      const uMax = Number(upg.max);
      const cost = Math.round(uMin + ((uMax - uMin) * (academyLevel - 1)) / 3);
      return {
        mode: 'debit',
        currency: 'gold',
        amount: cost,
        kategori: 'akademi_upgrade',
        keterangan: `Upgrade Akademi Muda dari Level ${academyLevel} ke Level ${academyLevel + 1}`
      };
    }

    if (action === 'transfer_buy') {
      const price = Number(body?.price);
      const minAllowed = Number(dp.players.rookieGold.min);
      const maxAllowed = Number(dp.players.topGold.max);
      if (!Number.isFinite(price) || price < minAllowed || price > maxAllowed) {
        throw createHttpError(
          400,
          `Harga beli pemain harus berada di rentang config (${minAllowed}-${maxAllowed} Gold).`,
          'INVALID_PRICE'
        );
      }
      const playerName = String(body?.playerName || 'Pemain').slice(0, 80);
      return {
        mode: 'debit',
        currency: 'gold',
        amount: Math.round(price),
        kategori: 'transfer_beli',
        keterangan: `Pembelian Pemain Transfer: ${playerName}`
      };
    }

    if (action === 'transfer_sell') {
      const marketValue = Number(body?.marketValue);
      const maxAllowed = Number(dp.players.topGold.max) * 2;
      if (!Number.isFinite(marketValue) || marketValue <= 0 || marketValue > maxAllowed) {
        throw createHttpError(400, 'Nilai jual pemain tidak valid.', 'INVALID_PRICE');
      }
      const taxPct = Number(cfg.fees.marketTaxPercent || 0);
      const listingPct = Number(cfg.fees.listingFeePercent || 0);
      const totalFeePct = taxPct + listingPct;
      const gross = Math.round(marketValue);
      const fee = Math.ceil(gross * (totalFeePct / 100));
      const netGold = Math.max(0, Math.floor(gross * (1 - totalFeePct / 100)));
      const playerName = String(body?.playerName || 'Pemain').slice(0, 80);
      return {
        mode: 'credit',
        currency: 'gold',
        amount: netGold,
        fee,
        kategori: 'transfer_jual',
        keterangan: `Penjualan Pemain Transfer: ${playerName} (Market tax ${taxPct}% + listing ${listingPct}%)`
      };
    }

    throw createHttpError(400, 'Aksi pengeluaran tidak dikenali server.', 'INVALID_ACTION');
  }

  async function spendOrTrade(authUser, body = {}) {
    return withUserLock(authUser.uid, () => {
      const cfg = loadConfig();
      const wallets = readAllWallets();
      const wallet = getOrCreateWalletUnlocked(wallets, authUser, cfg);
      const spec = computeServerSpendSpec(cfg, body);

      const before = round4(wallet[spec.currency]);
      let after;
      let jenis;

      if (spec.mode === 'debit') {
        if (before < spec.amount) {
          throw createHttpError(
            400,
            `Saldo ${spec.currency} tidak mencukupi (tersedia: ${before}, butuh: ${spec.amount}).`,
            'INSUFFICIENT_BALANCE'
          );
        }
        after = round4(before - spec.amount);
        jenis = 'keluar';
      } else {
        after = round4(before + spec.amount);
        jenis = 'masuk';
      }

      wallet[spec.currency] = after;
      wallet.updated_at = new Date(nowFn()).toISOString();

      const ledgerEntry = appendImmutableLedgerEntry({
        user_id: authUser.uid,
        akun: wallet.akun,
        jenis_transaksi: jenis,
        kategori: spec.kategori,
        mata_uang: spec.currency,
        jumlah: spec.amount,
        fee: spec.fee || 0,
        saldo_sebelum: before,
        saldo_sesudah: after,
        ref_id: `TRD-${nowFn()}`,
        keterangan: spec.keterangan
      });

      writeAllWallets(wallets);

      return {
        wallet: { ...wallet },
        amount: spec.amount,
        fee: spec.fee || 0,
        ledgerEntry
      };
    });
  }

  async function adminResetWallet(authUser) {
    const email = String(authUser.email || '').toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) {
      throw createHttpError(403, 'Hanya Admin/Owner yang dapat mereset saldo.', 'FORBIDDEN');
    }

    return withUserLock(authUser.uid, () => {
      const cfg = loadConfig();
      const wallets = readAllWallets();
      const wallet = getOrCreateWalletUnlocked(wallets, authUser, cfg);
      const starter = cfg.starterBalance;

      const entries = [];
      const pairs = [
        ['currency', Number(starter.currency)],
        ['gold', Number(starter.gold)],
        ['diamond', Number(starter.diamonds)]
      ];

      for (const [curr, target] of pairs) {
        const before = round4(wallet[curr]);
        if (before !== target) {
          const diff = Math.abs(round4(before - target));
          const jenis = before > target ? 'keluar' : 'masuk';
          wallet[curr] = target;
          entries.push(appendImmutableLedgerEntry({
            user_id: authUser.uid,
            akun: wallet.akun,
            jenis_transaksi: jenis,
            kategori: 'admin_reset',
            mata_uang: curr,
            jumlah: diff,
            fee: 0,
            saldo_sebelum: before,
            saldo_sesudah: target,
            ref_id: `RST-${nowFn()}`,
            keterangan: `Admin Reset ke starterBalance (${target})`
          }));
        }
      }

      wallet.matchesToday = 0;
      wallet.lastDailyReset = null;
      wallet.lastMatchAt = null;
      wallet.lastWeeklyClaimAt = null;
      wallet.activeWithdrawId = null;
      wallet.updated_at = new Date(nowFn()).toISOString();
      writeAllWallets(wallets);

      return { wallet: { ...wallet }, ledgerEntries: entries };
    });
  }

  return {
    verifyFirebaseIdToken,
    getWallet,
    getLedger,
    getWithdrawStatus,
    submitKyc,
    adminVerifyKyc,
    adminCompleteWithdraw,
    claimMatchReward,
    executeConversion,
    settleWeeklySink,
    requestWithdraw,
    spendOrTrade,
    adminResetWallet,
    readAllLedgerEntries,
    readWithdrawQueue
  };
}

function mountEconomyRoutes(app, service) {
  async function requireAuth(req, res, next) {
    try {
      const authHeader = req.headers.authorization || '';
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      const token = match ? match[1].trim() : '';
      const authUser = await service.verifyFirebaseIdToken(token);
      req.authUser = authUser;
      next();
    } catch (err) {
      return res.status(err.status || 401).json({
        success: false,
        code: err.code || 'AUTH_FAILED',
        error: err.message || 'Autentikasi gagal.'
      });
    }
  }

  function handleRouteError(res, err) {
    const status = err.status || 500;
    const body = {
      success: false,
      code: err.code || 'SERVER_ERROR',
      error: err.message || 'Terjadi kesalahan pada server.'
    };
    if (err.details) body.details = err.details;
    return res.status(status).json(body);
  }

  app.get('/api/economy/wallet', requireAuth, async (req, res) => {
    try {
      const data = await service.getWallet(req.authUser);
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.get('/api/economy/ledger', requireAuth, async (req, res) => {
    try {
      const entries = await service.getLedger(req.authUser, { limit: req.query.limit });
      return res.json({ success: true, immutable: true, entries });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.get('/api/economy/withdraw-status', requireAuth, async (req, res) => {
    try {
      const data = await service.getWithdrawStatus(req.authUser);
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/kyc/submit', requireAuth, async (req, res) => {
    try {
      const data = await service.submitKyc(req.authUser, req.body || {});
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/admin/kyc/approve', requireAuth, async (req, res) => {
    try {
      const data = await service.adminVerifyKyc(req.authUser, req.body || {});
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/admin/withdraw/complete', requireAuth, async (req, res) => {
    try {
      const data = await service.adminCompleteWithdraw(req.authUser, req.body || {});
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  // Ledger bersifat permanen (append-only): tolak keras semua edit/hapus
  app.all('/api/economy/ledger*', (req, res, next) => {
    if (req.method === 'GET') return next();
    return res.status(403).json({
      success: false,
      code: 'LEDGER_IMMUTABLE',
      error: 'Ledger bersifat permanen (append-only) dan tidak boleh diedit atau dihapus oleh player.'
    });
  });

  app.post('/api/economy/match-reward', requireAuth, async (req, res) => {
    try {
      const result = await service.claimMatchReward(req.authUser, req.body || {});
      return res.json({ success: true, ...result });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/convert', requireAuth, async (req, res) => {
    try {
      const result = await service.executeConversion(req.authUser, req.body || {});
      return res.json({ success: true, ...result });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/weekly-sink', requireAuth, async (req, res) => {
    try {
      const result = await service.settleWeeklySink(req.authUser, req.body || {});
      return res.json({ success: true, ...result });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/withdraw-request', requireAuth, async (req, res) => {
    try {
      const result = await service.requestWithdraw(req.authUser, req.body || {});
      return res.json({ success: true, ...result });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/spend', requireAuth, async (req, res) => {
    try {
      const result = await service.spendOrTrade(req.authUser, req.body || {});
      return res.json({ success: true, ...result });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/admin/reset', requireAuth, async (req, res) => {
    try {
      const result = await service.adminResetWallet(req.authUser);
      return res.json({ success: true, ...result });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });
}

module.exports = {
  createEconomyService,
  mountEconomyRoutes
};
