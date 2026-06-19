package server

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	browserPreviewAgentationPath = "/__yyork_browser/agentation.js"
	browserPreviewBridgePath     = "/__yyork_browser/preview-bridge.js"
	browserPreviewHostSuffix     = "-preview.yyork.localhost"
)

var browserPreviewSlugChars = regexp.MustCompile(`[^a-z0-9]+`)

// browserPreviewMetaCSP matches a <meta http-equiv="Content-Security-Policy">
// (or the Report-Only variant) tag in any attribute order/quoting. CSP values
// never contain a literal '>', so a tag-bounded [^>]* match is safe.
var browserPreviewMetaCSP = regexp.MustCompile(
	`(?i)<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy(-report-only)?["']?[^>]*>`,
)

type browserPreviewTargetRequest struct {
	PreviewName string `json:"previewName"`
	URL         string `json:"url"`
}

type browserPreviewTargetResponse struct {
	PreviewURL string `json:"previewUrl"`
	TargetURL  string `json:"targetUrl"`
}

func (s *Server) handleBrowserPreviewTarget(w http.ResponseWriter, r *http.Request) {
	var payload browserPreviewTargetRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid preview target payload", http.StatusBadRequest)
		return
	}

	targetURL, err := parseBrowserPreviewTargetURL(payload.URL)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}

	targetOrigin := browserPreviewOrigin(targetURL)
	previewHost := browserPreviewHostForTarget(r, payload.PreviewName, targetOrigin)
	s.setBrowserPreviewTarget(previewHost, targetOrigin)

	writeJSON(w, http.StatusOK, browserPreviewTargetResponse{
		PreviewURL: browserPreviewURLForTarget(r, previewHost, targetURL),
		TargetURL:  targetURL.String(),
	})
}

func (s *Server) handleBrowserPreview(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == browserPreviewBridgePath {
		serveBrowserPreviewBridge(w)
		return
	}
	if r.URL.Path == browserPreviewAgentationPath {
		s.serveBrowserPreviewDashboardAsset(w, r, strings.TrimPrefix(browserPreviewAgentationPath, "/"))
		return
	}

	previewHost := normalizedRequestHostname(externalRequestHost(r))
	targetOrigin, ok := s.browserPreviewTarget(previewHost)
	if !ok {
		http.Error(w, "preview target not registered", http.StatusNotFound)
		return
	}

	upstreamURL := *targetOrigin
	upstreamURL.Path = r.URL.Path
	upstreamURL.RawPath = r.URL.RawPath
	upstreamURL.RawQuery = r.URL.RawQuery

	// connectURL is the address the proxy actually dials. It only diverges
	// from the logical upstreamURL for dev self-targets, where the live
	// dashboard is the Vite dev server rather than this process's embedded
	// build-time snapshot. The bridge config and redirect resolution keep
	// using targetOrigin/upstreamURL so logical URLs stay on the registered
	// host.
	connectURL := upstreamURL
	if isBrowserPreviewSelfTarget(r, targetOrigin) {
		if s.dashboardDevOrigin == nil {
			s.handleBrowserPreviewSelfTarget(w, r, targetOrigin, &upstreamURL)
			return
		}
		connectURL.Scheme = s.dashboardDevOrigin.Scheme
		connectURL.Host = s.dashboardDevOrigin.Host
	}

	// Protocol upgrades (a dev server's HMR websocket) cannot flow through
	// the buffered proxy below; tunnel them instead.
	if isBrowserPreviewUpgradeRequest(r) {
		serveBrowserPreviewUpgrade(w, r, browserPreviewOrigin(&connectURL))
		return
	}

	upstreamRequest, err := http.NewRequestWithContext(
		r.Context(),
		r.Method,
		connectURL.String(),
		r.Body,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	copyBrowserPreviewRequestHeaders(upstreamRequest.Header, r.Header)
	upstreamRequest.Host = connectURL.Host
	upstreamRequest.Header.Set("X-Forwarded-Host", externalRequestHost(r))
	upstreamRequest.Header.Set("X-Forwarded-Proto", externalRequestScheme(r))

	response, err := browserPreviewHTTPClient().Do(upstreamRequest)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return
		}
		http.Error(w, fmt.Sprintf("preview upstream failed: %v", err), http.StatusBadGateway)
		return
	}
	defer response.Body.Close()

	s.writeBrowserPreviewResponse(w, r, response, targetOrigin, &upstreamURL)
}

