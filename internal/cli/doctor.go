package cli

import (
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/spf13/cobra"

	"github.com/yyopc/yyork/internal/durabilityprovider"
)

const (
	doctorStatusOK      = "ok"
	doctorStatusMissing = "missing"

	doctorCategoryRuntime = "runtime"
	doctorCategoryAgent   = "agent"
)

var errDoctorFailed = errors.New("doctor: required runtime dependencies are missing")

type executableLookup func(string) (string, error)
type zellijBinaryLookup func() (durabilityprovider.ZellijBinary, error)

type doctorToolSpec struct {
	ID             string
	Command        string
	Category       string
	Required       bool
	MissingMessage string
}

type doctorOutput struct {
	OK     bool                `json:"ok"`
	Checks []doctorCheckOutput `json:"checks"`
}

type doctorCheckOutput struct {
	ID       string `json:"id"`
	Command  string `json:"command,omitempty"`
	Category string `json:"category"`
	Required bool   `json:"required"`
	Status   string `json:"status"`
	Path     string `json:"path,omitempty"`
	Source   string `json:"source,omitempty"`
	Message  string `json:"message,omitempty"`
}

type doctorTextStyles struct {
	titleOK       lipgloss.Style
	titleError    lipgloss.Style
	section       lipgloss.Style
	statusOK      lipgloss.Style
	statusWarning lipgloss.Style
	statusError   lipgloss.Style
	dim           lipgloss.Style
}

func newDoctorCmd() *cobra.Command {
	return newDoctorCmdWithLookups(exec.LookPath, durabilityprovider.ResolveZellijBinary)
}

func newDoctorCmdWithLookup(lookup executableLookup) *cobra.Command {
	return newDoctorCmdWithLookups(lookup, func() (durabilityprovider.ZellijBinary, error) {
		path, err := lookup("zellij")
		if err != nil {
			return durabilityprovider.ZellijBinary{}, err
		}
		return durabilityprovider.ZellijBinary{
			Path:   path,
			Source: durabilityprovider.ZellijBinarySourcePath,
		}, nil
	})
}

func newDoctorCmdWithLookups(lookup executableLookup, zellijLookup zellijBinaryLookup) *cobra.Command {
	var jsonOutput bool

	cmd := &cobra.Command{
		Use:     "doctor",
		GroupID: groupCore,
		Short:   "Check whether yyork can run on this system.",
		Long: "Check the runtime dependencies visible to yyork.\n\n" +
			"doctor reports required tools such as git and zellij, then reports " +
			"available agent CLIs. It exits nonzero when yyork cannot run sessions " +
			"as expected.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runDoctor(cmd, lookup, zellijLookup, jsonOutput)
		},
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	cmd.Flags().BoolVar(&jsonOutput, "json", false, "write machine-readable JSON to stdout")
	return cmd
}

func runDoctor(cmd *cobra.Command, lookup executableLookup, zellijLookup zellijBinaryLookup, jsonOutput bool) error {
	result := checkRuntimeDependencies(lookup, zellijLookup)
	if jsonOutput {
		if err := writeJSON(cmd, result); err != nil {
			return err
		}
	} else {
		writeDoctorText(cmd, result)
	}
	if !result.OK {
		return errDoctorFailed
	}
	return nil
}

