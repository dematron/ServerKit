//go:build !windows

package main

// acquireSingleInstance is a Windows-specific concern; on POSIX the user
// runs at most one tray per session anyway and we don't enforce it.
func acquireSingleInstance() (alreadyRunning bool, release func()) {
	return false, func() {}
}
