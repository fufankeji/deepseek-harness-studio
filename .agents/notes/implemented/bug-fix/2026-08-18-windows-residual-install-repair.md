# Agent Note: Windows residual installation repair

Status: implemented

English | [中文](2026-08-18-windows-residual-install-repair.zh.md)

## Problem

A user can delete an installed Desktop directory or encounter an incomplete legacy uninstall while the per-user installation and uninstall registry entries remain. The next NSIS installer then attempts to invoke a missing or unusable old uninstaller. Electron Builder reports the repeated failure with its generic application-cannot-close dialog even after every Desktop process has stopped, so retrying cannot repair the installation.

## Decision

The Windows installer closes the application and its owned process tree before inspecting the registered installation. A missing application executable, a missing uninstaller, or any registered `0.1.0-rc.*` preview identifies a repairable installation only when the registered path ends in the dedicated `DeepSeek Harness` directory. The installer then removes that application directory and the two stale uninstall commands before Electron Builder runs its old-version step. The normal payload extraction recreates the directory and complete uninstall registration. Profile, workspace, credentials, and plugin data remain outside the application directory.

## Verification

Packaging configuration coverage pins the dedicated-directory check, incomplete-file detection, preview-family detection, residual removal, and uninstall-command cleanup. The native Windows lifecycle workflow installs and launches the packaged Host, runs the same installer over the running preview, launches that replacement, completes a running uninstall, then separately preserves the registry while deleting the application directory and verifies residual repair.

## Alternatives considered

**Tell every user to delete the directory or run `taskkill` manually.** Rejected because it requires technical recovery steps for a state the installer can identify and repair safely.

**Delete every registered installation path unconditionally.** Rejected because a damaged or unexpected registry path must not authorize recursive removal outside the dedicated product directory.

**Only overwrite files without removing the residue.** Rejected because locked, incompatible, or partially removed legacy files can survive an overlay and leave the new payload inconsistent.

## Consequences

Broken per-user preview installations recover through the ordinary guided installer without Task Manager, PowerShell, or manual AppData cleanup. Repair deliberately removes every file inside the dedicated application directory; it does not remove user Profile data, but files manually placed inside the program directory are not retained.