func (s *Server) writeBrowserPreviewResponse(
	w http.ResponseWriter,
	r *http.Request,
	response *http.Response,
	targetOrigin *url.URL,
	upstreamURL *url.URL,
) {
	if isRedirectStatus(response.StatusCode) {
		s.handleBrowserPreviewRedirect(w, r, response, upstreamURL)
		return
	}

	if shouldInjectBrowserPreviewBridge(r.Method, response.Header) {
		body, err := io.ReadAll(response.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}

		copyBrowserPreviewResponseHeaders(w.Header(), response.Header)
		removeBrowserPreviewInjectionHeaders(w.Header())
		injected := injectBrowserPreviewBridge(body, browserPreviewBridgeConfig{
			TargetOrigin: targetOrigin.String(),
		})
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Length", fmt.Sprintf("%d", len(injected)))
		w.WriteHeader(response.StatusCode)
		_, _ = w.Write(injected)
		return
	}

	copyBrowserPreviewResponseHeaders(w.Header(), response.Header)
	w.WriteHeader(response.StatusCode)
	_, _ = io.Copy(w, response.Body)
}

func (s *Server) handleBrowserPreviewSelfTarget(
	w http.ResponseWriter,
	r *http.Request,
	targetOrigin *url.URL,
	upstreamURL *url.URL,
) {
	internalRequest := r.Clone(r.Context())
	internalRequest.URL = &url.URL{
		Scheme:   targetOrigin.Scheme,
		Host:     targetOrigin.Host,
		Path:     r.URL.Path,
		RawPath:  r.URL.RawPath,
		RawQuery: r.URL.RawQuery,
	}
	internalRequest.Host = targetOrigin.Host
	internalRequest.Header = r.Header.Clone()
	internalRequest.Header.Del("X-Forwarded-Host")
	internalRequest.Header.Del("X-Forwarded-Proto")

	response := newBufferedResponseWriter()
	s.handleDashboard(response, internalRequest)

	s.writeBrowserPreviewResponse(
		w,
		r,
		response.toHTTPResponse(),
		targetOrigin,
		upstreamURL,
	)
}

func (s *Server) setBrowserPreviewTarget(previewHost string, targetOrigin *url.URL) {
	s.previewTargetsMu.Lock()
	defer s.previewTargetsMu.Unlock()
	s.previewTargets[previewHost] = targetOrigin
}

func (s *Server) browserPreviewTarget(previewHost string) (*url.URL, bool) {
	s.previewTargetsMu.RLock()
	defer s.previewTargetsMu.RUnlock()
	targetOrigin, ok := s.previewTargets[previewHost]
	return targetOrigin, ok
}

func parseBrowserPreviewTargetURL(value string) (*url.URL, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil, fmt.Errorf("preview URL is required")
	}

	targetURL, err := url.Parse(trimmed)
	if err != nil || targetURL.Scheme == "" || targetURL.Host == "" {
		return nil, fmt.Errorf("enter a valid preview URL")
	}
	if targetURL.Scheme != "http" && targetURL.Scheme != "https" {
		return nil, fmt.Errorf("yyork Browser only supports HTTP and HTTPS preview URLs")
	}
	if !isLocalBrowserPreviewHostname(targetURL.Hostname()) {
		return nil, fmt.Errorf("yyork Browser only supports localhost, loopback, wildcard bind, and *.localhost preview URLs")
	}
	if isBrowserPreviewHost(targetURL.Hostname()) {
		return nil, fmt.Errorf("yyork Browser preview URLs cannot be used as preview targets")
	}
	return targetURL, nil
}

