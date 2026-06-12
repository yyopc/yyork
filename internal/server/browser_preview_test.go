package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"testing/fstest"
)

func TestBrowserPreviewTargetRegistrationRejectsExternalHosts(t *testing.T) {
	server := New(Config{})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/browser-preview/targets",
		strings.NewReader(`{"url":"https://google.com"}`),
	)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected external preview target to be rejected, got %d", response.Code)
	}
}

func TestBrowserPreviewTargetRegistrationRejectsPreviewHosts(t *testing.T) {
	server := New(Config{})
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/browser-preview/targets",
		strings.NewReader(`{"url":"https://yyork-preview.yyork.localhost/"}`),
	)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected preview target host to be rejected, got %d", response.Code)
	}
}

func TestBrowserPreviewTargetRegistrationUsesPreviewName(t *testing.T) {
	server := New(Config{})
	request := httptest.NewRequest(
		http.MethodPost,
		"http://127.0.0.1:4217/api/browser-preview/targets",
		strings.NewReader(`{"url":"http://localhost:3000/app","previewName":"yyork"}`),
	)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("register preview target failed with %d: %s", response.Code, response.Body.String())
	}

	var payload browserPreviewTargetResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode preview target response: %v", err)
	}
	if payload.PreviewURL != "http://yyork-preview.yyork.localhost:4217/app" {
		t.Fatalf("expected named preview URL, got %q", payload.PreviewURL)
	}
}

func TestBrowserPreviewTargetRegistrationUsesYyorkSelfPreviewName(t *testing.T) {
	server := New(Config{})
	request := httptest.NewRequest(
		http.MethodPost,
		"https://yyork.localhost/api/browser-preview/targets",
		strings.NewReader(`{"url":"https://yyork.localhost/board/demo"}`),
	)
	request.Header.Set("X-Forwarded-Proto", "https")
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("register preview target failed with %d: %s", response.Code, response.Body.String())
	}

	var payload browserPreviewTargetResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode preview target response: %v", err)
	}
	if payload.PreviewURL != "https://yyork-preview.yyork.localhost/board/demo" {
		t.Fatalf("expected yyork self-preview URL, got %q", payload.PreviewURL)
	}
}

func TestBrowserPreviewProxyInjectsBridgeIntoHTML(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Security-Policy", "script-src 'self'")
		_, _ = w.Write([]byte("<!doctype html><html><body><main>fixture app</main></body></html>"))
	}))
	t.Cleanup(upstream.Close)

	server := New(Config{})
	previewURL := registerBrowserPreviewTarget(t, server, upstream.URL+"/screen?panel=1")
	request := httptest.NewRequest(http.MethodGet, previewURL, nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected proxied HTML to succeed, got %d: %s", response.Code, response.Body.String())
	}
	body := response.Body.String()
	if !strings.Contains(body, "fixture app") {
		t.Fatalf("expected upstream HTML, got %s", body)
	}
	if !strings.Contains(body, `id="__yyork-preview-config"`) {
		t.Fatalf("expected injected preview config, got %s", body)
	}
	if !strings.Contains(body, browserPreviewBridgePath) {
		t.Fatalf("expected injected preview bridge script, got %s", body)
	}
	if !strings.Contains(body, browserPreviewAgentationPath) {
		t.Fatalf("expected injected Agentation script, got %s", body)
	}
	if csp := response.Header().Get("Content-Security-Policy"); csp != "" {
		t.Fatalf("expected CSP to be removed for injected local preview, got %q", csp)
	}
}

