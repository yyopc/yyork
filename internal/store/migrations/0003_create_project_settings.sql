-- +goose Up
CREATE TABLE project_settings (
    project_path           TEXT PRIMARY KEY,
    worker_workspace_mode  TEXT NOT NULL,
    updated_at             INTEGER NOT NULL
);

-- +goose Down
DROP TABLE IF EXISTS project_settings;
