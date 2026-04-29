//go:build windows

package setupui

import (
	"bytes"
	"context"
	_ "embed"
	"errors"
	"fmt"
	"image/png"
	"os"
	"runtime"
	"sync"

	"github.com/lxn/walk"
	dec "github.com/lxn/walk/declarative"

	"github.com/serverkit/agent/internal/logger"
)

//go:embed serverkit.ico
var iconBytes []byte

//go:embed serverkit_header.png
var headerPNG []byte

// stage names (used as panel keys for clarity)
const (
	stageForm    = "form"
	stagePairing = "pairing"
	stageDone    = "done"
)

// runWindow shows the native pairing wizard. It blocks until the user closes
// the window (success, cancel, or X-button). Returns nil on graceful close.
//
// Walk's MainWindow event loop must run on the OS main thread; the caller
// (cmd/agent.runDesktop) is responsible for runtime.LockOSThread before us.
func runWindow(ctx context.Context, log *logger.Logger, configPath string) (retErr error) {
	runtime.LockOSThread()

	// Surface panics as a real error dialog so a misconfigured widget can
	// never produce the silent-failure mode that motivated this rewrite.
	defer func() {
		if r := recover(); r != nil {
			retErr = fmt.Errorf("setup wizard panic: %v", r)
			walk.MsgBox(nil, "ServerKit Agent", retErr.Error(), walk.MsgBoxIconError)
		}
	}()

	w := &wizardUI{
		log:        log,
		configPath: configPath,
	}

	// Hook ctx cancellation into the wizard: if the parent ctx is cancelled
	// (e.g. SIGINT) we close the window from a goroutine.
	w.runCtx, w.cancel = context.WithCancel(ctx)
	defer w.cancel()

	go func() {
		<-w.runCtx.Done()
		if w.mw != nil {
			w.mw.Synchronize(func() {
				if w.mw != nil {
					w.mw.Close()
				}
			})
		}
	}()

	return w.show()
}

type wizardUI struct {
	log        *logger.Logger
	configPath string

	runCtx context.Context
	cancel context.CancelFunc

	mu          sync.Mutex
	pairCancel  context.CancelFunc

	mw *walk.MainWindow

	headerImage *walk.ImageView

	// stage 1 widgets
	urlEdit  *walk.LineEdit
	passEdit *walk.LineEdit
	nameEdit *walk.LineEdit
	formErr  *walk.Label
	startBtn *walk.PushButton

	// stage 2 widgets
	codeLabel    *walk.Label
	statusLabel  *walk.Label
	pairErrLabel *walk.Label
	cancelBtn    *walk.PushButton

	// stage 3 widgets
	doneTitle *walk.Label
	doneSub   *walk.Label

	// stage panels
	formPanel *walk.Composite
	pairPanel *walk.Composite
	donePanel *walk.Composite
}