func checkRuntimeDependencies(lookup executableLookup, zellijLookup zellijBinaryLookup) doctorOutput {
	specs := []doctorToolSpec{
		{
			ID:             "git",
			Command:        "git",
			Category:       doctorCategoryRuntime,
			Required:       true,
			MissingMessage: "git is required for repository detection, file status, and session worktrees.",
		},
		{
			ID:             "claude-code",
			Command:        "claude",
			Category:       doctorCategoryAgent,
			Required:       false,
			MissingMessage: "Claude Code is the default agent; install it or spawn with another available agent.",
		},
		{
			ID:             "codex",
			Command:        "codex",
			Category:       doctorCategoryAgent,
			Required:       false,
			MissingMessage: "Codex sessions are unavailable until the codex CLI is on PATH.",
		},
	}

	checks := make([]doctorCheckOutput, 0, len(specs)+2)
	ok := true
	agentAvailable := false
	zellij, err := zellijLookup()
	if err == nil && zellij.Path != "" {
		checks = append(checks, doctorCheckOutput{
			ID:       "zellij",
			Command:  "zellij",
			Category: doctorCategoryRuntime,
			Required: true,
			Status:   doctorStatusOK,
			Path:     zellij.Path,
			Source:   zellij.Source,
		})
	} else {
		ok = false
		checks = append(checks, doctorCheckOutput{
			ID:       "zellij",
			Command:  "zellij",
			Category: doctorCategoryRuntime,
			Required: true,
			Status:   doctorStatusMissing,
			Message:  "yyork could not find its bundled zellij runtime or a zellij binary on PATH.",
		})
	}

	for _, spec := range specs {
		path, err := lookup(spec.Command)
		check := doctorCheckOutput{
			ID:       spec.ID,
			Command:  spec.Command,
			Category: spec.Category,
			Required: spec.Required,
		}
		if err == nil && path != "" {
			check.Status = doctorStatusOK
			check.Path = path
			if spec.Category == doctorCategoryAgent {
				agentAvailable = true
			}
		} else {
			check.Status = doctorStatusMissing
			check.Message = spec.MissingMessage
			if spec.Required {
				ok = false
			}
		}
		checks = append(checks, check)
	}

	if !agentAvailable {
		ok = false
		checks = append(checks, doctorCheckOutput{
			ID:       "agent-cli",
			Category: doctorCategoryAgent,
			Required: true,
			Status:   doctorStatusMissing,
			Message:  "Install at least one supported agent CLI, such as Claude Code or Codex, before spawning sessions.",
		})
	}

	return doctorOutput{
		OK:     ok,
		Checks: checks,
	}
}

func writeDoctorText(cmd *cobra.Command, result doctorOutput) {
	writeDoctorTextOutput(cmd.OutOrStdout(), result, true)
}

func writeDoctorTextOutput(out io.Writer, result doctorOutput, styled bool) {
	_, _ = lipgloss.Fprint(out, renderDoctorText(result, newDoctorTextStyles(styled)))
}

func renderDoctorText(result doctorOutput, styles doctorTextStyles) string {
	var b strings.Builder
	if result.OK {
		b.WriteString(styles.titleOK.Render("yyork doctor passed"))
	} else {
		b.WriteString(styles.titleError.Render("yyork doctor found issues"))
	}
	b.WriteByte('\n')

	if failures := missingRequiredCheckIDs(result.Checks); len(failures) > 0 {
		b.WriteString(styles.dim.Render("Required failures: " + strings.Join(failures, ", ")))
		b.WriteByte('\n')
	}

	runtimeChecks := checksByCategory(result.Checks, doctorCategoryRuntime)
	agentChecks := checksByCategory(result.Checks, doctorCategoryAgent)

	b.WriteByte('\n')
	writeDoctorSection(&b, "Runtime requirements", runtimeChecks, styles)
	b.WriteByte('\n')
	writeDoctorSection(&b, "Agent CLI availability", agentChecks, styles)

	if steps := doctorNextSteps(result.Checks); len(steps) > 0 {
		b.WriteByte('\n')
		b.WriteString(styles.section.Render("Next steps"))
		b.WriteByte('\n')
		for _, step := range steps {
			b.WriteString("  - ")
			b.WriteString(step)
			b.WriteByte('\n')
		}
	}

	return b.String()
}

