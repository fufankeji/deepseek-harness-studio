/** Read the selected Profile facts needed by the compatibility evaluator without changing local state. */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import type {
  CatalogFreshness,
  CatalogVersionPreflight,
  CompatibilityFingerprint,
  InstalledPluginIdentity,
} from '@deepseek-ai/dsh-plugin-center-contracts'
import { resolveCompatibilityFingerprint } from './environment.ts'
import type { ProtectedSystemComponents } from './system-components.ts'

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const EXACT_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u
const ENTRY_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u

/** Desktop-owned inputs for one fresh read of the selected Profile projection. */
export interface ProfileCompatibilityReadInput {
  readonly homeDirectory: string
  readonly profileName: string
  readonly desktopVersion: string
  readonly dshVersion: string
  readonly nodeVersion: string
  readonly os: NodeJS.Platform
  readonly architecture: string
  readonly catalogEtag: string
  readonly catalogFreshness: CatalogFreshness
  readonly candidates: readonly CatalogVersionPreflight[]
  readonly systemComponents: ProtectedSystemComponents
  readonly activeOperation: boolean
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must hold an object`)
  return value as Record<string, unknown>
}

function optionalRecord(value: unknown, label: string): Record<string, unknown> | undefined {
  return value === undefined ? undefined : record(value, label)
}

function packageNames(value: unknown, label: string): readonly string[] {
  const source = record(value ?? {}, label)
  const names = Object.keys(source)
  if (names.some(name => !PACKAGE_NAME.test(name))) throw new Error(`${label} contains an invalid package name`)
  return names
}

function bundles(value: unknown, label: string): readonly string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some(name => typeof name !== 'string' || !PACKAGE_NAME.test(name))) {
    throw new Error(`${label} must contain package names`)
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} must not contain duplicates`)
  return value as readonly string[]
}

function packageManifestPath(profileDirectory: string, packageName: string): string {
  const segments = packageName.startsWith('@') ? packageName.split('/') : [packageName]
  return join(profileDirectory, 'node_modules', ...segments, 'package.json')
}

function parseManifest(bytes: Buffer, path: string): Record<string, unknown> {
  const source = bytes.toString('utf8')
  const normalized = source.charCodeAt(0) === 0xFEFF ? source.slice(1) : source
  try {
    return record(JSON.parse(normalized) as unknown, path)
  } catch (error) {
    throw new Error(`failed to parse package manifest ${path}: ${String(error)}`, { cause: error })
  }
}

function bundleEntryIds(patch: string, label: string): readonly string[] {
  const ids = new Set<string>()
  for (const [index, line] of patch.split(/\r?\n/u).entries()) {
    const matched = line.match(/^\s*-\s+id:\s+(.+?)\s*$/u)?.[1]
    if (matched === undefined) continue
    const value = ((matched.startsWith("'") && matched.endsWith("'"))
      || (matched.startsWith('"') && matched.endsWith('"'))) ? matched.slice(1, -1) : matched
    if (!ENTRY_ID.test(value)) throw new Error(`${label}:${String(index + 1)} has an invalid Loader row id`)
    ids.add(value)
  }
  return [...ids].sort()
}

function addFile(hash: ReturnType<typeof createHash>, label: string, path: string, required: true): Buffer
function addFile(hash: ReturnType<typeof createHash>, label: string, path: string, required: false): Buffer | undefined
function addFile(hash: ReturnType<typeof createHash>, label: string, path: string, required: boolean): Buffer | undefined {
  if (!existsSync(path)) {
    if (required) throw new Error(`selected Profile is missing ${path}`)
    hash.update(`${label}\0<absent>\0`)
    return undefined
  }
  const bytes = readFileSync(path)
  hash.update(`${label}\0`)
  hash.update(bytes)
  hash.update('\0')
  return bytes
}

