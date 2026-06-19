package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// ProjectSettings holds project-scoped dashboard and CLI settings.
type ProjectSettings struct {
	ProjectPath         string
	WorkerWorkspaceMode string
	UpdatedAt           time.Time
}

// ErrProjectSettingsNotFound is returned by Get when no settings row matches
// the requested project path.
var ErrProjectSettingsNotFound = errors.New("store: project settings not found")

// ProjectSettingsRepo is the repository surface for project-scoped settings.
type ProjectSettingsRepo interface {
	Get(ctx context.Context, projectPath string) (ProjectSettings, error)
	List(ctx context.Context) ([]ProjectSettings, error)
	SetWorkerWorkspaceMode(ctx context.Context, projectPath string, mode string) error
}

type projectSettingsRepo struct {
	db *sql.DB
}

func (r *projectSettingsRepo) Get(ctx context.Context, projectPath string) (ProjectSettings, error) {
	const q = `
SELECT project_path, worker_workspace_mode, updated_at
FROM project_settings WHERE project_path = ?`

	row := r.db.QueryRowContext(ctx, q, projectPath)
	settings, err := scanProjectSettings(row)
	if errors.Is(err, sql.ErrNoRows) {
		return ProjectSettings{}, ErrProjectSettingsNotFound
	}
	if err != nil {
		return ProjectSettings{}, fmt.Errorf("get project settings %s: %w", projectPath, err)
	}
	return settings, nil
}

func (r *projectSettingsRepo) List(ctx context.Context) ([]ProjectSettings, error) {
	const q = `
SELECT project_path, worker_workspace_mode, updated_at
FROM project_settings ORDER BY project_path`

	rows, err := r.db.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("query project settings: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var out []ProjectSettings
	for rows.Next() {
		settings, err := scanProjectSettings(rows)
		if err != nil {
			return nil, fmt.Errorf("scan project settings: %w", err)
		}
		out = append(out, settings)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate project settings: %w", err)
	}
	return out, nil
}

func (r *projectSettingsRepo) SetWorkerWorkspaceMode(ctx context.Context, projectPath string, mode string) error {
	if projectPath == "" {
		return errors.New("store: project_path is required")
	}
	if mode == "" {
		return errors.New("store: worker_workspace_mode is required")
	}

	now := time.Now().UTC().Unix()
	const q = `
INSERT INTO project_settings (project_path, worker_workspace_mode, updated_at)
VALUES (?, ?, ?)
ON CONFLICT(project_path) DO UPDATE SET
    worker_workspace_mode = excluded.worker_workspace_mode,
    updated_at = excluded.updated_at`

	if _, err := r.db.ExecContext(ctx, q, projectPath, mode, now); err != nil {
		return fmt.Errorf("set project worker workspace mode: %w", err)
	}
	return nil
}

func scanProjectSettings(scanner rowScanner) (ProjectSettings, error) {
	var (
		settings      ProjectSettings
		updatedAtUnix int64
	)
	if err := scanner.Scan(
		&settings.ProjectPath,
		&settings.WorkerWorkspaceMode,
		&updatedAtUnix,
	); err != nil {
		return ProjectSettings{}, err
	}
	settings.UpdatedAt = time.Unix(updatedAtUnix, 0).UTC()
	return settings, nil
}
