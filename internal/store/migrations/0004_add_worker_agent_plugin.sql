-- +goose Up
ALTER TABLE project_settings ADD COLUMN worker_agent_plugin TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE project_settings DROP COLUMN worker_agent_plugin;