func browserPreviewOrigin(targetURL *url.URL) *url.URL {
	return &url.URL{
		Scheme: targetURL.Scheme,
		Host:   targetURL.Host,
	}
}

func browserPreviewURLForTarget(r *http.Request, previewHost string, targetURL *url.URL) string {
	previewURL := &url.URL{
		Scheme:   externalRequestScheme(r),
		Host:     browserPreviewPublicHost(r, previewHost),
		Path:     targetURL.Path,
		RawPath:  targetURL.RawPath,
		RawQuery: targetURL.RawQuery,
		Fragment: targetURL.Fragment,
	}
	if previewURL.Path == "" {
		previewURL.Path = "/"
	}
	return previewURL.String()
}

func browserPreviewPublicHost(r *http.Request, previewHost string) string {
	_, port, err := net.SplitHostPort(externalRequestHost(r))
	if err != nil || port == "" {
		return previewHost
	}
	return net.JoinHostPort(previewHost, port)
}

func browserPreviewHostForTarget(
	r *http.Request,
	previewName string,
	targetOrigin *url.URL,
) string {
	if slug := browserPreviewNameSlug(previewName); slug != "" {
		return slug + browserPreviewHostSuffix
	}
	if slug := browserPreviewSelfTargetSlug(r, targetOrigin); slug != "" {
		return slug + browserPreviewHostSuffix
	}
	return browserPreviewHostForOrigin(targetOrigin)
}

func browserPreviewHostForOrigin(targetOrigin *url.URL) string {
	hostLabel := targetOrigin.Hostname()
	hostLabel = strings.ToLower(strings.Trim(hostLabel, "[]"))
	hostLabel = browserPreviewSlugChars.ReplaceAllString(hostLabel, "-")
	hostLabel = strings.Trim(hostLabel, "-")
	if hostLabel == "" {
		hostLabel = "local"
	}

	port := targetOrigin.Port()
	if port != "" {
		hostLabel += "-" + port
	}

	slug := targetOrigin.Scheme + "-" + hostLabel
	if len(slug) > 46 {
		hash := sha256.Sum256([]byte(targetOrigin.String()))
		slug = strings.TrimSuffix(slug[:46], "-") + "-" + hex.EncodeToString(hash[:])[:12]
	}

	return slug + browserPreviewHostSuffix
}

func browserPreviewNameSlug(value string) string {
	slug := strings.ToLower(strings.TrimSpace(value))
	slug = browserPreviewSlugChars.ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		return ""
	}
	if len(slug) > 63-len(browserPreviewHostSuffix) {
		hash := sha256.Sum256([]byte(slug))
		slug = strings.TrimSuffix(slug[:63-len(browserPreviewHostSuffix)-13], "-") +
			"-" +
			hex.EncodeToString(hash[:])[:12]
	}
	return slug
}

func browserPreviewSelfTargetSlug(r *http.Request, targetOrigin *url.URL) string {
	if normalizedRequestHostname(targetOrigin.Host) == "yyork.localhost" {
		return "yyork"
	}
	if externalRequestScheme(r) == targetOrigin.Scheme &&
		normalizedRequestHostname(externalRequestHost(r)) == normalizedRequestHostname(targetOrigin.Host) &&
		requestPortForScheme(externalRequestScheme(r), externalRequestHost(r)) ==
			requestPortForScheme(targetOrigin.Scheme, targetOrigin.Host) {
		return "yyork"
	}
	return ""
}

func isBrowserPreviewHost(host string) bool {
	hostname := normalizedRequestHostname(host)
	return strings.HasSuffix(hostname, browserPreviewHostSuffix)
}

