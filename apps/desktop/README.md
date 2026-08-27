# DeepSeek Harness Studio · Desktop App

English | [中文](README.zh.md)

The desktop app supervises the existing loopback Web Host and keeps it alive from the system tray when its window is closed.

## Development

Install dependencies, then use the desktop development command. On the first run, after a relevant input changes, or when a required output is missing, it builds the Host and client packages, Web frontend, and Electron main process before launching the application. When those inputs and outputs are unchanged, it launches Electron directly from the verified build:

```sh
pnpm run dev:desktop
```

The launcher records a content fingerprint under the ignored `apps/desktop/lib/` output directory. Source, manifest, build-configuration, Node runtime, or build-environment changes invalidate that record; documentation-only edits do not. A failed build never leaves a reusable record. Force a complete rebuild when diagnosing generated output or toolchain state:

```sh
pnpm run dev:desktop:rebuild
```

The launcher also passes its absolute Node executable into Electron, so development Host startup and package recovery do not depend on an interactive shell `PATH`.

Closing the window hides it. Use the tray menu to restore the window or quit the application. Explicit quit waits for the Host process to stop and escalates termination after the bounded Host grace period.

The desktop app accepts only the readiness URL emitted by `dsh web` for `127.0.0.1` or `localhost`. Navigation stays on that origin; HTTP and HTTPS links open in the system browser.

Workspace selection in Electron uses a fixed preload method and `dialog.showOpenDialog` in the main process. Only the current owned renderer may invoke it; cancellation returns no path. Ordinary local Web deployments retain the Host-native picker adapter.

Native chrome follows the host platform. macOS uses a frameless inset title bar, traffic lights, and sidebar vibrancy; its collapsed sidebar is 90px wide, with centered controls whose top edge aligns with the expanded logo row below the traffic lights. Windows retains its system frame, shadow, resize and Snap behavior, and Windows 11 rounded corners while a hidden title bar places the native caption buttons in the Session header's first row; the Windows sidebar has no traffic-light inset. The empty part of that row remains draggable, its controls remain clickable, and a resident drag band covers the same row when no Session header is visible. Windows acrylic and macOS vibrancy reach only the sidebar, while conversation and details stay opaque. Linux keeps a frameless window and an opaque sidebar fallback.

### Plugin Center trusted lifecycle

Desktop owns Plugin Center discovery, compatibility, and package-mutation authority. Public discovery combines the npm `dsh-plugin` convention with bounded text queries, direct scoped-package lookups, and explicit `https://github.com/<owner>/<repo>` repository parsing. Short names and full scoped names are both supported. A successful bounded text result survives a simultaneous keyword-index outage, so npm rate limiting on the broad index cannot hide an exact textual match. The keyword and GitHub mapping are discovery signals, not official endorsement or installation authority; GitHub source is never cloned, built, or installed directly. Only an exact version from the fixed npm registry that declares `dsh.bundle` may continue. Cached candidates are re-read before authority, and exact metadata hydration is capped at 96 ranked candidates per query. Exact detail hydration retries one transient connection, 408/425/429, or 5xx failure, honors a bounded `Retry-After`, and never retries structural validation failures. Desktop downloads the immutable npm tarball and validates registry integrity, SHA-256, archive containment, package identity, the Bundle patch through the Host YAML schema, exact aggregate dependencies, and activation identities. Loader entries may use validated npm export subpaths owned by the Bundle package, such as `dsh-builtin-browser/browser`; unsafe or undeclared package references remain rejected. A Bundle may reuse modules in the closed packaged Host dependency map, whose deterministic fingerprint also namespaces persisted authority. Before Host startup, Desktop atomically exposes the exact bundled pnpm entry through its managed command directory, so Host plugins can resolve `pnpm` even when a GUI launch has no terminal PATH, npm, or Corepack. The sandboxed renderer can call only fixed catalog and operation methods and submits only plugin id, exact version, and an idempotency key.

The same serialized transaction owns install, enable, disable, exact update, and uninstall. It snapshots before mutation, preserves explicit active or disabled Bundle intent, stops the Host before package replacement or removal, and commits only after the target Profile and declared Host, client, and Skill evidence agree. Continuity checks exclude `include:agent-presets:*` Loader children because they belong to live preset instances and are not stable across Host replacement. During disable and uninstall, the verifier also accepts a removed Skill that the package registered but omitted from `expectedSkillIds`; declared target identities, the owning `agent-presets` entry, and every unrelated Loader entry and client module remain required. Uninstall preserves configuration and plugin-owned data by default; a separate post-commit bridge can delete only exact declared paths below the plugin storage root. Host replacement retains the last rendered Desktop frame until the new page paints, so a successful mutation does not expose the intermediate navigation. When the installed manager is expanded, a whitelisted renderer URL marker carries that subview into the replacement Host while arbitrary query state is discarded. Before a normal Host starts, Desktop deactivates validated external Bundles that are incompatible with the current application release while retaining their packages and reasons. It also removes a legacy manual `dshmarket` insertion only after verifying that the selected Profile already owns the installed `dshmarket` Bundle; id-targeted settings and unrelated patches remain intact. The production preload exposes these operations through the recovery-backed controller.

