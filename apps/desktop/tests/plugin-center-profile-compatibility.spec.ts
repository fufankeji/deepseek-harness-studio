import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BUNDLED_CATALOG } from '../src/plugin-center/catalog-fixture.ts'
import { readProfileCompatibilityFingerprint } from '../src/plugin-center/profile-compatibility.ts'

const roots: string[] = []
const WORKSPACE_CANDIDATE = BUNDLED_CATALOG.preflights.find(
  candidate => candidate.pluginId === 'fixture.workspace-tools',
)!

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function packageDirectory(profile: string, packageName: string): string {
  return join(profile, 'node_modules', ...packageName.split('/'))
}

function writeBundle(profile: string, packageName: string, version: string, entryId: string): void {
  const directory = packageDirectory(profile, packageName)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), `${JSON.stringify({
    name: packageName,
    version,
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, undefined, 2)}\n`)
  writeFileSync(join(directory, 'cordis.patch.yml'), `- id: ${entryId}\n  disabled: false\n`)
}

function fixture(): { readonly home: string; readonly profile: string } {
  const home = mkdtempSync(join(tmpdir(), 'dsh-plugin-profile-'))
  roots.push(home)
  const profile = join(home, 'profiles/web')
  mkdirSync(profile, { recursive: true })
  const bundles = [WORKSPACE_CANDIDATE.packageName, '@local/unknown-bundle']
  writeFileSync(join(profile, 'package.json'), `${JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies: {
      [WORKSPACE_CANDIDATE.packageName]: WORKSPACE_CANDIDATE.version,
      '@local/unknown-bundle': '0.3.0',
    },
    dsh: { profile: { bundles } },
  }, undefined, 2)}\n`)
  writeFileSync(join(profile, 'cordis.patch.yml'), '[]\n')
  writeFileSync(join(profile, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  writeBundle(
    profile,
    WORKSPACE_CANDIDATE.packageName,
    WORKSPACE_CANDIDATE.version,
    'fixture.workspace-tools',
  )
  writeBundle(profile, '@local/unknown-bundle', '0.3.0', 'local.unknown')
  return { home, profile }
}

function read(home: string) {
  return readProfileCompatibilityFingerprint({
    homeDirectory: home,
    profileName: 'web',
    desktopVersion: '0.1.0-rc.5',
    dshVersion: '0.1.0-rc.5',
    nodeVersion: '22.22.0',
    os: 'darwin',
    architecture: 'arm64',
    catalogEtag: BUNDLED_CATALOG.etag,
    catalogFreshness: 'fresh',
    candidates: BUNDLED_CATALOG.preflights,
    systemComponents: {
      packageNames: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
      entryIds: ['agent-loop'],
    },
    activeOperation: false,
  })
}

describe('selected Profile compatibility projection', () => {
  it('maps exact reviewed Bundles, preserves unknown local identity, and hashes every consumed authority file', () => {
    const current = fixture()
    const before = read(current.home)
    expect(before.installedPlugins).toEqual([
      {
        pluginId: 'fixture.workspace-tools',
        version: WORKSPACE_CANDIDATE.version,
        packageName: WORKSPACE_CANDIDATE.packageName,
        enabled: true,
        entryIds: ['fixture.workspace-tools'],
      },
      {
        pluginId: null,
        version: '0.3.0',
        packageName: '@local/unknown-bundle',
        enabled: true,
        entryIds: ['local.unknown'],
      },
    ])

    writeFileSync(join(current.profile, 'node_modules/@local/unknown-bundle/cordis.patch.yml'),
      '- id: local.changed\n  disabled: false\n')
    const after = read(current.home)
    expect(after.profileRevision).not.toBe(before.profileRevision)
    expect(after.installedPlugins[1]?.entryIds).toEqual(['local.changed'])
  })

  it('projects explicitly disabled installed Bundles without silently reactivating them', () => {
    const current = fixture()
    writeFileSync(join(current.profile, 'package.json'), `${JSON.stringify({
      name: 'dsh-profile-web',
      dependencies: {
        [WORKSPACE_CANDIDATE.packageName]: WORKSPACE_CANDIDATE.version,
        '@local/unknown-bundle': '0.3.0',
      },
      dsh: {
        profile: {
          bundles: ['@local/unknown-bundle'],
          disabledBundles: [WORKSPACE_CANDIDATE.packageName],
        },
      },
    }, undefined, 2)}\n`)
    const fingerprint = read(current.home)
    expect(fingerprint.installedPlugins.find(plugin => plugin.pluginId === 'fixture.workspace-tools'))
      .toMatchObject({ enabled: false })
    expect(fingerprint.installedPlugins.find(plugin => plugin.packageName === '@local/unknown-bundle'))
      .toMatchObject({ enabled: true })
  })

  it('fails loud on malformed durable Profile and Bundle authority', () => {
    const current = fixture()
    writeFileSync(join(current.profile, 'package.json'), '[]\n')
    expect(() => read(current.home)).toThrow('must hold an object')
  })

  it('projects BOM-prefixed Profile and installed Bundle manifests', () => {
    const current = fixture()
    const profileManifest = join(current.profile, 'package.json')
    const bundleManifest = join(
      current.profile,
      'node_modules/@local/unknown-bundle/package.json',
    )
    writeFileSync(profileManifest, `\uFEFF${readFileSync(profileManifest, 'utf8')}`)
    writeFileSync(bundleManifest, `\uFEFF${readFileSync(bundleManifest, 'utf8')}`)

    const fingerprint = read(current.home)
    expect(fingerprint.installedPlugins.find(plugin => plugin.packageName === '@local/unknown-bundle'))
      .toMatchObject({ enabled: true, version: '0.3.0' })
  })

  it('rejects ambiguous active and disabled Profile state', () => {
    const current = fixture()
    writeFileSync(join(current.profile, 'package.json'), `${JSON.stringify({
      dependencies: { [WORKSPACE_CANDIDATE.packageName]: WORKSPACE_CANDIDATE.version },
      dsh: {
        profile: {
          bundles: [WORKSPACE_CANDIDATE.packageName],
          disabledBundles: [WORKSPACE_CANDIDATE.packageName],
        },
      },
    })}\n`)
    expect(() => read(current.home)).toThrow('both active and disabled')
  })
})
