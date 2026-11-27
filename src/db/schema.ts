import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp
} from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
  uid: text('uid').primaryKey(),
  email: text('email').notNull(),
  diamond: doublePrecision('diamond').notNull().default(0),
  gold: doublePrecision('gold').notNull().default(0),
  currency: doublePrecision('currency').notNull().default(0),
  dailyMatches: integer('daily_matches').notNull().default(0),
  lastMatchDate: text('last_match_date'),
  lastMatchTimestamp: timestamp('last_match_timestamp', { withTimezone: true }),
  totalMatches: integer('total_matches').notNull().default(0),
  lastWeeklyClaimAt: timestamp('last_weekly_claim_at', { withTimezone: true }),
  lastWeeklyWeekKey: text('last_weekly_week_key'),
  lastWeeklyLondonDate: text('last_weekly_london_date'),
  activeWithdrawId: text('active_withdraw_id'),
  lastWithdrawAt: timestamp('last_withdraw_at', { withTimezone: true }),
  kycVerified: boolean('kyc_verified').notNull().default(false),
  kycStatus: text('kyc_status').notNull().default('unverified'),
  kycSubmittedAt: timestamp('kyc_submitted_at', { withTimezone: true }),
  kycVerifiedAt: timestamp('kyc_verified_at', { withTimezone: true }),
  kycIdentityHash: text('kyc_identity_hash'),
  kycData: jsonb('kyc_data'),
  security: jsonb('security').notNull().default({}),
  accountCreatedAt: timestamp('account_created_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const ledger = pgTable('ledger', {
  seq: serial('seq').primaryKey(),
  id: text('id').notNull().unique(),
  waktu: timestamp('waktu', { withTimezone: true }).defaultNow().notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => profiles.uid),
  akun: text('akun').notNull(),
  jenisTransaksi: text('jenis_transaksi').notNull(),
  kategori: text('kategori').notNull(),
  mataUang: text('mata_uang').notNull(),
  jumlah: doublePrecision('jumlah').notNull(),
  fee: doublePrecision('fee').notNull().default(0),
  saldoSebelum: doublePrecision('saldo_sebelum').notNull(),
  saldoSesudah: doublePrecision('saldo_sesudah').notNull(),
  refId: text('ref_id'),
  keterangan: text('keterangan').notNull().default('')
});

export const matches = pgTable('matches', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => profiles.uid),
  opponent: text('opponent').notNull(),
  homeScore: integer('home_score').notNull(),
  awayScore: integer('away_score').notNull(),
  result: text('result').notNull(),
  rewardCurrency: doublePrecision('reward_currency').notNull().default(0),
  matchDateLondon: text('match_date_london').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true })
});

export const withdrawQueue = pgTable('withdraw_queue', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => profiles.uid),
  akun: text('akun').notNull(),
  status: text('status').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const topupRequests = pgTable('topup_requests', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => profiles.uid),
  akun: text('akun').notNull(),
  status: text('status').notNull().default('PENDING_VERIFICATION'),
  paymentMethod: text('payment_method').notNull(),
  packageId: text('package_id').notNull(),
  referenceCode: text('reference_code'),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const securityEvents = pgTable('security_events', {
  seq: serial('seq').primaryKey(),
  id: text('id').notNull().unique(),
  waktu: timestamp('waktu', { withTimezone: true }).defaultNow().notNull(),
  userId: text('user_id').notNull(),
  akun: text('akun').notNull(),
  eventType: text('event_type').notNull(),
  severity: text('severity').notNull().default('medium'),
  ip: text('ip'),
  deviceId: text('device_id'),
  detail: text('detail').notNull().default(''),
  meta: jsonb('meta')
});
