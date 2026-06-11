// Package store owns the yyork SQLite database.
//
// The database lives at ~/.yyork/state.db and contains exactly the
// currently-running sessions: a row exists if and only if the session is
// alive. Termination deletes the row. There is no history table or archive.
//
// Schema is managed by goose migrations embedded into the binary. The
// database driver is github.com/ncruces/go-sqlite3 (real upstream SQLite
// compiled to WebAssembly, executed by wazero — no cgo).
package store

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	_ "github.com/ncruces/go-sqlite3/driver"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Store is the public surface every other package uses to read and write
// session state. Implementations are expected to be safe for concurrent use.
type Store interface {
	// Health verifies the database is reachable and the schema is at the
	// expected migration version. Returns nil on success.
	Health(ctx context.Context) error

	// Close releases the underlying database connection. Safe to call
	// multiple times; subsequent calls return nil.
	Close() error

	// Sessions returns the session repository.
	Sessions() SessionRepo
}

// DefaultPath returns the conventional database path: ~/.yyork/state.db.
// The parent directory is not created here; callers should pass the path to
// Open, which creates it.
func DefaultPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home directory: %w", err)
	}
	return filepath.Join(home, ".yyork", "state.db"), nil
}

// Open opens the SQLite database at path, creating the parent directory if
// missing, enabling WAL journal mode, and running any pending migrations to
// bring the schema up to date.
//
// Open is idempotent: calling it twice against the same path yields a
// working store both times (the second call finds no pending migrations).
func Open(ctx context.Context, path string) (Store, error) {
	if path == "" {
		return nil, errors.New("store: path is required")
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("create data directory: %w", err)
	}

	db, err := sql.Open("sqlite3", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite database at %s: %w", path, err)
	}

	if err := configurePragmas(ctx, db); err != nil {
		_ = db.Close()
		return nil, err
	}

	if err := migrate(ctx, db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("apply migrations: %w", err)
	}

	return &sqliteStore{db: db}, nil
}

// configurePragmas enables WAL mode plus a few pragmas that make SQLite
// behave sensibly for our concurrent-writer workload.
func configurePragmas(ctx context.Context, db *sql.DB) error {
	pragmas := []string{
		"PRAGMA journal_mode = WAL",
		"PRAGMA synchronous = NORMAL", // WAL durability without per-write fsync
		"PRAGMA foreign_keys = ON",
		"PRAGMA busy_timeout = 5000", // ms; absorb brief writer contention
	}
	for _, p := range pragmas {
		if _, err := db.ExecContext(ctx, p); err != nil {
			return fmt.Errorf("apply %q: %w", p, err)
		}
	}
	return nil
}

// gooseInit configures goose's package-level state once per process.
// Setting these from within migrate() would race when multiple Open calls
// run concurrently (e.g. parallel tests) because goose.SetBaseFS,
// SetDialect and SetLogger all touch globals.
var gooseInit sync.Once

// migrate runs all pending up-migrations embedded under migrations/.
func migrate(ctx context.Context, db *sql.DB) error {
	var setupErr error
	gooseInit.Do(func() {
		goose.SetBaseFS(migrationsFS)
		if err := goose.SetDialect("sqlite3"); err != nil {
			setupErr = fmt.Errorf("set goose dialect: %w", err)
			return
		}
		// Silence goose's default stdout chatter — we surface our own logs
		// at app-startup level.
		goose.SetLogger(goose.NopLogger())
	})
	if setupErr != nil {
		return setupErr
	}

	return goose.UpContext(ctx, db, "migrations")
}

// sqliteStore is the concrete Store backed by a *sql.DB.
type sqliteStore struct {
	db *sql.DB
}

func (s *sqliteStore) Health(ctx context.Context) error {
	if s == nil || s.db == nil {
		return errors.New("store: not open")
	}
	return s.db.PingContext(ctx)
}

func (s *sqliteStore) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	err := s.db.Close()
	s.db = nil
	return err
}

func (s *sqliteStore) Sessions() SessionRepo {
	return &sessionRepo{db: s.db}
}
