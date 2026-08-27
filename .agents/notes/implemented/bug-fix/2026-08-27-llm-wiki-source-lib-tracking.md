# Agent Note: LLM Wiki source libraries remain tracked

Status: implemented

English | [中文](2026-08-27-llm-wiki-source-lib-tracking.zh.md)

## Problem

FF–LLM Wiki keeps its browser API, navigation, and streaming QA modules in `application/apps/web/src/lib`. Repository and plugin ignore patterns named `lib/` without a root anchor, so Git treated that source directory like generated package output. A long-lived development checkout could build from its ignored local files, while a clean checkout lacked the modules imported by every major Web view and failed before deployment.

## Decision

The plugin-level output rule is anchored to the plugin package's top-level `/lib/`, while the repository ignore file explicitly restores the TypeScript source modules below the application Web source tree. `api.ts`, `graph-adapt.ts`, `model-settings.ts`, `nav.ts`, and `qa.ts` are tracked application inputs. Generated package `lib/` directories elsewhere remain ignored.

## Alternatives considered

**Force-add the files without correcting ignore rules.** Rejected because later source additions and edits in the same directory would remain hidden from ordinary Git status checks.

**Rename the source directory.** Rejected because `src/lib` is an ordinary application layout; the defect was the overly broad output rule rather than the module name.

**Generate the modules during packaging.** Rejected because API behavior, navigation, and streaming parsing are authored product source and must be reviewable before a build.

## Consequences

Clean checkouts contain the complete FF–LLM Wiki frontend and can run its production build. The ignore file carries two narrow exceptions, and any new source file in this directory must be added explicitly unless the exception is broadened deliberately.

## Testing

Verification requires all five paths to appear in `git ls-files` and the application-level production build to complete from those tracked inputs.
