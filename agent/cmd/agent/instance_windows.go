//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

// acquireSingleInstance opens (or creates) a per-user named mutex. If the
// mutex already existed, another instance of the desktop app is already
// running for this user and we should bow out. Otherwise we hold the mutex
// for the lifetime of the process.
//
// Per-user (Local\) namespace: each Windows user gets their own ServerKit
// tray, which matches the per-user Run-key autostart.
func acquireSingleInstance() (alreadyRunning bool, release func()) {
	const (
		errAlreadyExists = 183
	)

	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	createMutexW := kernel32.NewProc("CreateMutexW")
	closeHandle := kernel32.NewProc("CloseHandle")

	name, err := syscall.UTF16PtrFromString(`Local\ServerKitAgentDesktop`)
	if err != nil {
		return false, func() {}
	}

	handle, _, lastErr := createMutexW.Call(
		0, // lpMutexAttributes = NULL
		0, // bInitialOwner = FALSE
		uintptr(unsafe.Pointer(name)),
	)

	if handle == 0 {
		return false, func() {}
	}

	if errno, ok := lastErr.(syscall.Errno); ok && uintptr(errno) == errAlreadyExists {
		closeHandle.Call(handle)
		return true, func() {}
	}

	return false, func() { closeHandle.Call(handle) }
}
