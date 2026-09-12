-- Private append-only draft revisions. No existing rows/tables are modified.
CREATE TABLE IF NOT EXISTS project_contract_drafts (
  project_id text NOT NULL REFERENCES contract_projects(id),
  revision integer NOT NULL CHECK (revision > 0),
  template_version text NOT NULL,
  fields jsonb NOT NULL CHECK (jsonb_typeof(fields) = 'object'),
  saved_by text NOT NULL REFERENCES users(id),
  saved_at timestamptz NOT NULL,
  PRIMARY KEY (project_id, revision)
);