func (w *wizardUI) show() error {
	hostname, _ := os.Hostname()

	const (
		brandPurple  = 0x6366F1
		errorRed     = 0xDC2626
		mutedGray    = 0x6B7280
		subtleGray   = 0x9CA3AF
		darkText     = 0x111827
		medText      = 0x374151
		titleSize    = 14
		bodySize     = 9
		smallSize    = 8
		codeSize     = 32
	)

	err := (dec.MainWindow{
		AssignTo:   &w.mw,
		Title:      "ServerKit Agent",
		MinSize:    dec.Size{Width: 440, Height: 580},
		Size:       dec.Size{Width: 440, Height: 580},
		Layout:     dec.VBox{MarginsZero: false, Margins: dec.Margins{Left: 28, Top: 24, Right: 28, Bottom: 28}, Spacing: 0},
		Background: dec.SolidColorBrush{Color: walk.RGB(248, 250, 252)},
		Children: []dec.Widget{
			// ── Brand header ───────────────────────────────────────────────
			dec.Composite{
				Layout: dec.HBox{MarginsZero: true, Spacing: 16},
				Children: []dec.Widget{
					dec.ImageView{
						AssignTo: &w.headerImage,
						MinSize:  dec.Size{Width: 60, Height: 60},
						MaxSize:  dec.Size{Width: 60, Height: 60},
						Mode:     dec.ImageViewModeZoom,
					},
					dec.Composite{
						Layout: dec.VBox{MarginsZero: true, Spacing: 4},
						Children: []dec.Widget{
							dec.VSpacer{},
							dec.Label{
								Text:      "Pair this server",
								Font:      dec.Font{PointSize: titleSize, Bold: true},
								TextColor: rgbHex(darkText),
							},
							dec.Label{
								Text:      "Connect this machine to your ServerKit panel.",
								Font:      dec.Font{PointSize: bodySize},
								TextColor: rgbHex(mutedGray),
							},
							dec.VSpacer{},
						},
					},
				},
			},

			dec.VSpacer{Size: 22},

			// ── Stage 1: connection form ────────────────────────────────────
			dec.Composite{
				AssignTo:   &w.formPanel,
				Layout:     dec.VBox{MarginsZero: false, Margins: dec.Margins{Left: 16, Top: 18, Right: 16, Bottom: 18}, Spacing: 2},
				Background: dec.SolidColorBrush{Color: walk.RGB(255, 255, 255)},
				Children: []dec.Widget{
					// Panel URL
					dec.Label{
						Text:      "Panel URL",
						Font:      dec.Font{Bold: true, PointSize: bodySize},
						TextColor: rgbHex(medText),
					},
					dec.VSpacer{Size: 2},
					dec.LineEdit{
						AssignTo:  &w.urlEdit,
						CueBanner: "https://panel.example.com",
						MaxLength: 500,
					},
					dec.Label{
						Text:      "The full URL of your ServerKit control panel.",
						Font:      dec.Font{PointSize: smallSize},
						TextColor: rgbHex(subtleGray),
					},

					dec.VSpacer{Size: 12},

					// Passphrase
					dec.Label{
						Text:      "Passphrase",
						Font:      dec.Font{Bold: true, PointSize: bodySize},
						TextColor: rgbHex(medText),
					},
					dec.VSpacer{Size: 2},
					dec.LineEdit{
						AssignTo:     &w.passEdit,
						PasswordMode: true,
						CueBanner:    "Set in the panel under Add Server",
						MaxLength:    200,
					},
					dec.Label{
						Text:      "Generated in your panel under Servers → Add Server.",
						Font:      dec.Font{PointSize: smallSize},
						TextColor: rgbHex(subtleGray),
					},

					dec.VSpacer{Size: 12},

					// Server name
					dec.Label{
						Text:      "Server name  (optional)",
						Font:      dec.Font{Bold: true, PointSize: bodySize},
						TextColor: rgbHex(medText),
					},
					dec.VSpacer{Size: 2},
					dec.LineEdit{
						AssignTo:  &w.nameEdit,
						Text:      hostname,
						CueBanner: "Defaults to hostname",
					},
					dec.Label{
						Text:      "How this machine appears in your panel.",
						Font:      dec.Font{PointSize: smallSize},
						TextColor: rgbHex(subtleGray),
					},

					dec.VSpacer{Size: 14},

					dec.Label{
						AssignTo:  &w.formErr,
						TextColor: rgbHex(errorRed),
						Font:      dec.Font{PointSize: bodySize},
						Text:      "",
					},
					dec.PushButton{
						AssignTo:  &w.startBtn,
						Text:      "Connect  →",
						MinSize:   dec.Size{Height: 36},
						OnClicked: w.handleConnect,
					},
				},
			},

			// ── Stage 2: pairing code (hidden initially) ──────────────────
			dec.Composite{
				AssignTo:   &w.pairPanel,
				Visible:    false,
				Layout:     dec.VBox{MarginsZero: false, Margins: dec.Margins{Left: 16, Top: 24, Right: 16, Bottom: 24}, Spacing: 0},
				Background: dec.SolidColorBrush{Color: walk.RGB(255, 255, 255)},
				Children: []dec.Widget{
					dec.Label{
						Text:      "Open your panel and enter this code:",
						Font:      dec.Font{PointSize: bodySize},
						TextColor: rgbHex(mutedGray),
					},
					dec.VSpacer{Size: 16},
					dec.Composite{
						Layout: dec.HBox{MarginsZero: true},
						Children: []dec.Widget{
							dec.HSpacer{},
							dec.Label{
								AssignTo:      &w.codeLabel,
								Text:          "",
								Font:          dec.Font{PointSize: codeSize, Bold: true, Family: "Consolas"},
								TextColor:     rgbHex(brandPurple),
								TextAlignment: dec.AlignCenter,
							},
							dec.HSpacer{},
						},
					},
					dec.VSpacer{Size: 16},
					dec.Label{
						AssignTo:      &w.statusLabel,
						Text:          "Waiting for the panel to claim this server…",
						Font:          dec.Font{PointSize: bodySize},
						TextColor:     rgbHex(mutedGray),
						TextAlignment: dec.AlignCenter,
					},
					dec.Label{
						AssignTo:  &w.pairErrLabel,
						TextColor: rgbHex(errorRed),
						Font:      dec.Font{PointSize: bodySize},
						Text:      "",
					},
					dec.VSpacer{Size: 16},
					dec.PushButton{
						AssignTo:  &w.cancelBtn,
						Text:      "Cancel",
						MinSize:   dec.Size{Height: 34},
						OnClicked: w.handleCancel,
					},
				},
			},

			// ── Stage 3: success ───────────────────────────────────────────
			dec.Composite{
				AssignTo:   &w.donePanel,
				Visible:    false,
				Layout:     dec.VBox{MarginsZero: false, Margins: dec.Margins{Left: 16, Top: 24, Right: 16, Bottom: 24}, Spacing: 10},
				Background: dec.SolidColorBrush{Color: walk.RGB(255, 255, 255)},
				Children: []dec.Widget{
					dec.Label{
						AssignTo:  &w.doneTitle,
						Text:      "Successfully paired",
						Font:      dec.Font{PointSize: titleSize, Bold: true},
						TextColor: walk.RGB(16, 185, 129),
					},
					dec.Label{
						AssignTo: &w.doneSub,
						Text:     "",
						Font:     dec.Font{PointSize: bodySize},
					},
					dec.VSpacer{Size: 8},
					dec.PushButton{
						Text:      "Close",
						MinSize:   dec.Size{Height: 36},
						OnClicked: func() { w.mw.Close() },
					},
				},
			},

			dec.VSpacer{},
		},
	}).Create()
	if err != nil {
		return fmt.Errorf("create window: %w", err)
	}

	if icon, err := loadAppIcon(); err == nil && icon != nil {
		_ = w.mw.SetIcon(icon)
	}
	if bmp, err := loadHeaderBitmap(); err == nil && bmp != nil && w.headerImage != nil {
		_ = w.headerImage.SetImage(bmp)
	}

	w.mw.Show()
	// Windows' anti-focus-stealing rule will leave the window invisible behind
	// the desktop when the agent is launched from the Start menu shortcut.
	// scheduleForceForeground retries the AttachThreadInput-based activation
	// recipe several times across the first ~1.5s of window life so we win
	// regardless of when walk's message pump actually starts servicing.
	scheduleForceForeground(w.mw)
	w.mw.Run()

	w.mu.Lock()
	if w.pairCancel != nil {
		w.pairCancel()
	}
	w.mu.Unlock()

	return nil
}

