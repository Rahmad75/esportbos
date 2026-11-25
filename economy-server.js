const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const QRCode = require('qrcode');

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
  const topupRequestsFile = path.join(dataDir, 'topup_requests.json');
  const securityEventsFile = path.join(dataDir, 'economy-security-events.jsonl');
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
  if (!fs.existsSync(topupRequestsFile)) {
    fs.writeFileSync(topupRequestsFile, JSON.stringify([], null, 2), 'utf8');
  }
  if (!fs.existsSync(securityEventsFile)) {
    fs.writeFileSync(securityEventsFile, '', 'utf8');
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

  function readTopupRequests() {
    try {
      const raw = fs.readFileSync(topupRequestsFile, 'utf8');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function writeTopupRequests(requests) {
    const tmpFile = `${topupRequestsFile}.tmp.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tmpFile, JSON.stringify(requests, null, 2), 'utf8');
    fs.renameSync(tmpFile, topupRequestsFile);
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

  function appendSecurityEvent(event) {
    const record = {
      id: `SEC-${nowFn()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      waktu: new Date(nowFn()).toISOString(),
      user_id: String(event.user_id || ''),
      akun: String(event.akun || event.user_id || ''),
      eventType: String(event.eventType || 'SECURITY_ALERT'),
      severity: String(event.severity || 'medium'),
      ip: event.ip || null,
      deviceId: event.deviceId || null,
      detail: String(event.detail || ''),
      meta: event.meta || null
    };
    fs.appendFileSync(securityEventsFile, JSON.stringify(record) + '\n', 'utf8');
    return record;
  }

  function readSecurityEvents(limit = 100) {
    try {
      const content = fs.readFileSync(securityEventsFile, 'utf8');
      if (!content.trim()) return [];
      const rows = content.split('\n').filter(Boolean).map((line) => JSON.parse(line));
      return rows.slice(-limit).reverse();
    } catch (_) {
      return [];
    }
  }

  function normalizeRequestMeta(reqMeta = {}) {
    const rawForwarded = String(reqMeta?.forwardedFor || reqMeta?.xForwardedFor || '').trim();
    const forwardedList = rawForwarded ? rawForwarded.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const ip = String(reqMeta?.ip || forwardedList[0] || '').trim().slice(0, 80) || null;
    const deviceId = String(reqMeta?.deviceId || '').trim().slice(0, 120) || null;
    const userAgent = String(reqMeta?.userAgent || '').trim().slice(0, 200) || null;
    return {
      ip,
      deviceId,
      userAgent,
      proxyHopCount: forwardedList.length,
      suspiciousFlag: Boolean(reqMeta?.suspiciousFlag)
    };
  }

  function ensureWalletSecurity(wallet) {
    if (!wallet.security || typeof wallet.security !== 'object') {
      wallet.security = {};
    }
    const sec = wallet.security;
    if (typeof sec.flagged !== 'boolean') sec.flagged = false;
    if (!Number.isFinite(sec.riskScore)) sec.riskScore = 0;
    if (!Array.isArray(sec.flags)) sec.flags = [];
    if (!Array.isArray(sec.flagReasons)) sec.flagReasons = [];
    if (!Number.isFinite(sec.botSpamAttempts)) sec.botSpamAttempts = 0;
    if (!Number.isFinite(sec.fastMatchAttempts)) sec.fastMatchAttempts = 0;
    if (!Number.isFinite(sec.duplicateKycAttempts)) sec.duplicateKycAttempts = 0;
    if (!Number.isFinite(sec.holdCount)) sec.holdCount = 0;
    if (!Array.isArray(sec.matchAttemptTimestamps)) sec.matchAttemptTimestamps = [];
    if (!Array.isArray(sec.rewardedMatchIds)) sec.rewardedMatchIds = [];
    if (!Array.isArray(sec.knownIps)) sec.knownIps = [];
    if (!Array.isArray(sec.knownDevices)) sec.knownDevices = [];
    if (sec.lastIp === undefined) sec.lastIp = null;
    if (sec.lastDeviceId === undefined) sec.lastDeviceId = null;
    if (sec.lastFlaggedAt === undefined) sec.lastFlaggedAt = null;
    return sec;
  }

  function recordWalletContext(wallet, meta) {
    const sec = ensureWalletSecurity(wallet);
    if (meta.ip) {
      sec.lastIp = meta.ip;
      if (!sec.knownIps.includes(meta.ip)) {
        sec.knownIps.push(meta.ip);
        if (sec.knownIps.length > 10) sec.knownIps = sec.knownIps.slice(-10);
      }
    }
    if (meta.deviceId) {
      sec.lastDeviceId = meta.deviceId;
      if (!sec.knownDevices.includes(meta.deviceId)) {
        sec.knownDevices.push(meta.deviceId);
        if (sec.knownDevices.length > 10) sec.knownDevices = sec.knownDevices.slice(-10);
      }
    }
  }

  function flagWalletSecurity(wallet, { flagCode, reason, scoreDelta = 25, meta = {}, markFlagged = true, eventType = flagCode, severity = 'high', extraMeta = null }) {
    const sec = ensureWalletSecurity(wallet);
    if (markFlagged) {
      sec.flagged = true;
      sec.lastFlaggedAt = new Date(nowFn()).toISOString();
    }
    sec.riskScore = Math.min(100, Number(sec.riskScore || 0) + Number(scoreDelta || 0));
    if (flagCode && !sec.flags.includes(flagCode)) {
      sec.flags.push(flagCode);
    }
    if (reason) {
      sec.flagReasons.push(`${new Date(nowFn()).toISOString().slice(0, 19)}Z: ${reason}`);
      if (sec.flagReasons.length > 15) sec.flagReasons = sec.flagReasons.slice(-15);
    }
    appendSecurityEvent({
      user_id: wallet.user_id,
      akun: wallet.akun,
      eventType,
      severity,
      ip: meta.ip || null,
      deviceId: meta.deviceId || null,
      detail: reason,
      meta: extraMeta
    });
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
      ensureWalletSecurity(existing);
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
    ensureWalletSecurity(wallet);
    wallets[uid] = wallet;
    return wallet;
  }

  function detectTamperedFields(body, forbiddenKeys) {
    if (!body || typeof body !== 'object') return [];
    return forbiddenKeys.filter((k) => Object.prototype.hasOwnProperty.call(body, k));
  }

  async function getWallet(authUser, reqMeta = {}) {
    return withUserLock(authUser.uid, () => {
      const cfg = loadConfig();
      const wallets = readAllWallets();
      const existed = Boolean(wallets[authUser.uid]);
      const wallet = getOrCreateWalletUnlocked(wallets, authUser, cfg);
      const meta = normalizeRequestMeta(reqMeta);
      const sec = ensureWalletSecurity(wallet);
      const hadIp = Boolean(meta.ip && sec.knownIps.includes(meta.ip));
      const hadDev = Boolean(meta.deviceId && sec.knownDevices.includes(meta.deviceId));
      recordWalletContext(wallet, meta);
      if (!existed || (meta.ip && !hadIp) || (meta.deviceId && !hadDev)) {
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

  async function claimMatchReward(authUser, body = {}, reqMeta = {}) {
    return withUserLock(authUser.uid, () => {
      const cfg = loadConfig();
      const wallets = readAllWallets();
      const wallet = getOrCreateWalletUnlocked(wallets, authUser, cfg);
      const meta = normalizeRequestMeta(reqMeta);
      const sec = ensureWalletSecurity(wallet);
      const anti = cfg.antiAbuse || {};

      const tampered = detectTamperedFields(body, [
        'reward', 'amount', 'currency', 'diamonds', 'gold', 'balance', 'newBalance', 'user_id', 'uid'
      ]);

      const nowMs = nowFn();
      const todayStr = new Date(nowMs).toISOString().split('T')[0];

      if (wallet.lastDailyReset !== todayStr) {
        wallet.matchesToday = 0;
        wallet.lastDailyReset = todayStr;
      }

      // Catat semua percobaan request match dalam 1 jam terakhir untuk deteksi spam/bot
      const oneHourAgo = nowMs - (60 * 60 * 1000);
      sec.matchAttemptTimestamps = sec.matchAttemptTimestamps.filter((ts) => Number(ts) >= oneHourAgo);
      sec.matchAttemptTimestamps.push(nowMs);

      const maxPerHour = Number(anti.maxMatchRequestsPerHour || 10);
      const minIntervalSec = Number(anti.minMatchIntervalSeconds || 120);
      const flagThreshold = Number(anti.botFlagThresholdAttempts || 3);
      const attemptsIn1Min = sec.matchAttemptTimestamps.filter((ts) => (nowMs - Number(ts)) <= 60 * 1000).length;

      // Anti-Bot 1: Puluhan request dalam 1 jam (hourly flood)
      if (sec.matchAttemptTimestamps.length > maxPerHour) {
        sec.botSpamAttempts += 1;
        flagWalletSecurity(wallet, {
          flagCode: 'BOT_HOURLY_RATE_LIMIT',
          reason: `Bot rate limit terlampaui (${sec.matchAttemptTimestamps.length} request match dalam 1 jam, batas ${maxPerHour}/jam).`,
          scoreDelta: 40,
          meta,
          markFlagged: true
        });
        writeAllWallets(wallets);
        throw createHttpError(
          429,
          `Akses ditolak sistem Anti-Bot: Terlalu banyak request match dalam 1 jam (${sec.matchAttemptTimestamps.length}/${maxPerHour}). Akun Anda telah ditandai untuk review.`,
          'BOT_RATE_LIMIT',
          { flagged: true, security: { ...sec } }
        );
      }

      // Anti-Bot 2: Replay matchId yang sudah pernah diklaim
      const incomingMatchId = typeof body?.matchId === 'string' && body.matchId.trim()
        ? body.matchId.trim().slice(0, 128)
        : null;
      if (incomingMatchId && sec.rewardedMatchIds.includes(incomingMatchId)) {
        sec.botSpamAttempts += 1;
        flagWalletSecurity(wallet, {
          flagCode: 'BOT_REPLAY_MATCH',
          reason: `Percobaan klaim ulang Match ID duplikat (${incomingMatchId}).`,
          scoreDelta: 30,
          meta,
          markFlagged: sec.botSpamAttempts >= flagThreshold
        });
        writeAllWallets(wallets);
        throw createHttpError(
          409,
          `Permintaan ditolak server: Match ID (${incomingMatchId}) sudah pernah diklaim sebelumnya.`,
          'DUPLICATE_MATCH_ID'
        );
      }

      // Anti-Bot 3: Jeda antar match terlalu cepat (misal 3 match dalam 1 menit / < minMatchIntervalSeconds)
      if (wallet.lastMatchAt) {
        const lastMs = new Date(wallet.lastMatchAt).getTime();
        const elapsedMs = nowMs - lastMs;
        if (Number.isFinite(lastMs) && elapsedMs < minIntervalSec * 1000) {
          sec.fastMatchAttempts += 1;
          sec.botSpamAttempts += 1;
          const elapsedSec = Math.max(0, Math.round(elapsedMs / 1000));
          const shouldFlag = attemptsIn1Min >= flagThreshold || sec.fastMatchAttempts >= 2;
          flagWalletSecurity(wallet, {
            flagCode: 'BOT_RAPID_MATCH',
            reason: `Interval match tidak wajar (${elapsedSec} detik setelah match sebelumnya, minimal ${minIntervalSec} detik). Percobaan 1 menit terakhir: ${attemptsIn1Min}.`,
            scoreDelta: shouldFlag ? 35 : 15,
            meta,
            markFlagged: shouldFlag
          });
          writeAllWallets(wallets);
          throw createHttpError(
            429,
            `Permintaan ditolak sistem Anti-Bot: Waktu penyelesaian match terlalu cepat (${elapsedSec} detik, minimal ${minIntervalSec} detik antar match).${shouldFlag ? ' Akun telah ditandai mencurigakan.' : ''}`,
            'BOT_MATCH_TOO_FAST',
            { flagged: sec.flagged, elapsedSec, minIntervalSec, attemptsIn1Min }
          );
        }
      }

      // Cek batas harian match (misal 3 match/hari)
      const maxMatchesPerDay = Number(cfg.matchReward.maxMatchesPerDay);
      if (wallet.matchesToday >= maxMatchesPerDay) {
        sec.botSpamAttempts += 1;
        if (attemptsIn1Min >= flagThreshold || sec.botSpamAttempts >= flagThreshold) {
          flagWalletSecurity(wallet, {
            flagCode: 'BOT_DAILY_SPAM',
            reason: `Spam request setelah batas harian (${maxMatchesPerDay} match/hari) tercapai.`,
            scoreDelta: 25,
            meta,
            markFlagged: true
          });
        }
        writeAllWallets(wallets);
        throw createHttpError(
          429,
          `Batas harian tercapai! Maksimal ${maxMatchesPerDay} match per hari.${sec.flagged ? ' Aktivitas spam Anda telah ditandai.' : ''}`,
          'DAILY_MATCH_LIMIT',
          { flagged: sec.flagged }
        );
      }

      // Cek cooldown match normal (default 4 jam jika diaktifkan)
      if (wallet.lastMatchAt && matchCooldownMs > 0) {
        const lastMs = new Date(wallet.lastMatchAt).getTime();
        if (Number.isFinite(lastMs) && (nowMs - lastMs) < matchCooldownMs) {
          sec.botSpamAttempts += 1;
          if (attemptsIn1Min >= flagThreshold || sec.botSpamAttempts >= flagThreshold) {
            flagWalletSecurity(wallet, {
              flagCode: 'BOT_COOLDOWN_SPAM',
              reason: `Spam request match selama masa cooldown.`,
              scoreDelta: 25,
              meta,
              markFlagged: true
            });
          }
          writeAllWallets(wallets);
          const remainMinutes = Math.ceil((matchCooldownMs - (nowMs - lastMs)) / 60000);
          throw createHttpError(
            429,
            `Cooldown match aktif. Tunggu ${remainMinutes} menit lagi.`,
            'MATCH_COOLDOWN',
            { flagged: sec.flagged }
          );
        }
      }

      const allowedResults = ['win', 'draw', 'lose'];
      const result = allowedResults.includes(body?.result) ? body.result : 'lose';
      const opponent = typeof body?.opponent === 'string' ? body.opponent.trim().slice(0, 80) : 'Lawan';
      const matchId = incomingMatchId || `MCH-${nowMs}`;

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
      sec.rewardedMatchIds.push(matchId);
      if (sec.rewardedMatchIds.length > 50) sec.rewardedMatchIds = sec.rewardedMatchIds.slice(-50);
      recordWalletContext(wallet, meta);

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

  async function executeConversion(authUser, body = {}, reqMeta = {}) {
    return withUserLock(authUser.uid, () => {
      const cfg = loadConfig();
      const wallets = readAllWallets();
      const wallet = getOrCreateWalletUnlocked(wallets, authUser, cfg);
      recordWalletContext(wallet, normalizeRequestMeta(reqMeta));

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

    const activeQueueItems = queue.filter(
      (q) => q.user_id === wallet.user_id && (q.status === 'queued' || q.status === 'hold')
    );
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

  async function submitKyc(authUser, body = {}, reqMeta = {}) {
    return withUserLock(authUser.uid, () => {
      const cfg = loadConfig();
      const wallets = readAllWallets();
      const wallet = getOrCreateWalletUnlocked(wallets, authUser, cfg);
      const meta = normalizeRequestMeta(reqMeta);
      const sec = ensureWalletSecurity(wallet);

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

      const idTypeNorm = idType.toUpperCase();
      const idNumberNorm = idNumber.replace(/[\s.-]+/g, '').toUpperCase();
      const walletAddrNorm = walletAddress.toLowerCase();
      const idHash = crypto.createHash('sha256').update(`${idTypeNorm}:${idNumberNorm}`).digest('hex');

      // Anti Multi-Account: 1 identitas KYC & 1 wallet tujuan hanya boleh terhubung ke 1 akun game
      if (cfg.guards?.oneKycIdentityPerWithdrawAccount !== false) {
        const otherWallets = Object.values(wallets).filter((w) => w.user_id !== authUser.uid);
        const duplicateIdentityOwner = otherWallets.find((w) => w.kycIdentityHash && w.kycIdentityHash === idHash);
        if (duplicateIdentityOwner) {
          sec.duplicateKycAttempts += 1;
          flagWalletSecurity(wallet, {
            flagCode: 'MULTI_ACCOUNT_KYC',
            reason: `Percobaan multi-akun KYC ditolak: Identitas ${idTypeNorm} sudah terhubung ke akun ${duplicateIdentityOwner.akun || duplicateIdentityOwner.user_id}.`,
            scoreDelta: 50,
            meta,
            markFlagged: true,
            extraMeta: { conflictUserId: duplicateIdentityOwner.user_id }
          });
          writeAllWallets(wallets);
          throw createHttpError(
            409,
            `Pengajuan KYC ditolak server: Identitas KYC (${idTypeNorm}) ini sudah terdaftar pada akun game lain. Kebijakan sistem melarang 1 identitas KYC dipakai di lebih dari 1 akun.`,
            'DUPLICATE_KYC_IDENTITY',
            { flagged: true }
          );
        }

        const duplicateWalletOwner = otherWallets.find(
          (w) => w.kycWalletAddress && String(w.kycWalletAddress).trim().toLowerCase() === walletAddrNorm
        );
        if (duplicateWalletOwner) {
          sec.duplicateKycAttempts += 1;
          flagWalletSecurity(wallet, {
            flagCode: 'MULTI_ACCOUNT_WALLET',
            reason: `Alamat dompet USDT (${walletAddress.slice(0, 12)}...) sudah dipakai oleh akun ${duplicateWalletOwner.akun || duplicateWalletOwner.user_id}.`,
            scoreDelta: 40,
            meta,
            markFlagged: true,
            extraMeta: { conflictUserId: duplicateWalletOwner.user_id }
          });
          writeAllWallets(wallets);
          throw createHttpError(
            409,
            'Pengajuan KYC ditolak server: Alamat dompet USDT ini sudah terdaftar pada akun game lain.',
            'DUPLICATE_WITHDRAW_WALLET',
            { flagged: true }
          );
        }
      }

      const nowIso = new Date(nowFn()).toISOString();

      wallet.kycStatus = wallet.kycVerified ? 'verified' : 'pending';
      wallet.kycSubmittedAt = nowIso;
      wallet.kycFullName = fullName;
      wallet.kycIdType = idTypeNorm;
      wallet.kycIdentityHash = idHash;
      wallet.kycWalletAddress = walletAddress;
      wallet.updated_at = nowIso;
      recordWalletContext(wallet, meta);

      writeAllWallets(wallets);
      return {
        wallet: { ...wallet },
        message: wallet.kycVerified
          ? 'Akun Anda sudah terverifikasi KYC.'
          : 'Pengajuan KYC diterima server dan menunggu verifikasi Admin.'
      };
    });
  }

  function assertAdmin(authUser, message = 'Hanya Admin/Owner yang dapat mengakses fitur ini.') {
    const email = String(authUser?.email || '').toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) {
      throw createHttpError(403, message, 'FORBIDDEN');
    }
    return email;
  }

  async function adminVerifyKyc(authUser, body = {}) {
    assertAdmin(authUser, 'Hanya Admin/Owner yang dapat memverifikasi KYC.');

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

  function renumberQueuedItems(queue) {
    let pos = 1;
    for (const item of queue) {
      if (item.status === 'queued') {
        item.queuePosition = pos++;
      }
    }
  }

  async function adminApproveWithdraw(authUser, body = {}) {
    const adminEmail = assertAdmin(authUser, 'Hanya Admin/Owner yang dapat menyetujui (Approve) withdraw.');
    const withdrawId = String(body?.withdrawId || '').trim();
    if (!withdrawId) {
      throw createHttpError(400, 'ID request withdraw wajib diisi.', 'INVALID_WITHDRAW_ID');
    }

    const initialQueue = readWithdrawQueue();
    const initialTarget = initialQueue.find((q) => q.id === withdrawId);
    if (!initialTarget) {
      throw createHttpError(404, 'Request withdraw dalam antrean tidak ditemukan.', 'WITHDRAW_NOT_FOUND');
    }

    return withUserLock(initialTarget.user_id, () => {
      const queue = readWithdrawQueue();
      const targetItem = queue.find((q) => q.id === withdrawId);
      if (!targetItem) {
        throw createHttpError(404, 'Request withdraw dalam antrean tidak ditemukan.', 'WITHDRAW_NOT_FOUND');
      }
      if (targetItem.status !== 'queued' && targetItem.status !== 'hold') {
        throw createHttpError(
          409,
          `Request withdraw ${targetItem.id} sudah diproses sebelumnya (${targetItem.status}).`,
          'WITHDRAW_ALREADY_PROCESSED'
        );
      }

      const wallets = readAllWallets();
      const targetWallet = wallets[targetItem.user_id];
      const nowIso = new Date(nowFn()).toISOString();
      const prevStatus = targetItem.status;

      targetItem.status = 'approved';
      targetItem.reviewed_from_status = prevStatus;
      targetItem.approved_by = adminEmail;
      targetItem.approved_at = nowIso;
      targetItem.completed_at = nowIso;
      if (body?.txHash) {
        targetItem.txHash = String(body.txHash).trim().slice(0, 128);
      }
      renumberQueuedItems(queue);
      writeWithdrawQueue(queue);

      if (targetWallet) {
        if (targetWallet.activeWithdrawId === targetItem.id) {
          targetWallet.activeWithdrawId = null;
        }
        targetWallet.updated_at = nowIso;
        writeAllWallets(wallets);
      }

      return {
        withdraw: { ...targetItem },
        wallet: targetWallet ? { ...targetWallet } : null,
        message: `Withdraw ${targetItem.id} (${targetItem.netUsdt} USDT) berhasil di-Approve.`
      };
    });
  }

  async function adminRejectWithdraw(authUser, body = {}) {
    const adminEmail = assertAdmin(authUser, 'Hanya Admin/Owner yang dapat menolak (Reject) withdraw.');
    const withdrawId = String(body?.withdrawId || '').trim();
    if (!withdrawId) {
      throw createHttpError(400, 'ID request withdraw wajib diisi.', 'INVALID_WITHDRAW_ID');
    }

    const reason = String(body?.reason || 'Ditolak oleh Admin').trim().slice(0, 200) || 'Ditolak oleh Admin';
    const initialQueue = readWithdrawQueue();
    const initialTarget = initialQueue.find((q) => q.id === withdrawId);
    if (!initialTarget) {
      throw createHttpError(404, 'Request withdraw dalam antrean tidak ditemukan.', 'WITHDRAW_NOT_FOUND');
    }

    return withUserLock(initialTarget.user_id, () => {
      const cfg = loadConfig();
      const queue = readWithdrawQueue();
      const targetItem = queue.find((q) => q.id === withdrawId);
      if (!targetItem) {
        throw createHttpError(404, 'Request withdraw dalam antrean tidak ditemukan.', 'WITHDRAW_NOT_FOUND');
      }
      if (targetItem.status !== 'queued' && targetItem.status !== 'hold') {
        throw createHttpError(
          409,
          `Request withdraw ${targetItem.id} sudah diproses sebelumnya (${targetItem.status}).`,
          'WITHDRAW_ALREADY_PROCESSED'
        );
      }

      const wallets = readAllWallets();
      const targetWallet = getOrCreateWalletUnlocked(
        wallets,
        { uid: targetItem.user_id, email: targetItem.akun },
        cfg
      );
      const nowIso = new Date(nowFn()).toISOString();
      const refundDiamond = round4(targetItem.grossDiamond);
      const beforeDiamond = round4(targetWallet.diamond);
      const afterDiamond = round4(beforeDiamond + refundDiamond);

      targetWallet.diamond = afterDiamond;
      if (targetWallet.activeWithdrawId === targetItem.id) {
        targetWallet.activeWithdrawId = null;
      }

      if (targetItem.previousLastWithdrawAt !== undefined) {
        targetWallet.lastWithdrawAt = targetItem.previousLastWithdrawAt;
      } else {
        const previousValid = queue
          .filter((q) => q.user_id === targetItem.user_id && q.id !== targetItem.id && q.status !== 'rejected')
          .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
        targetWallet.lastWithdrawAt = previousValid ? previousValid.created_at : null;
      }
      targetWallet.updated_at = nowIso;

      targetItem.status = 'rejected';
      targetItem.reject_reason = reason;
      targetItem.rejected_by = adminEmail;
      targetItem.rejected_at = nowIso;
      targetItem.refundedDiamond = refundDiamond;
      renumberQueuedItems(queue);
      writeWithdrawQueue(queue);

      const ledgerEntry = appendImmutableLedgerEntry({
        user_id: targetItem.user_id,
        akun: targetWallet.akun || targetItem.akun,
        jenis_transaksi: 'masuk',
        kategori: 'withdraw_refund',
        mata_uang: 'diamond',
        jumlah: refundDiamond,
        fee: 0,
        saldo_sebelum: beforeDiamond,
        saldo_sesudah: afterDiamond,
        ref_id: targetItem.id,
        keterangan: `Withdraw ${targetItem.id} Ditolak Admin (Refund ${refundDiamond} Diamond): ${reason}`
      });

      writeAllWallets(wallets);

      return {
        withdraw: { ...targetItem },
        wallet: { ...targetWallet },
        ledgerEntry,
        refundedDiamond: refundDiamond,
        message: `Withdraw ${targetItem.id} ditolak & saldo ${refundDiamond} Diamond dikembalikan ke ${targetWallet.akun}.`
      };
    });
  }

  async function adminClearSecurityFlag(authUser, body = {}) {
    const adminEmail = assertAdmin(authUser, 'Hanya Admin/Owner yang dapat mereset status bendera keamanan.');
    const targetUid = String(body?.targetUid || '').trim();
    if (!targetUid) {
      throw createHttpError(400, 'targetUid wajib diisi.', 'INVALID_UID');
    }
    return withUserLock(targetUid, () => {
      const wallets = readAllWallets();
      const targetWallet = wallets[targetUid];
      if (!targetWallet) {
        throw createHttpError(404, 'Wallet user tidak ditemukan.', 'WALLET_NOT_FOUND');
      }
      const sec = ensureWalletSecurity(targetWallet);
      sec.flagged = false;
      sec.riskScore = 0;
      sec.flags = [];
      sec.clearedBy = adminEmail;
      sec.clearedAt = new Date(nowFn()).toISOString();
      targetWallet.updated_at = sec.clearedAt;
      appendSecurityEvent({
        user_id: targetUid,
        akun: targetWallet.akun,
        eventType: 'ADMIN_CLEAR_FLAG',
        severity: 'low',
        detail: `Flag keamanan dibersihkan oleh ${adminEmail}`
      });
      writeAllWallets(wallets);
      return { wallet: { ...targetWallet } };
    });
  }

  async function adminCompleteWithdraw(authUser, body = {}) {
    assertAdmin(authUser, 'Hanya Admin/Owner yang dapat menyelesaikan antrean withdraw.');

    const queue = readWithdrawQueue();
    const withdrawId = String(body?.withdrawId || '').trim();
    const targetItem = withdrawId
      ? queue.find((q) => q.id === withdrawId)
      : queue.find((q) => q.status === 'queued');

    if (!targetItem) {
      throw createHttpError(404, 'Request withdraw dalam antrean tidak ditemukan.', 'WITHDRAW_NOT_FOUND');
    }
    if (targetItem.status !== 'queued') {
      throw createHttpError(409, `Request withdraw ${targetItem.id} sudah diproses (${targetItem.status}).`, 'WITHDRAW_ALREADY_PROCESSED');
    }

    return withUserLock(targetItem.user_id, () => {
      const freshQueue = readWithdrawQueue();
      const freshItem = freshQueue.find((q) => q.id === targetItem.id);
      if (!freshItem || freshItem.status !== 'queued') {
        throw createHttpError(409, 'Request withdraw sudah diproses.', 'WITHDRAW_ALREADY_PROCESSED');
      }
      const wallets = readAllWallets();
      const targetWallet = wallets[freshItem.user_id];
      const nowIso = new Date(nowFn()).toISOString();

      freshItem.status = 'completed';
      freshItem.completed_at = nowIso;
      renumberQueuedItems(freshQueue);
      writeWithdrawQueue(freshQueue);

      if (targetWallet) {
        if (targetWallet.activeWithdrawId === freshItem.id) {
          targetWallet.activeWithdrawId = null;
        }
        targetWallet.updated_at = nowIso;
        writeAllWallets(wallets);
      }

      return { withdraw: { ...freshItem }, wallet: targetWallet ? { ...targetWallet } : null };
    });
  }

  function computePeriodEconomyMetrics(ledgerEntries, cfg, cutoffMs) {
    const goldToCurrency = Number(cfg.rates.goldToCurrency);
    const diamondToCurrency = Number(cfg.rates.diamondToCurrency);

    const toEquivCurrency = (mataUang, val) => {
      const num = Number(val || 0);
      if (mataUang === 'diamond') return num * diamondToCurrency;
      if (mataUang === 'gold') return num * goldToCurrency;
      return num;
    };

    const byCurrency = {
      currency: { masuk: 0, keluar: 0, net: 0 },
      gold: { masuk: 0, keluar: 0, net: 0 },
      diamond: { masuk: 0, keluar: 0, net: 0 }
    };

    const FAUCET_CATEGORIES = new Set(['match_reward', 'event_bonus_mingguan', 'transfer_jual']);
    const SINK_CATEGORIES = new Set([
      'weekly_sink_gaji_pemain',
      'weekly_sink_gaji_staf',
      'weekly_sink_stadion',
      'weekly_sink_akademi',
      'stadion_upgrade',
      'kantor_upgrade',
      'rekrut_staf',
      'akademi_scout',
      'akademi_upgrade',
      'transfer_beli'
    ]);

    let faucetCurrency = 0;
    let sinkCurrency = 0;
    let conversionFeeSinkCurrency = 0;
    let marketFeeSinkCurrency = 0;
    let withdrawFeeSinkCurrency = 0;
    let withdrawNetOutflowDiamond = 0;
    let transactionCount = 0;

    // Map withdrawId -> feeDiamond so rejected withdraws reverse any fee sink from that request
    const feeByWithdrawId = new Map();
    for (const e of ledgerEntries) {
      if (e.kategori === 'withdraw_request' && e.ref_id) {
        feeByWithdrawId.set(e.ref_id, Number(e.fee || 0));
      }
    }

    for (const entry of ledgerEntries) {
      if (cutoffMs !== null) {
        const ts = new Date(entry.waktu).getTime();
        if (!Number.isFinite(ts) || ts < cutoffMs) continue;
      }
      if (entry.kategori === 'admin_reset') continue;

      transactionCount += 1;
      const curr = entry.mata_uang;
      const jumlah = Number(entry.jumlah || 0);
      const fee = Number(entry.fee || 0);

      if (byCurrency[curr]) {
        if (entry.jenis_transaksi === 'masuk') {
          byCurrency[curr].masuk = round4(byCurrency[curr].masuk + jumlah);
        } else if (entry.jenis_transaksi === 'keluar') {
          byCurrency[curr].keluar = round4(byCurrency[curr].keluar + jumlah);
        }
      }

      if (FAUCET_CATEGORIES.has(entry.kategori) && entry.jenis_transaksi === 'masuk') {
        faucetCurrency += toEquivCurrency(curr, jumlah);
      }

      if (SINK_CATEGORIES.has(entry.kategori) && entry.jenis_transaksi === 'keluar') {
        sinkCurrency += toEquivCurrency(curr, jumlah);
      }

      if (entry.kategori === 'konversi_masuk' && fee > 0) {
        const feeEq = toEquivCurrency(curr, fee);
        sinkCurrency += feeEq;
        conversionFeeSinkCurrency += feeEq;
      }

      if (entry.kategori === 'transfer_jual' && fee > 0) {
        const feeEq = toEquivCurrency(curr, fee);
        sinkCurrency += feeEq;
        marketFeeSinkCurrency += feeEq;
      }

      if (entry.kategori === 'withdraw_request') {
        const feeEq = toEquivCurrency('diamond', fee);
        sinkCurrency += feeEq;
        withdrawFeeSinkCurrency += feeEq;
        withdrawNetOutflowDiamond += Math.max(0, jumlah - fee);
      }

      if (entry.kategori === 'withdraw_refund') {
        const origFee = feeByWithdrawId.get(entry.ref_id) || 0;
        const feeEq = toEquivCurrency('diamond', origFee);
        sinkCurrency = Math.max(0, sinkCurrency - feeEq);
        withdrawFeeSinkCurrency = Math.max(0, withdrawFeeSinkCurrency - feeEq);
        withdrawNetOutflowDiamond = Math.max(0, withdrawNetOutflowDiamond - Math.max(0, jumlah - origFee));
      }
    }

    for (const curr of Object.keys(byCurrency)) {
      byCurrency[curr].net = round4(byCurrency[curr].masuk - byCurrency[curr].keluar);
    }

    const totalFaucetCurrency = round2(faucetCurrency);
    const totalSinkCurrency = round2(sinkCurrency);
    const netEmissionCurrency = round2(totalFaucetCurrency - totalSinkCurrency);
    const sinkCoveragePercent = totalFaucetCurrency > 0
      ? round2((totalSinkCurrency / totalFaucetCurrency) * 100)
      : (totalSinkCurrency > 0 ? 100 : 0);

    return {
      transactionCount,
      totalFaucetCurrency,
      totalSinkCurrency,
      netEmissionCurrency,
      totalFaucetDiamond: round4(totalFaucetCurrency / diamondToCurrency),
      totalSinkDiamond: round4(totalSinkCurrency / diamondToCurrency),
      netEmissionDiamond: round4(netEmissionCurrency / diamondToCurrency),
      sinkCoveragePercent,
      sinkBreakdownCurrency: {
        gameplayAndWeekly: round2(totalSinkCurrency - conversionFeeSinkCurrency - marketFeeSinkCurrency - withdrawFeeSinkCurrency),
        conversionFees: round2(conversionFeeSinkCurrency),
        marketFees: round2(marketFeeSinkCurrency),
        withdrawFees: round2(withdrawFeeSinkCurrency)
      },
      withdrawNetOutflowDiamond: round4(withdrawNetOutflowDiamond),
      byCurrency
    };
  }

  async function getAdminEconomyDashboard(authUser) {
    assertAdmin(authUser, 'Hanya Admin/Owner yang dapat melihat dashboard ekonomi.');

    const cfg = loadConfig();
    const walletsObj = readAllWallets();
    const allWallets = Object.values(walletsObj);
    const queue = readWithdrawQueue();
    const ledgerEntries = readAllLedgerEntries();
    const nowMs = nowFn();

    const metrics = {
      allTime: computePeriodEconomyMetrics(ledgerEntries, cfg, null),
      daily: computePeriodEconomyMetrics(ledgerEntries, cfg, nowMs - DAY_MS),
      weekly: computePeriodEconomyMetrics(ledgerEntries, cfg, nowMs - 7 * DAY_MS),
      monthly: computePeriodEconomyMetrics(ledgerEntries, cfg, nowMs - 30 * DAY_MS)
    };

    const diamondToGold = Number(cfg.rates.diamondToGold);
    const diamondToCurrency = Number(cfg.rates.diamondToCurrency);
    const diamondToUsdt = Number(cfg.rates.diamondToUsdt);

    const circulatingDiamonds = round4(allWallets.reduce((s, w) => s + Number(w.diamond || 0), 0));
    const circulatingGold = round4(allWallets.reduce((s, w) => s + Number(w.gold || 0), 0));
    const circulatingCurrency = round2(allWallets.reduce((s, w) => s + Number(w.currency || 0), 0));

    const queuedItems = queue.filter((q) => q.status === 'queued' || q.status === 'hold');
    const holdItems = queue.filter((q) => q.status === 'hold');
    const queuedWithdrawDiamonds = round4(queuedItems.reduce((s, q) => s + Number(q.grossDiamond || 0), 0));
    const queuedWithdrawNetUsdt = round2(queuedItems.reduce((s, q) => s + Number(q.netUsdt || 0), 0));
    const totalDiamondLiability = round4(circulatingDiamonds + queuedWithdrawDiamonds);
    const totalUsdtLiability = round2(totalDiamondLiability * diamondToUsdt);

    const rankedWallets = allWallets.map((w) => {
      const diamond = round4(w.diamond || 0);
      const gold = round4(w.gold || 0);
      const currency = round2(w.currency || 0);
      const equivalentDiamond = round4(
        diamond + (gold / diamondToGold) + (currency / diamondToCurrency)
      );
      return {
        user_id: w.user_id,
        akun: w.akun || w.user_id,
        diamond,
        gold,
        currency,
        equivalentDiamond,
        equivalentUsdt: round2(equivalentDiamond * diamondToUsdt),
        kycStatus: w.kycStatus || (w.kycVerified ? 'verified' : 'unverified'),
        activeWithdrawId: w.activeWithdrawId || null
      };
    }).sort((a, b) => {
      if (b.equivalentDiamond !== a.equivalentDiamond) return b.equivalentDiamond - a.equivalentDiamond;
      if (b.diamond !== a.diamond) return b.diamond - a.diamond;
      if (b.gold !== a.gold) return b.gold - a.gold;
      return b.currency - a.currency;
    });

    const totalSystemEquivDiamond = round4(rankedWallets.reduce((s, w) => s + w.equivalentDiamond, 0));
    const top1Count = rankedWallets.length === 0 ? 0 : Math.max(1, Math.ceil(rankedWallets.length * 0.01));
    const top1Users = rankedWallets.slice(0, top1Count).map((w, idx) => ({
      rank: idx + 1,
      ...w,
      sharePercent: totalSystemEquivDiamond > 0
        ? round2((w.equivalentDiamond / totalSystemEquivDiamond) * 100)
        : 0
    }));

    const sortedQueue = [...queue].sort((a, b) => {
      const rankStatus = (s) => (s === 'hold' ? 0 : (s === 'queued' ? 1 : 2));
      const ra = rankStatus(a.status);
      const rb = rankStatus(b.status);
      if (ra !== rb) return ra - rb;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    const flaggedAccounts = allWallets
      .filter((w) => w.security?.flagged || (w.security?.riskScore || 0) > 0)
      .map((w) => {
        const sec = ensureWalletSecurity(w);
        return {
          user_id: w.user_id,
          akun: w.akun || w.user_id,
          flagged: Boolean(sec.flagged),
          riskScore: Number(sec.riskScore || 0),
          flags: [...sec.flags],
          flagReasons: [...sec.flagReasons],
          botSpamAttempts: sec.botSpamAttempts,
          fastMatchAttempts: sec.fastMatchAttempts,
          duplicateKycAttempts: sec.duplicateKycAttempts,
          holdCount: sec.holdCount,
          lastIp: sec.lastIp,
          lastDeviceId: sec.lastDeviceId,
          lastFlaggedAt: sec.lastFlaggedAt
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore);

    const topupRequests = [...readTopupRequests()].sort((a, b) => {
      const rank = (s) => (s === 'PENDING_VERIFICATION' ? 0 : 1);
      const ra = rank(a.status);
      const rb = rank(b.status);
      if (ra !== rb) return ra - rb;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
    const topupPendingCount = topupRequests.filter((r) => r.status === 'PENDING_VERIFICATION').length;

    return {
      rates: cfg.rates,
      metrics,
      liability: {
        totalUsers: allWallets.length,
        circulatingDiamonds,
        circulatingGold,
        circulatingCurrency,
        queuedCount: queuedItems.length,
        holdCount: holdItems.length,
        topupPendingCount,
        queuedWithdrawDiamonds,
        queuedWithdrawNetUsdt,
        totalDiamondLiability,
        totalUsdtLiability
      },
      withdrawQueue: sortedQueue,
      topupQueue: topupRequests,
      top1Percent: {
        topCount: top1Count,
        totalUsers: rankedWallets.length,
        thresholdPercent: 1,
        totalSystemEquivDiamond,
        users: top1Users
      },
      securitySummary: {
        flaggedAccountsCount: flaggedAccounts.filter((a) => a.flagged).length,
        holdWithdrawCount: holdItems.length,
        flaggedAccounts,
        recentEvents: readSecurityEvents(30)
      }
    };
  }

  function evaluateWithdrawSuspicion(wallet, walletsObj, ledgerEntries, requestedDiamond, cfg, meta, nowMs) {
    const reasons = [];
    let riskDelta = 0;
    const sec = ensureWalletSecurity(wallet);
    const anti = cfg.antiAbuse || {};

    // 1. Akun sudah ditandai oleh Anti-Bot atau Anti Multi-Akun
    if (sec.flagged) {
      reasons.push(`Akun sebelumnya ditandai sistem keamanan (${sec.flags.join(', ') || 'FLAGGED'})`);
      riskDelta += 45;
    }

    // 2. Deteksi Lonjakan Saldo Tidak Wajar vs catatan Ledger
    const myEntries = ledgerEntries.filter((e) => e.user_id === wallet.user_id);
    let ledgerDiamondIn = 0;
    let ledgerDiamondOut = 0;
    let dailyCurrencyGain = 0;
    const dayAgo = nowMs - DAY_MS;

    for (const e of myEntries) {
      const amt = Number(e.jumlah || 0);
      if (e.mata_uang === 'diamond') {
        if (e.jenis_transaksi === 'masuk') ledgerDiamondIn += amt;
        if (e.jenis_transaksi === 'keluar') ledgerDiamondOut += amt;
      }
      if (e.mata_uang === 'currency' && e.jenis_transaksi === 'masuk' && (e.kategori === 'match_reward' || e.kategori === 'event_bonus_mingguan')) {
        const ts = new Date(e.waktu).getTime();
        if (Number.isFinite(ts) && ts >= dayAgo) {
          dailyCurrencyGain += amt;
        }
      }
    }
    const verifiedNetDiamond = round4(ledgerDiamondIn - ledgerDiamondOut);
    if (round4(wallet.diamond) > round4(verifiedNetDiamond + 0.01)) {
      const unexplained = round4(wallet.diamond - verifiedNetDiamond);
      reasons.push(`Lonjakan saldo Diamond tidak wajar (+${unexplained} D tidak memiliki jejak konversi/pendapatan di Ledger)`);
      riskDelta += 50;
    }

    const maxDailyCurrency = Number(anti.maxExpectedDailyCurrencyGain || 30000);
    if (dailyCurrencyGain > maxDailyCurrency) {
      reasons.push(`Lonjakan pendapatan 24 jam (${dailyCurrencyGain.toLocaleString('id-ID')} C) melebihi batas wajar (${maxDailyCurrency.toLocaleString('id-ID')} C)`);
      riskDelta += 35;
    }

    // 3. Deteksi IP / Device mencurigakan
    if (anti.holdOnNewIpOrDevice !== false) {
      if (meta.ip && sec.knownIps.length > 0 && !sec.knownIps.includes(meta.ip)) {
        reasons.push(`IP withdraw berbeda dari riwayat normal akun (${meta.ip})`);
        riskDelta += 30;
      }
      if (meta.deviceId && sec.knownDevices.length > 0 && !sec.knownDevices.includes(meta.deviceId)) {
        reasons.push(`Device ID withdraw tidak dikenal (${meta.deviceId})`);
        riskDelta += 35;
      }
    }

    if (meta.proxyHopCount > 2 || meta.suspiciousFlag) {
      reasons.push(`Sinyal jaringan / proxy mencurigakan (hop: ${meta.proxyHopCount})`);
      riskDelta += 25;
    }

    // Cek apakah IP atau Device ini dipakai bersama akun KYC / withdraw lain
    const otherWallets = Object.values(walletsObj).filter((w) => w.user_id !== wallet.user_id);
    if (meta.deviceId) {
      const sharedDev = otherWallets.find((w) => (w.security?.knownDevices || []).includes(meta.deviceId) && (w.kycSubmittedAt || w.activeWithdrawId));
      if (sharedDev) {
        reasons.push(`Device ID (${meta.deviceId}) terdeteksi dipakai bersama akun lain (${sharedDev.akun || sharedDev.user_id})`);
        riskDelta += 40;
      }
    }
    if (meta.ip) {
      const sharedIp = otherWallets.find((w) => (w.security?.knownIps || []).includes(meta.ip) && (w.kycSubmittedAt || w.activeWithdrawId));
      if (sharedIp) {
        reasons.push(`IP (${meta.ip}) terdeteksi dipakai bersama akun withdraw/KYC lain (${sharedIp.akun || sharedIp.user_id})`);
        riskDelta += 30;
      }
    }

    return {
      isSuspicious: reasons.length > 0 && anti.holdOnSuspiciousActivity !== false,
      reasons,
      riskDelta
    };
  }

  async function requestWithdraw(authUser, body = {}, reqMeta = {}) {
    return withUserLock(authUser.uid, () => {
      const cfg = loadConfig();
      const wallets = readAllWallets();
      const wallet = getOrCreateWalletUnlocked(wallets, authUser, cfg);
      const queue = readWithdrawQueue();
      const ledgerEntries = readAllLedgerEntries();
      const nowMs = nowFn();
      const meta = normalizeRequestMeta(reqMeta);
      const sec = ensureWalletSecurity(wallet);

      const tampered = detectTamperedFields(body, [
        'fee', 'feePercent', 'netUsdt', 'netDiamond', 'status', 'instant',
        'balance', 'user_id', 'kycVerified', 'accountAgeDays', 'bypassCooldown', 'bypassGate', 'bypassHold'
      ]);

      const wd = cfg.withdraw;
      const requestedDiamond = body?.amount !== undefined ? Number(body.amount) : Number(wd.minDiamond);
      const gate = evaluateWithdrawGate(wallet, queue, cfg, requestedDiamond, nowMs);

      // 1. Cek anti-spam: maksimal 1 request aktif per akun
      if (!gate.checks.noActiveRequestOk) {
        throw createHttpError(
          409,
          `Request ditolak server: Maksimal ${gate.maxActiveRequests} request withdraw aktif per akun. Request Anda (${gate.activeRequestId}) masih berada dalam antrean (queue/hold).`,
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

      // 7. Cek kembali keunikan identitas KYC sebelum withdraw diproses
      if (cfg.guards?.oneKycIdentityPerWithdrawAccount !== false && wallet.kycIdentityHash) {
        const dupOwner = Object.values(wallets).find(
          (w) => w.user_id !== authUser.uid && w.kycIdentityHash === wallet.kycIdentityHash
        );
        if (dupOwner) {
          throw createHttpError(
            409,
            'Request ditolak server: Terdeteksi duplikasi identitas KYC antar akun.',
            'DUPLICATE_KYC_IDENTITY',
            { gate }
          );
        }
      }

      // 8. Suspicious Activity Hold Check
      const suspicion = evaluateWithdrawSuspicion(wallet, wallets, ledgerEntries, requestedDiamond, cfg, meta, nowMs);
      const targetStatus = suspicion.isSuspicious ? 'hold' : 'queued';

      const feePercent = Number(wd.feePercent);
      const feeDiamond = round4(requestedDiamond * (feePercent / 100));
      const netDiamond = round4(requestedDiamond - feeDiamond);
      const netUsdt = round2(netDiamond * Number(cfg.rates.diamondToUsdt));
      const wdId = `WD-${nowMs}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const nowIso = new Date(nowMs).toISOString();

      const afterDiamond = round4(beforeDiamond - requestedDiamond);
      wallet.diamond = afterDiamond;
      wallet.activeWithdrawId = wdId;
      wallet.updated_at = nowIso;

      if (suspicion.isSuspicious) {
        sec.holdCount += 1;
        flagWalletSecurity(wallet, {
          flagCode: 'WITHDRAW_AUTO_HOLD',
          reason: `Withdraw ${wdId} otomatis ditangguhkan (HOLD): ${suspicion.reasons.join(' | ')}`,
          scoreDelta: suspicion.riskDelta,
          meta,
          markFlagged: true,
          eventType: 'WITHDRAW_AUTO_HOLD',
          severity: 'high',
          extraMeta: { withdrawId: wdId, reasons: suspicion.reasons }
        });
      } else {
        recordWalletContext(wallet, meta);
      }

      const queuePosition = targetStatus === 'queued'
        ? queue.filter((q) => q.status === 'queued').length + 1
        : null;

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
        status: targetStatus,
        holdReasons: suspicion.isSuspicious ? suspicion.reasons : [],
        riskScoreAtRequest: sec.riskScore,
        requestIp: meta.ip,
        requestDeviceId: meta.deviceId,
        queuePosition,
        processingMode: suspicion.isSuspicious ? 'manual_security_hold' : wd.processingMode,
        accountAgeDaysAtRequest: gate.accountAgeDays,
        previousLastWithdrawAt: wallet.lastWithdrawAt || null,
        created_at: nowIso
      };
      wallet.lastWithdrawAt = nowIso;
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
        keterangan: suspicion.isSuspicious
          ? `Withdraw ${requestedDiamond} Diamond → Net ${netUsdt} USDT [HOLD - Review Admin: ${suspicion.reasons[0]}]`
          : `Withdraw ${requestedDiamond} Diamond → Net ${netUsdt} USDT (fee ${feePercent}%, antrean #${queuePosition}, mode: ${wd.processingMode})`
      });

      writeAllWallets(wallets);

      return {
        wallet: { ...wallet },
        withdraw: queueRecord,
        heldForReview: suspicion.isSuspicious,
        holdReasons: suspicion.isSuspicious ? suspicion.reasons : [],
        ledgerEntry,
        gate: evaluateWithdrawGate(wallet, queue, cfg, Number(wd.minDiamond), nowMs),
        message: suspicion.isSuspicious
          ? `Withdraw ${wdId} masuk status HOLD (ditangguhkan) untuk review manual Admin karena terdeteksi aktivitas mencurigakan.`
          : `Withdraw ${wdId} berhasil masuk antrean #${queuePosition}.`,
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

  function validateReceiptImage(dataUrl) {
    if (dataUrl === undefined || dataUrl === null || dataUrl === '') return null;
    if (typeof dataUrl !== 'string') {
      throw createHttpError(400, 'Format foto struk tidak valid.', 'INVALID_RECEIPT_IMAGE');
    }
    const trimmed = dataUrl.trim();
    if (trimmed.length > 2 * 1024 * 1024) {
      throw createHttpError(400, 'Ukuran foto struk maksimal 2 MB.', 'RECEIPT_IMAGE_TOO_LARGE');
    }
    const match = trimmed.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) {
      throw createHttpError(400, 'Foto struk harus berupa gambar PNG, JPG, atau WEBP.', 'INVALID_RECEIPT_IMAGE');
    }
    return trimmed;
  }

  function getTopupConfig() {
    const cfg = loadConfig();
    return { topUp: cfg.topUp || null };
  }

  async function getSolanaQrSvg() {
    const cfg = loadConfig();
    const addr = String(cfg?.topUp?.solana?.walletAddress || '').trim();
    if (!addr) {
      throw createHttpError(500, 'Alamat wallet Solana belum dikonfigurasi.', 'SOLANA_CONFIG_MISSING');
    }
    return QRCode.toString(addr, {
      type: 'svg',
      width: 220,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
  }

  async function submitTopupRequest(authUser, body = {}, reqMeta = {}) {
    return withUserLock(authUser.uid, () => {
      const cfg = loadConfig();
      const topUpCfg = cfg.topUp || {};
      const packages = topUpCfg.packages || {};
      const wallets = readAllWallets();
      const wallet = getOrCreateWalletUnlocked(wallets, authUser, cfg);
      const meta = normalizeRequestMeta(reqMeta);
      const requests = readTopupRequests();

      const tampered = detectTamperedFields(body, [
        'status', 'diamonds', 'bonusGold', 'bonus_gold', 'gold', 'priceIdr', 'price_idr',
        'priceUsdt', 'price_usdt', 'user_id', 'approved_by', 'approved_at'
      ]);

      const packageId = String(body?.packageId || '').trim().toLowerCase();
      const pkg = packages[packageId];
      if (!pkg) {
        throw createHttpError(400, 'Paket top-up tidak valid atau tidak ditemukan.', 'INVALID_TOPUP_PACKAGE');
      }

      const paymentMethod = String(body?.paymentMethod || '').trim().toLowerCase();
      if (paymentMethod !== 'dana_qris' && paymentMethod !== 'usdt_solana') {
        throw createHttpError(400, 'Metode pembayaran harus QRIS DANA Bisnis atau Crypto (USDT Solana).', 'INVALID_PAYMENT_METHOD');
      }

      let referenceNumber = null;
      let receiptImage = null;
      let txid = null;
      let proofNorm = null;

      if (paymentMethod === 'dana_qris') {
        referenceNumber = typeof body?.referenceNumber === 'string'
          ? body.referenceNumber.trim().slice(0, 80)
          : '';
        receiptImage = validateReceiptImage(body?.receiptImage);

        if (!referenceNumber && !receiptImage) {
          throw createHttpError(
            400,
            'Untuk QRIS DANA Bisnis, wajib mengisi Nomor Referensi atau mengunggah Foto Struk transfer.',
            'MISSING_DANA_PROOF'
          );
        }
        if (referenceNumber && referenceNumber.length < 4) {
          throw createHttpError(
            400,
            'Nomor Referensi DANA minimal 4 karakter.',
            'INVALID_DANA_REFERENCE'
          );
        }
        if (referenceNumber) {
          proofNorm = `DANA:${referenceNumber.replace(/\s+/g, '').toUpperCase()}`;
          const dup = requests.find(
            (r) => r.status !== 'REJECTED' && r.proof_norm && r.proof_norm === proofNorm
          );
          if (dup) {
            throw createHttpError(
              409,
              `Nomor Referensi (${referenceNumber}) sudah pernah digunakan pada transaksi ${dup.id}.`,
              'DUPLICATE_TOPUP_PROOF'
            );
          }
        } else {
          referenceNumber = null;
        }
      } else {
        txid = typeof body?.txid === 'string' ? body.txid.trim() : '';
        if (!/^[A-Za-z0-9]{16,128}$/.test(txid)) {
          throw createHttpError(
            400,
            'TXID (Transaction Hash) Solana tidak valid. Masukkan 16-128 karakter alfanumerik.',
            'INVALID_SOLANA_TXID'
          );
        }
        proofNorm = `SOL:${txid}`;
        const dup = requests.find(
          (r) => r.status !== 'REJECTED' && r.proof_norm && r.proof_norm === proofNorm
        );
        if (dup) {
          throw createHttpError(
            409,
            `TXID (${txid}) sudah pernah digunakan pada transaksi ${dup.id}.`,
            'DUPLICATE_TOPUP_PROOF'
          );
        }
      }

      const nowMs = nowFn();
      const nowIso = new Date(nowMs).toISOString();
      const topupId = `TOP-${nowMs}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const methodLabel = paymentMethod === 'dana_qris'
        ? (topUpCfg.dana?.label || 'QRIS DANA Bisnis')
        : (topUpCfg.solana?.label || 'Crypto (USDT Solana)');

      const record = {
        id: topupId,
        user_id: authUser.uid,
        akun: wallet.akun || authUser.email || authUser.uid,
        package_id: pkg.id,
        package_name: pkg.name,
        payment_method: paymentMethod,
        payment_method_label: methodLabel,
        price_idr: Number(pkg.priceIdr),
        price_usdt: Number(pkg.priceUsdt),
        diamonds: Number(pkg.diamonds),
        bonus_gold: Number(pkg.bonusGold || 0),
        reference_number: referenceNumber || null,
        receipt_image: receiptImage || null,
        txid: txid || null,
        proof_norm: proofNorm,
        status: 'PENDING_VERIFICATION',
        request_ip: meta.ip,
        request_device_id: meta.deviceId,
        created_at: nowIso,
        updated_at: nowIso
      };

      requests.push(record);
      writeTopupRequests(requests);

      recordWalletContext(wallet, meta);
      writeAllWallets(wallets);

      return {
        topup: { ...record },
        wallet: { ...wallet },
        message: `Permintaan Top-Up ${pkg.name} (${topupId}) berhasil dikirim dengan status PENDING_VERIFICATION. Saldo akan ditambahkan setelah diverifikasi Admin.`,
        serverValidation: {
          sourceOfTruth: 'economy.config.json',
          immediateBalanceAdded: false,
          ignoredClientFields: tampered
        }
      };
    });
  }

  async function getMyTopupRequests(authUser) {
    const requests = readTopupRequests();
    const mine = requests
      .filter((r) => r.user_id === authUser.uid)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    return { requests: mine };
  }

  async function getAdminTopupQueue(authUser, opts = {}) {
    assertAdmin(authUser, 'Hanya Admin/Owner yang dapat melihat antrean Top-Up.');
    const requests = readTopupRequests();
    const sorted = [...requests].sort((a, b) => {
      const rank = (s) => (s === 'PENDING_VERIFICATION' ? 0 : 1);
      const ra = rank(a.status);
      const rb = rank(b.status);
      if (ra !== rb) return ra - rb;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
    const statusFilter = typeof opts?.status === 'string' && opts.status.trim()
      ? opts.status.trim().toUpperCase()
      : null;
    const filtered = statusFilter
      ? sorted.filter((r) => String(r.status || '').toUpperCase() === statusFilter)
      : sorted;
    const pendingCount = sorted.filter((r) => r.status === 'PENDING_VERIFICATION').length;
    return {
      requests: filtered,
      pendingCount,
      totalCount: sorted.length
    };
  }

  async function adminApproveTopup(authUser, body = {}) {
    const adminEmail = assertAdmin(authUser, 'Hanya Admin/Owner yang dapat menyetujui (Approve) Top-Up.');
    const topupId = String(body?.topupId || '').trim();
    if (!topupId) {
      throw createHttpError(400, 'ID transaksi Top-Up wajib diisi.', 'INVALID_TOPUP_ID');
    }

    const initialRequests = readTopupRequests();
    const initialTarget = initialRequests.find((r) => r.id === topupId);
    if (!initialTarget) {
      throw createHttpError(404, 'Permintaan Top-Up tidak ditemukan.', 'TOPUP_NOT_FOUND');
    }

    return withUserLock(initialTarget.user_id, () => {
      const cfg = loadConfig();
      const requests = readTopupRequests();
      const target = requests.find((r) => r.id === topupId);
      if (!target) {
        throw createHttpError(404, 'Permintaan Top-Up tidak ditemukan.', 'TOPUP_NOT_FOUND');
      }
      if (target.status !== 'PENDING_VERIFICATION') {
        throw createHttpError(
          409,
          `Transaksi Top-Up ${target.id} sudah diproses sebelumnya (${target.status}).`,
          'TOPUP_ALREADY_PROCESSED'
        );
      }

      const wallets = readAllWallets();
      const targetWallet = getOrCreateWalletUnlocked(
        wallets,
        { uid: target.user_id, email: target.akun },
        cfg
      );
      const nowIso = new Date(nowFn()).toISOString();
      const creditDiamonds = round4(target.diamonds || 0);
      const creditGold = round4(target.bonus_gold || 0);

      const beforeDiamond = round4(targetWallet.diamond);
      const afterDiamond = round4(beforeDiamond + creditDiamonds);
      targetWallet.diamond = afterDiamond;

      const beforeGold = round4(targetWallet.gold);
      const afterGold = round4(beforeGold + creditGold);
      targetWallet.gold = afterGold;
      targetWallet.updated_at = nowIso;

      const proofLabel = target.txid
        ? `TXID: ${target.txid}`
        : (target.reference_number ? `Ref: ${target.reference_number}` : 'Foto Struk');

      const ledgerEntries = [];
      if (creditDiamonds > 0) {
        ledgerEntries.push(appendImmutableLedgerEntry({
          user_id: target.user_id,
          akun: targetWallet.akun || target.akun,
          jenis_transaksi: 'masuk',
          kategori: 'topup_diamond',
          mata_uang: 'diamond',
          jumlah: creditDiamonds,
          fee: 0,
          saldo_sebelum: beforeDiamond,
          saldo_sesudah: afterDiamond,
          ref_id: target.id,
          keterangan: `Top-Up Paket ${target.package_name} (${target.payment_method_label}) disetujui Admin [${proofLabel}]`
        }));
      }

      if (creditGold > 0) {
        ledgerEntries.push(appendImmutableLedgerEntry({
          user_id: target.user_id,
          akun: targetWallet.akun || target.akun,
          jenis_transaksi: 'masuk',
          kategori: 'topup_bonus_gold',
          mata_uang: 'gold',
          jumlah: creditGold,
          fee: 0,
          saldo_sebelum: beforeGold,
          saldo_sesudah: afterGold,
          ref_id: target.id,
          keterangan: `Bonus Gold Top-Up Paket ${target.package_name} (${target.payment_method_label}) disetujui Admin`
        }));
      }

      target.status = 'APPROVED';
      target.approved_by = adminEmail;
      target.approved_at = nowIso;
      target.updated_at = nowIso;
      target.ledger_entry_ids = ledgerEntries.map((e) => e.id);

      writeTopupRequests(requests);
      writeAllWallets(wallets);

      return {
        topup: { ...target },
        wallet: { ...targetWallet },
        ledgerEntries,
        message: `Top-Up ${target.id} disetujui! +${creditDiamonds} Diamond & +${creditGold} Gold ditambahkan ke ${targetWallet.akun} lewat Ledger.`
      };
    });
  }

  async function adminRejectTopup(authUser, body = {}) {
    const adminEmail = assertAdmin(authUser, 'Hanya Admin/Owner yang dapat menolak (Reject) Top-Up.');
    const topupId = String(body?.topupId || '').trim();
    if (!topupId) {
      throw createHttpError(400, 'ID transaksi Top-Up wajib diisi.', 'INVALID_TOPUP_ID');
    }
    const reason = String(body?.reason || 'Bukti transfer tidak valid / tidak ditemukan').trim().slice(0, 200)
      || 'Bukti transfer tidak valid / tidak ditemukan';

    const initialRequests = readTopupRequests();
    const initialTarget = initialRequests.find((r) => r.id === topupId);
    if (!initialTarget) {
      throw createHttpError(404, 'Permintaan Top-Up tidak ditemukan.', 'TOPUP_NOT_FOUND');
    }

    return withUserLock(initialTarget.user_id, () => {
      const requests = readTopupRequests();
      const target = requests.find((r) => r.id === topupId);
      if (!target) {
        throw createHttpError(404, 'Permintaan Top-Up tidak ditemukan.', 'TOPUP_NOT_FOUND');
      }
      if (target.status !== 'PENDING_VERIFICATION') {
        throw createHttpError(
          409,
          `Transaksi Top-Up ${target.id} sudah diproses sebelumnya (${target.status}).`,
          'TOPUP_ALREADY_PROCESSED'
        );
      }

      const nowIso = new Date(nowFn()).toISOString();
      target.status = 'REJECTED';
      target.reject_reason = reason;
      target.rejected_by = adminEmail;
      target.rejected_at = nowIso;
      target.updated_at = nowIso;

      writeTopupRequests(requests);

      return {
        topup: { ...target },
        message: `Top-Up ${target.id} ditolak (${reason}). Saldo player tetap tidak bertambah.`
      };
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
    adminApproveWithdraw,
    adminRejectWithdraw,
    adminClearSecurityFlag,
    getAdminEconomyDashboard,
    claimMatchReward,
    executeConversion,
    settleWeeklySink,
    requestWithdraw,
    spendOrTrade,
    adminResetWallet,
    getTopupConfig,
    getSolanaQrSvg,
    submitTopupRequest,
    getMyTopupRequests,
    getAdminTopupQueue,
    adminApproveTopup,
    adminRejectTopup,
    readAllLedgerEntries,
    readWithdrawQueue,
    readTopupRequests,
    readSecurityEvents
  };
}

function mountEconomyRoutes(app, service) {
  function extractRequestMeta(req) {
    return {
      ip: req.ip || req.socket?.remoteAddress || '',
      forwardedFor: req.headers['x-forwarded-for'] || '',
      deviceId: req.headers['x-device-id'] || req.body?.deviceId || '',
      userAgent: req.headers['user-agent'] || ''
    };
  }

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
      const data = await service.getWallet(req.authUser, extractRequestMeta(req));
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
      const data = await service.submitKyc(req.authUser, req.body || {}, extractRequestMeta(req));
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

  app.get('/api/economy/admin/dashboard', requireAuth, async (req, res) => {
    try {
      const data = await service.getAdminEconomyDashboard(req.authUser);
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/admin/security/unflag', requireAuth, async (req, res) => {
    try {
      const data = await service.adminClearSecurityFlag(req.authUser, req.body || {});
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/admin/withdraw/approve', requireAuth, async (req, res) => {
    try {
      const data = await service.adminApproveWithdraw(req.authUser, req.body || {});
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/admin/withdraw/reject', requireAuth, async (req, res) => {
    try {
      const data = await service.adminRejectWithdraw(req.authUser, req.body || {});
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
      const result = await service.claimMatchReward(req.authUser, req.body || {}, extractRequestMeta(req));
      return res.json({ success: true, ...result });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/convert', requireAuth, async (req, res) => {
    try {
      const result = await service.executeConversion(req.authUser, req.body || {}, extractRequestMeta(req));
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
      const result = await service.requestWithdraw(req.authUser, req.body || {}, extractRequestMeta(req));
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

  app.get('/api/economy/topup/config', (req, res) => {
    try {
      const data = service.getTopupConfig();
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.get('/api/economy/topup/solana-qr.svg', async (req, res) => {
    try {
      const svg = await service.getSolanaQrSvg();
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(svg);
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.get('/api/economy/topup/my-requests', requireAuth, async (req, res) => {
    try {
      const data = await service.getMyTopupRequests(req.authUser);
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/topup/request', requireAuth, async (req, res) => {
    try {
      const data = await service.submitTopupRequest(req.authUser, req.body || {}, extractRequestMeta(req));
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  const handleGetAdminTopupQueue = async (req, res) => {
    try {
      const data = await service.getAdminTopupQueue(req.authUser, { status: req.query?.status });
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  };

  const handlePostAdminTopupApprove = async (req, res) => {
    try {
      const data = await service.adminApproveTopup(req.authUser, req.body || {});
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  };

  const handlePostAdminTopupReject = async (req, res) => {
    try {
      const data = await service.adminRejectTopup(req.authUser, req.body || {});
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  };

  app.get('/api/economy/admin/topup/queue', requireAuth, handleGetAdminTopupQueue);
  app.get('/api/economy/admin/topup-queue', requireAuth, handleGetAdminTopupQueue);
  app.get('/api/admin/topup/queue', requireAuth, handleGetAdminTopupQueue);
  app.get('/api/admin/topup-queue', requireAuth, handleGetAdminTopupQueue);

  app.post('/api/economy/admin/topup/approve', requireAuth, handlePostAdminTopupApprove);
  app.post('/api/admin/topup/approve', requireAuth, handlePostAdminTopupApprove);

  app.post('/api/economy/admin/topup/reject', requireAuth, handlePostAdminTopupReject);
  app.post('/api/admin/topup/reject', requireAuth, handlePostAdminTopupReject);
}

module.exports = {
  createEconomyService,
  mountEconomyRoutes
};
