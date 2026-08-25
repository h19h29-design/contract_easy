-- 초기 스키마 (drizzle-kit generate 결과와 동일하게 유지)
-- 운영 배포 시: psql "$DATABASE_URL" -f 0001_init.sql

CREATE TABLE IF NOT EXISTS crawl_runs (
  id text PRIMARY KEY,
  mode text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  status text NOT NULL,
  pages_fetched integer NOT NULL DEFAULT 0,
  pages_changed integer NOT NULL DEFAULT 0,
  attachments_fetched integer NOT NULL DEFAULT 0,
  failures integer NOT NULL DEFAULT 0,
  notes jsonb
);

CREATE TABLE IF NOT EXISTS sources (
  id text PRIMARY KEY,
  url text NOT NULL UNIQUE,
  seed_name text,
  kind text NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_checked_at timestamptz NOT NULL,
  current_version_id text,
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS source_versions (
  id text PRIMARY KEY,
  source_id text NOT NULL,
  url text NOT NULL,
  title text NOT NULL,
  menu_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at text,
  effective_at text,
  collected_at timestamptz NOT NULL,
  last_checked_at timestamptz NOT NULL,
  content_sha256 text NOT NULL,
  raw_html_path text,
  version_index integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS sv_by_source_idx ON source_versions (source_id);

CREATE TABLE IF NOT EXISTS attachments (
  id text PRIMARY KEY,
  source_version_id text NOT NULL,
  url text NOT NULL,
  file_name text NOT NULL,
  ext text NOT NULL,
  mime_type text,
  size_bytes bigint,
  sha256 text,
  saved_path text,
  robots_disallowed boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS normalized_documents (
  id text PRIMARY KEY,
  source_version_id text NOT NULL,
  format text NOT NULL,
  markdown_path text NOT NULL,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id text PRIMARY KEY,
  source_version_id text NOT NULL,
  type text NOT NULL,
  section_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  order_idx integer NOT NULL,
  text text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  tsv text
);
CREATE INDEX IF NOT EXISTS chunk_by_sv_idx ON document_chunks (source_version_id);
-- 운영 권장: CREATE INDEX IF NOT EXISTS chunk_fts_idx ON document_chunks USING gin (to_tsvector('korean', text));

CREATE TABLE IF NOT EXISTS source_links (
  id text PRIMARY KEY,
  from_source_version_id text NOT NULL,
  to_url text NOT NULL,
  link_text text,
  internal boolean NOT NULL,
  external_meta_only boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS crawl_failures (
  id serial PRIMARY KEY,
  run_id text,
  url text NOT NULL,
  category text NOT NULL,
  message text,
  at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS rules (
  id text PRIMARY KEY,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_status text NOT NULL DEFAULT 'draft',
  superseded_by text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS rule_versions (
  id text PRIMARY KEY,
  rule_id text NOT NULL,
  version integer NOT NULL,
  definition jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS rule_versions_uniq ON rule_versions (rule_id, version);

CREATE TABLE IF NOT EXISTS rule_sources (
  id text PRIMARY KEY,
  rule_version_id text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  published_at text,
  effective_from text,
  checked_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS rule_reviews (
  id text PRIMARY KEY,
  rule_version_id text NOT NULL,
  reviewer text NOT NULL,
  action text NOT NULL,
  comment text,
  at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS rule_conflicts (
  id text PRIMARY KEY,
  rule_version_id_a text NOT NULL,
  rule_version_id_b text NOT NULL,
  reason text NOT NULL,
  detected_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL,
  disabled boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS sessions (
  token text PRIMARY KEY,
  user_id text NOT NULL,
  csrf_token text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  name text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id text NOT NULL,
  role_name text NOT NULL,
  PRIMARY KEY (user_id, role_name)
);

CREATE TABLE IF NOT EXISTS contract_projects (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  name text NOT NULL,
  contract_category text NOT NULL,
  estimated_price bigint NOT NULL DEFAULT 0,
  organization_type text NOT NULL,
  status text NOT NULL DEFAULT 'planning',
  wizard_input jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS project_members (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  user_id text NOT NULL,
  role text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS project_members_uniq ON project_members (project_id, user_id);

CREATE TABLE IF NOT EXISTS project_steps (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  stage_key text NOT NULL,
  sort_order integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS project_checklist_items (
  id text PRIMARY KEY,
  step_id text NOT NULL,
  project_id text NOT NULL,
  label text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  required boolean NOT NULL DEFAULT true,
  evidence_path text,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS project_documents (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  uploaded_by text NOT NULL,
  original_name text NOT NULL,
  stored_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  is_private boolean NOT NULL DEFAULT true,
  uploaded_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS project_events (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  due_at timestamptz,
  notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS project_changes (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  change_type text NOT NULL,
  "before" jsonb,
  "after" jsonb,
  reason text,
  approved_by text,
  at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY,
  actor_user_id text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  detail jsonb,
  ip text,
  at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS answer_reports (
  id text PRIMARY KEY,
  question text NOT NULL,
  answer text,
  reporter_note text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL
);

INSERT INTO roles (name, description) VALUES
  ('PUBLIC', '비로그인 공개 조회'),
  ('USER', '자신의 계약 프로젝트 관리'),
  ('REVIEWER', '규칙 후보·출처 검토'),
  ('ADMIN', '전체 관리')
ON CONFLICT DO NOTHING;