// handleConnect is fired by the "Connect" button. Validates inputs, kicks off
// pairing in a goroutine, and transitions to the pairing stage on success.
func (w *wizardUI) handleConnect() {
	url := w.urlEdit.Text()
	pass := w.passEdit.Text()
	name := w.nameEdit.Text()

	if url == "" {
		w.formErr.SetText("Panel URL is required.")
		return
	}
	if len(pass) < 4 {
		w.formErr.SetText("Passphrase must be at least 4 characters.")
		return
	}
	w.formErr.SetText("")
	w.startBtn.SetEnabled(false)
	w.startBtn.SetText("Connecting…")

	pairCtx, cancel := context.WithCancel(w.runCtx)
	w.mu.Lock()
	w.pairCancel = cancel
	w.mu.Unlock()

	cb := pairingCallbacks{
		onEnrolled: func(code, formatted string) {
			w.mw.Synchronize(func() {
				w.codeLabel.SetText(displayCode(code, formatted))
				w.showStage(stagePairing)
			})
		},
		onClaimed: func(serverName string) {
			w.mw.Synchronize(func() {
				if serverName == "" {
					serverName = "this server"
				}
				w.doneSub.SetText(fmt.Sprintf("This machine is now connected to ServerKit as %q.\n\nThe agent service has been started in the background. You can close this window.", serverName))
				w.showStage(stageDone)
			})
		},
		onError: func(err error) {
			w.mw.Synchronize(func() {
				msg := errorPretty(err)
				if w.pairPanel.Visible() {
					w.pairErrLabel.SetText(msg)
					w.cancelBtn.SetText("Try again")
				} else {
					w.formErr.SetText(msg)
					w.startBtn.SetEnabled(true)
					w.startBtn.SetText("Connect")
				}
			})
		},
	}

	go runPairing(pairCtx, w.log, w.configPath, url, pass, name, cb)
}