### Preset Square installation

Desktop owns Preset Square network access and accepts renderer requests containing only a closed sort, search text, slug, and optional local target id. It reads metadata and archives only from `https://www.dshdesktop.com/preset/`, rejects redirects, bounds response sizes, re-resolves detail before installation, and verifies the published archive size and SHA-256 before sending bytes to the loopback Host importer. The renderer never supplies a URL, archive, filesystem path, or Host origin.

Seven compact capability packs ship in `resources/preset-square/presets/` under the catalog source **Fufan Official** (`赋范官方`): AI WebApp, PPT Office, video generation, content factory, AI report, Feishu digital employee, and LLM Wiki Producer. The last installs the `LLM Wiki 全栈工程师` Agent Preset used to develop and verify enterprise knowledge-base projects in stages. This label identifies content maintained by the Fufan Desktop team, not official DeepSeek Harness content. Desktop materializes deterministic integrity-checked archives from these read-only resources, while the Host still installs them into the writable user Preset root so they remain removable and reinstallable.

An uncommitted journal owns recovery before the normal Host starts. Mutation side effects durably record their before and after points, so the same recovery path covers interruption before or after Host stop, Profile or package mutation, Host start, and renderer reconnect. Recovery restores the hash-bound snapshot, rematerializes the old packages, and requires the prior Host, client, and Skill evidence before publishing `rolled-back`. Snapshot, Profile, package, lock, or Host-health failures keep the protected recovery page with same-operation retry and redacted diagnostic export. When only the exact runtime inventory differs after the restored Host passes health, Desktop starts the normal renderer on Plugin Center in restricted safe mode: browsing, retry, diagnostics, configuration, disable, and uninstall remain available, while install, update, and enable stay blocked until a verified recovery or safe cleanup commits ([decision](../../.agents/notes/implemented/bug-fix/2026-08-24-plugin-recovery-safe-mode.md)).

Use `pnpm run dev:desktop:web` for deterministic browser acceptance of the same client components and progress contract. That development bridge simulates phases and persistence but has no Electron, Profile, filesystem, package-manager, MCP, or Host-restart authority.

## Packaging

The local packaging command first rebuilds the bundled FF–LLM Wiki application from its source, then performs the complete repository build, stages the Host's closed production dependency tree, and creates an unpacked application for the current platform. Generated application assets stay ignored and are never a source-of-truth input to a clean release checkout. A separate manual build is not required:

```sh
pnpm run package:desktop
```

Packaged applications run the staged `@deepseek-ai/dsh` CLI in a separate process through Electron's Node mode. The application therefore retains the supervised-Host lifecycle without shipping a second Node executable. An `afterPack` check rejects the package before signing when the staged CLI entry, Web frontend entry, generic HTTPS update provider, or explicit update channel is absent. It also verifies the macOS arm64 or Windows x64 Sharp native module required by the Harness image pipeline. The same hook writes `app-update.yml` for every target, including the unpacked directory used by preview archives. Preview packages therefore request the published `rc-mac.yml` or `rc.yml` manifest instead of Electron's nonexistent default channel and can resolve a same-version feed as up to date. Both macOS and Windows derive their platform icons from the tracked transparent, rounded `apps/desktop/build/icon.png`; the repository does not commit separate platform-specific variants.

### Signed macOS DMG and ZIP

The macOS distribution command produces the DMG used for installation and the ZIP required by the auto-updater. It requires a valid `Developer ID Application` identity whose certificate and private key are both installed in the build user's Keychain. It also requires one complete notarization credential source. A Keychain profile keeps the app-specific password out of the repository and shell history:

```sh
xcrun notarytool store-credentials "dsh-notary" --apple-id "<Apple ID>" --team-id "<Team ID>"
```

`notarytool` requests the secret interactively. Build the signed, hardened-runtime, notarized DMG with the stored profile:

```sh
APPLE_KEYCHAIN_PROFILE=dsh-notary pnpm run dist:mac:desktop
```

An existing secrets file can supply `MAC_CERT_P12_BASE64`, `MACOS_SIGN_IDENTITY`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` without importing the certificate into the persistent Keychain:

```sh
node --env-file=/absolute/path/to/macos-signing-secrets.env --import tsx apps/desktop/scripts/release-mac.ts
```

Electron Builder imports that Base64 PKCS#12 certificate into its temporary Keychain and removes it when the build finishes. The wrapper keeps signing and notarization variables out of the repository-build and runtime-staging subprocesses, then passes them only to Electron Builder. The secrets file and its path are never tracked.

The release preflight runs before the repository build. It fails if the host is not macOS, the supplied identity is not a `Developer ID Application` identity, signing credentials are incomplete, signing discovery is disabled, or notarization credentials are missing or incomplete. Without the PKCS#12 group, it requires a usable `Developer ID Application` identity and private key in the Keychain. Instead of a Keychain profile, the command accepts the complete Apple ID group (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`) or App Store Connect API key group (`APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`).

