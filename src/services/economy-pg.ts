import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express, NextFunction, Request, Response } from 'express';
import { and, desc, eq, ne, or, sql } from 'drizzle-orm';
import QRCode from 'qrcode';
import { db } from '../db/index.ts';
import {
  ledger,
  matches,
  profiles,
  securityEvents,
  topupRequests,
  withdrawQueue
} from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';

export const ADMIN_EMAILS = [
  'muhammadgazali75@gmail.com',
  'angriyani1977@gmail.com',
  'm.gazali1975@gmail.com'
];

const DEFAULT_MATCH_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const WEEKLY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface AuthUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  createdAtMs: number | null;
}

export interface RequestMetaInput {
  ip?: string;
  forwardedFor?: string;
  xForwardedFor?: string;
  deviceId?: string;
  userAgent?: string;
  suspiciousFlag?: boolean;
}

export interface LondonTimeInfo {
  nowMs: number;
  utcIso: string;
  dateTime: string;
  timeZone: string;
  londonDate: string;
  londonTime: string;
  londonZoneAbbr: string;
  isDstBst: boolean;
  wibResetTime: string;
  londonWeekKey: string;
}

export interface HttpError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown> | null;
}

interface SecurityState {
  flagged: boolean;
  riskScore: number;
  flags: string[];
  flagReasons: string[];
  botSpamAttempts: number;
  fastMatchAttempts: number;
  duplicateKycAttempts: number;
  holdCount: number;
  matchAttemptTimestamps: number[];
  rewardedMatchIds: string[];
  knownIps: string[];
  knownDevices: string[];
  lastIp: string | null;
  lastDeviceId: string | null;
  lastFlaggedAt: string | null;
  clearedBy?: string | null;
  clearedAt?: string | null;
  pendingMatch?: {
    matchId: string;
    opponent: string;
    homeScore: number;
    awayScore: number;
    result: 'win' | 'draw' | 'lose';
    createdAtMs: number;
    startedAt: string;
  } | null;
}

interface EconomyConfig {
  version: string;
  starterBalance: {
    diamonds: number;
    gold: number;
    currency: number;
  };
  rates: {
    diamondToUsdt: number;
    diamondToGold: number;
    goldToCurrency: number;
    diamondToCurrency: number;
  };
  withdraw: {
    minDiamond: number;
    feePercent: number;
    minAccountAgeDays: number;
    cooldownDays: number;
    maxActiveRequestsPerAccount: number;
    requireKycBeforeFirstWithdraw: boolean;
    processingMode: string;
  };
  fees: {
    marketTaxPercent: number;
    listingFeePercent: number;
    currencyToGoldFeePercent: number;
    goldToDiamondFeePercent: number;
  };
  matchReward: {
    perMatchCurrency: number;
    maxMatchesPerDay: number;
    winBonusCurrency: number;
    drawBonusCurrency: number;
    lossBonusCurrency: number;
    eventBonusCurrency: number;
  };
  weeklySink: {
    playerSalariesCurrency: number;
    staffSalariesCurrency: number;
    stadiumMaintenanceCurrency: number;
    youthAcademyCurrency: number;
  };
  defaultPrices: {
    players: {
      rookieGold: { min: number; max: number };
      topGold: { min: number; max: number };
    };
    staff: {
      regularGold: { min: number; max: number };
    };
    upgrades: {
      stadiumGold: { min: number; max: number };
      academyGold: { min: number; max: number };
    };
  };
  guards?: {
    oneKycIdentityPerWithdrawAccount?: boolean;
  };
  antiAbuse?: {
    minMatchIntervalSeconds?: number;
    maxMatchRequestsPerHour?: number;
    botFlagThresholdAttempts?: number;
    maxExpectedDailyCurrencyGain?: number;
    holdOnSuspiciousActivity?: boolean;
    holdOnNewIpOrDevice?: boolean;
  };
  topUp?: {
    dana?: { label?: string };
    solana?: { label?: string; walletAddress?: string };
    packages?: Record<
      string,
      {
        id: string;
        name: string;
        priceIdr: number;
        priceUsdt: number;
        diamonds: number;
        bonusGold?: number;
      }
    >;
  };
}

function round4(val: unknown): number {
  return Math.round((Number(val || 0) + Number.EPSILON) * 10000) / 10000;
}

function round2(val: unknown): number {
  return Math.round((Number(val || 0) + Number.EPSILON) * 100) / 100;
}

function createHttpError(
  status: number,
  message: string,
  code = 'ECONOMY_ERROR',
  details: Record<string, unknown> | null = null
): HttpError {
  const err = new Error(message) as HttpError;
  err.status = status;
  err.code = code;
  if (details) err.details = details;
  return err;
}

function isHttpError(err: unknown): err is HttpError {
  return Boolean(err && typeof err === 'object' && 'status' in err && typeof (err as HttpError).status === 'number');
}

function sanitizeDbError(err: unknown, contextMsg: string): never {
  if (isHttpError(err)) {
    throw err;
  }
  console.error(`[CloudSQL] ${contextMsg}:`, err);
  const wrapped = createHttpError(
    500,
    'Terjadi gangguan sementara pada layanan database. Silakan coba lagi beberapa saat.',
    'DATABASE_ERROR'
  );
  (wrapped as Error & { cause?: unknown }).cause = err;
  throw wrapped;
}

