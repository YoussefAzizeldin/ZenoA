$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$desktop = [Environment]::GetFolderPath('Desktop')
$source = Join-Path $root 'dist\win-unpacked'
$install = Join-Path $env:LOCALAPPDATA 'Zeno'
$installedExe = Join-Path $install 'Zeno.exe'
$desktopExe = Join-Path $desktop 'Zeno.exe'
$desktopShortcut = Join-Path $desktop 'Zeno.lnk'
$desktopUninstaller = Join-Path $desktop 'Uninstall Zeno.exe'
$desktopUninstallerShortcut = Join-Path $desktop 'Uninstall Zeno.lnk'

if (-not (Test-Path (Join-Path $source 'Zeno.exe'))) {
  throw 'No built Zeno.exe was found in dist\win-unpacked.'
}

if (Test-Path $install) {
  Remove-Item -LiteralPath $install -Recurse -Force
}

Copy-Item -LiteralPath $source -Destination $install -Recurse -Force

$launcherCode = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

public static class ZenoUninstallerProgram {
  [STAThread]
  public static void Main() {
    string target = Path.Combine(
      Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
      "Zeno",
      "Zeno.exe"
    );

    if (!File.Exists(target)) {
      MessageBox.Show(
        "Zeno is not installed at " + target,
        "Zeno Launcher",
        MessageBoxButtons.OK,
        MessageBoxIcon.Error
      );
      return;
    }

    Process.Start(new ProcessStartInfo(target) {
      WorkingDirectory = Path.GetDirectoryName(target)
    });
  }
}
'@

if (Test-Path $desktopExe) {
  Remove-Item -LiteralPath $desktopExe -Force
}

try {
  Add-Type `
    -TypeDefinition $launcherCode `
    -ReferencedAssemblies 'System.Windows.Forms.dll' `
    -OutputAssembly $desktopExe `
    -OutputType WindowsApplication

  if (Test-Path $desktopShortcut) {
    Remove-Item -LiteralPath $desktopShortcut -Force
  }

  Write-Host ('Installed app: ' + $installedExe)
  Write-Host ('Desktop executable ready: ' + $desktopExe)
} catch {
  Write-Warning ('Could not create Desktop launcher exe: ' + $_.Exception.Message)
  Write-Host 'Creating Desktop shortcut instead...'

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($desktopShortcut)
  $shortcut.TargetPath = $installedExe
  $shortcut.WorkingDirectory = $install
  $shortcut.IconLocation = $installedExe
  $shortcut.Save()

  Write-Host ('Installed app: ' + $installedExe)
  Write-Host ('Desktop shortcut ready: ' + $desktopShortcut)
}

$uninstallerCode = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

public static class Program {
  [STAThread]
  public static void Main() {
    string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
    string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);

    string installDir = Path.Combine(localAppData, "Zeno");
    string userDataDir = Path.Combine(appData, "Zeno");
    string desktopLauncher = Path.Combine(desktop, "Zeno.exe");
    string desktopShortcut = Path.Combine(desktop, "Zeno.lnk");
    string desktopUninstaller = Application.ExecutablePath;
    string desktopUninstallerShortcut = Path.Combine(desktop, "Uninstall Zeno.lnk");

    DialogResult choice = MessageBox.Show(
      "This will uninstall Zeno from this PC.\n\nRemove saved settings, tasks, logs, and WhatsApp auth data too?\n\nYes = remove app and saved data\nNo = remove app only\nCancel = stop",
      "Uninstall Zeno",
      MessageBoxButtons.YesNoCancel,
      MessageBoxIcon.Warning
    );

    if (choice == DialogResult.Cancel) {
      return;
    }

    bool removeData = choice == DialogResult.Yes;

    try {
      StopZeno();
      Thread.Sleep(600);

      DeleteFile(desktopLauncher);
      DeleteFile(desktopShortcut);
      DeleteFile(desktopUninstallerShortcut);
      DeleteDirectory(installDir);

      if (removeData) {
        DeleteDirectory(userDataDir);
      }

      MessageBox.Show(
        removeData
          ? "Zeno has been uninstalled.\n\nSaved app data was removed."
          : "Zeno has been uninstalled.\n\nSaved app data was preserved.",
        "Uninstall Zeno",
        MessageBoxButtons.OK,
        MessageBoxIcon.Information
      );

      DeleteSelfLater(desktopUninstaller);
    } catch (Exception ex) {
      MessageBox.Show(
        "Uninstall failed:\n\n" + ex.Message,
        "Uninstall Zeno",
        MessageBoxButtons.OK,
        MessageBoxIcon.Error
      );
    }
  }

  static void StopZeno() {
    int currentId = Process.GetCurrentProcess().Id;
    foreach (Process process in Process.GetProcessesByName("Zeno")) {
      if (process.Id == currentId) continue;
      try {
        process.Kill();
        process.WaitForExit(3000);
      } catch {}
    }
  }

  static void DeleteFile(string path) {
    if (File.Exists(path)) {
      File.Delete(path);
    }
  }

  static void DeleteDirectory(string path) {
    if (Directory.Exists(path)) {
      Directory.Delete(path, true);
    }
  }

  static void DeleteSelfLater(string path) {
    if (!File.Exists(path)) return;

    string args = "/c ping 127.0.0.1 -n 2 > nul & del /f /q \"" + path + "\"";
    ProcessStartInfo info = new ProcessStartInfo("cmd.exe", args);
    info.CreateNoWindow = true;
    info.WindowStyle = ProcessWindowStyle.Hidden;
    Process.Start(info);
  }
}
'@

if (Test-Path $desktopUninstaller) {
  Remove-Item -LiteralPath $desktopUninstaller -Force
}

try {
  Add-Type `
    -TypeDefinition $uninstallerCode `
    -ReferencedAssemblies 'System.Windows.Forms.dll' `
    -OutputAssembly $desktopUninstaller `
    -OutputType WindowsApplication

  if (Test-Path $desktopUninstallerShortcut) {
    Remove-Item -LiteralPath $desktopUninstallerShortcut -Force
  }

  Write-Host ('Desktop uninstaller ready: ' + $desktopUninstaller)
} catch {
  Write-Warning ('Could not create Desktop uninstaller exe: ' + $_.Exception.Message)
  Write-Host 'Creating Desktop uninstaller shortcut instead...'

  Copy-Item `
    -LiteralPath (Join-Path $root 'scripts\uninstall-zeno.ps1') `
    -Destination (Join-Path $install 'uninstall-zeno.ps1') `
    -Force

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($desktopUninstallerShortcut)
  $shortcut.TargetPath = 'powershell.exe'
  $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $install 'uninstall-zeno.ps1') + '"'
  $shortcut.WorkingDirectory = $install
  $shortcut.Save()

  Write-Host ('Desktop uninstaller shortcut ready: ' + $desktopUninstallerShortcut)
}
