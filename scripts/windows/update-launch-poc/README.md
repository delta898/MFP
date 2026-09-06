# Windows update helper launch PoC

This packages a minimal unsigned Electron application and compares two harmless helper launch modes. It does not read, replace, or remove BlogGenius files.

From a Windows PowerShell prompt at the repository root:

```powershell
.\scripts\windows\update-launch-poc\build-and-run.ps1
```

The command prints the path to `report.json`. The expected result is:

- `current`: reproduces the detached PowerShell failure (`helperReady=false`).
- `bootstrap`: starts and survives the packaged Electron parent (`helperReady=true`, `helperSurvived=true`).

The report also records the packaged executable's Authenticode status, Zone Identifier presence, and relevant Windows policy events that were accessible to the current user.

When using the artifact produced by GitHub Actions, extract it and run `run-poc.cmd`. Its report is written under `results-user`.