func isBrowserPreviewSelfTarget(r *http.Request, targetOrigin *url.URL) bool {
	requestHost := normalizedRequestHostname(externalRequestHost(r))
	requestPort := requestPortForScheme(externalRequestScheme(r), externalRequestHost(r))
	targetPort := requestPortForScheme(targetOrigin.Scheme, targetOrigin.Host)
	if requestPort == "" || requestPort != targetPort {
		return false
	}

	targetHostname := normalizedRequestHostname(targetOrigin.Host)
	return isLoopbackBrowserPreviewHostname(targetHostname) ||
		targetHostname == "yyork.localhost" ||
		(strings.HasSuffix(requestHost, browserPreviewHostSuffix) &&
			strings.HasSuffix(targetHostname, ".yyork.localhost"))
}

func normalizedRequestHostname(host string) string {
	hostname := strings.TrimSpace(host)
	if parsedHost, _, err := net.SplitHostPort(hostname); err == nil {
		hostname = parsedHost
	}
	return strings.ToLower(strings.TrimSuffix(hostname, "."))
}

func requestPortForScheme(scheme string, host string) string {
	_, port, err := net.SplitHostPort(host)
	if err == nil && port != "" {
		return port
	}
	switch scheme {
	case "http":
		return "80"
	case "https":
		return "443"
	default:
		return ""
	}
}

func isLocalBrowserPreviewHostname(hostname string) bool {
	normalized := strings.ToLower(strings.Trim(hostname, "[]"))
	return normalized == "localhost" ||
		strings.HasSuffix(normalized, ".localhost") ||
		normalized == "::1" ||
		normalized == "::" ||
		normalized == "0.0.0.0" ||
		strings.HasPrefix(normalized, "127.")
}

func isLoopbackBrowserPreviewHostname(hostname string) bool {
	normalized := strings.ToLower(strings.Trim(hostname, "[]"))
	return normalized == "localhost" ||
		normalized == "::1" ||
		normalized == "0.0.0.0" ||
		strings.HasPrefix(normalized, "127.")
}

func externalRequestScheme(r *http.Request) string {
	if forwardedProto := r.Header.Get("X-Forwarded-Proto"); forwardedProto != "" {
		proto, _, _ := strings.Cut(forwardedProto, ",")
		proto = strings.ToLower(strings.TrimSpace(proto))
		if proto == "http" || proto == "https" {
			return proto
		}
	}
	if r.TLS != nil {
		return "https"
	}
	if r.URL.Scheme == "http" || r.URL.Scheme == "https" {
		return r.URL.Scheme
	}
	return "http"
}

// isBrowserPreviewUpgradeRequest reports whether the request asks to switch
// protocols (e.g. Vite's HMR websocket: `Connection: Upgrade` plus an
// `Upgrade:` token).
func isBrowserPreviewUpgradeRequest(r *http.Request) bool {
	if r.Header.Get("Upgrade") == "" {
		return false
	}
	for _, value := range r.Header.Values("Connection") {
		for token := range strings.SplitSeq(value, ",") {
			if strings.EqualFold(strings.TrimSpace(token), "upgrade") {
				return true
			}
		}
	}
	return false
}

// serveBrowserPreviewUpgrade tunnels a protocol-upgrade request to the
// upstream origin. The buffered preview proxy cannot switch protocols, so
// upgrades go through httputil.ReverseProxy, which hijacks the client
// connection after the upstream's 101 and streams both directions. Without
// this, a previewed dev server renders but its HMR socket never connects,
// so the page goes stale on source edits.
func serveBrowserPreviewUpgrade(w http.ResponseWriter, r *http.Request, origin *url.URL) {
	proxy := &httputil.ReverseProxy{
		Rewrite: func(request *httputil.ProxyRequest) {
			request.SetURL(origin)
			request.Out.Host = origin.Host
		},
	}
	proxy.ServeHTTP(w, r)
}

