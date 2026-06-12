package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// Session is the persisted shape of one running yyork session.
//
// A row exists in the `sessions` table if and only if the session is alive.
// Termination — explicit stop, reconciler-detected zellij gone, spawn
// rollback — leaves no row. There is no lifecycle_state column.
type Session struct {
	ID            string
	ProjectPath   string
	ProjectName   string
	AgentPlugin   string
	WorkspacePath string
	ZellijSession string

	// PID is the agent process id, when known. Zero if unset.
	PID int64

	// Metadata holds plugin-specific fields (codex thread id, etc.) as a
	// free-form map. It is persisted as a JSON blob in the metadata column.
	Metadata map[string]any

	CreatedAt time.Time
	UpdatedAt time.Time
}

// ErrSessionNotFound is returned by Get when no row matches the requested id.
var ErrSessionNotFound = errors.New("store: session not found")

// SessionRepo is the per-session repository surface.
type SessionRepo interface {
	// Insert persists a new session row. CreatedAt and UpdatedAt are set to
	// time.Now() if zero.
	Insert(ctx context.Context, s Session) error

	// Get returns the session with the given id, or ErrSessionNotFound if it
	// does not exist.
	Get(ctx context.Context, id string) (Session, error)

	// List returns every session in the table, ordered by created_at DESC.
	List(ctx context.Context) ([]Session, error)

	// ListByProject returns every session whose project_path matches,
	// ordered by created_at DESC.
	ListByProject(ctx context.Context, projectPath string) ([]Session, error)

	// Delete removes the row for the given id. Deleting a non-existent id is
	// a no-op (returns nil) — this matches the engine's idempotent-stop
	// contract.
	Delete(ctx context.Context, id string) error

	// UpdatePID writes a new pid value for the given session.
	UpdatePID(ctx context.Context, id string, pid int64) error

	// MergeMetadata shallow-merges the provided fields into the session's
	// metadata JSON blob, preserving keys not mentioned.
	MergeMetadata(ctx context.Context, id string, fields map[string]any) error
}

type sessionRepo struct {
	db *sql.DB
}