// handleCancel rolls back to the form stage and cancels any in-flight pairing.
func (w *wizardUI) handleCancel() {
	w.mu.Lock()
	if w.pairCancel != nil {
		w.pairCancel()
		w.pairCancel = nil
	}
	w.mu.Unlock()

	w.formErr.SetText("")
	w.pairErrLabel.SetText("")
	w.codeLabel.SetText("")
	w.cancelBtn.SetText("Cancel")
	w.startBtn.SetEnabled(true)
	w.startBtn.SetText("Connect")
	w.showStage(stageForm)
}

func (w *wizardUI) showStage(stage string) {
	w.formPanel.SetVisible(stage == stageForm)
	w.pairPanel.SetVisible(stage == stagePairing)
	w.donePanel.SetVisible(stage == stageDone)
}

// errorPretty turns errors from runPairing into a user-friendly one-liner.
func errorPretty(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.Canceled) {
		return "Cancelled."
	}
	return err.Error()
}

// displayCode prefers the server-formatted code (e.g. "1234-5678") and falls
// back to the raw code if the panel didn't supply one.
func displayCode(code, formatted string) string {
	if formatted != "" {
		return formatted
	}
	return code
}

func rgbHex(rgb uint32) walk.Color {
	return walk.RGB(byte(rgb>>16), byte(rgb>>8), byte(rgb))
}

// loadAppIcon writes the embedded .ico to a temp file (walk doesn't load icons
// from raw bytes) and returns it. The temp file lingers until process exit;
// Windows handles cleanup of %TEMP%.
var (
	iconOnce sync.Once
	iconRef  *walk.Icon
)

func loadAppIcon() (*walk.Icon, error) {
	iconOnce.Do(func() {
		f, err := os.CreateTemp("", "serverkit-*.ico")
		if err != nil {
			return
		}
		_, _ = f.Write(iconBytes)
		_ = f.Close()
		ic, err := walk.NewIconFromFile(f.Name())
		if err != nil {
			return
		}
		iconRef = ic
	})
	if iconRef == nil {
		return nil, fmt.Errorf("icon not loaded")
	}
	return iconRef, nil
}

// loadHeaderBitmap decodes the embedded brand PNG into a walk Bitmap suitable
// for an ImageView. Must be called after the walk runtime is up (i.e. after
// MainWindow.Create), otherwise the underlying GDI calls return errors.
var (
	headerOnce sync.Once
	headerBmp  *walk.Bitmap
)

func loadHeaderBitmap() (*walk.Bitmap, error) {
	headerOnce.Do(func() {
		img, err := png.Decode(bytes.NewReader(headerPNG))
		if err != nil {
			return
		}
		bmp, err := walk.NewBitmapFromImageForDPI(img, 96)
		if err != nil {
			return
		}
		headerBmp = bmp
	})
	if headerBmp == nil {
		return nil, fmt.Errorf("header bitmap not loaded")
	}
	return headerBmp, nil
}
