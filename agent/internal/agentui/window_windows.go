//go:build windows

package agentui

import (
	"context"
	"fmt"
	"os"
	"runtime"

	webview2 "github.com/jchv/go-webview2"

	"github.com/serverkit/agent/internal/logger"
)

// Run launches the agent's WebView2 console window and blocks until the user
// closes it. configPath is reserved for the upcoming wizard-migration
// milestone — for now the React app loads in console-only mode and the
// existing setupui wizard still owns first-run pairing.
//
// Set SERVERKIT_AGENT_UI_DEV=http://localhost:5174 to point the webview at
// the Vite dev server instead of the embedded bundle. Useful while iterating
// on the UI: changes hot-reload without rebuilding the Go binary.
func Run(ctx context.Context, log *logger.Logger, configPath string) error {
	runtime.LockOSThread()

	target := os.Getenv("SERVERKIT_AGENT_UI_DEV")
	var stopServer func()
	if target == "" {
		url, shutdown, err := startAssetServer(ctx)
		if err != nil {
			return fmt.Errorf("start asset server: %w", err)
		}
		target = url
		stopServer = shutdown
	} else {
		log.Info("agent UI: using dev server", "url", target)
	}
	if stopServer != nil {
		defer stopServer()
	}

	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     os.Getenv("SERVERKIT_AGENT_UI_DEVTOOLS") == "true",
		AutoFocus: true,
		WindowOptions: webview2.WindowOptions{
			Title:  "ServerKit Agent",
			Width:  900,
			Height: 620,
			IconId: 2,
			Center: true,
		},
	})
	if w == nil {
		return fmt.Errorf("webview2 unavailable; ensure the WebView2 runtime is installed")
	}
	defer w.Destroy()

	w.SetSize(900, 620, webview2.HintMin)
	w.Navigate(target)

	// Hook ctx cancellation to terminate the webview from a background
	// goroutine. Run() blocks on the OS message pump, so we need an external
	// signal to break it cleanly when the parent process is torn down.
	go func() {
		<-ctx.Done()
		w.Terminate()
	}()

	w.Run()
	return nil
}
