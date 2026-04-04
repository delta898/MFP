#ifndef MyAppVersion
  #error MyAppVersion define is required.
#endif

#ifndef MySourceDir
  #error MySourceDir define is required.
#endif

#ifndef MyOutputDir
  #error MyOutputDir define is required.
#endif

#ifndef MyOutputBaseFilename
  #error MyOutputBaseFilename define is required.
#endif

#ifndef MySetupIcon
  #error MySetupIcon define is required.
#endif

#define MyAppName "BlogGenius"
#define MyAppPublisher "amadejjs"
#define MyAppExeName "BlogGenius.exe"

[Setup]
AppId={{8C8728D1-37EF-4D47-9B95-D166F35E6A31}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL=https://github.com/delta898/NaverAutoBlog
AppSupportURL=https://github.com/delta898/NaverAutoBlog
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir={#MyOutputDir}
OutputBaseFilename={#MyOutputBaseFilename}
SetupIconFile={#MySetupIcon}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\{#MyAppExeName}
CloseApplications=no

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; Flags: unchecked

[Files]
Source: "{#MySourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent
