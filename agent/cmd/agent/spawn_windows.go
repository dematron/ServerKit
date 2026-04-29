//go:build windows

package main

import "syscall"

const (
	// CreateNoWindow: hide the new console window if any.
	createNoWindow = 0x08000000
	// DetachedProcess: child process is not bound to the parent's console.
	detachedProcess = 0x00000008
)

// detachedProcessAttrs returns SysProcAttr that fully detaches the spawned
// process from the parent. Used when the tray spawns a fresh `serverkit-agent
// --repair` to relaunch the wizard: the tray must keep running independently.
func detachedProcessAttrs() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: createNoWindow | detachedProcess,
	}
}
