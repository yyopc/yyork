//go:build ignore

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"
	"github.com/yyopc/yyork/internal/session"
)

const openAPIOutputPath = "api/openapi.generated.json"

type workspaceOutput struct {
	Body session.Workspace
}

func main() {
	spec, err := renderOpenAPI()
	if err != nil {
		panic(err)
	}

	if err := os.WriteFile(openAPIOutputPath, spec, 0o644); err != nil {
		panic(err)
	}
}

func renderOpenAPI() ([]byte, error) {
	api := newContractAPI()
	registerWorkspaceOperation(api)
	removeDefaultErrorSchemas(api.OpenAPI())
	if err := addWorkspaceEnumSchemas(api.OpenAPI()); err != nil {
		return nil, err
	}

	spec, err := api.OpenAPI().Downgrade()
	if err != nil {
		return nil, fmt.Errorf("downgrade OpenAPI 3.1 spec: %w", err)
	}

	var formatted bytes.Buffer
	if err := json.Indent(&formatted, spec, "", "  "); err != nil {
		return nil, fmt.Errorf("format OpenAPI spec: %w", err)
	}
	formatted.WriteByte('\n')

	return formatted.Bytes(), nil
}

func newContractAPI() huma.API {
	config := huma.DefaultConfig("yyork API", "0.0.1")
	config.OpenAPIPath = ""
	config.DocsPath = ""
	config.SchemasPath = ""
	config.Servers = []*huma.Server{{URL: "/"}}

	return humago.New(http.NewServeMux(), config)
}

func registerWorkspaceOperation(api huma.API) {
	huma.Register(api, huma.Operation{
		OperationID: "getWorkspace",
		Method:      http.MethodGet,
		Path:        "/api/workspace",
		Summary:     "Get the dashboard workspace",
		Tags:        []string{"Workspace"},
	}, func(context.Context, *struct{}) (*workspaceOutput, error) {
		return nil, nil
	})
}

func addWorkspaceEnumSchemas(spec *huma.OpenAPI) error {
	if spec.Components == nil || spec.Components.Schemas == nil {
		return fmt.Errorf("OpenAPI spec is missing component schemas")
	}

	schemas := spec.Components.Schemas.Map()
	sessionSchema, ok := schemas["Session"]
	if !ok {
		return fmt.Errorf("OpenAPI spec is missing Session schema")
	}
	projectSchema, ok := schemas["Project"]
	if !ok {
		return fmt.Errorf("OpenAPI spec is missing Project schema")
	}

	schemas["WorkerSessionState"] = stringEnumSchema(
		string(session.StateWorking),
		string(session.StatePrompt),
		string(session.StateTriage),
		string(session.StateDone),
	)
	schemas["TerminalSessionKind"] = stringEnumSchema(
		string(session.KindOrchestrator),
		string(session.KindWorker),
	)
	schemas["WorkerWorkspaceMode"] = stringEnumSchema(
		string(session.WorkerWorkspaceModeLocal),
		string(session.WorkerWorkspaceModeNewWorktree),
	)

	setPropertyRef(sessionSchema, "state", "#/components/schemas/WorkerSessionState")
	setPropertyRef(sessionSchema, "kind", "#/components/schemas/TerminalSessionKind")
	setPropertyRef(projectSchema, "workerWorkspaceMode", "#/components/schemas/WorkerWorkspaceMode")

	return nil
}

func removeDefaultErrorSchemas(spec *huma.OpenAPI) {
	if spec.Components != nil && spec.Components.Schemas != nil {
		schemas := spec.Components.Schemas.Map()
		delete(schemas, "ErrorDetail")
		delete(schemas, "ErrorModel")
	}

	path := spec.Paths["/api/workspace"]
	if path == nil || path.Get == nil {
		return
	}
	delete(path.Get.Responses, "default")
}

func stringEnumSchema(values ...string) *huma.Schema {
	enum := make([]any, 0, len(values))
	for _, value := range values {
		enum = append(enum, value)
	}
	return &huma.Schema{
		Type: "string",
		Enum: enum,
	}
}

func setPropertyRef(schema *huma.Schema, name string, ref string) {
	if schema.Properties == nil {
		schema.Properties = map[string]*huma.Schema{}
	}
	schema.Properties[name] = &huma.Schema{Ref: ref}
}
