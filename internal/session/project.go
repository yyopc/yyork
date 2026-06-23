package session

import (
	"crypto/sha256"
	"encoding/base32"
	"path/filepath"
	"strings"
)

const projectIDPrefix = "p_"

// ProjectID returns yyork's stable, URL-safe identifier for a project path.
// The absolute filesystem path remains the project source of truth; this id is
// only a route/API handle so users do not see encoded local paths in URLs.
func ProjectID(projectPath string) string {
	normalized := strings.TrimSpace(projectPath)
	if normalized == "" {
		return ""
	}
	normalized = filepath.Clean(normalized)

	sum := sha256.Sum256([]byte(normalized))
	encoded := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(sum[:16])
	return projectIDPrefix + strings.ToLower(encoded)
}

// ProjectMatches reports whether candidate identifies project. Project ids are
// preferred, while path matching keeps old URLs and CLI flags working.
func ProjectMatches(project Project, candidate string) bool {
	candidate = strings.TrimSpace(candidate)
	if candidate == "" {
		return false
	}
	return project.ID == candidate || project.Path == candidate || project.CWD == candidate
}

// SessionProjectMatches is the session equivalent of ProjectMatches.
func SessionProjectMatches(session Session, candidate string) bool {
	candidate = strings.TrimSpace(candidate)
	if candidate == "" {
		return false
	}
	return session.Project == candidate || session.ProjectPath == candidate
}
