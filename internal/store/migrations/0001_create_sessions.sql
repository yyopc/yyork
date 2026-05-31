-- +goose Up
CREATE TABLE sessions (
    id              TEXT PRIMARY KEY,
    project_path    TEXT NOT NULL,
    project_name    TEXT,
    agent_plugin    TEXT NOT NULL,
    workspace_path  TEXT NOT NULL,
    zellij_session  TEXT NOT NULL,
    pid             INTEGER,
    metadata        TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_sessions_project ON sessions(project_path);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_sessions_updated;
DROP INDEX IF EXISTS idx_sessions_project;
DROP TABLE IF EXISTS sessions;
