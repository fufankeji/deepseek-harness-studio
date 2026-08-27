import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/desktop-release.yml'), 'utf8')
const previewWorkflow = readFileSync(resolve(repositoryRoot, '.github/workflows/desktop-windows-preview.yml'), 'utf8')
const installerValidationWorkflow = readFileSync(
  resolve(repositoryRoot, '.github/workflows/windows-installer-lifecycle-validation.yml'),
  'utf8',
)
const chineseReadme = readFileSync(resolve(repositoryRoot, 'README.md'), 'utf8')
const englishReadme = readFileSync(resolve(repositoryRoot, 'README.en.md'), 'utf8')

describe('desktop GitHub Release workflow', () => {
  it('binds release assets to one exact Desktop tag and both native builds', () => {
    expect(workflow).toContain('desktop-v${version}')
    expect(workflow).toContain('elif [[ "$version" == *-* ]]')
    expect(workflow).toContain('needs: [prepare, macos, windows]')
    expect(workflow).toContain('run dist:mac -- --arm64')
    expect(workflow).toContain("$env:DSH_DESKTOP_TARGET_PLATFORM = 'win32'")
    expect(workflow).toContain("$env:DSH_DESKTOP_TARGET_ARCH = 'x64'")
  })

  it('requires native signatures and publishes only a complete draft with checksums', () => {
    expect(workflow).toContain('spctl --assess --type execute')
    expect(workflow).toContain('xcrun stapler validate')
    expect(workflow).toContain('Get-AuthenticodeSignature')
    expect(workflow).toContain('! -name SHA256SUMS -print0')
    expect(workflow).toContain('release-assets/SHA256SUMS')
    expect(workflow).toContain('--draft')
    expect(workflow.indexOf('gh release create')).toBeLessThan(workflow.indexOf('gh release edit'))
    expect(workflow).toContain('gh release edit "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --draft=false')
  })

  it('keeps the bilingual public download entry on the Studio repository', () => {
    for (const readme of [chineseReadme, englishReadme]) {
      expect(readme).toContain('https://github.com/fufankeji/deepseek-harness-studio/releases')
      expect(readme).toContain('SHA256SUMS')
      expect(readme).not.toContain('https://github.com/fufankeji/deepseek-harness-desktop')
    }
    expect(chineseReadme).toContain('下载 Windows x64')
    expect(englishReadme).toContain('Download the Windows x64')
  })

  it('keeps preview diagnostics in Actions and exposes only the Windows installer', () => {
    expect(previewWorkflow).toContain('Preserve verified Windows preview as an Actions artifact')
    expect(previewWorkflow).toContain('apps/desktop/dist/WINDOWS_PREVIEW_VERIFICATION.txt')
    expect(previewWorkflow).toContain('Remove-ApplicationFilesButKeepRegistration')
    expect(previewWorkflow).toContain("Invoke-HarnessInstaller 'residual-repair'")
    expect(previewWorkflow).toContain('WaitForExit(300000)')
    expect(previewWorkflow).toContain("Where-Object Name -Like 'Uninstall*.exe'")
    expect(previewWorkflow).toContain('The copied background uninstaller remained after uninstall.')
    expect(previewWorkflow).toContain("'preset-runtime\\bin\\pnpm.cmd'")
    expect(previewWorkflow).toContain('bundled_pnpm_command=PASS')
    expect(previewWorkflow).toContain("Invoke-HarnessInstaller 'in-place-preview-upgrade'")
    expect(previewWorkflow).toContain('in_place_preview_upgrade=PASS')
    expect(previewWorkflow).toContain("$expectedPnpmVersion = ($packageManager -split '@')[-1]")
    expect(previewWorkflow).not.toContain('$expectedPnpmVersion = node -p')
    expect(previewWorkflow).toContain('manually_deleted_install_repair=PASS')
    expect(previewWorkflow).toContain('repaired_uninstaller=PASS')
    const releaseStep = previewWorkflow.slice(previewWorkflow.indexOf(
      '- name: Attach verified Windows installer to the existing release',
    ))
    expect(releaseStep).toContain('gh release upload $env:RELEASE_TAG $installer')
    expect(releaseStep).not.toContain('Setup.exe.blockmap')
    expect(releaseStep).not.toContain('SHA256SUMS-windows-x64-preview.txt')
    expect(releaseStep).not.toContain('WINDOWS_PREVIEW_VERIFICATION.txt')
  })

  it('validates Windows running uninstall, reinstall, and residual-install repair', () => {
    expect(installerValidationWorkflow).toContain('workflow_dispatch:')
    expect(installerValidationWorkflow).toContain('/D=$installDirectory')
    expect(installerValidationWorkflow).toContain('Invoke-RunningUninstall $upgradedApplication')
    expect(installerValidationWorkflow).toContain("Invoke-HarnessInstaller 'in-place-upgrade'")
    expect(installerValidationWorkflow).toContain("Invoke-HarnessInstaller 'reinstall'")
    expect(installerValidationWorkflow).toContain('Remove-ApplicationFilesButKeepRegistration')
    expect(installerValidationWorkflow).toContain("Invoke-HarnessInstaller 'residual-repair'")
    expect(installerValidationWorkflow).toContain('same_directory_reinstall=PASS')
    expect(installerValidationWorkflow).toContain('running_in_place_upgrade=PASS')
    expect(installerValidationWorkflow).toContain('manually_deleted_install_repair=PASS')
    expect(installerValidationWorkflow).toContain('repaired_packaged_host_start=PASS')
    expect(installerValidationWorkflow).toContain('run_real_vision:')
    expect(installerValidationWorkflow).toContain('DSH_WINDOWS_VISION_E2E_KEY')
    expect(installerValidationWorkflow).toContain('verify-installed-vision-e2e.ts')
    expect(installerValidationWorkflow).toContain('$nodeExecutable = (Get-Command node -ErrorAction Stop).Source')
    expect(installerValidationWorkflow).toContain("'node_modules\\tsx\\dist\\cli.mjs'")
    expect(installerValidationWorkflow).toContain('& $nodeExecutable $visionDriver')
    expect(installerValidationWorkflow).not.toContain('pnpm exec tsx apps/desktop/scripts/verify-installed-vision-e2e.ts')
    expect(installerValidationWorkflow).toContain('installed_v4_vision=$windowsVisionStatus')
    expect(installerValidationWorkflow).toContain('differential_update_blockmap=PASS')
    expect(installerValidationWorkflow).toContain('fresh_install_seconds=')
    expect(installerValidationWorkflow).toContain('WINDOWS_INSTALLER_LIFECYCLE_VERIFICATION.txt')
    expect(installerValidationWorkflow).toContain('$hostProcess = Get-CimInstance Win32_Process')
    expect(installerValidationWorkflow).not.toContain('$host = Get-CimInstance Win32_Process')
    expect(installerValidationWorkflow).toContain('$appExitDeadline = (Get-Date).AddSeconds(45)')
    expect(installerValidationWorkflow).toContain('while (-not $application.HasExited')
    expect(installerValidationWorkflow).not.toContain('gh release upload')
  })
})
