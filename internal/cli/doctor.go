package cli

import (
	"errors"
	"fmt"
	"os/exec"
	"text/tabwriter"

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
	out := cmd.OutOrStdout()
	if result.OK {
		fmt.Fprintln(out, "yyork doctor passed.")
	} else {
		fmt.Fprintln(out, "yyork doctor found issues.")
	}

	tw := tabwriter.NewWriter(out, 0, 0, 2, ' ', 0)
	fmt.Fprintln(tw, "CHECK\tSTATUS\tDETAIL")
	for _, check := range result.Checks {
		detail := check.Path
		if detail != "" && check.Source != "" {
			detail = fmt.Sprintf("%s (%s)", detail, check.Source)
		}
		if detail == "" {
			detail = check.Message
		}
		fmt.Fprintf(tw, "%s\t%s\t%s\n", check.ID, check.Status, detail)
	}
	_ = tw.Flush()
}
