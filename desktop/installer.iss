; JM下载器 桌面端安装包（Inno Setup 6）。由 desktop/build.py 调用，别直接编译：
;   ISCC /DAppVersion=1.1.1 /DDistDir=<PyInstaller 输出目录> /DOutDir=<安装包输出目录> installer.iss
; 装的只有程序本身；书和各种数据在 %APPDATA%\JM下载器（或设置里选的位置），卸载时不会删。

#define AppName "JM下载器"
#define AppExe "JMDownloader.exe"
#ifndef AppVersion
  #define AppVersion "1.1.1"
#endif

[Setup]
AppId={{8F3C2A51-7B4E-4C1D-9A2E-5D6F7A8B9C01}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=lumasy123
AppPublisherURL=https://github.com/lumasy123/JM-Downloader
AppSupportURL=https://github.com/lumasy123/JM-Downloader/issues
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
; 默认装到当前用户（不用管理员权限），也可以在安装时选「为所有用户安装」
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir={#OutDir}
OutputBaseFilename=JM下载器-安装包-{#AppVersion}
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; 升级时如果程序开着，先提示关掉
CloseApplications=yes

[Languages]
Name: "chs"; MessagesFile: "ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[InstallDelete]
; 升级时先清掉旧版本的库文件，免得新旧混在一起
Type: filesandordirs; Name: "{app}\_internal"

[Files]
Source: "{#DistDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
