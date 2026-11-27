CREATE TABLE "ledger" (
	"seq" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"waktu" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"akun" text NOT NULL,
	"jenis_transaksi" text NOT NULL,
	"kategori" text NOT NULL,
	"mata_uang" text NOT NULL,
	"jumlah" double precision NOT NULL,
	"fee" double precision DEFAULT 0 NOT NULL,
	"saldo_sebelum" double precision NOT NULL,
	"saldo_sesudah" double precision NOT NULL,
	"ref_id" text,
	"keterangan" text DEFAULT '' NOT NULL,
	CONSTRAINT "ledger_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"opponent" text NOT NULL,
	"home_score" integer NOT NULL,
	"away_score" integer NOT NULL,
	"result" text NOT NULL,
	"reward_currency" double precision DEFAULT 0 NOT NULL,
	"match_date_london" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"uid" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"diamond" double precision DEFAULT 0 NOT NULL,
	"gold" double precision DEFAULT 0 NOT NULL,
	"currency" double precision DEFAULT 0 NOT NULL,
	"daily_matches" integer DEFAULT 0 NOT NULL,
	"last_match_date" text,
	"last_match_timestamp" timestamp with time zone,
	"total_matches" integer DEFAULT 0 NOT NULL,
	"last_weekly_claim_at" timestamp with time zone,
	"last_weekly_week_key" text,
	"last_weekly_london_date" text,
	"active_withdraw_id" text,
	"last_withdraw_at" timestamp with time zone,
	"kyc_verified" boolean DEFAULT false NOT NULL,
	"kyc_status" text DEFAULT 'unverified' NOT NULL,
	"kyc_submitted_at" timestamp with time zone,
	"kyc_verified_at" timestamp with time zone,
	"kyc_identity_hash" text,
	"kyc_data" jsonb,
	"security" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"account_created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"seq" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"waktu" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"akun" text NOT NULL,
	"event_type" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"ip" text,
	"device_id" text,
	"detail" text DEFAULT '' NOT NULL,
	"meta" jsonb,
	CONSTRAINT "security_events_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "topup_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"akun" text NOT NULL,
	"status" text DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	"payment_method" text NOT NULL,
	"package_id" text NOT NULL,
	"reference_code" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdraw_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"akun" text NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_user_id_profiles_uid_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("uid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_id_profiles_uid_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("uid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topup_requests" ADD CONSTRAINT "topup_requests_user_id_profiles_uid_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("uid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdraw_queue" ADD CONSTRAINT "withdraw_queue_user_id_profiles_uid_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("uid") ON DELETE no action ON UPDATE no action;