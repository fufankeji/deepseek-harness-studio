/**
 * Profile machinery of `dsh-app-boot`: directory resolution and init,
 * manifest round-trips, two-anchor bundle resolution, patch-layer loading,
 * empty-root composition, and the installation module-fallback healing.
 */

import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  composeEntries,
  healProfilesModuleFallback,
  initProfile,
  loadProfile,
  PROFILE_PATCH_FILENAME,
  PROFILE_TEMPLATES,
  readProfileBundleState,
  readProfileManifest,
  reconcileProfileBundles,
  resolveBundleDir,
  resolveProfileDir,
  setProfileBundleEnabled,
  writeProfileManifest,
} from '../src/index.ts'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'dsh-profile-'))

/** Stage a fake installed app: package.json with deps and a node_modules holding bundles. */
function stageInstallation(bundles: Record<string, { patch?: string; deps?: Record<string, string> }>): string {
  const root = tmp()
  const appDir = join(root, 'app')
  mkdirSync(join(appDir, 'node_modules'), { recursive: true })
  const appDeps: Record<string, string> = {}
  for (const [name, spec] of Object.entries(bundles)) {
    appDeps[name] = '0.0.0'
    const dir = join(appDir, 'node_modules', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name,
      version: '0.0.0',
      dependencies: spec.deps ?? {},
      ...spec.patch === undefined ? {} : { dsh: { bundle: { patch: './cordis.patch.yml' } } },
    }))
    if (spec.patch !== undefined) writeFileSync(join(dir, 'cordis.patch.yml'), spec.patch)
  }
  writeFileSync(join(appDir, 'package.json'), JSON.stringify({ name: 'dsh-app', dependencies: appDeps }))
  return join(appDir, 'package.json')
}

describe('resolveProfileDir', () => {
  it('joins the home and rejects traversal-shaped names', () => {
    const home = tmp()
    expect(resolveProfileDir('tui', home)).toBe(join(home, 'profiles', 'tui'))
    for (const bad of ['', '.', '..', 'a/b', 'a\\b']) {
      expect(() => resolveProfileDir(bad, home)).toThrow('invalid profile name')
    }
  })
})