function installedIdentity(
  profileDirectory: string,
  packageName: string,
  enabled: boolean,
  candidates: readonly CatalogVersionPreflight[],
  hash: ReturnType<typeof createHash>,
): InstalledPluginIdentity | undefined {
  const manifestPath = packageManifestPath(profileDirectory, packageName)
  const bytes = addFile(hash, `package:${packageName}`, manifestPath, true)
  const manifest = parseManifest(bytes, manifestPath)
  const version = manifest['version']
  if (manifest['name'] !== packageName || typeof version !== 'string' || !EXACT_VERSION.test(version)) {
    throw new Error(`${manifestPath} does not declare its exact installed identity`)
  }
  const dsh = optionalRecord(manifest['dsh'], `${manifestPath} dsh`)
  const bundle = optionalRecord(dsh?.['bundle'], `${manifestPath} dsh.bundle`)
  const patch = bundle?.['patch']
  if (patch === undefined) return undefined
  if (typeof patch !== 'string' || patch === '') throw new Error(`${manifestPath} has an invalid dsh.bundle.patch`)
  const root = dirname(manifestPath)
  const patchPath = resolve(root, patch)
  const fromRoot = relative(root, patchPath)
  if (fromRoot === '..' || fromRoot.startsWith('../') || fromRoot.startsWith('..\\')) {
    throw new Error(`${manifestPath} declares a Bundle patch outside its package`)
  }
  const patchBytes = addFile(hash, `patch:${packageName}`, patchPath, true)
  const matches = candidates.filter(candidate =>
    candidate.packageName === packageName && candidate.version === version,
  )
  if (matches.length > 1) throw new Error(`${packageName}@${version} matches multiple catalog plugins`)
  return {
    pluginId: matches[0]?.pluginId ?? null,
    version,
    packageName,
    enabled,
    entryIds: bundleEntryIds(patchBytes.toString('utf8'), patchPath),
  }
}

/**
 * Rebuild one compatibility fingerprint from the current Profile files and installed Bundle manifests.
 * @param input - Release, catalog, selected-Profile, and operation facts owned by Desktop.
 * @returns A validated fingerprint whose revision changes with every consumed local authority file.
 */
export function readProfileCompatibilityFingerprint(input: ProfileCompatibilityReadInput): CompatibilityFingerprint {
  const profileDirectory = join(input.homeDirectory, 'profiles', input.profileName)
  const hash = createHash('sha256')
  const manifestPath = join(profileDirectory, 'package.json')
  const manifestBytes = addFile(hash, 'profile-manifest', manifestPath, true)
  addFile(hash, 'profile-patch', join(profileDirectory, 'cordis.patch.yml'), false)
  addFile(hash, 'profile-lock', join(profileDirectory, 'pnpm-lock.yaml'), false)
  const manifest = parseManifest(manifestBytes, manifestPath)
  const dsh = optionalRecord(manifest['dsh'], `${manifestPath} dsh`)
  const profile = optionalRecord(dsh?.['profile'], `${manifestPath} dsh.profile`)
  const dependencyNames = packageNames(manifest['dependencies'], `${manifestPath} dependencies`)
  const bundleNames = bundles(profile?.['bundles'], `${manifestPath} dsh.profile.bundles`)
  const disabledBundleNames = bundles(profile?.['disabledBundles'], `${manifestPath} dsh.profile.disabledBundles`)
  const disabled = new Set(disabledBundleNames)
  const overlap = bundleNames.find(packageName => disabled.has(packageName))
  if (overlap !== undefined) throw new Error(`${manifestPath} lists ${overlap} as both active and disabled`)
  const protectedNames = new Set(input.systemComponents.packageNames)
  const externalNames = [...new Set([...dependencyNames, ...bundleNames, ...disabledBundleNames])]
    .filter(packageName => !protectedNames.has(packageName))
    .sort()
  const enabled = new Set(bundleNames)
  const installedPlugins = externalNames.flatMap((packageName) => {
    const identity = installedIdentity(profileDirectory, packageName, enabled.has(packageName), input.candidates, hash)
    return identity === undefined ? [] : [identity]
  })
  const profileRevision = hash.digest().readUInt32BE(0) & 0x7fff_ffff
  return resolveCompatibilityFingerprint({
    desktopVersion: input.desktopVersion,
    dshVersion: input.dshVersion,
    nodeVersion: input.nodeVersion,
    os: input.os,
    architecture: input.architecture,
    catalogEtag: input.catalogEtag,
    catalogFreshness: input.catalogFreshness,
    profileRevision,
    installedPlugins,
    systemComponents: input.systemComponents,
    activeOperation: input.activeOperation,
  })
}