After a successful build, mount the generated DMG and verify the installed application signature, Gatekeeper assessment, and stapled notarization ticket:

```sh
DMG_PATH="$(find apps/desktop/dist -maxdepth 1 -type f -name '*.dmg' -print -quit)"
MOUNT_POINT="$(mktemp -d)"
hdiutil attach "$DMG_PATH" -mountpoint "$MOUNT_POINT" -nobrowse -readonly
APP_PATH="$MOUNT_POINT/DeepSeek Harness.app"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
spctl --assess --type execute --verbose=4 "$APP_PATH"
xcrun stapler validate "$APP_PATH"
hdiutil detach "$MOUNT_POINT"
rmdir "$MOUNT_POINT"
```

### Publishing updates

Desktop installations check the Beyondata OSS feed configured in this package; they never replace this customized application with an upstream DeepSeek Harness artifact. Electron Builder's generic provider generates channel metadata but does not upload it. After `ALIYUN_OSS_ACCESS_KEY_ID` and `ALIYUN_OSS_ACCESS_KEY_SECRET` have been injected through a protected environment mechanism, the release maintainer publishes one or more platform output directories whose installers have passed the platform signing and acceptance checks:

```sh
pnpm run publish:desktop-update -- \
  --dir /path/to/macos-output \
  --dir /path/to/windows-output
```

The command validates one version and channel across all supplied directories, checks every metadata size and SHA-512, requires each blockmap, and rejects a macOS release without a ZIP. It uploads versioned artifacts before replacing `rc-mac.yml` or `rc.yml`, then reads both manifests through the public URL. Existing immutable objects are reused only when their recorded size and SHA-512 match.

`--dry-run` performs every local check without contacting OSS. `--allow-current-baseline` is a one-time exception for publishing an already distributed current version whose macOS test package predates the ZIP requirement; it makes same-version checks return “up to date” but is not a cross-version update release. Future versions must use the signed DMG+ZIP and signed Windows NSIS paths before publication. Credentials stay in protected environment injection and must never enter a command transcript, build output, or tracked file.

### Windows x64 NSIS installer

Build the guided Windows x64 installer with:

```sh
pnpm run dist:win:desktop
```

The assisted flow defaults to the current user, allows an all-users installation, and lets the user choose the installation directory. The command builds the complete workspace, stages a Windows-targeted Host runtime, removes declarations and source maps that Node never loads, verifies the required Koffi, Sharp, and node-pty x64 native modules, then creates the `.exe` installer, blockmap, and update metadata. macOS cross-builds expose Electron Builder's NSIS templates through a short temporary path because NSIS still uses a fixed 260-character POSIX include buffer; the temporary symlink is removed after the build.

Before replacement or removal, NSIS asks the running single instance to enter the ordinary explicit-quit path, waits up to five seconds for the supervised Host to settle, then makes two bounded attempts to terminate any remaining `DeepSeek Harness.exe` process tree. A process that still owns the installation directory fails the operation explicitly instead of leaving a partial uninstall. If a manual deletion or failed uninstall leaves a broken registration and a partial application directory, the replacement removes that residue, bypasses the unusable old uninstaller, installs a clean payload, and recreates the uninstall registration. Every registered `0.1.0-rc.*` preview installation uses this same replacement path when its location equals the selected installation directory or is the dedicated default product directory, so custom-directory upgrades remain supported without authorizing deletion of an unrelated registry path. Profile data remains outside the application directory.

Internal test installers remain unsigned until a Windows Authenticode certificate is configured. SmartScreen may therefore require **More info → Run anyway** after the tester verifies the published SHA-256. Do not disable Defender. The native Windows lifecycle workflow installs into a non-default directory, starts the packaged Host, uninstalls while the application is running, reinstalls into the same directory, simulates a manually deleted application directory with retained registry state, repairs it, and repeats the launch and uninstall check.

## Known limitations

The first desktop assembly uses a loopback HTTP Host. The renderer and Host protocol remain unchanged so the application can replace the transport with the IPC carrier reserved by the GUI architecture without changing product features.

Browser progress remains simulation evidence only; real search, package mutation, Host restart, and uninstall require Desktop. The public npm index is a community distribution channel, not a DeepSeek security review. This first live source accepts prebuilt npm DSH Bundles and rejects packages without `dsh.bundle`, unsafe archives, mismatched immutable evidence, or install lifecycle scripts; GitHub-only source builds are not installed by the one-click path.

macOS has a signed and notarized distribution path. Windows has an x64 NSIS installer path, but production Authenticode signing remains release work. Linux still creates an unpacked application and has no installer format or distribution-signing path yet.

## Model Experience

The desktop shell does not add model-visible input. The reused Web profile continues to own its existing Web runtime context.
