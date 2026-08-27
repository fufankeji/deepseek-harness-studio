!macro customCheckAppRunning
  # The assisted uninstaller checks processes before multi-user initialization,
  # so read its registered custom location before falling back to the temp copy.
  !ifdef BUILD_UNINSTALLER
    ReadRegStr $3 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
    ${If} $3 == ""
      ReadRegStr $3 HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation"
    ${EndIf}
    ${If} $3 == ""
      StrCpy $3 "$EXEDIR"
    ${EndIf}
  !else
    StrCpy $3 "$INSTDIR"
  !endif

  ${If} ${FileExists} "$3\${APP_EXECUTABLE_FILENAME}"
    # The signal-only secondary Electron instance can outlive the primary quit
    # request, so never let its lifetime block the installer.
    Exec '"$3\${APP_EXECUTABLE_FILENAME}" --dsh-installer-quit'
    Sleep 3000
  ${EndIf}

  # Always force-clean the process tree. Public preview builds can leave a
  # process that both the install-path and filename probes fail to report.
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /T /F /IM "${APP_EXECUTABLE_FILENAME}"'
  Pop $0

  # Catch an orphaned Electron renderer or packaged Host whose image name no
  # longer matches the main executable but whose binary still lives in $3.
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance -ClassName Win32_Process | Where-Object {$$_.ExecutablePath -and $$_.ExecutablePath.StartsWith(''$3'', ''CurrentCultureIgnoreCase'')} | ForEach-Object {Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue}"'
  Pop $0
  Sleep 1000

  nsProcess::_FindProcess /NOUNLOAD "${APP_EXECUTABLE_FILENAME}"
  Pop $0
  ${If} $0 == 0
    nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /T /F /IM "${APP_EXECUTABLE_FILENAME}"'
    Pop $0
    Sleep 1000
  ${EndIf}

  nsProcess::_FindProcess /NOUNLOAD "${APP_EXECUTABLE_FILENAME}"
  Pop $0
  ${If} $0 == 0
    ${IfNot} ${Silent}
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(appCannotBeClosed)"
    ${EndIf}
    SetErrorLevel 2
    Abort
  ${EndIf}

  !ifndef BUILD_UNINSTALLER
    # Preview upgrades and incomplete uninstalls both replace only the
    # dedicated product directory before the stock installer can re-enter an
    # older preview uninstaller. User data lives outside this directory.
    ReadRegStr $1 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ReadRegStr $2 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "InstallLocation"
    StrCpy $4 "0"
    ${If} $2 != ""
      StrLen $5 "\${APP_FILENAME}"
      StrCpy $6 "$2" $5 -$5
      ${If} $6 == "\${APP_FILENAME}"
        ${IfNot} ${FileExists} "$2\${APP_EXECUTABLE_FILENAME}"
          StrCpy $4 "1"
        ${EndIf}
        ${IfNot} ${FileExists} "$2\${UNINSTALL_FILENAME}"
          StrCpy $4 "1"
        ${EndIf}
        StrCpy $7 "$1" 9
        ${If} $7 == "0.1.0-rc."
          StrCpy $4 "1"
        ${EndIf}
      ${EndIf}
      ${If} $4 == "1"
        DetailPrint "Removing an incomplete DeepSeek Harness installation at $2"
        RMDir /r "$2"
        DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
        DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
        SetOverwrite on
      ${EndIf}
    ${EndIf}
  !endif
!macroend