func (r *sessionRepo) Insert(ctx context.Context, s Session) error {
	if s.ID == "" {
		return errors.New("store: session id is required")
	}
	if s.ProjectPath == "" {
		return errors.New("store: project_path is required")
	}
	if s.AgentPlugin == "" {
		return errors.New("store: agent_plugin is required")
	}
	if s.WorkspacePath == "" {
		return errors.New("store: workspace_path is required")
	}
	if s.ZellijSession == "" {
		return errors.New("store: zellij_session is required")
	}

	now := time.Now().UTC()
	if s.CreatedAt.IsZero() {
		s.CreatedAt = now
	}
	if s.UpdatedAt.IsZero() {
		s.UpdatedAt = now
	}

	metadataJSON, err := encodeMetadata(s.Metadata)
	if err != nil {
		return err
	}

	const q = `
INSERT INTO sessions (
    id, project_path, project_name, agent_plugin, workspace_path,
    zellij_session, pid, metadata, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err = r.db.ExecContext(ctx, q,
		s.ID,
		s.ProjectPath,
		nullableString(s.ProjectName),
		s.AgentPlugin,
		s.WorkspacePath,
		s.ZellijSession,
		nullableInt(s.PID),
		nullableString(metadataJSON),
		s.CreatedAt.Unix(),
		s.UpdatedAt.Unix(),
	)
	if err != nil {
		return fmt.Errorf("insert session: %w", err)
	}
	return nil
}

func (r *sessionRepo) Get(ctx context.Context, id string) (Session, error) {
	const q = `
SELECT id, project_path, project_name, agent_plugin, workspace_path,
       zellij_session, pid, metadata, created_at, updated_at
FROM sessions WHERE id = ?`

	row := r.db.QueryRowContext(ctx, q, id)
	s, err := scanSession(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Session{}, ErrSessionNotFound
	}
	if err != nil {
		return Session{}, fmt.Errorf("get session %s: %w", id, err)
	}
	return s, nil
}

func (r *sessionRepo) List(ctx context.Context) ([]Session, error) {
	const q = `
SELECT id, project_path, project_name, agent_plugin, workspace_path,
       zellij_session, pid, metadata, created_at, updated_at
FROM sessions ORDER BY created_at DESC`

	return r.queryList(ctx, q)
}

func (r *sessionRepo) ListByProject(ctx context.Context, projectPath string) ([]Session, error) {
	const q = `
SELECT id, project_path, project_name, agent_plugin, workspace_path,
       zellij_session, pid, metadata, created_at, updated_at
FROM sessions WHERE project_path = ? ORDER BY created_at DESC`

	return r.queryList(ctx, q, projectPath)
}

func (r *sessionRepo) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete session %s: %w", id, err)
	}
	return nil
}

func (r *sessionRepo) UpdatePID(ctx context.Context, id string, pid int64) error {
	now := time.Now().UTC().Unix()
	res, err := r.db.ExecContext(ctx,
		`UPDATE sessions SET pid = ?, updated_at = ? WHERE id = ?`,
		nullableInt(pid), now, id)
	if err != nil {
		return fmt.Errorf("update session pid: %w", err)
	}
	return ensureRowAffected(res, id)
}

func (r *sessionRepo) MergeMetadata(ctx context.Context, id string, fields map[string]any) error {
	if len(fields) == 0 {
		return nil
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var current sql.NullString
	if err := tx.QueryRowContext(ctx,
		`SELECT metadata FROM sessions WHERE id = ?`, id).Scan(&current); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrSessionNotFound
		}
		return fmt.Errorf("read metadata: %w", err)
	}

	merged := map[string]any{}
	if current.Valid && current.String != "" {
		if err := json.Unmarshal([]byte(current.String), &merged); err != nil {
			return fmt.Errorf("decode current metadata: %w", err)
		}
	}
	for k, v := range fields {
		merged[k] = v
	}

	encoded, err := encodeMetadata(merged)
	if err != nil {
		return err
	}

	now := time.Now().UTC().Unix()
	res, err := tx.ExecContext(ctx,
		`UPDATE sessions SET metadata = ?, updated_at = ? WHERE id = ?`,
		nullableString(encoded), now, id)
	if err != nil {
		return fmt.Errorf("update metadata: %w", err)
	}
	if err := ensureRowAffected(res, id); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *sessionRepo) queryList(ctx context.Context, q string, args ...any) ([]Session, error) {
	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("query sessions: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var out []Session
	for rows.Next() {
		s, err := scanSession(rows)
		if err != nil {
			return nil, fmt.Errorf("scan session: %w", err)
		}
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate sessions: %w", err)
	}
	return out, nil
}

// rowScanner unifies *sql.Row and *sql.Rows for scanSession.
type rowScanner interface {
	Scan(dest ...any) error
}

func scanSession(scanner rowScanner) (Session, error) {
	var (
		s             Session
		projectName   sql.NullString
		pid           sql.NullInt64
		metadata      sql.NullString
		createdAtUnix int64
		updatedAtUnix int64
	)
	err := scanner.Scan(
		&s.ID,
		&s.ProjectPath,
		&projectName,
		&s.AgentPlugin,
		&s.WorkspacePath,
		&s.ZellijSession,
		&pid,
		&metadata,
		&createdAtUnix,
		&updatedAtUnix,
	)
	if err != nil {
		return Session{}, err
	}

	if projectName.Valid {
		s.ProjectName = projectName.String
	}
	if pid.Valid {
		s.PID = pid.Int64
	}
	if metadata.Valid && metadata.String != "" {
		m := map[string]any{}
		if err := json.Unmarshal([]byte(metadata.String), &m); err != nil {
			return Session{}, fmt.Errorf("decode metadata: %w", err)
		}
		s.Metadata = m
	}
	s.CreatedAt = time.Unix(createdAtUnix, 0).UTC()
	s.UpdatedAt = time.Unix(updatedAtUnix, 0).UTC()

	return s, nil
}

func encodeMetadata(m map[string]any) (string, error) {
	if len(m) == 0 {
		return "", nil
	}
	buf, err := json.Marshal(m)
	if err != nil {
		return "", fmt.Errorf("encode metadata: %w", err)
	}
	return string(buf), nil
}

func nullableString(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullableInt(n int64) any {
	if n == 0 {
		return nil
	}
	return n
}

func ensureRowAffected(res sql.Result, id string) error {
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if n == 0 {
		return ErrSessionNotFound
	}
	return nil
}