func newDoctorTextStyles(styled bool) doctorTextStyles {
	base := lipgloss.NewStyle()
	if !styled {
		return doctorTextStyles{
			titleOK:       base,
			titleError:    base,
			section:       base,
			statusOK:      base,
			statusWarning: base,
			statusError:   base,
			dim:           base,
		}
	}

	pink := lipgloss.Color("212")
	cyan := lipgloss.Color("86")
	amber := lipgloss.Color("215")
	dim := lipgloss.Color("241")

	return doctorTextStyles{
		titleOK:       base.Bold(true).Foreground(cyan),
		titleError:    base.Bold(true).Foreground(pink),
		section:       base.Bold(true),
		statusOK:      base.Bold(true).Foreground(cyan),
		statusWarning: base.Bold(true).Foreground(amber),
		statusError:   base.Bold(true).Foreground(pink),
		dim:           base.Foreground(dim),
	}
}

func writeDoctorSection(b *strings.Builder, title string, checks []doctorCheckOutput, styles doctorTextStyles) {
	b.WriteString(styles.section.Render(title))
	b.WriteByte('\n')
	if len(checks) == 0 {
		b.WriteString("  ")
		b.WriteString(styles.dim.Render("No checks reported."))
		b.WriteByte('\n')
		return
	}

	nameWidth := maxDoctorCheckIDWidth(checks)
	for _, check := range checks {
		fmt.Fprintf(
			b,
			"  %s  %-*s  %-8s  %s\n",
			doctorStatusText(check, styles),
			nameWidth,
			check.ID,
			doctorRequirementText(check),
			doctorDetailText(check),
		)
	}
}

func doctorStatusText(check doctorCheckOutput, styles doctorTextStyles) string {
	const statusWidth = 7

	switch check.Status {
	case doctorStatusOK:
		return styles.statusOK.Render(fmt.Sprintf("%-*s", statusWidth, "OK"))
	case doctorStatusMissing:
		if check.Required {
			return styles.statusError.Render(fmt.Sprintf("%-*s", statusWidth, "MISSING"))
		}
		return styles.statusWarning.Render(fmt.Sprintf("%-*s", statusWidth, "MISSING"))
	default:
		return fmt.Sprintf("%-*s", statusWidth, strings.ToUpper(check.Status))
	}
}

func doctorRequirementText(check doctorCheckOutput) string {
	if check.Required {
		return "required"
	}
	return "optional"
}

func doctorDetailText(check doctorCheckOutput) string {
	if check.Path != "" {
		if check.Source != "" {
			return fmt.Sprintf("%s (source: %s)", check.Path, check.Source)
		}
		return check.Path
	}
	return check.Message
}

func maxDoctorCheckIDWidth(checks []doctorCheckOutput) int {
	width := 0
	for _, check := range checks {
		if len(check.ID) > width {
			width = len(check.ID)
		}
	}
	return width
}

func checksByCategory(checks []doctorCheckOutput, category string) []doctorCheckOutput {
	matches := make([]doctorCheckOutput, 0, len(checks))
	for _, check := range checks {
		if check.Category == category {
			matches = append(matches, check)
		}
	}
	return matches
}

func missingRequiredCheckIDs(checks []doctorCheckOutput) []string {
	var ids []string
	for _, check := range checks {
		if check.Required && check.Status == doctorStatusMissing {
			ids = append(ids, check.ID)
		}
	}
	return ids
}

func doctorNextSteps(checks []doctorCheckOutput) []string {
	seen := make(map[string]bool)
	var steps []string
	for _, check := range checks {
		if !check.Required || check.Status != doctorStatusMissing || seen[check.ID] {
			continue
		}
		seen[check.ID] = true
		switch check.ID {
		case "git":
			steps = append(steps, "Install Git and make sure `git` is on PATH.")
		case "zellij":
			steps = append(steps, "Install a yyork package with bundled zellij, set YYORK_ZELLIJ, or put zellij on PATH.")
		case "agent-cli":
			steps = append(steps, "Install Claude Code or Codex, then rerun `yyork doctor`.")
		default:
			steps = append(steps, check.Message)
		}
	}
	return steps
}