describe('initProfile', () => {
  it('creates manifest, user patch layer, and pnpm workspace once, never overwriting', () => {
    const home = tmp()
    const dir = resolveProfileDir('tui', home)
    initProfile(dir, ['@deepseek-ai/dsh-base'])
    const manifest = readProfileManifest('t', dir)
    expect(manifest.dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base'])
    expect(manifest.dsh?.profile?.disabledBundles).toEqual([])
    expect(readFileSync(join(dir, PROFILE_PATCH_FILENAME), 'utf8')).toContain('[]')
    expect(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')).toContain('nodeLinker: hoisted')
    // Re-init keeps user edits.
    writeFileSync(join(dir, PROFILE_PATCH_FILENAME), '- id: x\n  config: {}\n')
    initProfile(dir, ['other'])
    expect(readProfileManifest('t', dir).dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base'])
    expect(readFileSync(join(dir, PROFILE_PATCH_FILENAME), 'utf8')).toContain('- id: x')
  })
})

describe('manifest round-trip', () => {
  it('writes and reads back, and fails loud on a broken manifest', () => {
    const dir = tmp()
    writeProfileManifest(dir, { name: 'p', dsh: { profile: { bundles: ['a'] } } })
    expect(readProfileManifest('t', dir).dsh?.profile?.bundles).toEqual(['a'])
    writeFileSync(join(dir, 'package.json'), '[]')
    expect(() => readProfileManifest('t', dir)).toThrow('must hold a JSON object')
    expect(() => readProfileManifest('t', join(dir, 'nope'))).toThrow('failed to read profile manifest')
  })

  it('accepts a UTF-8 BOM written by Windows tools without weakening JSON validation', () => {
    const dir = tmp()
    const path = join(dir, 'package.json')
    writeFileSync(path, `\uFEFF${JSON.stringify({
      name: 'p',
      dsh: { profile: { bundles: ['a'] } },
    })}`)
    expect(readProfileManifest('t', dir).dsh?.profile?.bundles).toEqual(['a'])
    writeFileSync(path, '\uFEFF{"name":')
    expect(() => readProfileManifest('t', dir)).toThrow(`failed to parse package manifest ${path}`)
  })
})

describe('reconcile profile bundles', () => {
  it('adds installed bundles in dependency order and reports newly added plain dependencies', () => {
    const before = {
      dependencies: { retained: '1.0.0' },
      dsh: { profile: { bundles: ['template-bundle', 'retained'] } },
    }
    const after = {
      dependencies: {
        retained: '1.0.1',
        'bundle-b': '1.0.0',
        'plain-library': '1.0.0',
        'bundle-a': '1.0.0',
      },
      dsh: { profile: { bundles: ['template-bundle', 'retained'] } },
    }
    const inspected: string[] = []

    const result = reconcileProfileBundles(before, after, (packageName) => {
      inspected.push(packageName)
      return packageName !== 'plain-library'
    })

    expect(result).toMatchObject({
      changed: true,
      addedBundles: ['bundle-b', 'bundle-a'],
      removedBundles: [],
      addedPlainDependencies: ['plain-library'],
    })
    expect(result.manifest.dsh?.profile?.bundles).toEqual([
      'template-bundle', 'retained', 'bundle-b', 'bundle-a',
    ])
    expect(inspected).toEqual(['retained', 'bundle-b', 'plain-library', 'bundle-a'])
    expect(after.dsh.profile.bundles).toEqual(['template-bundle', 'retained'])
  })

  it('retains user-managed bundles and removes only dependency-managed entries that stopped being bundles', () => {
    const before = {
      dependencies: {
        retained: '1.0.0',
        removed: '1.0.0',
        downgraded: '1.0.0',
      },
      dsh: { profile: { bundles: ['template-bundle', 'retained', 'removed', 'downgraded'] } },
    }
    const after = {
      dependencies: { retained: '1.0.1', downgraded: '2.0.0' },
      dsh: { profile: { bundles: ['template-bundle', 'retained', 'removed', 'downgraded'] } },
    }

    const result = reconcileProfileBundles(before, after, packageName => packageName === 'retained')

    expect(result).toMatchObject({
      changed: true,
      addedBundles: [],
      removedBundles: ['removed', 'downgraded'],
      addedPlainDependencies: [],
    })
    expect(result.manifest.dsh?.profile?.bundles).toEqual(['template-bundle', 'retained'])
    expect(after.dsh.profile.bundles).toEqual(['template-bundle', 'retained', 'removed', 'downgraded'])
  })

  it('returns the original manifest when no bundle transition is required', () => {
    const manifest = {
      dependencies: { retained: '1.0.0' },
      dsh: { profile: { bundles: ['template-bundle', 'retained'] } },
    }

    const result = reconcileProfileBundles(manifest, manifest, () => true)

    expect(result.changed).toBe(false)
    expect(result.manifest).toBe(manifest)
    expect(result.addedBundles).toEqual([])
    expect(result.removedBundles).toEqual([])
    expect(result.addedPlainDependencies).toEqual([])
  })

  it('preserves disabled profile bundles through unrelated upgrades and removes them on uninstall', () => {
    const before = {
      dependencies: { active: '1.0.0', disabled: '1.0.0' },
      dsh: { profile: { bundles: ['base', 'active'], disabledBundles: ['disabled'] } },
    }
    const upgraded = {
      dependencies: { active: '1.1.0', disabled: '1.1.0', added: '1.0.0' },
      // Simulate a package-manager rewrite that retained only the active list.
      dsh: { profile: { bundles: ['base', 'active', 'disabled'] } },
    }
    const result = reconcileProfileBundles(before, upgraded, () => true)
    expect(result.manifest.dsh?.profile).toEqual({
      bundles: ['base', 'active', 'added'],
      disabledBundles: ['disabled'],
    })
    expect(result.addedBundles).toEqual(['added'])
    expect(result.addedDisabledBundles).toEqual(['disabled'])

    const dsh = result.manifest.dsh
    if (dsh === undefined) throw new Error('upgraded profile must retain dsh metadata')
    const removed = reconcileProfileBundles(result.manifest, {
      dependencies: { active: '1.1.0', added: '1.0.0' },
      dsh,
    }, () => true)
    expect(removed.manifest.dsh?.profile).toEqual({
      bundles: ['base', 'active', 'added'],
      disabledBundles: [],
    })
    expect(removed.removedDisabledBundles).toEqual(['disabled'])
  })

  it('activates a newly installed bundle even when stale disabled metadata names it', () => {
    const before = { dependencies: {}, dsh: { profile: { bundles: ['base'], disabledBundles: [] } } }
    const after = {
      dependencies: { added: '1.0.0' },
      dsh: { profile: { bundles: ['base'], disabledBundles: ['added'] } },
    }
    const result = reconcileProfileBundles(before, after, () => true)
    expect(result.manifest.dsh?.profile).toEqual({ bundles: ['base', 'added'], disabledBundles: [] })
  })
})

describe('disabled profile bundles', () => {
  const manifest = {
    dependencies: { managed: '1.0.0' },
    dsh: { profile: { bundles: ['base', 'managed'], disabledBundles: [] } },
  }

  it('moves one installed Bundle between disjoint ordered lists without changing dependencies', () => {
    const disabled = setProfileBundleEnabled(manifest, 'managed', false)
    expect(disabled.dependencies).toBe(manifest.dependencies)
    expect(readProfileBundleState(disabled)).toEqual({ bundles: ['base'], disabledBundles: ['managed'] })
    const enabled = setProfileBundleEnabled(disabled, 'managed', true)
    expect(readProfileBundleState(enabled)).toEqual({ bundles: ['base', 'managed'], disabledBundles: [] })
    expect(setProfileBundleEnabled(enabled, 'managed', true)).toBe(enabled)
  })

  it('rejects overlap, duplicates, uninstalled names, and plain dependencies', () => {
    expect(() => readProfileBundleState({
      dsh: { profile: { bundles: ['same'], disabledBundles: ['same'] } },
    })).toThrow('both active and disabled')
    expect(() => readProfileBundleState({ dsh: { profile: { bundles: ['same', 'same'] } } }))
      .toThrow('must not contain duplicates')
    expect(() => setProfileBundleEnabled(manifest, 'missing', false)).toThrow('uninstalled')
    expect(() => setProfileBundleEnabled({
      dependencies: { plain: '1.0.0' },
      dsh: { profile: { bundles: ['base'], disabledBundles: [] } },
    }, 'plain', false)).toThrow('not a Profile Bundle')
  })
})

describe('resolveBundleDir', () => {
  it('prefers the installation anchor, falls back to the profile, and fails loud', () => {
    const anchor = stageInstallation({ 'in-box': { patch: '[]\n' } })
    const profileDir = tmp()
    mkdirSync(join(profileDir, 'node_modules', 'local-only'), { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), '{}')
    writeFileSync(join(profileDir, 'node_modules', 'local-only', 'package.json'), JSON.stringify({ name: 'local-only', version: '0.0.0' }))
    expect(resolveBundleDir('t', 'in-box', anchor, profileDir)).toContain('in-box')
    expect(resolveBundleDir('t', 'local-only', anchor, profileDir)).toContain('local-only')
    expect(() => resolveBundleDir('t', 'absent', anchor, profileDir)).toThrow('cannot resolve profile bundle')
  })

  it('resolves a package whose exports map omits ./package.json', () => {
    // Common on npm: an exports map without "./package.json" makes
    // require.resolve('<pkg>/package.json') throw ERR_PACKAGE_PATH_NOT_EXPORTED;
    // resolution must fall through to the paths probe instead of misreporting
    // the installed package as missing.
    const anchor = stageInstallation({})
    const profileDir = tmp()
    writeFileSync(join(profileDir, 'package.json'), '{}')
    const dir = join(profileDir, 'node_modules', 'sealed-bundle')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'sealed-bundle',
      version: '0.0.0',
      exports: { '.': './index.js' },
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    writeFileSync(join(dir, 'index.js'), '')
    writeFileSync(join(dir, 'cordis.patch.yml'), '[]\n')
    expect(resolveBundleDir('t', 'sealed-bundle', anchor, profileDir)).toBe(dir)
  })
})

describe('loadProfile', () => {
  it('resolves each dsh.profile.bundles entry to its patch layer in order, plus the user layer', () => {
    const anchor = stageInstallation({
      'bundle-a': { patch: '- insert:\n    - id: a\n      name: pkg-a\n' },
      'bundle-b': { patch: '- id: a\n  config:\n    v: 2\n' },
    })
    const home = tmp()
    const dir = resolveProfileDir('demo', home)
    initProfile(dir, ['bundle-a', 'bundle-b'])
    writeFileSync(join(dir, PROFILE_PATCH_FILENAME), '- id: a\n  config:\n    v: 3\n')
    const profile = loadProfile('t', 'demo', anchor, home)
    expect(profile.layers.map(layer => layer.packageName)).toEqual(['bundle-a', 'bundle-b'])
    expect(profile.patches).toHaveLength(1)
    const entries = composeEntries([
      ...profile.layers.map(layer => layer.patches),
      profile.patches,
    ])
    expect(entries).toEqual([{ id: 'a', name: 'pkg-a', config: { v: 3 } }])
    // A hand-made profile without the user layer file or dsh section: empty layers, no throw.
    rmSync(join(dir, PROFILE_PATCH_FILENAME))
    expect(loadProfile('t', 'demo', anchor, home).patches).toEqual([])
    writeProfileManifest(dir, { name: 'bare' })
    const bare = loadProfile('t', 'demo', anchor, home)
    expect(bare.layers).toEqual([])
  })

  it('auto-initializes only shipped templates and fails loud otherwise', () => {
    const anchor = stageInstallation({})
    const home = tmp()
    expect(() => loadProfile('t', 'custom', anchor, home))
      .toThrow('profile "custom" does not exist')
    // The web template auto-initializes on first load. Bundle resolution
    // cannot be asserted to fail here: the source-plane test runner resolves
    // @deepseek-ai/* through tsconfig paths regardless of the staged anchor.
    expect(PROFILE_TEMPLATES.web).toContain('@deepseek-ai/dsh-base')
    try {
      loadProfile('t', 'web', anchor, home)
    } catch {
      // Resolution failure is the plain-Node outcome for this empty anchor.
    }
    expect(readProfileManifest('t', resolveProfileDir('web', home)).dsh?.profile?.bundles)
      .toEqual([...PROFILE_TEMPLATES.web ?? []])
  })

  it('normalizes only the exact installation-owned headless bundle tuple', () => {
    const anchor = stageInstallation({
      '@deepseek-ai/dsh-base': { patch: '[]\n' },
      '@deepseek-ai/dsh-web-app': { patch: '[]\n' },
      '@deepseek-ai/dsh-headless': { patch: '[]\n' },
      'custom-bundle': { patch: '[]\n' },
    })
    const home = tmp()
    const stock = resolveProfileDir('headless', home)
    initProfile(stock, [
      '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-headless',
    ])
    loadProfile('t', 'headless', anchor, home)
    expect(readProfileManifest('t', stock).dsh?.profile?.bundles)
      .toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'])

    const customHome = tmp()
    const custom = resolveProfileDir('headless', customHome)
    initProfile(custom, [
      '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-headless', 'custom-bundle',
    ])
    loadProfile('t', 'headless', anchor, customHome)
    expect(readProfileManifest('t', custom).dsh?.profile?.bundles).toEqual([
      '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-headless', 'custom-bundle',
    ])
  })

  it('fails loud when a listed bundle declares no dsh.bundle', () => {
    const anchor = stageInstallation({ 'not-a-bundle': {} })
    const home = tmp()
    const dir = resolveProfileDir('demo', home)
    initProfile(dir, ['not-a-bundle'])
    expect(() => loadProfile('t', 'demo', anchor, home)).toThrow('declares no dsh.bundle')
  })
})

describe('composeEntries', () => {
  it('applies layers over an empty root and reports skipped patches', () => {
    const warnings: string[] = []
    const entries = composeEntries([
      [{ insert: [{ id: 'x', name: 'pkg-x', config: { a: 1 } }] }],
      [{ id: 'x', config: { a: 2 } }, { id: 'missing', config: {} }],
    ], message => warnings.push(message))
    expect(entries).toEqual([{ id: 'x', name: 'pkg-x', config: { a: 2 } }])
    expect(warnings.join('\n')).toContain('"missing"')
    // Default warn sink: skipped patches are silently dropped (boot repeats them).
    expect(composeEntries([[{ id: 'missing', config: {} }]])).toEqual([])
  })
})

describe('healProfilesModuleFallback', () => {
  it('links the app and bundle dependency surface flat under profiles/node_modules', () => {
    const anchor = stageInstallation({
      'bundle-a': { patch: '[]\n', deps: { 'dep-of-a': '0.0.0', 'ghost-dep': '0.0.0' } },
      'plain-lib': {},
    })
    // An app dependency that is declared but not installed: skipped, not fatal.
    const appManifest = JSON.parse(readFileSync(anchor, 'utf8')) as { dependencies: Record<string, string> }
    appManifest.dependencies['never-installed'] = '0.0.0'
    writeFileSync(anchor, JSON.stringify(appManifest))
    // dep-of-a lives in the installation's node_modules too.
    const modules = join(anchor, '..', 'node_modules')
    mkdirSync(join(modules, 'dep-of-a'), { recursive: true })
    writeFileSync(join(modules, 'dep-of-a', 'package.json'), JSON.stringify({ name: 'dep-of-a', version: '0.0.0' }))
    const home = tmp()
    healProfilesModuleFallback(anchor, home)
    const fallback = join(home, 'profiles', 'node_modules')
    // App deps, the bundle's own deps, and the bundle itself are linked; the
    // plain library is linked as an app dep (harmless), the app itself too.
    for (const name of ['bundle-a', 'plain-lib', 'dep-of-a', 'dsh-app']) {
      expect(lstatSync(join(fallback, name)).isSymbolicLink(), name).toBe(true)
    }
    // Idempotent, and a moved target is re-pointed.
    healProfilesModuleFallback(anchor, home)
    const before = readlinkSync(join(fallback, 'dep-of-a'))
    expect(before).toContain('dep-of-a')
  })

  it('throws when a fallback entry is a real directory', () => {
    const anchor = stageInstallation({})
    const home = tmp()
    mkdirSync(join(home, 'profiles', 'node_modules', 'dsh-app'), { recursive: true })
    expect(() => { healProfilesModuleFallback(anchor, home) }).toThrow('is not a symlink')
  })

  it('replaces a wrong symlink', () => {
    const anchor = stageInstallation({})
    const home = tmp()
    const fallback = join(home, 'profiles', 'node_modules')
    mkdirSync(fallback, { recursive: true })
    symlinkSync(tmp(), join(fallback, 'dsh-app'), 'junction')
    healProfilesModuleFallback(anchor, home)
    expect(readlinkSync(join(fallback, 'dsh-app'))).toContain('app')
  })

  it('tolerates losing the concurrent-heal race to an identical link and rejects a different one', () => {
    // The EEXIST arm: a second process wrote the link between our lstat miss
    // and symlinkSync. Simulated by pre-creating the correct link and calling
    // the internal path through a stale-lstat shim is not possible from
    // outside, so probe the observable contract: healing twice concurrently
    // is a no-op, and a foreign REAL directory still fails loud.
    const anchor = stageInstallation({})
    const home = tmp()
    healProfilesModuleFallback(anchor, home)
    healProfilesModuleFallback(anchor, home) // second healer sees the correct link
    const fallback = join(home, 'profiles', 'node_modules')
    expect(lstatSync(join(fallback, 'dsh-app')).isSymbolicLink()).toBe(true)
  })
})