func TestBrowserPreviewProxyStripsMetaCSP(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<!doctype html><html><head>` +
			`<meta http-equiv="Content-Security-Policy" content="default-src 'self'">` +
			`<meta http-equiv="content-security-policy-report-only" content="default-src 'self'">` +
			`</head><body><main>fixture app</main></body></html>`))
	}))
	t.Cleanup(upstream.Close)

	server := New(Config{})
	previewURL := registerBrowserPreviewTarget(t, server, upstream.URL)
	request := httptest.NewRequest(http.MethodGet, previewURL, nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected proxied HTML to succeed, got %d: %s", response.Code, response.Body.String())
	}
	body := response.Body.String()
	// A surviving meta CSP blocks Agentation's runtime-injected styles, so the
	// toolbar renders unstyled. The proxy must strip it like the header.
	if strings.Contains(strings.ToLower(body), "content-security-policy") {
		t.Fatalf("expected meta CSP to be stripped from proxied HTML, got %s", body)
	}
	if !strings.Contains(body, "fixture app") {
		t.Fatalf("expected upstream HTML to be preserved, got %s", body)
	}
	if !strings.Contains(body, browserPreviewAgentationPath) {
		t.Fatalf("expected injected Agentation script, got %s", body)
	}
}

func TestBrowserPreviewProxyPreservesNonHTMLAssets(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/javascript")
		_, _ = w.Write([]byte("window.fixture = true;"))
	}))
	t.Cleanup(upstream.Close)

	server := New(Config{})
	previewURL := registerBrowserPreviewTarget(t, server, upstream.URL+"/app.js")
	request := httptest.NewRequest(http.MethodGet, previewURL, nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected proxied asset to succeed, got %d", response.Code)
	}
	body := response.Body.String()
	if body != "window.fixture = true;" {
		t.Fatalf("expected asset body to be unchanged, got %q", body)
	}
	if strings.Contains(body, browserPreviewBridgePath) {
		t.Fatalf("expected non-HTML asset not to receive bridge injection")
	}
	if strings.Contains(body, browserPreviewAgentationPath) {
		t.Fatalf("expected non-HTML asset not to receive Agentation injection")
	}
}

func TestBrowserPreviewProxyCanServeYyorkItselfOnSamePort(t *testing.T) {
	server := New(Config{
		WebFS: dashboardFixtureFS(),
	})
	request := httptest.NewRequest(
		http.MethodPost,
		"http://127.0.0.1:4217/api/browser-preview/targets",
		strings.NewReader(`{"url":"http://127.0.0.1:4217/board/demo"}`),
	)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("register preview target failed with %d: %s", response.Code, response.Body.String())
	}

	var payload browserPreviewTargetResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode preview target response: %v", err)
	}
	if payload.PreviewURL != "http://yyork-preview.yyork.localhost:4217/board/demo" {
		t.Fatalf("expected yyork self-preview URL, got %q", payload.PreviewURL)
	}

	previewRequest := httptest.NewRequest(http.MethodGet, payload.PreviewURL, nil)
	previewResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(previewResponse, previewRequest)

	if previewResponse.Code != http.StatusOK {
		t.Fatalf("expected self preview to succeed, got %d: %s", previewResponse.Code, previewResponse.Body.String())
	}
	body := previewResponse.Body.String()
	if !strings.Contains(body, "dashboard fixture") {
		t.Fatalf("expected dashboard HTML, got %s", body)
	}
	if !strings.Contains(body, browserPreviewBridgePath) {
		t.Fatalf("expected self preview to receive bridge injection, got %s", body)
	}
	if !strings.Contains(body, browserPreviewAgentationPath) {
		t.Fatalf("expected self preview to receive Agentation injection, got %s", body)
	}
}

func TestBrowserPreviewProxyBlocksExternalRedirects(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Location", "https://google.com")
		w.WriteHeader(http.StatusFound)
	}))
	t.Cleanup(upstream.Close)

	server := New(Config{})
	previewURL := registerBrowserPreviewTarget(t, server, upstream.URL)
	request := httptest.NewRequest(http.MethodGet, previewURL, nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusBadGateway {
		t.Fatalf("expected external redirect to be blocked, got %d", response.Code)
	}
}

func TestBrowserPreviewProxyReusesPreviewHostOnRedirect(t *testing.T) {
	// Simulate Portless upgrading the proxied target from http to https (the
	// real failure: previewing http://yyork.localhost/ 302s to https). The proxy
	// must keep the iframe on the preview host it already loaded — that host is
	// routable to this server — instead of minting a new slug from the https
	// origin, which in dev would route to the raw app with no injection.
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Location", "https://yyork.localhost/board")
		w.WriteHeader(http.StatusFound)
	}))
	t.Cleanup(upstream.Close)

	server := New(Config{})
	previewURL := registerBrowserPreviewTarget(t, server, upstream.URL+"/")
	parsedPreview, err := url.Parse(previewURL)
	if err != nil {
		t.Fatalf("parse preview URL: %v", err)
	}
	previewHost := parsedPreview.Hostname()

	request := httptest.NewRequest(http.MethodGet, previewURL, nil)
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusFound {
		t.Fatalf("expected redirect passthrough, got %d: %s", response.Code, response.Body.String())
	}
	location := response.Header().Get("Location")
	if !strings.Contains(location, previewHost) {
		t.Fatalf("expected redirect to reuse preview host %q, got %q", previewHost, location)
	}
	if strings.Contains(location, "https-yyork-localhost-preview") {
		t.Fatalf("redirect minted a new (unroutable) preview slug: %q", location)
	}

	// The reused preview host must now point at the redirected https origin so
	// the follow-up request proxies https (with injection), not the stale http.
	gotTarget, ok := server.browserPreviewTarget(previewHost)
	if !ok {
		t.Fatalf("expected preview host %q to stay registered after redirect", previewHost)
	}
	if gotTarget.Scheme != "https" || gotTarget.Host != "yyork.localhost" {
		t.Fatalf("expected preview host repointed to https://yyork.localhost, got %s", gotTarget.String())
	}
}

func TestBrowserPreviewProxyServesVendoredBridge(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))
	t.Cleanup(upstream.Close)

	server := New(Config{})
	previewURL := registerBrowserPreviewTarget(t, server, upstream.URL)
	request := httptest.NewRequest(http.MethodGet, previewURL, nil)
	request.URL.Path = browserPreviewBridgePath
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected bridge asset to be served, got %d", response.Code)
	}
	if contentType := response.Header().Get("Content-Type"); !strings.Contains(contentType, "text/javascript") {
		t.Fatalf("expected JavaScript content type, got %q", contentType)
	}
	if !strings.Contains(response.Body.String(), "yyork-preview-bridge") {
		t.Fatalf("expected vendored bridge script, got %s", response.Body.String())
	}
}

func TestBrowserPreviewProxyServesAgentationBundle(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))
	t.Cleanup(upstream.Close)

	server := New(Config{
		WebFS: fstest.MapFS{
			"index.html": {
				Data: []byte("dashboard fixture"),
			},
			strings.TrimPrefix(browserPreviewAgentationPath, "/"): {
				Data: []byte("window.__yyorkAgentationLoaded = true;"),
			},
		},
	})
	previewURL := registerBrowserPreviewTarget(t, server, upstream.URL)
	request := httptest.NewRequest(http.MethodGet, previewURL, nil)
	request.URL.Path = browserPreviewAgentationPath
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected Agentation asset to be served, got %d", response.Code)
	}
	if !strings.Contains(response.Body.String(), "__yyorkAgentationLoaded") {
		t.Fatalf("expected Agentation bundle asset, got %s", response.Body.String())
	}
}

func TestBrowserPreviewTargetRegistrationPreservesDashboardPort(t *testing.T) {
	server := New(Config{})
	request := httptest.NewRequest(
		http.MethodPost,
		"http://127.0.0.1:4217/api/browser-preview/targets",
		strings.NewReader(`{"url":"http://localhost:3000/app"}`),
	)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("register preview target failed with %d: %s", response.Code, response.Body.String())
	}

	var payload browserPreviewTargetResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode preview target response: %v", err)
	}
	if !strings.Contains(payload.PreviewURL, ".yyork.localhost:4217/app") {
		t.Fatalf("expected preview URL to preserve dashboard port, got %q", payload.PreviewURL)
	}
}

func registerBrowserPreviewTarget(t *testing.T, server *Server, targetURL string) string {
	t.Helper()

	request := httptest.NewRequest(
		http.MethodPost,
		"https://yyork.localhost/api/browser-preview/targets",
		strings.NewReader(`{"url":"`+targetURL+`"}`),
	)
	request.Header.Set("X-Forwarded-Proto", "https")
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("register preview target failed with %d: %s", response.Code, response.Body.String())
	}

	var payload browserPreviewTargetResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode preview target response: %v", err)
	}
	if payload.PreviewURL == "" {
		t.Fatal("expected non-empty preview URL")
	}
	return payload.PreviewURL
}