func browserPreviewHTTPClient() *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	return &http.Client{
		Transport: transport,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func copyBrowserPreviewRequestHeaders(dst http.Header, src http.Header) {
	for key, values := range src {
		if skipBrowserPreviewRequestHeader(key) {
			continue
		}
		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

func skipBrowserPreviewRequestHeader(key string) bool {
	switch strings.ToLower(key) {
	case "accept-encoding", "host", "x-forwarded-host", "x-forwarded-proto":
		return true
	default:
		return false
	}
}

func copyBrowserPreviewResponseHeaders(dst http.Header, src http.Header) {
	for key, values := range src {
		if skipBrowserPreviewResponseHeader(key) {
			continue
		}
		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

func skipBrowserPreviewResponseHeader(key string) bool {
	switch strings.ToLower(key) {
	case "content-length", "content-encoding":
		return true
	default:
		return false
	}
}

func removeBrowserPreviewInjectionHeaders(headers http.Header) {
	headers.Del("Content-Security-Policy")
	headers.Del("Content-Security-Policy-Report-Only")
	headers.Del("Integrity-Policy")
	headers.Del("Integrity-Policy-Report-Only")
}

func shouldInjectBrowserPreviewBridge(method string, headers http.Header) bool {
	if method == http.MethodHead {
		return false
	}

	mediaType, _, err := mime.ParseMediaType(headers.Get("Content-Type"))
	if err != nil {
		mediaType = strings.TrimSpace(strings.ToLower(headers.Get("Content-Type")))
	}
	mediaType = strings.ToLower(mediaType)
	return mediaType == "text/html" || mediaType == "application/xhtml+xml"
}

type browserPreviewBridgeConfig struct {
	TargetOrigin string `json:"targetOrigin"`
}

func injectBrowserPreviewBridge(body []byte, config browserPreviewBridgeConfig) []byte {
	// The previewed page's CSP is also delivered in-document via
	// <meta http-equiv="Content-Security-Policy">. We strip the response header
	// in removeBrowserPreviewInjectionHeaders, but a meta CSP survives the proxy
	// and blocks Agentation's runtime-injected <style> tags, leaving the toolbar
	// unstyled (not the floating bottom-right control). Strip it here too so the
	// injected preview tooling renders regardless of how the target declares CSP.
	body = stripBrowserPreviewMetaCSP(body)

	snippet := []byte(browserPreviewBridgeSnippet(config))
	lowerBody := bytes.ToLower(body)
	bodyEnd := bytes.LastIndex(lowerBody, []byte("</body>"))
	if bodyEnd < 0 {
		return append(append([]byte{}, body...), snippet...)
	}

	injected := make([]byte, 0, len(body)+len(snippet))
	injected = append(injected, body[:bodyEnd]...)
	injected = append(injected, snippet...)
	injected = append(injected, body[bodyEnd:]...)
	return injected
}

// stripBrowserPreviewMetaCSP removes any in-document Content-Security-Policy
// meta tags from the proxied HTML so they can't block the preview tooling's
// injected styles/scripts. It mirrors removeBrowserPreviewInjectionHeaders,
// which strips the equivalent response header.
func stripBrowserPreviewMetaCSP(body []byte) []byte {
	if !bytes.Contains(bytes.ToLower(body), []byte("content-security-policy")) {
		return body
	}
	return browserPreviewMetaCSP.ReplaceAll(body, nil)
}

func browserPreviewBridgeSnippet(config browserPreviewBridgeConfig) string {
	configJSON, _ := json.Marshal(config)
	escapedConfigJSON := strings.ReplaceAll(string(configJSON), "<", "\\u003c")
	return "\n<script id=\"__yyork-preview-config\" type=\"application/json\">" +
		escapedConfigJSON +
		"</script>\n<script type=\"module\" src=\"" +
		browserPreviewBridgePath +
		"\"></script>\n<script src=\"" +
		browserPreviewAgentationPath +
		"\"></script>\n"
}

func serveBrowserPreviewBridge(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write([]byte(browserPreviewBridgeJavaScript))
}

func (s *Server) serveBrowserPreviewDashboardAsset(w http.ResponseWriter, r *http.Request, name string) {
	if s.webDir != "" {
		assetPath := filepath.Join(s.webDir, filepath.FromSlash(name))
		if _, err := os.Stat(assetPath); err == nil {
			w.Header().Set("Cache-Control", "no-store")
			http.ServeFile(w, r, assetPath)
			return
		}
	}

	if s.webFS != nil {
		if _, err := fs.Stat(s.webFS, name); err == nil {
			w.Header().Set("Cache-Control", "no-store")
			http.ServeFileFS(w, r, s.webFS, name)
			return
		}
	}

	http.Error(w, "preview Agentation bundle is not built", http.StatusNotFound)
}

func (s *Server) handleBrowserPreviewRedirect(
	w http.ResponseWriter,
	r *http.Request,
	response *http.Response,
	upstreamURL *url.URL,
) {
	location := strings.TrimSpace(response.Header.Get("Location"))
	if location == "" {
		copyBrowserPreviewResponseHeaders(w.Header(), response.Header)
		w.WriteHeader(response.StatusCode)
		return
	}

	redirectURL, err := url.Parse(location)
	if err != nil {
		http.Error(w, "preview upstream returned an invalid redirect", http.StatusBadGateway)
		return
	}
	redirectURL = upstreamURL.ResolveReference(redirectURL)
	if !isLocalBrowserPreviewHostname(redirectURL.Hostname()) {
		http.Error(w, "preview upstream redirected to an unsupported host", http.StatusBadGateway)
		return
	}

	// Keep the iframe on the preview host it already loaded. That host routed
	// the current request in, so it is guaranteed to reach this server; a slug
	// freshly derived from the redirect origin (e.g. after Portless upgrades
	// http://yyork.localhost to https) may route to the raw upstream instead of
	// the backend in dev, serving the page with no preview injection. Re-point
	// the same host at the redirect origin so injection survives the redirect.
	redirectOrigin := browserPreviewOrigin(redirectURL)
	previewHost := normalizedRequestHostname(externalRequestHost(r))
	s.setBrowserPreviewTarget(previewHost, redirectOrigin)

	copyBrowserPreviewResponseHeaders(w.Header(), response.Header)
	w.Header().Set("Location", browserPreviewURLForTarget(r, previewHost, redirectURL))
	w.WriteHeader(response.StatusCode)
}

func isRedirectStatus(status int) bool {
	return status >= 300 && status < 400
}

type bufferedResponseWriter struct {
	body   bytes.Buffer
	header http.Header
	status int
}

func newBufferedResponseWriter() *bufferedResponseWriter {
	return &bufferedResponseWriter{
		header: http.Header{},
		status: http.StatusOK,
	}
}

func (w *bufferedResponseWriter) Header() http.Header {
	return w.header
}

func (w *bufferedResponseWriter) WriteHeader(statusCode int) {
	w.status = statusCode
}

func (w *bufferedResponseWriter) Write(body []byte) (int, error) {
	return w.body.Write(body)
}

func (w *bufferedResponseWriter) toHTTPResponse() *http.Response {
	return &http.Response{
		Body:       io.NopCloser(bytes.NewReader(w.body.Bytes())),
		Header:     w.header,
		StatusCode: w.status,
	}
}

const browserPreviewBridgeJavaScript = `
const configElement = document.getElementById("__yyork-preview-config");
const config = (() => {
  try {
    return JSON.parse(configElement?.textContent || "{}");
  } catch {
    return {};
  }
})();

const bridge = {
  source: "yyork-preview-bridge",
  version: 1,
};

function logicalURL() {
  if (!config.targetOrigin) {
    return window.location.href;
  }
  try {
    const current = new URL(window.location.href);
    return new URL(current.pathname + current.search + current.hash, config.targetOrigin).href;
  } catch {
    return window.location.href;
  }
}

function post(type, payload = {}) {
  window.parent?.postMessage({
    ...bridge,
    type,
    timestamp: new Date().toISOString(),
    url: logicalURL(),
    ...payload,
  }, "*");
}

function cssEscape(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function cssAttributeEscape(value) {
  return String(value).replace(/["\\]/g, "\\$&");
}

function elementSelector(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }
  if (element.id) {
    return "#" + cssEscape(element.id);
  }
  const testId = element.getAttribute("data-testid");
  if (testId) {
    return "[data-testid=\"" + cssAttributeEscape(testId) + "\"]";
  }

  const parts = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
    let selector = current.localName;
    if (current.classList?.length) {
      selector += "." + Array.from(current.classList)
        .slice(0, 2)
        .map(cssEscape)
        .join(".");
    }
    parts.unshift(selector);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

function elementText(element) {
  if (!(element instanceof HTMLElement)) {
    return "";
  }
  return (element.innerText || element.textContent || "").trim().slice(0, 160);
}

function elementValue(element) {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.value;
  }
  return undefined;
}

function eventPayload(event) {
  const target = event.target instanceof Element ? event.target : document.documentElement;
  const rect = target.getBoundingClientRect();
  return {
    eventType: event.type,
    selector: elementSelector(target),
    text: elementText(target) || undefined,
    value: elementValue(target),
    x: Number.isFinite(rect.x) ? rect.x : undefined,
    y: Number.isFinite(rect.y) ? rect.y : undefined,
    element: target.localName,
  };
}

const eventTypes = ["click", "input", "change", "keydown", "focusin", "submit"];
for (const eventType of eventTypes) {
  document.addEventListener(eventType, (event) => {
    post("yyork:dom-event", eventPayload(event));
  }, true);
}

let lastScrollEventAt = 0;
function handleScroll(event) {
  const now = Date.now();
  if (now - lastScrollEventAt < 250) {
    return;
  }
  lastScrollEventAt = now;
  post("yyork:dom-event", eventPayload(event));
}
document.addEventListener("scroll", handleScroll, true);
window.addEventListener("scroll", handleScroll, true);

function postLocationChanged() {
  post("yyork:location-changed");
}

for (const method of ["pushState", "replaceState"]) {
  const original = history[method];
  history[method] = function yyorkHistoryWrapper(...args) {
    const result = original.apply(this, args);
    queueMicrotask(postLocationChanged);
    return result;
  };
}
window.addEventListener("popstate", postLocationChanged);
window.addEventListener("hashchange", postLocationChanged);
window.addEventListener("load", postLocationChanged);

async function clearPreviewStorage(scope) {
  if (scope === "cache" || scope === "all") {
    const cacheKeys = await window.caches?.keys?.();
    await Promise.all((cacheKeys || []).map((key) => window.caches.delete(key)));
    window.localStorage?.clear();
    window.sessionStorage?.clear();
  }
  if (scope === "cookies" || scope === "all") {
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.split("=")[0]?.trim();
      if (name) {
        document.cookie = name + "=; Max-Age=0; path=/";
      }
    }
  }
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) {
    return;
  }
  const data = event.data;
  if (!data || data.source !== "yyork-browser") {
    return;
  }
  const typeToScope = {
    "yyork:clear-cache": "cache",
    "yyork:clear-cookies": "cookies",
    "yyork:clear-storage": "all",
  };
  const scope = typeToScope[data.type];
  if (!scope) {
    return;
  }
  clearPreviewStorage(scope)
    .then(() => post("yyork:storage-cleared", { scope }))
    .catch((error) => post("yyork:storage-clear-failed", {
      scope,
      error: error instanceof Error ? error.message : String(error),
    }));
});

post("yyork:preview-ready");
postLocationChanged();
`
