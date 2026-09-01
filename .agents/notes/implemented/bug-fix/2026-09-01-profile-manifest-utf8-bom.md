# Agent Note: Profile manifests accept a UTF-8 byte-order mark

Status: implemented

English | [中文](2026-09-01-profile-manifest-utf8-bom.zh.md)

## Problem

Windows editors and PowerShell commands can prefix UTF-8 JSON with a byte-order mark. A Profile manifest under `~/.dsh` survives Desktop upgrades, so one such file made every installed Desktop version fail during startup when the Profile and plugin compatibility readers passed the decoded marker directly to `JSON.parse`. The resulting Electron dialog exposed only the parser fragment and did not identify the durable file.

## Decision

The shared Profile loader and the Desktop compatibility projection remove exactly one leading U+FEFF code point after UTF-8 decoding package manifests. Every other byte and every JSON validation rule remains unchanged. Parse failures name the manifest path, and the Desktop compatibility revision continues to hash the original bytes before decoding so a BOM addition or removal remains an observable Profile mutation.

## Alternatives considered

**Delete or recreate `~/.dsh` during Desktop startup.** Rejected because the directory owns user configuration and installed plugins, and an installer must not destroy that state to repair one encoding marker.

**Treat every JSON parse failure as a recoverable BOM problem.** Rejected because malformed or truncated manifests must still fail before the Loader consumes ambiguous configuration.

**Repair only the packaged Windows runtime.** Rejected because the persistent failing input is a Profile or installed-plugin manifest shared by Desktop versions and CLI launches, not a platform-specific executable.

## Consequences

Profiles and installed plugin packages written with an otherwise valid UTF-8 BOM load without rewriting the file. Malformed JSON still fails with the exact path. Focused tests cover both the shared Profile reader and the Desktop projection of BOM-prefixed Profile and Bundle manifests.
