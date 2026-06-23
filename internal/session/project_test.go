package session

import (
	"strings"
	"testing"
)

func TestProjectIDIsStableAndURLSafe(t *testing.T) {
	t.Parallel()

	first := ProjectID("/Users/me/Projects/creatives")
	second := ProjectID("/Users/me/Projects/creatives")
	other := ProjectID("/Users/me/Projects/yyork")

	if first == "" {
		t.Fatal("ProjectID returned empty id")
	}
	if first != second {
		t.Fatalf("ProjectID is not stable: %q != %q", first, second)
	}
	if first == other {
		t.Fatalf("different project paths produced the same id %q", first)
	}
	for _, forbidden := range []string{"/", "%", " "} {
		if strings.Contains(first, forbidden) {
			t.Fatalf("ProjectID %q contains %q", first, forbidden)
		}
	}
}

func TestProjectIDNormalizesEquivalentPaths(t *testing.T) {
	t.Parallel()

	if got, want := ProjectID("/repo/app/."), ProjectID("/repo/app"); got != want {
		t.Fatalf("ProjectID did not normalize clean paths: %q != %q", got, want)
	}
}

func TestProjectAndSessionMatchingAcceptsIDAndLegacyPath(t *testing.T) {
	t.Parallel()

	project := Project{
		ID:   ProjectID("/repo/app"),
		Path: "/repo/app",
		CWD:  "/repo/app",
	}
	sess := Session{
		Project:     project.ID,
		ProjectPath: project.Path,
	}

	if !ProjectMatches(project, project.ID) || !ProjectMatches(project, project.Path) {
		t.Fatalf("ProjectMatches should accept both id and path")
	}
	if !SessionProjectMatches(sess, project.ID) || !SessionProjectMatches(sess, project.Path) {
		t.Fatalf("SessionProjectMatches should accept both id and path")
	}
}
