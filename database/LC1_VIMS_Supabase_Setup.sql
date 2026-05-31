-- ================================================================
-- LC1 VIMS — SUPABASE DATABASE SETUP SCRIPT
-- ================================================================
-- HOW TO USE:
--   1. Log in to supabase.com → open your project
--   2. Click "SQL Editor" in the left sidebar
--   3. Paste this entire script and click "Run"
--   4. You should see "Success. No rows returned" — that is correct.
--
-- This creates one table per data module, mirroring the local
-- IndexedDB structure exactly. Each table has:
--   • id, village_id, data (full JSONB record), updated_at, deleted
--   • Searchable columns extracted from the record (for easy querying)
--   • Row Level Security enabled (open policy — add auth later)
-- ================================================================

-- ── EXTENSION ────────────────────────────────────────────────────
-- Enables automatic updated_at timestamp management
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

-- ================================================================
-- VILLAGES REGISTRY
-- One row per village that has been registered in the system
-- ================================================================
CREATE TABLE IF NOT EXISTS lc1_villages (
  village_id      TEXT PRIMARY KEY,
  village_name    TEXT,
  parish_name     TEXT,
  subcounty_name  TEXT,
  county_name     TEXT,
  district_name   TEXT,
  data            JSONB NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted         BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS lc1_villages_district ON lc1_villages(district_name);

-- ================================================================
-- RESIDENTS
-- ================================================================
CREATE TABLE IF NOT EXISTS lc1_residents (
  id              TEXT NOT NULL,
  village_id      TEXT NOT NULL,
  surname         TEXT,
  first_name      TEXT,
  other_names     TEXT,
  nin             TEXT,
  date_of_birth   DATE,
  sex             TEXT,
  status          TEXT DEFAULT 'active',
  resident_type   TEXT DEFAULT 'permanent',
  nationality     TEXT DEFAULT 'Ugandan',
  tribe           TEXT,
  religion        TEXT,
  occupation      TEXT,
  phone           TEXT,
  data            JSONB NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted         BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (id, village_id)
);
CREATE INDEX IF NOT EXISTS lc1_res_village    ON lc1_residents(village_id);
CREATE INDEX IF NOT EXISTS lc1_res_nin        ON lc1_residents(nin) WHERE nin IS NOT NULL;
CREATE INDEX IF NOT EXISTS lc1_res_status     ON lc1_residents(village_id, status);
CREATE INDEX IF NOT EXISTS lc1_res_surname    ON lc1_residents(village_id, surname);
CREATE INDEX IF NOT EXISTS lc1_res_updated    ON lc1_residents(updated_at);

-- ================================================================
-- HOUSEHOLDS
-- ================================================================
CREATE TABLE IF NOT EXISTS lc1_households (
  id              TEXT NOT NULL,
  village_id      TEXT NOT NULL,
  household_number TEXT,
  head_name       TEXT,
  zone            TEXT,
  household_type  TEXT,
  data            JSONB NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted         BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (id, village_id)
);
CREATE INDEX IF NOT EXISTS lc1_hh_village  ON lc1_households(village_id);
CREATE INDEX IF NOT EXISTS lc1_hh_updated  ON lc1_households(updated_at);

-- ================================================================
-- LAND RECORDS
-- ================================================================
CREATE TABLE IF NOT EXISTS lc1_land (
  id              TEXT NOT NULL,
  village_id      TEXT NOT NULL,
  plot_number     TEXT,
  title_ref       TEXT,
  owner_name      TEXT,
  land_use        TEXT,
  status          TEXT DEFAULT 'registered',
  dimensions      TEXT,
  data            JSONB NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted         BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (id, village_id)
);
CREATE INDEX IF NOT EXISTS lc1_land_village     ON lc1_land(village_id);
CREATE INDEX IF NOT EXISTS lc1_land_plot        ON lc1_land(village_id, plot_number);
CREATE INDEX IF NOT EXISTS lc1_land_updated     ON lc1_land(updated_at);

-- ================================================================
-- CASES
-- ================================================================
CREATE TABLE IF NOT EXISTS lc1_cases (
  id               TEXT NOT NULL,
  village_id       TEXT NOT NULL,
  case_number      TEXT,
  category         TEXT,
  status           TEXT DEFAULT 'open',
  complainant_name TEXT,
  date_reported    DATE,
  data             JSONB NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  deleted          BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (id, village_id)
);
CREATE INDEX IF NOT EXISTS lc1_cases_village   ON lc1_cases(village_id);
CREATE INDEX IF NOT EXISTS lc1_cases_status    ON lc1_cases(village_id, status);
CREATE INDEX IF NOT EXISTS lc1_cases_category  ON lc1_cases(village_id, category);
CREATE INDEX IF NOT EXISTS lc1_cases_updated   ON lc1_cases(updated_at);

-- ================================================================
-- BIRTHS
-- ================================================================
CREATE TABLE IF NOT EXISTS lc1_births (
  id              TEXT NOT NULL,
  village_id      TEXT NOT NULL,
  child_name      TEXT,
  child_surname   TEXT,
  date_of_birth   DATE,
  sex             TEXT,
  data            JSONB NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted         BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (id, village_id)
);
CREATE INDEX IF NOT EXISTS lc1_births_village  ON lc1_births(village_id);
CREATE INDEX IF NOT EXISTS lc1_births_date     ON lc1_births(village_id, date_of_birth);
CREATE INDEX IF NOT EXISTS lc1_births_updated  ON lc1_births(updated_at);

-- ================================================================
-- DEATHS
-- ================================================================
CREATE TABLE IF NOT EXISTS lc1_deaths (
  id              TEXT NOT NULL,
  village_id      TEXT NOT NULL,
  deceased_name   TEXT,
  date_of_death   DATE,
  cause_of_death  TEXT,
  data            JSONB NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted         BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (id, village_id)
);
CREATE INDEX IF NOT EXISTS lc1_deaths_village  ON lc1_deaths(village_id);
CREATE INDEX IF NOT EXISTS lc1_deaths_date     ON lc1_deaths(village_id, date_of_death);
CREATE INDEX IF NOT EXISTS lc1_deaths_updated  ON lc1_deaths(updated_at);

-- ================================================================
-- MEETINGS
-- ================================================================
CREATE TABLE IF NOT EXISTS lc1_meetings (
  id              TEXT NOT NULL,
  village_id      TEXT NOT NULL,
  meeting_type    TEXT,
  meeting_date    DATE,
  venue           TEXT,
  status          TEXT,
  data            JSONB NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted         BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (id, village_id)
);
CREATE INDEX IF NOT EXISTS lc1_meetings_village ON lc1_meetings(village_id);
CREATE INDEX IF NOT EXISTS lc1_meetings_date    ON lc1_meetings(village_id, meeting_date);
CREATE INDEX IF NOT EXISTS lc1_meetings_updated ON lc1_meetings(updated_at);

-- ================================================================
-- LETTERS & CERTIFICATES
-- ================================================================
CREATE TABLE IF NOT EXISTS lc1_letters (
  id              TEXT NOT NULL,
  village_id      TEXT NOT NULL,
  letter_type     TEXT,
  reference_number TEXT,
  resident_name   TEXT,
  issued_at       DATE,
  data            JSONB NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted         BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (id, village_id)
);
CREATE INDEX IF NOT EXISTS lc1_letters_village  ON lc1_letters(village_id);
CREATE INDEX IF NOT EXISTS lc1_letters_type     ON lc1_letters(village_id, letter_type);
CREATE INDEX IF NOT EXISTS lc1_letters_updated  ON lc1_letters(updated_at);

-- ================================================================
-- WELFARE / PDM
-- ================================================================
CREATE TABLE IF NOT EXISTS lc1_welfare (
  id              TEXT NOT NULL,
  village_id      TEXT NOT NULL,
  resident_name   TEXT,
  program_type    TEXT,
  status          TEXT,
  data            JSONB NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted         BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (id, village_id)
);
CREATE INDEX IF NOT EXISTS lc1_welfare_village  ON lc1_welfare(village_id);
CREATE INDEX IF NOT EXISTS lc1_welfare_program  ON lc1_welfare(village_id, program_type);
CREATE INDEX IF NOT EXISTS lc1_welfare_updated  ON lc1_welfare(updated_at);

-- ================================================================
-- BUSINESSES
-- ================================================================
CREATE TABLE IF NOT EXISTS lc1_businesses (
  id              TEXT NOT NULL,
  village_id      TEXT NOT NULL,
  business_name   TEXT,
  owner_name      TEXT,
  business_type   TEXT,
  status          TEXT,
  data            JSONB NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted         BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (id, village_id)
);
CREATE INDEX IF NOT EXISTS lc1_biz_village  ON lc1_businesses(village_id);
CREATE INDEX IF NOT EXISTS lc1_biz_type     ON lc1_businesses(village_id, business_type);
CREATE INDEX IF NOT EXISTS lc1_biz_updated  ON lc1_businesses(updated_at);

-- ================================================================
-- SECURITY INCIDENTS
-- ================================================================
CREATE TABLE IF NOT EXISTS lc1_security (
  id              TEXT NOT NULL,
  village_id      TEXT NOT NULL,
  incident_type   TEXT,
  date_occurred   DATE,
  status          TEXT,
  data            JSONB NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted         BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (id, village_id)
);
CREATE INDEX IF NOT EXISTS lc1_sec_village  ON lc1_security(village_id);
CREATE INDEX IF NOT EXISTS lc1_sec_type     ON lc1_security(village_id, incident_type);
CREATE INDEX IF NOT EXISTS lc1_sec_updated  ON lc1_security(updated_at);

-- ================================================================
-- COMMITTEE USERS (per village)
-- ================================================================
CREATE TABLE IF NOT EXISTS lc1_users (
  id              TEXT NOT NULL,
  village_id      TEXT NOT NULL,
  username        TEXT,
  role            TEXT,
  full_name       TEXT,
  user_status     TEXT DEFAULT 'active',
  data            JSONB NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted         BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (id, village_id)
);
CREATE INDEX IF NOT EXISTS lc1_users_village  ON lc1_users(village_id);
CREATE INDEX IF NOT EXISTS lc1_users_role     ON lc1_users(village_id, role);
CREATE INDEX IF NOT EXISTS lc1_users_updated  ON lc1_users(updated_at);

-- ================================================================
-- AUDIT LOG
-- ================================================================
CREATE TABLE IF NOT EXISTS lc1_audit (
  id              TEXT NOT NULL,
  village_id      TEXT NOT NULL,
  action          TEXT,
  store_name      TEXT,
  record_id       TEXT,
  user_id         TEXT,
  timestamp       TIMESTAMPTZ,
  data            JSONB NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted         BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (id, village_id)
);
CREATE INDEX IF NOT EXISTS lc1_audit_village    ON lc1_audit(village_id);
CREATE INDEX IF NOT EXISTS lc1_audit_action     ON lc1_audit(village_id, action);
CREATE INDEX IF NOT EXISTS lc1_audit_timestamp  ON lc1_audit(village_id, timestamp);
CREATE INDEX IF NOT EXISTS lc1_audit_updated    ON lc1_audit(updated_at);

-- ================================================================
-- SETTINGS (village configuration)
-- ================================================================
CREATE TABLE IF NOT EXISTS lc1_settings (
  id              TEXT PRIMARY KEY,   -- {village_id}_{key}
  village_id      TEXT NOT NULL,
  setting_key     TEXT NOT NULL,
  data            JSONB NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted         BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS lc1_settings_village  ON lc1_settings(village_id);
CREATE INDEX IF NOT EXISTS lc1_settings_key      ON lc1_settings(village_id, setting_key);
CREATE INDEX IF NOT EXISTS lc1_settings_updated  ON lc1_settings(updated_at);

-- ================================================================
-- AUTO-UPDATE updated_at ON EVERY ROW CHANGE
-- This ensures delta pulls always get new changes
-- ================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'lc1_villages','lc1_residents','lc1_households','lc1_land',
    'lc1_cases','lc1_births','lc1_deaths','lc1_meetings',
    'lc1_letters','lc1_welfare','lc1_businesses','lc1_security',
    'lc1_users','lc1_audit','lc1_settings'
  ]) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
       CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION update_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- ================================================================
-- ROW LEVEL SECURITY
-- Enable RLS on all tables with open policy for now.
-- You can tighten this later by adding Supabase Auth.
-- ================================================================
DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'lc1_villages','lc1_residents','lc1_households','lc1_land',
    'lc1_cases','lc1_births','lc1_deaths','lc1_meetings',
    'lc1_letters','lc1_welfare','lc1_businesses','lc1_security',
    'lc1_users','lc1_audit','lc1_settings'
  ]) LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS allow_all ON %s;
       CREATE POLICY allow_all ON %s FOR ALL USING (true) WITH CHECK (true);',
      t, t
    );
  END LOOP;
END $$;

-- ================================================================
-- VERIFICATION — run this to confirm all tables were created
-- ================================================================
SELECT table_name, 
       (SELECT COUNT(*) FROM information_schema.columns 
        WHERE table_name = t.table_name) AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name LIKE 'lc1_%'
ORDER BY table_name;

-- ================================================================
-- DONE. You should see 15 tables listed above.
-- Now go to LC1 VIMS → Settings → Sync & Backup
-- Enter your Supabase URL and anon key, test the connection,
-- and click "Sync now".
-- ================================================================