export function getLondonTimeInfo(nowMs = Date.now()): LondonTimeInfo {
  const dt = new Date(nowMs);
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(dt);
  const getPart = (parts: Intl.DateTimeFormatPart[], type: string) =>
    parts.find((p) => p.type === type)?.value || '';
  const londonDate = `${getPart(dateParts, 'year')}-${getPart(dateParts, 'month')}-${getPart(dateParts, 'day')}`;

  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  }).formatToParts(dt);
  const londonTime = `${getPart(timeParts, 'hour')}:${getPart(timeParts, 'minute')}:${getPart(timeParts, 'second')}`;
  const londonZoneAbbr = getPart(timeParts, 'timeZoneName') || 'GMT';
  const isDstBst = londonZoneAbbr === 'BST' || londonZoneAbbr.includes('+1');
  const wibResetTime = isDstBst ? '06:00 WIB' : '07:00 WIB';

  const [y, m, d] = londonDate.split('-').map(Number);
  const londonUtcMidnight = new Date(Date.UTC(y, m - 1, d));
  const dayNum = londonUtcMidnight.getUTCDay() || 7;
  const thursday = new Date(londonUtcMidnight);
  thursday.setUTCDate(londonUtcMidnight.getUTCDate() + (4 - dayNum));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((thursday.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const londonWeekKey = `${thursday.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;

  return {
    nowMs,
    utcIso: dt.toISOString(),
    dateTime: dt.toISOString(),
    timeZone: 'Europe/London',
    londonDate,
    londonTime,
    londonZoneAbbr,
    isDstBst,
    wibResetTime,
    londonWeekKey
  };
}

function normalizeSecurity(raw: unknown): SecurityState {
  const s = raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {};
  return {
    flagged: Boolean(s.flagged),
    riskScore: Number.isFinite(Number(s.riskScore)) ? Number(s.riskScore) : 0,
    flags: Array.isArray(s.flags) ? s.flags.map(String) : [],
    flagReasons: Array.isArray(s.flagReasons) ? s.flagReasons.map(String) : [],
    botSpamAttempts: Number.isFinite(Number(s.botSpamAttempts)) ? Number(s.botSpamAttempts) : 0,
    fastMatchAttempts: Number.isFinite(Number(s.fastMatchAttempts)) ? Number(s.fastMatchAttempts) : 0,
    duplicateKycAttempts: Number.isFinite(Number(s.duplicateKycAttempts)) ? Number(s.duplicateKycAttempts) : 0,
    holdCount: Number.isFinite(Number(s.holdCount)) ? Number(s.holdCount) : 0,
    matchAttemptTimestamps: Array.isArray(s.matchAttemptTimestamps)
      ? s.matchAttemptTimestamps.map(Number).filter(Number.isFinite)
      : [],
    rewardedMatchIds: Array.isArray(s.rewardedMatchIds) ? s.rewardedMatchIds.map(String) : [],
    knownIps: Array.isArray(s.knownIps) ? s.knownIps.map(String) : [],
    knownDevices: Array.isArray(s.knownDevices) ? s.knownDevices.map(String) : [],
    lastIp: typeof s.lastIp === 'string' ? s.lastIp : null,
    lastDeviceId: typeof s.lastDeviceId === 'string' ? s.lastDeviceId : null,
    lastFlaggedAt: typeof s.lastFlaggedAt === 'string' ? s.lastFlaggedAt : null,
    clearedBy: typeof s.clearedBy === 'string' ? s.clearedBy : null,
    clearedAt: typeof s.clearedAt === 'string' ? s.clearedAt : null,
    pendingMatch:
      s.pendingMatch && typeof s.pendingMatch === 'object'
        ? (s.pendingMatch as SecurityState['pendingMatch'])
        : null
  };
}

function normalizeRequestMeta(reqMeta: RequestMetaInput = {}) {
  const rawForwarded = String(reqMeta?.forwardedFor || reqMeta?.xForwardedFor || '').trim();
  const forwardedList = rawForwarded
    ? rawForwarded
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
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

function recordContextIntoSecurity(sec: SecurityState, meta: ReturnType<typeof normalizeRequestMeta>): boolean {
  let changed = false;
  if (meta.ip) {
    if (sec.lastIp !== meta.ip) {
      sec.lastIp = meta.ip;
      changed = true;
    }
    if (!sec.knownIps.includes(meta.ip)) {
      sec.knownIps.push(meta.ip);
      if (sec.knownIps.length > 10) sec.knownIps = sec.knownIps.slice(-10);
      changed = true;
    }
  }
  if (meta.deviceId) {
    if (sec.lastDeviceId !== meta.deviceId) {
      sec.lastDeviceId = meta.deviceId;
      changed = true;
    }
    if (!sec.knownDevices.includes(meta.deviceId)) {
      sec.knownDevices.push(meta.deviceId);
      if (sec.knownDevices.length > 10) sec.knownDevices = sec.knownDevices.slice(-10);
      changed = true;
    }
  }
  return changed;
}

type ProfileRow = typeof profiles.$inferSelect;
type LedgerRow = typeof ledger.$inferSelect;
type WithdrawRow = typeof withdrawQueue.$inferSelect;
type TopupRow = typeof topupRequests.$inferSelect;
type SecurityEventRow = typeof securityEvents.$inferSelect;

function profileToWallet(row: ProfileRow) {
  const kycData = (row.kycData && typeof row.kycData === 'object' ? row.kycData : {}) as Record<string, unknown>;
  const sec = normalizeSecurity(row.security);
  const lastMatchIso = row.lastMatchTimestamp ? row.lastMatchTimestamp.toISOString() : null;
  return {
    user_id: row.uid,
    uid: row.uid,
    akun: row.email,
    diamond: round4(row.diamond),
    gold: round4(row.gold),
    currency: round4(row.currency),
    matchesToday: Number(row.dailyMatches || 0),
    dailyMatches: Number(row.dailyMatches || 0),
    lastDailyReset: row.lastMatchDate || null,
    lastMatchDate: row.lastMatchDate || null,
    lastMatchAt: lastMatchIso,
    lastMatchTimestamp: lastMatchIso,
    lastWeeklyClaimAt: row.lastWeeklyClaimAt ? row.lastWeeklyClaimAt.toISOString() : null,
    lastWeeklyWeekKey: row.lastWeeklyWeekKey || null,
    lastWeeklyLondonDate: row.lastWeeklyLondonDate || null,
    activeWithdrawId: row.activeWithdrawId || null,
    lastWithdrawAt: row.lastWithdrawAt ? row.lastWithdrawAt.toISOString() : null,
    kycVerified: Boolean(row.kycVerified),
    kycStatus: row.kycStatus || (row.kycVerified ? 'verified' : 'unverified'),
    kycSubmittedAt: row.kycSubmittedAt ? row.kycSubmittedAt.toISOString() : null,
    kycVerifiedAt: row.kycVerifiedAt ? row.kycVerifiedAt.toISOString() : null,
    kycIdentityHash: row.kycIdentityHash || null,
    kycFullName: typeof kycData.fullName === 'string' ? kycData.fullName : null,
    kycIdType: typeof kycData.idType === 'string' ? kycData.idType : null,
    kycWalletAddress: typeof kycData.walletAddress === 'string' ? kycData.walletAddress : null,
    accountCreatedAt: row.accountCreatedAt ? row.accountCreatedAt.toISOString() : row.createdAt.toISOString(),
    totalMatches: Number(row.totalMatches || 0),
    security: sec,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

function ledgerRowToClient(row: LedgerRow) {
  return {
    id: row.id,
    seq: row.seq,
    waktu: row.waktu.toISOString(),
    user_id: row.userId,
    akun: row.akun,
    jenis_transaksi: row.jenisTransaksi,
    kategori: row.kategori,
    mata_uang: row.mataUang,
    jumlah: round4(row.jumlah),
    fee: round4(row.fee),
    saldo_sebelum: round4(row.saldoSebelum),
    saldo_sesudah: round4(row.saldoSesudah),
    ref_id: row.refId || null,
    keterangan: row.keterangan || ''
  };
}

function withdrawRowToClient(row: WithdrawRow) {
  const payload = (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, unknown>;
  return {
    ...payload,
    id: row.id,
    user_id: row.userId,
    akun: row.akun,
    status: row.status,
    created_at: typeof payload.created_at === 'string' ? payload.created_at : row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

function topupRowToClient(row: TopupRow) {
  const payload = (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, unknown>;
  return {
    ...payload,
    id: row.id,
    user_id: row.userId,
    akun: row.akun,
    status: row.status,
    payment_method: row.paymentMethod,
    package_id: row.packageId,
    created_at: typeof payload.created_at === 'string' ? payload.created_at : row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

function securityEventRowToClient(row: SecurityEventRow) {
  return {
    id: row.id,
    seq: row.seq,
    waktu: row.waktu.toISOString(),
    user_id: row.userId,
    akun: row.akun,
    eventType: row.eventType,
    severity: row.severity,
    ip: row.ip || null,
    deviceId: row.deviceId || null,
    detail: row.detail || '',
    meta: row.meta || null
  };
}

function detectTamperedFields(body: unknown, forbiddenKeys: string[]): string[] {
  if (!body || typeof body !== 'object') return [];
  return forbiddenKeys.filter((k) => Object.prototype.hasOwnProperty.call(body, k));
}

export interface EconomyPgServiceOptions {
  rootDir?: string;
  configPath?: string;
  nowFn?: () => number;
  matchCooldownMs?: number;
  weeklyCooldownMs?: number;
  verifyTokenFn?: (idToken: string) => Promise<AuthUser>;
}

export function createEconomyPgService(options: EconomyPgServiceOptions = {}) {
  const rootDir = options.rootDir || process.cwd();
  const configPath = options.configPath || path.join(rootDir, 'economy.config.json');
  const nowFn = typeof options.nowFn === 'function' ? options.nowFn : () => Date.now();
  const matchCooldownMs = Number.isFinite(options.matchCooldownMs)
    ? Number(options.matchCooldownMs)
    : DEFAULT_MATCH_COOLDOWN_MS;
  const weeklyCooldownMs = Number.isFinite(options.weeklyCooldownMs)
    ? Number(options.weeklyCooldownMs)
    : WEEKLY_COOLDOWN_MS;

  function loadConfig(): EconomyConfig {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw) as EconomyConfig;
  }

  async function verifyFirebaseIdToken(idToken: string): Promise<AuthUser> {
    if (typeof options.verifyTokenFn === 'function') {
      return options.verifyTokenFn(idToken);
    }
    if (typeof idToken !== 'string' || !idToken.trim()) {
      throw createHttpError(401, 'Token autentikasi Firebase tidak ditemukan.', 'AUTH_MISSING');
    }
    try {
      const decoded = await adminAuth.verifyIdToken(idToken.trim());
      if (!decoded || !decoded.uid) {
        throw createHttpError(401, 'Akun pengguna tidak terverifikasi.', 'AUTH_USER_NOT_FOUND');
      }
      const authTimeMs = Number.isFinite(decoded.auth_time) ? decoded.auth_time * 1000 : null;
      return {
        uid: decoded.uid,
        email: decoded.email || '',
        emailVerified: Boolean(decoded.email_verified),
        createdAtMs: authTimeMs
      };
    } catch (err) {
      if (isHttpError(err)) throw err;
      throw createHttpError(401, 'Token login tidak valid atau kedaluwarsa.', 'AUTH_INVALID');
    }
  }

  type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  async function getOrCreateProfileTx(tx: DbTx, authUser: AuthUser, cfg: EconomyConfig): Promise<ProfileRow> {
    const nowMs = nowFn();
    const nowDt = new Date(nowMs);
    const starter = cfg.starterBalance;
    const accountCreatedAt = Number.isFinite(authUser.createdAtMs)
      ? new Date(Number(authUser.createdAtMs))
      : nowDt;

    await tx
      .insert(profiles)
      .values({
        uid: authUser.uid,
        email: authUser.email || authUser.uid,
        diamond: Number(starter.diamonds),
        gold: Number(starter.gold),
        currency: Number(starter.currency),
        dailyMatches: 0,
        totalMatches: 0,
        kycVerified: false,
        kycStatus: 'unverified',
        security: normalizeSecurity({}),
        accountCreatedAt,
        createdAt: nowDt,
        updatedAt: nowDt
      })
      .onConflictDoNothing({ target: profiles.uid });

    const [row] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.uid, authUser.uid))
      .for('update');

    if (!row) {
      throw createHttpError(500, 'Gagal memuat profil wallet pemain.', 'PROFILE_LOAD_FAILED');
    }

    if (authUser.email && (!row.email || row.email === row.uid)) {
      const [updated] = await tx
        .update(profiles)
        .set({ email: authUser.email, updatedAt: nowDt })
        .where(eq(profiles.uid, authUser.uid))
        .returning();
      return updated;
    }

    return row;
  }

  async function insertImmutableLedgerTx(
    tx: DbTx,
    entry: {
      user_id: string;
      akun: string;
      jenis_transaksi: 'masuk' | 'keluar';
      kategori: string;
      mata_uang: 'currency' | 'gold' | 'diamond';
      jumlah: number;
      fee?: number;
      saldo_sebelum: number;
      saldo_sesudah: number;
      ref_id?: string | null;
      keterangan?: string;
    }
  ) {
    const nowMs = nowFn();
    const id = `LDG-${nowMs}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const [inserted] = await tx
      .insert(ledger)
      .values({
        id,
        waktu: new Date(nowMs),
        userId: String(entry.user_id),
        akun: String(entry.akun || entry.user_id),
        jenisTransaksi: entry.jenis_transaksi,
        kategori: String(entry.kategori),
        mataUang: entry.mata_uang,
        jumlah: round4(entry.jumlah),
        fee: round4(entry.fee || 0),
        saldoSebelum: round4(entry.saldo_sebelum),
        saldoSesudah: round4(entry.saldo_sesudah),
        refId: entry.ref_id ? String(entry.ref_id) : null,
        keterangan: String(entry.keterangan || '')
      })
      .returning();
    return ledgerRowToClient(inserted);
  }

  async function insertSecurityEventTx(
    tx: DbTx,
    event: {
      user_id: string;
      akun: string;
      eventType: string;
      severity?: string;
      ip?: string | null;
      deviceId?: string | null;
      detail?: string;
      meta?: Record<string, unknown> | null;
    }
  ) {
    const nowMs = nowFn();
    const id = `SEC-${nowMs}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const [inserted] = await tx
      .insert(securityEvents)
      .values({
        id,
        waktu: new Date(nowMs),
        userId: String(event.user_id || ''),
        akun: String(event.akun || event.user_id || ''),
        eventType: String(event.eventType || 'SECURITY_ALERT'),
        severity: String(event.severity || 'medium'),
        ip: event.ip || null,
        deviceId: event.deviceId || null,
        detail: String(event.detail || ''),
        meta: event.meta || null
      })
      .returning();
    return securityEventRowToClient(inserted);
  }

  async function flagProfileSecurityTx(
    tx: DbTx,
    row: ProfileRow,
    sec: SecurityState,
    params: {
      flagCode: string;
      reason: string;
      scoreDelta?: number;
      meta?: ReturnType<typeof normalizeRequestMeta>;
      markFlagged?: boolean;
      eventType?: string;
      severity?: string;
      extraMeta?: Record<string, unknown> | null;
    }
  ) {
    const nowIso = new Date(nowFn()).toISOString();
    if (params.markFlagged !== false) {
      sec.flagged = true;
      sec.lastFlaggedAt = nowIso;
    }
    sec.riskScore = Math.min(100, Number(sec.riskScore || 0) + Number(params.scoreDelta || 0));
    if (params.flagCode && !sec.flags.includes(params.flagCode)) {
      sec.flags.push(params.flagCode);
    }
    if (params.reason) {
      sec.flagReasons.push(`${nowIso.slice(0, 19)}Z: ${params.reason}`);
      if (sec.flagReasons.length > 15) sec.flagReasons = sec.flagReasons.slice(-15);
    }

    await insertSecurityEventTx(tx, {
      user_id: row.uid,
      akun: row.email,
      eventType: params.eventType || params.flagCode,
      severity: params.severity || 'high',
      ip: params.meta?.ip || null,
      deviceId: params.meta?.deviceId || null,
      detail: params.reason,
      meta: params.extraMeta || null
    });
  }

  function assertAdmin(authUser: AuthUser, message = 'Hanya Admin/Owner yang dapat mengakses fitur ini.') {
    const email = String(authUser?.email || '').toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) {
      throw createHttpError(403, message, 'FORBIDDEN');
    }
    return email;
  }

  async function getWallet(authUser: AuthUser, reqMeta: RequestMetaInput = {}) {
    try {
      const cfg = loadConfig();
      const meta = normalizeRequestMeta(reqMeta);
      const wallet = await db.transaction(async (tx) => {
        const row = await getOrCreateProfileTx(tx, authUser, cfg);
        const sec = normalizeSecurity(row.security);
        const changed = recordContextIntoSecurity(sec, meta);
        if (changed) {
          const [updated] = await tx
            .update(profiles)
            .set({ security: sec, updatedAt: new Date(nowFn()) })
            .where(eq(profiles.uid, authUser.uid))
            .returning();
          return profileToWallet(updated);
        }
        return profileToWallet(row);
      });
      return {
        wallet,
        configVersion: cfg.version
      };
    } catch (err) {
      sanitizeDbError(err, 'getWallet');
    }
  }

  async function getLedger(authUser: AuthUser, opts: { limit?: unknown } = {}) {
    try {
      const limit = Math.min(Math.max(Number(opts.limit || 100), 1), 500);
      const rows = await db
        .select()
        .from(ledger)
        .where(eq(ledger.userId, authUser.uid))
        .orderBy(desc(ledger.seq))
        .limit(limit);
      return rows.map(ledgerRowToClient);
    } catch (err) {
      sanitizeDbError(err, 'getLedger');
    }
  }

  async function startMatch(authUser: AuthUser, _body: Record<string, unknown> = {}, reqMeta: RequestMetaInput = {}) {
    try {
      const cfg = loadConfig();
      const meta = normalizeRequestMeta(reqMeta);
      const anti = cfg.antiAbuse || {};

      return await db.transaction(async (tx) => {
        const row = await getOrCreateProfileTx(tx, authUser, cfg);
        const sec = normalizeSecurity(row.security);
        const nowMs = nowFn();
        const londonInfo = getLondonTimeInfo(nowMs);
        const serverDateTime = londonInfo.utcIso;
        const todayStr = londonInfo.londonDate;

        // Reset hitungan harian HANYA jika tanggal London berubah; JANGAN pernah sentuh lastMatchTimestamp (cooldown 4 jam)!
        const effectiveDailyMatches = row.lastMatchDate === todayStr ? Number(row.dailyMatches || 0) : 0;

        const maxMatchesPerDay = Number(cfg.matchReward.maxMatchesPerDay);
        if (effectiveDailyMatches >= maxMatchesPerDay) {
          throw createHttpError(
            429,
            `Batas harian tercapai! Anda sudah memainkan ${maxMatchesPerDay} pertandingan hari ini.`,
            'DAILY_MATCH_LIMIT',
            { matchesToday: effectiveDailyMatches, maxMatchesPerDay, serverNowMs: nowMs, serverDateTime }
          );
        }

        const minIntervalSec = Number(anti.minMatchIntervalSeconds || 120);
        if (row.lastMatchTimestamp) {
          const lastMs = row.lastMatchTimestamp.getTime();
          const elapsedMs = nowMs - lastMs;
          if (Number.isFinite(lastMs) && elapsedMs < minIntervalSec * 1000) {
            const elapsedSec = Math.max(0, Math.round(elapsedMs / 1000));
            throw createHttpError(
              429,
              `Permintaan ditolak sistem Anti-Bot: Tunggu minimal ${minIntervalSec} detik antar pertandingan (baru ${elapsedSec} detik).`,
              'BOT_MATCH_TOO_FAST',
              { elapsedSec, minIntervalSec, serverNowMs: nowMs, serverDateTime }
            );
          }
          if (matchCooldownMs > 0 && Number.isFinite(lastMs) && elapsedMs < matchCooldownMs) {
            const remainMinutes = Math.ceil((matchCooldownMs - elapsedMs) / 60000);
            throw createHttpError(
              429,
              `Cooldown match aktif. Tunggu ${remainMinutes} menit lagi.`,
              'MATCH_COOLDOWN',
              { remainMinutes, serverNowMs: nowMs, serverDateTime }
            );
          }
        }

        const opponents = [
          'Garuda Esports',
          'Naga Merah',
          'Banteng FC',
          'Elang Jawa',
          'Harimau Sumatra',
          'Satria Muda',
          'Bima Sakti',
          'Persija Jakarta',
          'Persib Bandung'
        ];
        const opponent = opponents[crypto.randomInt(0, opponents.length)];
        const homeScore = crypto.randomInt(0, 6);
        const awayScore = crypto.randomInt(0, 6);
        const result: 'win' | 'draw' | 'lose' =
          homeScore > awayScore ? 'win' : homeScore === awayScore ? 'draw' : 'lose';
        const matchId = `MCH-${nowMs}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

        sec.pendingMatch = {
          matchId,
          opponent,
          homeScore,
          awayScore,
          result,
          createdAtMs: nowMs,
          startedAt: serverDateTime
        };
        recordContextIntoSecurity(sec, meta);

        await tx
          .update(profiles)
          .set({
            dailyMatches: effectiveDailyMatches,
            lastMatchDate: todayStr,
            security: sec,
            updatedAt: new Date(nowMs)
          })
          .where(eq(profiles.uid, authUser.uid));

        return {
          match: {
            matchId,
            opponent,
            homeScore,
            awayScore,
            result,
            startedAt: serverDateTime
          },
          matchesToday: effectiveDailyMatches,
          dailyMatches: effectiveDailyMatches,
          maxMatchesPerDay,
          serverNowMs: nowMs,
          serverDateTime,
          todayStr,
          serverTime: londonInfo,
          nextMatchAvailableAt: new Date(nowMs + matchCooldownMs).toISOString()
        };
      });
    } catch (err) {
      sanitizeDbError(err, 'startMatch');
    }
  }

  async function claimMatchReward(authUser: AuthUser, body: Record<string, unknown> = {}, reqMeta: RequestMetaInput = {}) {
    try {
      const cfg = loadConfig();
      const meta = normalizeRequestMeta(reqMeta);
      const anti = cfg.antiAbuse || {};

      const tampered = detectTamperedFields(body, [
        'reward',
        'amount',
        'currency',
        'diamonds',
        'gold',
        'balance',
        'newBalance',
        'user_id',
        'uid'
      ]);

      return await db.transaction(async (tx) => {
        const row = await getOrCreateProfileTx(tx, authUser, cfg);
        const sec = normalizeSecurity(row.security);
        const nowMs = nowFn();
        const londonInfo = getLondonTimeInfo(nowMs);
        const todayStr = londonInfo.londonDate;

        // Reset hitungan harian ke 0 jika hari London berganti; lastMatchTimestamp (cooldown 4 jam) TETAP bertahan
        const currentDailyMatches = row.lastMatchDate === todayStr ? Number(row.dailyMatches || 0) : 0;

        const oneHourAgo = nowMs - 60 * 60 * 1000;
        sec.matchAttemptTimestamps = sec.matchAttemptTimestamps.filter((ts) => Number(ts) >= oneHourAgo);
        sec.matchAttemptTimestamps.push(nowMs);

        const maxPerHour = Number(anti.maxMatchRequestsPerHour || 10);
        const minIntervalSec = Number(anti.minMatchIntervalSeconds || 120);
        const flagThreshold = Number(anti.botFlagThresholdAttempts || 3);
        const attemptsIn1Min = sec.matchAttemptTimestamps.filter((ts) => nowMs - Number(ts) <= 60 * 1000).length;

        if (sec.matchAttemptTimestamps.length > maxPerHour) {
          sec.botSpamAttempts += 1;
          await flagProfileSecurityTx(tx, row, sec, {
            flagCode: 'BOT_HOURLY_RATE_LIMIT',
            reason: `Bot rate limit terlampaui (${sec.matchAttemptTimestamps.length} request match dalam 1 jam, batas ${maxPerHour}/jam).`,
            scoreDelta: 40,
            meta,
            markFlagged: true
          });
          await tx
            .update(profiles)
            .set({ security: sec, updatedAt: new Date(nowMs) })
            .where(eq(profiles.uid, authUser.uid));
          throw createHttpError(
            429,
            `Akses ditolak sistem Anti-Bot: Terlalu banyak request match dalam 1 jam (${sec.matchAttemptTimestamps.length}/${maxPerHour}). Akun Anda telah ditandai untuk review.`,
            'BOT_RATE_LIMIT',
            { flagged: true, security: sec }
          );
        }

        const incomingMatchId =
          typeof body?.matchId === 'string' && body.matchId.trim() ? body.matchId.trim().slice(0, 128) : null;

        let alreadyClaimedMatch = false;
        if (incomingMatchId) {
          if (sec.rewardedMatchIds.includes(incomingMatchId)) {
            alreadyClaimedMatch = true;
          } else {
            const [existingMatch] = await tx
              .select({ id: matches.id })
              .from(matches)
              .where(eq(matches.id, incomingMatchId))
              .limit(1);
            if (existingMatch) alreadyClaimedMatch = true;
          }
        }

        if (alreadyClaimedMatch && incomingMatchId) {
          sec.botSpamAttempts += 1;
          await flagProfileSecurityTx(tx, row, sec, {
            flagCode: 'BOT_REPLAY_MATCH',
            reason: `Percobaan klaim ulang Match ID duplikat (${incomingMatchId}).`,
            scoreDelta: 30,
            meta,
            markFlagged: sec.botSpamAttempts >= flagThreshold
          });
          await tx
            .update(profiles)
            .set({ security: sec, updatedAt: new Date(nowMs) })
            .where(eq(profiles.uid, authUser.uid));
          throw createHttpError(
            409,
            `Permintaan ditolak server: Match ID (${incomingMatchId}) sudah pernah diklaim sebelumnya.`,
            'DUPLICATE_MATCH_ID'
          );
        }

        if (row.lastMatchTimestamp) {
          const lastMs = row.lastMatchTimestamp.getTime();
          const elapsedMs = nowMs - lastMs;
          if (Number.isFinite(lastMs) && elapsedMs < minIntervalSec * 1000) {
            sec.fastMatchAttempts += 1;
            sec.botSpamAttempts += 1;
            const elapsedSec = Math.max(0, Math.round(elapsedMs / 1000));
            const shouldFlag = attemptsIn1Min >= flagThreshold || sec.fastMatchAttempts >= 2;
            await flagProfileSecurityTx(tx, row, sec, {
              flagCode: 'BOT_RAPID_MATCH',
              reason: `Interval match tidak wajar (${elapsedSec} detik setelah match sebelumnya, minimal ${minIntervalSec} detik). Percobaan 1 menit terakhir: ${attemptsIn1Min}.`,
              scoreDelta: shouldFlag ? 35 : 15,
              meta,
              markFlagged: shouldFlag
            });
            await tx
              .update(profiles)
              .set({ security: sec, updatedAt: new Date(nowMs) })
              .where(eq(profiles.uid, authUser.uid));
            throw createHttpError(
              429,
              `Permintaan ditolak sistem Anti-Bot: Waktu penyelesaian match terlalu cepat (${elapsedSec} detik, minimal ${minIntervalSec} detik antar match).${shouldFlag ? ' Akun telah ditandai mencurigakan.' : ''}`,
              'BOT_MATCH_TOO_FAST',
              { flagged: sec.flagged, elapsedSec, minIntervalSec, attemptsIn1Min }
            );
          }
        }

        const maxMatchesPerDay = Number(cfg.matchReward.maxMatchesPerDay);
        if (currentDailyMatches >= maxMatchesPerDay) {
          sec.botSpamAttempts += 1;
          if (attemptsIn1Min >= flagThreshold || sec.botSpamAttempts >= flagThreshold) {
            await flagProfileSecurityTx(tx, row, sec, {
              flagCode: 'BOT_DAILY_SPAM',
              reason: `Spam request setelah batas harian (${maxMatchesPerDay} match/hari) tercapai.`,
              scoreDelta: 25,
              meta,
              markFlagged: true
            });
          }
          await tx
            .update(profiles)
            .set({
              dailyMatches: currentDailyMatches,
              lastMatchDate: todayStr,
              security: sec,
              updatedAt: new Date(nowMs)
            })
            .where(eq(profiles.uid, authUser.uid));
          throw createHttpError(
            429,
            `Batas harian tercapai! Maksimal ${maxMatchesPerDay} match per hari.${sec.flagged ? ' Aktivitas spam Anda telah ditandai.' : ''}`,
            'DAILY_MATCH_LIMIT',
            { flagged: sec.flagged }
          );
        }

        if (row.lastMatchTimestamp && matchCooldownMs > 0) {
          const lastMs = row.lastMatchTimestamp.getTime();
          if (Number.isFinite(lastMs) && nowMs - lastMs < matchCooldownMs) {
            sec.botSpamAttempts += 1;
            if (attemptsIn1Min >= flagThreshold || sec.botSpamAttempts >= flagThreshold) {
              await flagProfileSecurityTx(tx, row, sec, {
                flagCode: 'BOT_COOLDOWN_SPAM',
                reason: `Spam request match selama masa cooldown.`,
                scoreDelta: 25,
                meta,
                markFlagged: true
              });
            }
            await tx
              .update(profiles)
              .set({ security: sec, updatedAt: new Date(nowMs) })
              .where(eq(profiles.uid, authUser.uid));
            const remainMinutes = Math.ceil((matchCooldownMs - (nowMs - lastMs)) / 60000);
            throw createHttpError(
              429,
              `Cooldown match aktif. Tunggu ${remainMinutes} menit lagi.`,
              'MATCH_COOLDOWN',
              { flagged: sec.flagged }
            );
          }
        }

        const allowedResults = new Set(['win', 'draw', 'lose']);
        const hasPending = Boolean(
          sec.pendingMatch && (!incomingMatchId || sec.pendingMatch.matchId === incomingMatchId)
        );
        const pending = sec.pendingMatch;
        const result: 'win' | 'draw' | 'lose' = hasPending && pending
          ? pending.result
          : allowedResults.has(String(body?.result))
            ? (body.result as 'win' | 'draw' | 'lose')
            : 'lose';
        const opponent = hasPending && pending
          ? pending.opponent
          : typeof body?.opponent === 'string' && body.opponent.trim()
            ? body.opponent.trim().slice(0, 80)
            : 'Lawan';
        const homeScore = hasPending && pending ? Number(pending.homeScore || 0) : result === 'win' ? 2 : result === 'draw' ? 1 : 0;
        const awayScore = hasPending && pending ? Number(pending.awayScore || 0) : result === 'win' ? 0 : result === 'draw' ? 1 : 2;
        const matchId = hasPending && pending ? pending.matchId : incomingMatchId || `MCH-${nowMs}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        const startedAt = hasPending && pending ? new Date(pending.startedAt) : new Date(nowMs);

        const mr = cfg.matchReward;
        const base = Number(mr.perMatchCurrency);
        const eventBonus = Number(mr.eventBonusCurrency || 0);
        const outcomeBonus =
          result === 'win'
            ? Number(mr.winBonusCurrency)
            : result === 'draw'
              ? Number(mr.drawBonusCurrency)
              : Number(mr.lossBonusCurrency);
        const reward = round4(base + outcomeBonus + eventBonus);

        const beforeCurrency = round4(row.currency);
        const nextDailyMatches = currentDailyMatches + 1;
        const serverDt = new Date(nowMs);
        const serverDateTime = serverDt.toISOString();

        sec.pendingMatch = null;
        sec.rewardedMatchIds.push(matchId);
        if (sec.rewardedMatchIds.length > 50) sec.rewardedMatchIds = sec.rewardedMatchIds.slice(-50);
        recordContextIntoSecurity(sec, meta);

        // Penambahan saldo atomik di SQL (TIDAK PERNAH menimpa saldo lama)
        const [updatedRow] = await tx
          .update(profiles)
          .set({
            currency: sql`ROUND((COALESCE(${profiles.currency}, 0) + ${reward})::numeric, 4)::double precision`,
            dailyMatches: nextDailyMatches,
            lastMatchDate: todayStr,
            lastMatchTimestamp: serverDt,
            totalMatches: sql`COALESCE(${profiles.totalMatches}, 0) + 1`,
            security: sec,
            updatedAt: serverDt
          })
          .where(eq(profiles.uid, authUser.uid))
          .returning();

        const afterCurrency = round4(updatedRow.currency);

        await tx.insert(matches).values({
          id: matchId,
          userId: authUser.uid,
          opponent,
          homeScore,
          awayScore,
          result,
          rewardCurrency: reward,
          matchDateLondon: todayStr,
          startedAt,
          finishedAt: serverDt
        });

        const ledgerEntry = await insertImmutableLedgerTx(tx, {
          user_id: authUser.uid,
          akun: updatedRow.email,
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

        return {
          wallet: profileToWallet(updatedRow),
          reward,
          matchesToday: nextDailyMatches,
          dailyMatches: nextDailyMatches,
          maxMatchesPerDay,
          serverNowMs: nowMs,
          serverDateTime,
          todayStr,
          ledgerEntry,
          serverValidation: {
            sourceOfTruth: 'economy.config.json',
            ignoredClientFields: tampered
          }
        };
      });
    } catch (err) {
      sanitizeDbError(err, 'claimMatchReward');
    }
  }

  async function executeConversion(authUser: AuthUser, body: Record<string, unknown> = {}, reqMeta: RequestMetaInput = {}) {
    try {
      const cfg = loadConfig();
      const meta = normalizeRequestMeta(reqMeta);
      const direction = String(body?.direction || '').trim();
      const amount = Number(body?.amount);
      const tampered = detectTamperedFields(body, [
        'rate',
        'fee',
        'feePercent',
        'amount_to',
        'result',
        'netOut',
        'balance',
        'user_id'
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

      const fromKey: 'currency' | 'gold' = direction === 'currency-gold' ? 'currency' : 'gold';
      const toKey: 'gold' | 'diamond' = direction === 'currency-gold' ? 'gold' : 'diamond';
      const rate = direction === 'currency-gold' ? Number(cfg.rates.goldToCurrency) : Number(cfg.rates.diamondToGold);
      const feePercent =
        direction === 'currency-gold'
          ? Number(cfg.fees.currencyToGoldFeePercent)
          : Number(cfg.fees.goldToDiamondFeePercent);
      const grossOut = amount / rate;
      const feeOut = round4(grossOut * (feePercent / 100));
      const netOut = round4(grossOut - feeOut);

      if (netOut <= 0) {
        throw createHttpError(400, 'Jumlah konversi terlalu kecil setelah biaya.', 'AMOUNT_TOO_SMALL');
      }

      return await db.transaction(async (tx) => {
        const row = await getOrCreateProfileTx(tx, authUser, cfg);
        const sec = normalizeSecurity(row.security);
        recordContextIntoSecurity(sec, meta);

        const beforeFrom = round4(fromKey === 'currency' ? row.currency : row.gold);
        if (beforeFrom < amount) {
          throw createHttpError(
            400,
            `Saldo ${fromKey} tidak mencukupi (tersedia: ${beforeFrom}, dibutuhkan: ${amount}).`,
            'INSUFFICIENT_BALANCE'
          );
        }

        const beforeTo = round4(toKey === 'gold' ? row.gold : row.diamond);
        const nowMs = nowFn();
        const serverDt = new Date(nowMs);
        const convRef = `CNV-${nowMs}`;

        const [updatedRow] = await tx
          .update(profiles)
          .set(
            direction === 'currency-gold'
              ? {
                  currency: sql`ROUND((COALESCE(${profiles.currency}, 0) - ${amount})::numeric, 4)::double precision`,
                  gold: sql`ROUND((COALESCE(${profiles.gold}, 0) + ${netOut})::numeric, 4)::double precision`,
                  security: sec,
                  updatedAt: serverDt
                }
              : {
                  gold: sql`ROUND((COALESCE(${profiles.gold}, 0) - ${amount})::numeric, 4)::double precision`,
                  diamond: sql`ROUND((COALESCE(${profiles.diamond}, 0) + ${netOut})::numeric, 4)::double precision`,
                  security: sec,
                  updatedAt: serverDt
                }
          )
          .where(eq(profiles.uid, authUser.uid))
          .returning();

        const afterFrom = round4(fromKey === 'currency' ? updatedRow.currency : updatedRow.gold);
        const afterTo = round4(toKey === 'gold' ? updatedRow.gold : updatedRow.diamond);

        const outEntry = await insertImmutableLedgerTx(tx, {
          user_id: authUser.uid,
          akun: updatedRow.email,
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

        const inEntry = await insertImmutableLedgerTx(tx, {
          user_id: authUser.uid,
          akun: updatedRow.email,
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

        return {
          wallet: profileToWallet(updatedRow),
          serverNowMs: nowMs,
          serverDateTime: serverDt.toISOString(),
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
    } catch (err) {
      sanitizeDbError(err, 'executeConversion');
    }
  }

  async function settleWeeklySink(authUser: AuthUser, body: Record<string, unknown> = {}) {
    try {
      const cfg = loadConfig();
      const tampered = detectTamperedFields(body, ['expense', 'sink', 'total', 'income', 'netChange', 'balance', 'user_id']);

      return await db.transaction(async (tx) => {
        const row = await getOrCreateProfileTx(tx, authUser, cfg);
        const nowMs = nowFn();
        const londonInfo = getLondonTimeInfo(nowMs);

        if (weeklyCooldownMs > 0) {
          const lastWeekKey =
            row.lastWeeklyWeekKey ||
            (row.lastWeeklyClaimAt && Number.isFinite(row.lastWeeklyClaimAt.getTime())
              ? getLondonTimeInfo(row.lastWeeklyClaimAt.getTime()).londonWeekKey
              : null);
          if (lastWeekKey && lastWeekKey === londonInfo.londonWeekKey) {
            throw createHttpError(
              429,
              `Settlement gaji mingguan sudah dilakukan untuk minggu London ${londonInfo.londonWeekKey}. Reset setiap Senin 00:00 London (${londonInfo.wibResetTime}).`,
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

        const availableAfterEvent = round4(Number(row.currency) + eventBonus);
        if (availableAfterEvent < totalSink) {
          throw createHttpError(
            400,
            `Saldo Currency tidak cukup untuk settlement biaya mingguan (butuh ${totalSink.toLocaleString('id-ID')} Currency, saldo Anda ${Number(row.currency).toLocaleString('id-ID')} Currency).`,
            'INSUFFICIENT_BALANCE'
          );
        }

        const settleRef = `WK-${nowMs}`;
        const ledgerEntries = [];
        let runningBalance = round4(row.currency);

        if (eventBonus > 0) {
          const before = runningBalance;
          runningBalance = round4(runningBalance + eventBonus);
          ledgerEntries.push(
            await insertImmutableLedgerTx(tx, {
              user_id: authUser.uid,
              akun: row.email,
              jenis_transaksi: 'masuk',
              kategori: 'event_bonus_mingguan',
              mata_uang: 'currency',
              jumlah: eventBonus,
              fee: 0,
              saldo_sebelum: before,
              saldo_sesudah: runningBalance,
              ref_id: settleRef,
              keterangan: 'Bonus Sponsor / Event Mingguan'
            })
          );
        }

        for (const item of sinkItems) {
          const before = runningBalance;
          runningBalance = round4(runningBalance - item.amount);
          ledgerEntries.push(
            await insertImmutableLedgerTx(tx, {
              user_id: authUser.uid,
              akun: row.email,
              jenis_transaksi: 'keluar',
              kategori: item.kategori,
              mata_uang: 'currency',
              jumlah: item.amount,
              fee: 0,
              saldo_sebelum: before,
              saldo_sesudah: runningBalance,
              ref_id: settleRef,
              keterangan: item.label
            })
          );
        }

        const netDelta = round4(eventBonus - totalSink);
        const nowDt = new Date(nowMs);
        const [updatedRow] = await tx
          .update(profiles)
          .set({
            currency: sql`ROUND((COALESCE(${profiles.currency}, 0) + ${netDelta})::numeric, 4)::double precision`,
            lastWeeklyClaimAt: nowDt,
            lastWeeklyWeekKey: londonInfo.londonWeekKey,
            lastWeeklyLondonDate: londonInfo.londonDate,
            updatedAt: nowDt
          })
          .where(eq(profiles.uid, authUser.uid))
          .returning();

        return {
          wallet: profileToWallet(updatedRow),
          income: eventBonus,
          expense: totalSink,
          netChange: netDelta,
          londonWeekKey: londonInfo.londonWeekKey,
          serverTime: londonInfo,
          sinkBreakdown: sinkItems,
          ledgerEntries,
          serverValidation: {
            sourceOfTruth: 'economy.config.json',
            ignoredClientFields: tampered
          }
        };
      });
    } catch (err) {
      sanitizeDbError(err, 'settleWeeklySink');
    }
  }

  function evaluateWithdrawGate(
    wallet: ReturnType<typeof profileToWallet>,
    userActiveQueue: ReturnType<typeof withdrawRowToClient>[],
    cfg: EconomyConfig,
    requestedDiamond: number,
    nowMs: number
  ) {
    const wd = cfg.withdraw;
    const minDiamond = Number(wd.minDiamond);
    const minAccountAgeDays = Number(wd.minAccountAgeDays);
    const cooldownDays = Number(wd.cooldownDays);
    const maxActiveRequests = Number(wd.maxActiveRequestsPerAccount);
    const requireKyc = Boolean(wd.requireKycBeforeFirstWithdraw);

    const createdMs = new Date(wallet.accountCreatedAt || wallet.created_at || nowMs).getTime();
    const accountAgeDaysExact = Math.max(0, (nowMs - createdMs) / DAY_MS);
    const accountAgeDays = Math.floor(accountAgeDaysExact);

    const activeQueueItems = userActiveQueue.filter((q) => q.status === 'queued' || q.status === 'hold');
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

  async function getWithdrawStatus(authUser: AuthUser) {
    try {
      const cfg = loadConfig();
      return await db.transaction(async (tx) => {
        const row = await getOrCreateProfileTx(tx, authUser, cfg);
        const wallet = profileToWallet(row);
        const queueRows = await tx
          .select()
          .from(withdrawQueue)
          .where(eq(withdrawQueue.userId, authUser.uid))
          .orderBy(desc(withdrawQueue.createdAt))
          .limit(10);
        const userQueue = queueRows.map(withdrawRowToClient);
        const nowMs = nowFn();
        const gate = evaluateWithdrawGate(wallet, userQueue, cfg, Number(cfg.withdraw.minDiamond), nowMs);

        return {
          wallet,
          gate,
          queue: userQueue,
          serverNowMs: nowMs,
          serverDateTime: new Date(nowMs).toISOString()
        };
      });
    } catch (err) {
      sanitizeDbError(err, 'getWithdrawStatus');
    }
  }

  async function submitKyc(authUser: AuthUser, body: Record<string, unknown> = {}, reqMeta: RequestMetaInput = {}) {
    try {
      const cfg = loadConfig();
      const meta = normalizeRequestMeta(reqMeta);

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

      return await db.transaction(async (tx) => {
        const row = await getOrCreateProfileTx(tx, authUser, cfg);
        const sec = normalizeSecurity(row.security);

        if (cfg.guards?.oneKycIdentityPerWithdrawAccount !== false) {
          const otherProfiles = await tx
            .select({
              uid: profiles.uid,
              email: profiles.email,
              kycIdentityHash: profiles.kycIdentityHash,
              kycData: profiles.kycData
            })
            .from(profiles)
            .where(ne(profiles.uid, authUser.uid));

          const dupIdentity = otherProfiles.find((p) => p.kycIdentityHash && p.kycIdentityHash === idHash);
          if (dupIdentity) {
            sec.duplicateKycAttempts += 1;
            await flagProfileSecurityTx(tx, row, sec, {
              flagCode: 'MULTI_ACCOUNT_KYC',
              reason: `Percobaan multi-akun KYC ditolak: Identitas ${idTypeNorm} sudah terhubung ke akun ${dupIdentity.email || dupIdentity.uid}.`,
              scoreDelta: 50,
              meta,
              markFlagged: true,
              extraMeta: { conflictUserId: dupIdentity.uid }
            });
            await tx
              .update(profiles)
              .set({ security: sec, updatedAt: new Date(nowFn()) })
              .where(eq(profiles.uid, authUser.uid));
            throw createHttpError(
              409,
              `Pengajuan KYC ditolak server: Identitas KYC (${idTypeNorm}) ini sudah terdaftar pada akun game lain. Kebijakan sistem melarang 1 identitas KYC dipakai di lebih dari 1 akun.`,
              'DUPLICATE_KYC_IDENTITY',
              { flagged: true }
            );
          }

          const dupWallet = otherProfiles.find((p) => {
            const kd = (p.kycData && typeof p.kycData === 'object' ? p.kycData : {}) as Record<string, unknown>;
            return typeof kd.walletAddress === 'string' && kd.walletAddress.trim().toLowerCase() === walletAddrNorm;
          });
          if (dupWallet) {
            sec.duplicateKycAttempts += 1;
            await flagProfileSecurityTx(tx, row, sec, {
              flagCode: 'MULTI_ACCOUNT_WALLET',
              reason: `Alamat dompet USDT (${walletAddress.slice(0, 12)}...) sudah dipakai oleh akun ${dupWallet.email || dupWallet.uid}.`,
              scoreDelta: 40,
              meta,
              markFlagged: true,
              extraMeta: { conflictUserId: dupWallet.uid }
            });
            await tx
              .update(profiles)
              .set({ security: sec, updatedAt: new Date(nowFn()) })
              .where(eq(profiles.uid, authUser.uid));
            throw createHttpError(
              409,
              'Pengajuan KYC ditolak server: Alamat dompet USDT ini sudah terdaftar pada akun game lain.',
              'DUPLICATE_WITHDRAW_WALLET',
              { flagged: true }
            );
          }
        }

        const nowDt = new Date(nowFn());
        recordContextIntoSecurity(sec, meta);

        const [updatedRow] = await tx
          .update(profiles)
          .set({
            kycStatus: row.kycVerified ? 'verified' : 'pending',
            kycSubmittedAt: nowDt,
            kycIdentityHash: idHash,
            kycData: {
              fullName,
              idType: idTypeNorm,
              walletAddress
            },
            security: sec,
            updatedAt: nowDt
          })
          .where(eq(profiles.uid, authUser.uid))
          .returning();

        return {
          wallet: profileToWallet(updatedRow),
          message: updatedRow.kycVerified
            ? 'Akun Anda sudah terverifikasi KYC.'
            : 'Pengajuan KYC diterima server dan menunggu verifikasi Admin.'
        };
      });
    } catch (err) {
      sanitizeDbError(err, 'submitKyc');
    }
  }

  async function adminVerifyKyc(authUser: AuthUser, body: Record<string, unknown> = {}) {
    assertAdmin(authUser, 'Hanya Admin/Owner yang dapat memverifikasi KYC.');
    const targetUid = String(body?.targetUid || authUser.uid).trim();

    try {
      return await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.uid, targetUid))
          .for('update');
        if (!existing) {
          throw createHttpError(404, 'Wallet user tidak ditemukan.', 'WALLET_NOT_FOUND');
        }
        const nowDt = new Date(nowFn());
        const [updated] = await tx
          .update(profiles)
          .set({
            kycVerified: true,
            kycStatus: 'verified',
            kycVerifiedAt: nowDt,
            updatedAt: nowDt
          })
          .where(eq(profiles.uid, targetUid))
          .returning();
        return { wallet: profileToWallet(updated) };
      });
    } catch (err) {
      sanitizeDbError(err, 'adminVerifyKyc');
    }
  }

  async function renumberQueuedWithdrawsTx(tx: DbTx) {
    const queuedRows = await tx
      .select()
      .from(withdrawQueue)
      .where(eq(withdrawQueue.status, 'queued'))
      .orderBy(withdrawQueue.createdAt);

    let pos = 1;
    for (const q of queuedRows) {
      const payload = (q.payload && typeof q.payload === 'object' ? { ...(q.payload as Record<string, unknown>) } : {});
      if (payload.queuePosition !== pos) {
        payload.queuePosition = pos;
        await tx
          .update(withdrawQueue)
          .set({ payload })
          .where(eq(withdrawQueue.id, q.id));
      }
      pos += 1;
    }
  }

  async function adminApproveWithdraw(authUser: AuthUser, body: Record<string, unknown> = {}) {
    const adminEmail = assertAdmin(authUser, 'Hanya Admin/Owner yang dapat menyetujui (Approve) withdraw.');
    const withdrawId = String(body?.withdrawId || '').trim();
    if (!withdrawId) {
      throw createHttpError(400, 'ID request withdraw wajib diisi.', 'INVALID_WITHDRAW_ID');
    }

    try {
      return await db.transaction(async (tx) => {
        const [targetRow] = await tx
          .select()
          .from(withdrawQueue)
          .where(eq(withdrawQueue.id, withdrawId))
          .for('update');
        if (!targetRow) {
          throw createHttpError(404, 'Request withdraw dalam antrean tidak ditemukan.', 'WITHDRAW_NOT_FOUND');
        }
        if (targetRow.status !== 'queued' && targetRow.status !== 'hold') {
          throw createHttpError(
            409,
            `Request withdraw ${targetRow.id} sudah diproses sebelumnya (${targetRow.status}).`,
            'WITHDRAW_ALREADY_PROCESSED'
          );
        }

        const [targetProfile] = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.uid, targetRow.userId))
          .for('update');

        const nowDt = new Date(nowFn());
        const nowIso = nowDt.toISOString();
        const prevStatus = targetRow.status;
        const payload = {
          ...((targetRow.payload && typeof targetRow.payload === 'object' ? targetRow.payload : {}) as Record<string, unknown>),
          reviewed_from_status: prevStatus,
          approved_by: adminEmail,
          approved_at: nowIso,
          completed_at: nowIso,
          ...(body?.txHash ? { txHash: String(body.txHash).trim().slice(0, 128) } : {})
        };

        const [updatedWd] = await tx
          .update(withdrawQueue)
          .set({
            status: 'approved',
            payload,
            updatedAt: nowDt
          })
          .where(eq(withdrawQueue.id, withdrawId))
          .returning();

        await renumberQueuedWithdrawsTx(tx);

        let updatedWallet = targetProfile ? profileToWallet(targetProfile) : null;
        if (targetProfile) {
          const [p] = await tx
            .update(profiles)
            .set({
              activeWithdrawId: targetProfile.activeWithdrawId === targetRow.id ? null : targetProfile.activeWithdrawId,
              updatedAt: nowDt
            })
            .where(eq(profiles.uid, targetProfile.uid))
            .returning();
          updatedWallet = profileToWallet(p);
        }

        const item = withdrawRowToClient(updatedWd);
        return {
          withdraw: item,
          wallet: updatedWallet,
          message: `Withdraw ${item.id} (${String((item as Record<string, unknown>).netUsdt || 0)} USDT) berhasil di-Approve.`
        };
      });
    } catch (err) {
      sanitizeDbError(err, 'adminApproveWithdraw');
    }
  }

  async function adminRejectWithdraw(authUser: AuthUser, body: Record<string, unknown> = {}) {
    const adminEmail = assertAdmin(authUser, 'Hanya Admin/Owner yang dapat menolak (Reject) withdraw.');
    const withdrawId = String(body?.withdrawId || '').trim();
    if (!withdrawId) {
      throw createHttpError(400, 'ID request withdraw wajib diisi.', 'INVALID_WITHDRAW_ID');
    }
    const reason = String(body?.reason || 'Ditolak oleh Admin').trim().slice(0, 200) || 'Ditolak oleh Admin';

    try {
      const cfg = loadConfig();
      return await db.transaction(async (tx) => {
        const [targetRow] = await tx
          .select()
          .from(withdrawQueue)
          .where(eq(withdrawQueue.id, withdrawId))
          .for('update');
        if (!targetRow) {
          throw createHttpError(404, 'Request withdraw dalam antrean tidak ditemukan.', 'WITHDRAW_NOT_FOUND');
        }
        if (targetRow.status !== 'queued' && targetRow.status !== 'hold') {
          throw createHttpError(
            409,
            `Request withdraw ${targetRow.id} sudah diproses sebelumnya (${targetRow.status}).`,
            'WITHDRAW_ALREADY_PROCESSED'
          );
        }

        const targetProfile = await getOrCreateProfileTx(
          tx,
          { uid: targetRow.userId, email: targetRow.akun, emailVerified: true, createdAtMs: null },
          cfg
        );
        const nowDt = new Date(nowFn());
        const nowIso = nowDt.toISOString();
        const rawPayload = (targetRow.payload && typeof targetRow.payload === 'object' ? targetRow.payload : {}) as Record<
          string,
          unknown
        >;
        const refundDiamond = round4(rawPayload.grossDiamond || 0);
        const beforeDiamond = round4(targetProfile.diamond);

        let restoredLastWithdrawAt: Date | null = null;
        if (rawPayload.previousLastWithdrawAt !== undefined) {
          restoredLastWithdrawAt = rawPayload.previousLastWithdrawAt
            ? new Date(String(rawPayload.previousLastWithdrawAt))
            : null;
        } else {
          const prevRows = await tx
            .select()
            .from(withdrawQueue)
            .where(
              and(
                eq(withdrawQueue.userId, targetRow.userId),
                ne(withdrawQueue.id, targetRow.id),
                ne(withdrawQueue.status, 'rejected')
              )
            )
            .orderBy(desc(withdrawQueue.createdAt))
            .limit(1);
          restoredLastWithdrawAt = prevRows[0] ? prevRows[0].createdAt : null;
        }

        const [updatedProfile] = await tx
          .update(profiles)
          .set({
            diamond: sql`ROUND((COALESCE(${profiles.diamond}, 0) + ${refundDiamond})::numeric, 4)::double precision`,
            activeWithdrawId: targetProfile.activeWithdrawId === targetRow.id ? null : targetProfile.activeWithdrawId,
            lastWithdrawAt: restoredLastWithdrawAt,
            updatedAt: nowDt
          })
          .where(eq(profiles.uid, targetProfile.uid))
          .returning();

        const afterDiamond = round4(updatedProfile.diamond);

        const nextPayload = {
          ...rawPayload,
          reject_reason: reason,
          rejected_by: adminEmail,
          rejected_at: nowIso,
          refundedDiamond: refundDiamond
        };

        const [updatedWd] = await tx
          .update(withdrawQueue)
          .set({
            status: 'rejected',
            payload: nextPayload,
            updatedAt: nowDt
          })
          .where(eq(withdrawQueue.id, withdrawId))
          .returning();

        await renumberQueuedWithdrawsTx(tx);

        const ledgerEntry = await insertImmutableLedgerTx(tx, {
          user_id: targetRow.userId,
          akun: updatedProfile.email || targetRow.akun,
          jenis_transaksi: 'masuk',
          kategori: 'withdraw_refund',
          mata_uang: 'diamond',
          jumlah: refundDiamond,
          fee: 0,
          saldo_sebelum: beforeDiamond,
          saldo_sesudah: afterDiamond,
          ref_id: targetRow.id,
          keterangan: `Withdraw ${targetRow.id} Ditolak Admin (Refund ${refundDiamond} Diamond): ${reason}`
        });

        return {
          withdraw: withdrawRowToClient(updatedWd),
          wallet: profileToWallet(updatedProfile),
          ledgerEntry,
          refundedDiamond: refundDiamond,
          message: `Withdraw ${targetRow.id} ditolak & saldo ${refundDiamond} Diamond dikembalikan ke ${updatedProfile.email}.`
        };
      });
    } catch (err) {
      sanitizeDbError(err, 'adminRejectWithdraw');
    }
  }

  async function adminClearSecurityFlag(authUser: AuthUser, body: Record<string, unknown> = {}) {
    const adminEmail = assertAdmin(authUser, 'Hanya Admin/Owner yang dapat mereset status bendera keamanan.');
    const targetUid = String(body?.targetUid || '').trim();
    if (!targetUid) {
      throw createHttpError(400, 'targetUid wajib diisi.', 'INVALID_UID');
    }

    try {
      return await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.uid, targetUid))
          .for('update');
        if (!existing) {
          throw createHttpError(404, 'Wallet user tidak ditemukan.', 'WALLET_NOT_FOUND');
        }
        const nowDt = new Date(nowFn());
        const sec = normalizeSecurity(existing.security);
        sec.flagged = false;
        sec.riskScore = 0;
        sec.flags = [];
        sec.clearedBy = adminEmail;
        sec.clearedAt = nowDt.toISOString();

        const [updated] = await tx
          .update(profiles)
          .set({ security: sec, updatedAt: nowDt })
          .where(eq(profiles.uid, targetUid))
          .returning();

        await insertSecurityEventTx(tx, {
          user_id: targetUid,
          akun: updated.email,
          eventType: 'ADMIN_CLEAR_FLAG',
          severity: 'low',
          detail: `Flag keamanan dibersihkan oleh ${adminEmail}`
        });

        return { wallet: profileToWallet(updated) };
      });
    } catch (err) {
      sanitizeDbError(err, 'adminClearSecurityFlag');
    }
  }

  async function adminCompleteWithdraw(authUser: AuthUser, body: Record<string, unknown> = {}) {
    assertAdmin(authUser, 'Hanya Admin/Owner yang dapat menyelesaikan antrean withdraw.');
    const withdrawId = String(body?.withdrawId || '').trim();

    try {
      return await db.transaction(async (tx) => {
        let targetRow: WithdrawRow | undefined;
        if (withdrawId) {
          [targetRow] = await tx.select().from(withdrawQueue).where(eq(withdrawQueue.id, withdrawId)).for('update');
        } else {
          [targetRow] = await tx
            .select()
            .from(withdrawQueue)
            .where(eq(withdrawQueue.status, 'queued'))
            .orderBy(withdrawQueue.createdAt)
            .limit(1)
            .for('update');
        }
        if (!targetRow) {
          throw createHttpError(404, 'Request withdraw dalam antrean tidak ditemukan.', 'WITHDRAW_NOT_FOUND');
        }
        if (targetRow.status !== 'queued') {
          throw createHttpError(
            409,
            `Request withdraw ${targetRow.id} sudah diproses (${targetRow.status}).`,
            'WITHDRAW_ALREADY_PROCESSED'
          );
        }

        const nowDt = new Date(nowFn());
        const payload = {
          ...((targetRow.payload && typeof targetRow.payload === 'object' ? targetRow.payload : {}) as Record<string, unknown>),
          completed_at: nowDt.toISOString()
        };

        const [updatedWd] = await tx
          .update(withdrawQueue)
          .set({ status: 'completed', payload, updatedAt: nowDt })
          .where(eq(withdrawQueue.id, targetRow.id))
          .returning();

        await renumberQueuedWithdrawsTx(tx);

        const [targetProfile] = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.uid, targetRow.userId))
          .for('update');

        let wallet = targetProfile ? profileToWallet(targetProfile) : null;
        if (targetProfile) {
          const [p] = await tx
            .update(profiles)
            .set({
              activeWithdrawId: targetProfile.activeWithdrawId === targetRow.id ? null : targetProfile.activeWithdrawId,
              updatedAt: nowDt
            })
            .where(eq(profiles.uid, targetProfile.uid))
            .returning();
          wallet = profileToWallet(p);
        }

        return { withdraw: withdrawRowToClient(updatedWd), wallet };
      });
    } catch (err) {
      sanitizeDbError(err, 'adminCompleteWithdraw');
    }
  }

  function computePeriodEconomyMetrics(
    ledgerEntries: ReturnType<typeof ledgerRowToClient>[],
    cfg: EconomyConfig,
    cutoffMs: number | null
  ) {
    const goldToCurrency = Number(cfg.rates.goldToCurrency);
    const diamondToCurrency = Number(cfg.rates.diamondToCurrency);

    const toEquivCurrency = (mataUang: string, val: number) => {
      const num = Number(val || 0);
      if (mataUang === 'diamond') return num * diamondToCurrency;
      if (mataUang === 'gold') return num * goldToCurrency;
      return num;
    };

    const byCurrency: Record<'currency' | 'gold' | 'diamond', { masuk: number; keluar: number; net: number }> = {
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

    const feeByWithdrawId = new Map<string, number>();
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
      const curr = entry.mata_uang as 'currency' | 'gold' | 'diamond';
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
        const origFee = (entry.ref_id && feeByWithdrawId.get(entry.ref_id)) || 0;
        const feeEq = toEquivCurrency('diamond', origFee);
        sinkCurrency = Math.max(0, sinkCurrency - feeEq);
        withdrawFeeSinkCurrency = Math.max(0, withdrawFeeSinkCurrency - feeEq);
        withdrawNetOutflowDiamond = Math.max(0, withdrawNetOutflowDiamond - Math.max(0, jumlah - origFee));
      }
    }

    for (const curr of Object.keys(byCurrency) as Array<'currency' | 'gold' | 'diamond'>) {
      byCurrency[curr].net = round4(byCurrency[curr].masuk - byCurrency[curr].keluar);
    }

    const totalFaucetCurrency = round2(faucetCurrency);
    const totalSinkCurrency = round2(sinkCurrency);
    const netEmissionCurrency = round2(totalFaucetCurrency - totalSinkCurrency);
    const sinkCoveragePercent =
      totalFaucetCurrency > 0 ? round2((totalSinkCurrency / totalFaucetCurrency) * 100) : totalSinkCurrency > 0 ? 100 : 0;

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
        gameplayAndWeekly: round2(
          totalSinkCurrency - conversionFeeSinkCurrency - marketFeeSinkCurrency - withdrawFeeSinkCurrency
        ),
        conversionFees: round2(conversionFeeSinkCurrency),
        marketFees: round2(marketFeeSinkCurrency),
        withdrawFees: round2(withdrawFeeSinkCurrency)
      },
      withdrawNetOutflowDiamond: round4(withdrawNetOutflowDiamond),
      byCurrency
    };
  }

  async function getAdminEconomyDashboard(authUser: AuthUser) {
    assertAdmin(authUser, 'Hanya Admin/Owner yang dapat melihat dashboard ekonomi.');

    try {
      const cfg = loadConfig();
      const [profileRows, queueRows, ledgerRows, topupRows, secRows] = await Promise.all([
        db.select().from(profiles),
        db.select().from(withdrawQueue),
        db.select().from(ledger).orderBy(ledger.seq),
        db.select().from(topupRequests),
        db.select().from(securityEvents).orderBy(desc(securityEvents.seq)).limit(30)
      ]);

      const allWallets = profileRows.map(profileToWallet);
      const queue = queueRows.map(withdrawRowToClient) as Array<
        ReturnType<typeof withdrawRowToClient> & { grossDiamond?: number; netUsdt?: number }
      >;
      const ledgerEntries = ledgerRows.map(ledgerRowToClient);
      const topups = topupRows.map(topupRowToClient);
      const recentEvents = secRows.map(securityEventRowToClient);
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

      const rankedWallets = allWallets
        .map((w) => {
          const diamond = round4(w.diamond || 0);
          const gold = round4(w.gold || 0);
          const currency = round2(w.currency || 0);
          const equivalentDiamond = round4(diamond + gold / diamondToGold + currency / diamondToCurrency);
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
        })
        .sort((a, b) => {
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
        sharePercent: totalSystemEquivDiamond > 0 ? round2((w.equivalentDiamond / totalSystemEquivDiamond) * 100) : 0
      }));

      const sortedQueue = [...queue].sort((a, b) => {
        const rankStatus = (s: string) => (s === 'hold' ? 0 : s === 'queued' ? 1 : 2);
        const ra = rankStatus(a.status);
        const rb = rankStatus(b.status);
        if (ra !== rb) return ra - rb;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });

      const flaggedAccounts = allWallets
        .filter((w) => w.security?.flagged || (w.security?.riskScore || 0) > 0)
        .map((w) => {
          const sec = w.security;
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

      const sortedTopups = [...topups].sort((a, b) => {
        const rank = (s: string) => (s === 'PENDING_VERIFICATION' ? 0 : 1);
        const ra = rank(a.status);
        const rb = rank(b.status);
        if (ra !== rb) return ra - rb;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
      const topupPendingCount = sortedTopups.filter((r) => r.status === 'PENDING_VERIFICATION').length;

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
        topupQueue: sortedTopups,
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
          recentEvents
        }
      };
    } catch (err) {
      sanitizeDbError(err, 'getAdminEconomyDashboard');
    }
  }

  function evaluateWithdrawSuspicion(
    wallet: ReturnType<typeof profileToWallet>,
    allWallets: ReturnType<typeof profileToWallet>[],
    userLedgerEntries: ReturnType<typeof ledgerRowToClient>[],
    cfg: EconomyConfig,
    meta: ReturnType<typeof normalizeRequestMeta>,
    nowMs: number
  ) {
    const reasons: string[] = [];
    let riskDelta = 0;
    const sec = wallet.security;
    const anti = cfg.antiAbuse || {};

    if (sec.flagged) {
      reasons.push(`Akun sebelumnya ditandai sistem keamanan (${sec.flags.join(', ') || 'FLAGGED'})`);
      riskDelta += 45;
    }

    let ledgerDiamondIn = 0;
    let ledgerDiamondOut = 0;
    let dailyCurrencyGain = 0;
    const dayAgo = nowMs - DAY_MS;

    for (const e of userLedgerEntries) {
      const amt = Number(e.jumlah || 0);
      if (e.mata_uang === 'diamond') {
        if (e.jenis_transaksi === 'masuk') ledgerDiamondIn += amt;
        if (e.jenis_transaksi === 'keluar') ledgerDiamondOut += amt;
      }
      if (
        e.mata_uang === 'currency' &&
        e.jenis_transaksi === 'masuk' &&
        (e.kategori === 'match_reward' || e.kategori === 'event_bonus_mingguan')
      ) {
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
      reasons.push(
        `Lonjakan pendapatan 24 jam (${dailyCurrencyGain.toLocaleString('id-ID')} C) melebihi batas wajar (${maxDailyCurrency.toLocaleString('id-ID')} C)`
      );
      riskDelta += 35;
    }

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

    const otherWallets = allWallets.filter((w) => w.user_id !== wallet.user_id);
    if (meta.deviceId) {
      const sharedDev = otherWallets.find(
        (w) => (w.security?.knownDevices || []).includes(meta.deviceId!) && (w.kycSubmittedAt || w.activeWithdrawId)
      );
      if (sharedDev) {
        reasons.push(`Device ID (${meta.deviceId}) terdeteksi dipakai bersama akun lain (${sharedDev.akun || sharedDev.user_id})`);
        riskDelta += 40;
      }
    }
    if (meta.ip) {
      const sharedIp = otherWallets.find(
        (w) => (w.security?.knownIps || []).includes(meta.ip!) && (w.kycSubmittedAt || w.activeWithdrawId)
      );
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

  async function requestWithdraw(authUser: AuthUser, body: Record<string, unknown> = {}, reqMeta: RequestMetaInput = {}) {
    try {
      const cfg = loadConfig();
      const meta = normalizeRequestMeta(reqMeta);
      const tampered = detectTamperedFields(body, [
        'fee',
        'feePercent',
        'netUsdt',
        'netDiamond',
        'status',
        'instant',
        'balance',
        'user_id',
        'kycVerified',
        'accountAgeDays',
        'bypassCooldown',
        'bypassGate',
        'bypassHold'
      ]);

      return await db.transaction(async (tx) => {
        const row = await getOrCreateProfileTx(tx, authUser, cfg);
        const wallet = profileToWallet(row);
        const sec = normalizeSecurity(row.security);

        const [allProfileRows, queueRows, userLedgerRows] = await Promise.all([
          tx.select().from(profiles),
          tx.select().from(withdrawQueue),
          tx.select().from(ledger).where(eq(ledger.userId, authUser.uid))
        ]);

        const allWallets = allProfileRows.map(profileToWallet);
        const queue = queueRows.map(withdrawRowToClient);
        const userQueue = queue.filter((q) => q.user_id === authUser.uid);
        const userLedgerEntries = userLedgerRows.map(ledgerRowToClient);

        const nowMs = nowFn();
        const wd = cfg.withdraw;
        const requestedDiamond = body?.amount !== undefined ? Number(body.amount) : Number(wd.minDiamond);
        const gate = evaluateWithdrawGate(wallet, userQueue, cfg, requestedDiamond, nowMs);

        if (!gate.checks.noActiveRequestOk) {
          throw createHttpError(
            409,
            `Request ditolak server: Maksimal ${gate.maxActiveRequests} request withdraw aktif per akun. Request Anda (${gate.activeRequestId}) masih berada dalam antrean (queue/hold).`,
            'ACTIVE_WITHDRAW_EXISTS',
            { gate }
          );
        }
        if (!gate.checks.cooldownOk) {
          throw createHttpError(
            429,
            `Request ditolak server: Masih dalam masa cooldown withdraw ${gate.cooldownDays} hari. Silakan tunggu ${gate.cooldownRemainingDays} hari lagi.`,
            'WITHDRAW_COOLDOWN',
            { gate }
          );
        }
        if (!gate.checks.minAmountOk) {
          throw createHttpError(
            400,
            `Request ditolak server: Minimum withdraw adalah ${gate.minDiamond} Diamond.`,
            'BELOW_MIN_WITHDRAW',
            { gate }
          );
        }

        const beforeDiamond = round4(wallet.diamond);
        if (!gate.checks.sufficientBalanceOk) {
          throw createHttpError(
            400,
            `Request ditolak server: Saldo Diamond tidak cukup! Saldo Anda ${beforeDiamond} Diamond, dibutuhkan minimal ${requestedDiamond} Diamond.`,
            'INSUFFICIENT_DIAMOND',
            { gate }
          );
        }
        if (!gate.checks.accountAgeOk) {
          const kurangHari = Math.max(1, Math.ceil(gate.minAccountAgeDays - gate.accountAgeDaysExact));
          throw createHttpError(
            403,
            `Request ditolak server: Umur akun minimal ${gate.minAccountAgeDays} hari untuk withdraw. Umur akun Anda baru ${gate.accountAgeDays} hari (kurang ${kurangHari} hari lagi).`,
            'ACCOUNT_TOO_NEW',
            { gate }
          );
        }
        if (!gate.checks.kycOk) {
          throw createHttpError(
            403,
            'Request ditolak server: Akun belum terverifikasi KYC. Wajib menyelesaikan verifikasi KYC sebelum withdraw pertama.',
            'KYC_REQUIRED',
            { gate }
          );
        }

        if (cfg.guards?.oneKycIdentityPerWithdrawAccount !== false && row.kycIdentityHash) {
          const dupOwner = allWallets.find(
            (w) => w.user_id !== authUser.uid && w.kycIdentityHash === row.kycIdentityHash
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

        const suspicion = evaluateWithdrawSuspicion(wallet, allWallets, userLedgerEntries, cfg, meta, nowMs);
        const targetStatus = suspicion.isSuspicious ? 'hold' : 'queued';

        const feePercent = Number(wd.feePercent);
        const feeDiamond = round4(requestedDiamond * (feePercent / 100));
        const netDiamond = round4(requestedDiamond - feeDiamond);
        const netUsdt = round2(netDiamond * Number(cfg.rates.diamondToUsdt));
        const wdId = `WD-${nowMs}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        const nowDt = new Date(nowMs);
        const nowIso = nowDt.toISOString();

        if (suspicion.isSuspicious) {
          sec.holdCount += 1;
          await flagProfileSecurityTx(tx, row, sec, {
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
          recordContextIntoSecurity(sec, meta);
        }

        const queuePosition =
          targetStatus === 'queued' ? queue.filter((q) => q.status === 'queued').length + 1 : null;

        const payload = {
          grossDiamond: round4(requestedDiamond),
          feePercent,
          feeDiamond,
          netDiamond,
          netUsdt,
          destinationWallet: wallet.kycWalletAddress || null,
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

        const [insertedWd] = await tx
          .insert(withdrawQueue)
          .values({
            id: wdId,
            userId: authUser.uid,
            akun: wallet.akun,
            status: targetStatus,
            payload,
            createdAt: nowDt,
            updatedAt: nowDt
          })
          .returning();

        const [updatedProfile] = await tx
          .update(profiles)
          .set({
            diamond: sql`ROUND((COALESCE(${profiles.diamond}, 0) - ${requestedDiamond})::numeric, 4)::double precision`,
            activeWithdrawId: wdId,
            lastWithdrawAt: nowDt,
            security: sec,
            updatedAt: nowDt
          })
          .where(eq(profiles.uid, authUser.uid))
          .returning();

        const afterDiamond = round4(updatedProfile.diamond);

        const ledgerEntry = await insertImmutableLedgerTx(tx, {
          user_id: authUser.uid,
          akun: updatedProfile.email,
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

        const updatedWallet = profileToWallet(updatedProfile);
        const queueRecord = withdrawRowToClient(insertedWd);
        const nextGate = evaluateWithdrawGate(updatedWallet, [...userQueue, queueRecord], cfg, Number(wd.minDiamond), nowMs);

        return {
          wallet: updatedWallet,
          withdraw: queueRecord,
          heldForReview: suspicion.isSuspicious,
          holdReasons: suspicion.isSuspicious ? suspicion.reasons : [],
          ledgerEntry,
          gate: nextGate,
          message: suspicion.isSuspicious
            ? `Withdraw ${wdId} masuk status HOLD (ditangguhkan) untuk review manual Admin karena terdeteksi aktivitas mencurigakan.`
            : `Withdraw ${wdId} berhasil masuk antrean #${queuePosition}.`,
          serverValidation: {
            sourceOfTruth: 'economy.config.json',
            ignoredClientFields: tampered
          }
        };
      });
    } catch (err) {
      sanitizeDbError(err, 'requestWithdraw');
    }
  }

  function computeServerSpendSpec(cfg: EconomyConfig, body: Record<string, unknown>) {
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
      const costMap: Record<number, number> = { 1: min, 2: mid, 3: max };
      return {
        mode: 'debit' as const,
        currency: 'gold' as const,
        amount: costMap[currentLevel],
        fee: 0,
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
      const cost = Math.round(min + ((max - min) * currentLevel) / 3);
      return {
        mode: 'debit' as const,
        currency: 'gold' as const,
        amount: cost,
        fee: 0,
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
        mode: 'debit' as const,
        currency: 'gold' as const,
        amount: cost,
        fee: 0,
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
        mode: 'debit' as const,
        currency: 'gold' as const,
        amount: cost,
        fee: 0,
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
        mode: 'debit' as const,
        currency: 'gold' as const,
        amount: cost,
        fee: 0,
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
        mode: 'debit' as const,
        currency: 'gold' as const,
        amount: Math.round(price),
        fee: 0,
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
        mode: 'credit' as const,
        currency: 'gold' as const,
        amount: netGold,
        fee,
        kategori: 'transfer_jual',
        keterangan: `Penjualan Pemain Transfer: ${playerName} (Market tax ${taxPct}% + listing ${listingPct}%)`
      };
    }

    throw createHttpError(400, 'Aksi pengeluaran tidak dikenali server.', 'INVALID_ACTION');
  }

  async function spendOrTrade(authUser: AuthUser, body: Record<string, unknown> = {}) {
    try {
      const cfg = loadConfig();
      const spec = computeServerSpendSpec(cfg, body);

      return await db.transaction(async (tx) => {
        const row = await getOrCreateProfileTx(tx, authUser, cfg);
        const before = round4(spec.currency === 'gold' ? row.gold : row.currency);

        if (spec.mode === 'debit' && before < spec.amount) {
          throw createHttpError(
            400,
            `Saldo ${spec.currency} tidak mencukupi (tersedia: ${before}, butuh: ${spec.amount}).`,
            'INSUFFICIENT_BALANCE'
          );
        }

        const delta = spec.mode === 'debit' ? -spec.amount : spec.amount;
        const nowMs = nowFn();
        const nowDt = new Date(nowMs);

        const [updatedRow] = await tx
          .update(profiles)
          .set({
            gold: sql`ROUND((COALESCE(${profiles.gold}, 0) + ${delta})::numeric, 4)::double precision`,
            updatedAt: nowDt
          })
          .where(eq(profiles.uid, authUser.uid))
          .returning();

        const after = round4(updatedRow.gold);
        const jenis: 'masuk' | 'keluar' = spec.mode === 'debit' ? 'keluar' : 'masuk';

        const ledgerEntry = await insertImmutableLedgerTx(tx, {
          user_id: authUser.uid,
          akun: updatedRow.email,
          jenis_transaksi: jenis,
          kategori: spec.kategori,
          mata_uang: spec.currency,
          jumlah: spec.amount,
          fee: spec.fee || 0,
          saldo_sebelum: before,
          saldo_sesudah: after,
          ref_id: `TRD-${nowMs}`,
          keterangan: spec.keterangan
        });

        return {
          wallet: profileToWallet(updatedRow),
          amount: spec.amount,
          fee: spec.fee || 0,
          ledgerEntry
        };
      });
    } catch (err) {
      sanitizeDbError(err, 'spendOrTrade');
    }
  }

  async function adminResetWallet(authUser: AuthUser) {
    assertAdmin(authUser, 'Hanya Admin/Owner yang dapat mereset saldo.');
    try {
      const cfg = loadConfig();
      const starter = cfg.starterBalance;

      return await db.transaction(async (tx) => {
        const row = await getOrCreateProfileTx(tx, authUser, cfg);
        const entries = [];
        const nowMs = nowFn();
        const nowDt = new Date(nowMs);

        const pairs: Array<['currency' | 'gold' | 'diamond', number, number]> = [
          ['currency', round4(row.currency), Number(starter.currency)],
          ['gold', round4(row.gold), Number(starter.gold)],
          ['diamond', round4(row.diamond), Number(starter.diamonds)]
        ];

        for (const [curr, before, target] of pairs) {
          if (before !== target) {
            const diff = Math.abs(round4(before - target));
            const jenis: 'masuk' | 'keluar' = before > target ? 'keluar' : 'masuk';
            entries.push(
              await insertImmutableLedgerTx(tx, {
                user_id: authUser.uid,
                akun: row.email,
                jenis_transaksi: jenis,
                kategori: 'admin_reset',
                mata_uang: curr,
                jumlah: diff,
                fee: 0,
                saldo_sebelum: before,
                saldo_sesudah: target,
                ref_id: `RST-${nowMs}`,
                keterangan: `Admin Reset ke starterBalance (${target})`
              })
            );
          }
        }

        const [updatedRow] = await tx
          .update(profiles)
          .set({
            currency: Number(starter.currency),
            gold: Number(starter.gold),
            diamond: Number(starter.diamonds),
            dailyMatches: 0,
            lastMatchDate: null,
            lastMatchTimestamp: null,
            lastWeeklyClaimAt: null,
            lastWeeklyWeekKey: null,
            lastWeeklyLondonDate: null,
            activeWithdrawId: null,
            updatedAt: nowDt
          })
          .where(eq(profiles.uid, authUser.uid))
          .returning();

        return { wallet: profileToWallet(updatedRow), ledgerEntries: entries };
      });
    } catch (err) {
      sanitizeDbError(err, 'adminResetWallet');
    }
  }

  function validateReceiptImage(dataUrl: unknown): string | null {
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

  async function submitTopupRequest(authUser: AuthUser, body: Record<string, unknown> = {}, reqMeta: RequestMetaInput = {}) {
    try {
      const cfg = loadConfig();
      const topUpCfg = cfg.topUp || {};
      const packages = topUpCfg.packages || {};
      const meta = normalizeRequestMeta(reqMeta);
      const tampered = detectTamperedFields(body, [
        'status',
        'diamonds',
        'bonusGold',
        'bonus_gold',
        'gold',
        'priceIdr',
        'price_idr',
        'priceUsdt',
        'price_usdt',
        'user_id',
        'approved_by',
        'approved_at'
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

      let referenceNumber: string | null = null;
      let receiptImage: string | null = null;
      let txid: string | null = null;
      let proofNorm: string | null = null;

      if (paymentMethod === 'dana_qris') {
        referenceNumber = typeof body?.referenceNumber === 'string' ? body.referenceNumber.trim().slice(0, 80) : '';
        receiptImage = validateReceiptImage(body?.receiptImage);
        if (!referenceNumber && !receiptImage) {
          throw createHttpError(
            400,
            'Untuk QRIS DANA Bisnis, wajib mengisi Nomor Referensi atau mengunggah Foto Struk transfer.',
            'MISSING_DANA_PROOF'
          );
        }
        if (referenceNumber && referenceNumber.length < 4) {
          throw createHttpError(400, 'Nomor Referensi DANA minimal 4 karakter.', 'INVALID_DANA_REFERENCE');
        }
        if (referenceNumber) {
          proofNorm = `DANA:${referenceNumber.replace(/\s+/g, '').toUpperCase()}`;
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
      }

      return await db.transaction(async (tx) => {
        const row = await getOrCreateProfileTx(tx, authUser, cfg);
        const sec = normalizeSecurity(row.security);

        if (proofNorm) {
          const [dup] = await tx
            .select({ id: topupRequests.id })
            .from(topupRequests)
            .where(and(ne(topupRequests.status, 'REJECTED'), eq(topupRequests.referenceCode, proofNorm)))
            .limit(1);
          if (dup) {
            if (paymentMethod === 'dana_qris') {
              throw createHttpError(
                409,
                `Nomor Referensi (${referenceNumber}) sudah pernah digunakan pada transaksi ${dup.id}.`,
                'DUPLICATE_TOPUP_PROOF'
              );
            } else {
              throw createHttpError(
                409,
                `TXID (${txid}) sudah pernah digunakan pada transaksi ${dup.id}.`,
                'DUPLICATE_TOPUP_PROOF'
              );
            }
          }
        }

        const nowMs = nowFn();
        const nowDt = new Date(nowMs);
        const nowIso = nowDt.toISOString();
        const topupId = `TOP-${nowMs}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        const methodLabel =
          paymentMethod === 'dana_qris'
            ? topUpCfg.dana?.label || 'QRIS DANA Bisnis'
            : topUpCfg.solana?.label || 'Crypto (USDT Solana)';

        const payload = {
          package_id: pkg.id,
          package_name: pkg.name,
          payment_method: paymentMethod,
          payment_method_label: methodLabel,
          price_idr: Number(pkg.priceIdr),
          price_usdt: Number(pkg.priceUsdt),
          diamonds: Number(pkg.diamonds),
          bonus_gold: Number(pkg.bonusGold || 0),
          reference_number: referenceNumber,
          receipt_image: receiptImage,
          txid,
          proof_norm: proofNorm,
          request_ip: meta.ip,
          request_device_id: meta.deviceId,
          created_at: nowIso
        };

        const [insertedTopup] = await tx
          .insert(topupRequests)
          .values({
            id: topupId,
            userId: authUser.uid,
            akun: row.email || authUser.email || authUser.uid,
            status: 'PENDING_VERIFICATION',
            paymentMethod,
            packageId: pkg.id,
            referenceCode: proofNorm,
            payload,
            createdAt: nowDt,
            updatedAt: nowDt
          })
          .returning();

        recordContextIntoSecurity(sec, meta);
        const [updatedRow] = await tx
          .update(profiles)
          .set({ security: sec, updatedAt: nowDt })
          .where(eq(profiles.uid, authUser.uid))
          .returning();

        return {
          topup: topupRowToClient(insertedTopup),
          wallet: profileToWallet(updatedRow),
          message: `Permintaan Top-Up ${pkg.name} (${topupId}) berhasil dikirim dengan status PENDING_VERIFICATION. Saldo akan ditambahkan setelah diverifikasi Admin.`,
          serverValidation: {
            sourceOfTruth: 'economy.config.json',
            immediateBalanceAdded: false,
            ignoredClientFields: tampered
          }
        };
      });
    } catch (err) {
      sanitizeDbError(err, 'submitTopupRequest');
    }
  }

  async function getMyTopupRequests(authUser: AuthUser) {
    try {
      const rows = await db
        .select()
        .from(topupRequests)
        .where(eq(topupRequests.userId, authUser.uid))
        .orderBy(desc(topupRequests.createdAt));
      return { requests: rows.map(topupRowToClient) };
    } catch (err) {
      sanitizeDbError(err, 'getMyTopupRequests');
    }
  }

  async function getAdminTopupQueue(authUser: AuthUser, opts: { status?: unknown } = {}) {
    assertAdmin(authUser, 'Hanya Admin/Owner yang dapat melihat antrean Top-Up.');
    try {
      const rows = await db.select().from(topupRequests);
      const all = rows.map(topupRowToClient).sort((a, b) => {
        const rank = (s: string) => (s === 'PENDING_VERIFICATION' ? 0 : 1);
        const ra = rank(a.status);
        const rb = rank(b.status);
        if (ra !== rb) return ra - rb;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
      const statusFilter =
        typeof opts?.status === 'string' && opts.status.trim() ? opts.status.trim().toUpperCase() : null;
      const filtered = statusFilter ? all.filter((r) => String(r.status || '').toUpperCase() === statusFilter) : all;
      const pendingCount = all.filter((r) => r.status === 'PENDING_VERIFICATION').length;

      return {
        requests: filtered,
        pendingCount,
        totalCount: all.length
      };
    } catch (err) {
      sanitizeDbError(err, 'getAdminTopupQueue');
    }
  }

  async function adminApproveTopup(authUser: AuthUser, body: Record<string, unknown> = {}) {
    const adminEmail = assertAdmin(authUser, 'Hanya Admin/Owner yang dapat menyetujui (Approve) Top-Up.');
    const topupId = String(body?.topupId || '').trim();
    if (!topupId) {
      throw createHttpError(400, 'ID transaksi Top-Up wajib diisi.', 'INVALID_TOPUP_ID');
    }

    try {
      const cfg = loadConfig();
      return await db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(topupRequests)
          .where(eq(topupRequests.id, topupId))
          .for('update');
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

        const targetProfile = await getOrCreateProfileTx(
          tx,
          { uid: target.userId, email: target.akun, emailVerified: true, createdAtMs: null },
          cfg
        );
        const payload = (target.payload && typeof target.payload === 'object' ? { ...(target.payload as Record<string, unknown>) } : {});
        const nowDt = new Date(nowFn());
        const nowIso = nowDt.toISOString();
        const creditDiamonds = round4(payload.diamonds || 0);
        const creditGold = round4(payload.bonus_gold || 0);

        const beforeDiamond = round4(targetProfile.diamond);
        const beforeGold = round4(targetProfile.gold);

        const [updatedProfile] = await tx
          .update(profiles)
          .set({
            diamond: sql`ROUND((COALESCE(${profiles.diamond}, 0) + ${creditDiamonds})::numeric, 4)::double precision`,
            gold: sql`ROUND((COALESCE(${profiles.gold}, 0) + ${creditGold})::numeric, 4)::double precision`,
            updatedAt: nowDt
          })
          .where(eq(profiles.uid, targetProfile.uid))
          .returning();

        const afterDiamond = round4(updatedProfile.diamond);
        const afterGold = round4(updatedProfile.gold);

        const proofLabel = payload.txid
          ? `TXID: ${String(payload.txid)}`
          : payload.reference_number
            ? `Ref: ${String(payload.reference_number)}`
            : 'Foto Struk';

        const ledgerEntries = [];
        if (creditDiamonds > 0) {
          ledgerEntries.push(
            await insertImmutableLedgerTx(tx, {
              user_id: target.userId,
              akun: updatedProfile.email || target.akun,
              jenis_transaksi: 'masuk',
              kategori: 'topup_diamond',
              mata_uang: 'diamond',
              jumlah: creditDiamonds,
              fee: 0,
              saldo_sebelum: beforeDiamond,
              saldo_sesudah: afterDiamond,
              ref_id: target.id,
              keterangan: `Top-Up Paket ${String(payload.package_name || target.packageId)} (${String(payload.payment_method_label || target.paymentMethod)}) disetujui Admin [${proofLabel}]`
            })
          );
        }

        if (creditGold > 0) {
          ledgerEntries.push(
            await insertImmutableLedgerTx(tx, {
              user_id: target.userId,
              akun: updatedProfile.email || target.akun,
              jenis_transaksi: 'masuk',
              kategori: 'topup_bonus_gold',
              mata_uang: 'gold',
              jumlah: creditGold,
              fee: 0,
              saldo_sebelum: beforeGold,
              saldo_sesudah: afterGold,
              ref_id: target.id,
              keterangan: `Bonus Gold Top-Up Paket ${String(payload.package_name || target.packageId)} (${String(payload.payment_method_label || target.paymentMethod)}) disetujui Admin`
            })
          );
        }

        payload.approved_by = adminEmail;
        payload.approved_at = nowIso;
        payload.ledger_entry_ids = ledgerEntries.map((e) => e.id);

        const [updatedTopup] = await tx
          .update(topupRequests)
          .set({
            status: 'APPROVED',
            payload,
            updatedAt: nowDt
          })
          .where(eq(topupRequests.id, topupId))
          .returning();

        return {
          topup: topupRowToClient(updatedTopup),
          wallet: profileToWallet(updatedProfile),
          ledgerEntries,
          message: `Top-Up ${target.id} disetujui! +${creditDiamonds} Diamond & +${creditGold} Gold ditambahkan ke ${updatedProfile.email} lewat Ledger.`
        };
      });
    } catch (err) {
      sanitizeDbError(err, 'adminApproveTopup');
    }
  }

  async function adminRejectTopup(authUser: AuthUser, body: Record<string, unknown> = {}) {
    const adminEmail = assertAdmin(authUser, 'Hanya Admin/Owner yang dapat menolak (Reject) Top-Up.');
    const topupId = String(body?.topupId || '').trim();
    if (!topupId) {
      throw createHttpError(400, 'ID transaksi Top-Up wajib diisi.', 'INVALID_TOPUP_ID');
    }
    const reason =
      String(body?.reason || 'Bukti transfer tidak valid / tidak ditemukan').trim().slice(0, 200) ||
      'Bukti transfer tidak valid / tidak ditemukan';

    try {
      return await db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(topupRequests)
          .where(eq(topupRequests.id, topupId))
          .for('update');
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

        const nowDt = new Date(nowFn());
        const nowIso = nowDt.toISOString();
        const payload = {
          ...((target.payload && typeof target.payload === 'object' ? target.payload : {}) as Record<string, unknown>),
          reject_reason: reason,
          rejected_by: adminEmail,
          rejected_at: nowIso
        };

        const [updatedTopup] = await tx
          .update(topupRequests)
          .set({
            status: 'REJECTED',
            payload,
            updatedAt: nowDt
          })
          .where(eq(topupRequests.id, topupId))
          .returning();

        return {
          topup: topupRowToClient(updatedTopup),
          message: `Top-Up ${target.id} ditolak (${reason}). Saldo player tetap tidak bertambah.`
        };
      });
    } catch (err) {
      sanitizeDbError(err, 'adminRejectTopup');
    }
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
    startMatch,
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
    adminRejectTopup
  };
}

export type EconomyPgService = ReturnType<typeof createEconomyPgService>;

interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
}

export function mountEconomyRoutes(app: Express, service: EconomyPgService) {
  function extractRequestMeta(req: Request): RequestMetaInput {
    const headerFwd = req.headers['x-forwarded-for'];
    const headerDev = req.headers['x-device-id'];
    const headerUa = req.headers['user-agent'];
    return {
      ip: req.ip || req.socket?.remoteAddress || '',
      forwardedFor: Array.isArray(headerFwd) ? headerFwd.join(',') : headerFwd || '',
      deviceId: String(Array.isArray(headerDev) ? headerDev[0] : headerDev || req.body?.deviceId || ''),
      userAgent: String(Array.isArray(headerUa) ? headerUa[0] : headerUa || '')
    };
  }

  async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const authHeader = req.headers.authorization || '';
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      const token = match ? match[1].trim() : '';
      const authUser = await service.verifyFirebaseIdToken(token);
      req.authUser = authUser;
      next();
    } catch (err) {
      const httpErr = err as Partial<HttpError>;
      return res.status(httpErr.status || 401).json({
        success: false,
        code: httpErr.code || 'AUTH_FAILED',
        error: httpErr.message || 'Autentikasi gagal.'
      });
    }
  }

  function handleRouteError(res: Response, err: unknown) {
    const httpErr = err as Partial<HttpError>;
    const status = httpErr.status || 500;
    const body: Record<string, unknown> = {
      success: false,
      code: httpErr.code || 'SERVER_ERROR',
      error: httpErr.message || 'Terjadi kesalahan pada server.'
    };
    if (httpErr.details) body.details = httpErr.details;
    return res.status(status).json(body);
  }

  app.get('/api/economy/wallet', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await service.getWallet(req.authUser!, extractRequestMeta(req));
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.get('/api/economy/ledger', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const entries = await service.getLedger(req.authUser!, { limit: req.query.limit });
      return res.json({ success: true, immutable: true, entries });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  const handleGetWithdrawStatus = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await service.getWithdrawStatus(req.authUser!);
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  };
  app.get('/api/economy/withdraw-status', requireAuth, handleGetWithdrawStatus);
  app.get('/api/economy/withdraw/status', requireAuth, handleGetWithdrawStatus);
  app.get('/api/withdraw/status', requireAuth, handleGetWithdrawStatus);
  app.get('/api/withdraw-status', requireAuth, handleGetWithdrawStatus);

  app.post('/api/economy/kyc/submit', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await service.submitKyc(req.authUser!, req.body || {}, extractRequestMeta(req));
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/admin/kyc/approve', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await service.adminVerifyKyc(req.authUser!, req.body || {});
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.get('/api/economy/admin/dashboard', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await service.getAdminEconomyDashboard(req.authUser!);
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/admin/security/unflag', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await service.adminClearSecurityFlag(req.authUser!, req.body || {});
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/admin/withdraw/approve', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await service.adminApproveWithdraw(req.authUser!, req.body || {});
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/admin/withdraw/reject', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await service.adminRejectWithdraw(req.authUser!, req.body || {});
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/admin/withdraw/complete', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await service.adminCompleteWithdraw(req.authUser!, req.body || {});
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.all('/api/economy/ledger*', (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET') return next();
    return res.status(403).json({
      success: false,
      code: 'LEDGER_IMMUTABLE',
      error: 'Ledger bersifat permanen (append-only) dan tidak boleh diedit atau dihapus oleh player.'
    });
  });

  const handlePostMatchStart = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await service.startMatch(req.authUser!, req.body || {}, extractRequestMeta(req));
      return res.json({ success: true, ...result });
    } catch (err) {
      return handleRouteError(res, err);
    }
  };
  app.post('/api/match/start', requireAuth, handlePostMatchStart);
  app.post('/api/economy/match/start', requireAuth, handlePostMatchStart);

  const handlePostMatchReward = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await service.claimMatchReward(req.authUser!, req.body || {}, extractRequestMeta(req));
      return res.json({ success: true, ...result });
    } catch (err) {
      return handleRouteError(res, err);
    }
  };
  app.post('/api/economy/match-reward', requireAuth, handlePostMatchReward);
  app.post('/api/match/reward', requireAuth, handlePostMatchReward);

  const handlePostConvert = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await service.executeConversion(req.authUser!, req.body || {}, extractRequestMeta(req));
      return res.json({ success: true, ...result });
    } catch (err) {
      return handleRouteError(res, err);
    }
  };
  app.post('/api/economy/convert', requireAuth, handlePostConvert);
  app.post('/api/convert', requireAuth, handlePostConvert);

  app.post('/api/economy/weekly-sink', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await service.settleWeeklySink(req.authUser!, req.body || {});
      return res.json({ success: true, ...result });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/withdraw-request', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await service.requestWithdraw(req.authUser!, req.body || {}, extractRequestMeta(req));
      return res.json({ success: true, ...result });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/spend', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await service.spendOrTrade(req.authUser!, req.body || {});
      return res.json({ success: true, ...result });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/admin/reset', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await service.adminResetWallet(req.authUser!);
      return res.json({ success: true, ...result });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.get('/api/economy/topup/config', (_req: Request, res: Response) => {
    try {
      const data = service.getTopupConfig();
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.get('/api/economy/topup/solana-qr.svg', async (_req: Request, res: Response) => {
    try {
      const svg = await service.getSolanaQrSvg();
      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(svg);
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.get('/api/economy/topup/my-requests', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await service.getMyTopupRequests(req.authUser!);
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  app.post('/api/economy/topup/request', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await service.submitTopupRequest(req.authUser!, req.body || {}, extractRequestMeta(req));
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  const handleGetAdminTopupQueue = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await service.getAdminTopupQueue(req.authUser!, { status: req.query?.status });
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  };

  const handlePostAdminTopupApprove = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await service.adminApproveTopup(req.authUser!, req.body || {});
      return res.json({ success: true, ...data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  };

  const handlePostAdminTopupReject = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await service.adminRejectTopup(req.authUser!, req.body || {});
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
