<#
.SYNOPSIS
  Runs the Artache Chat server on this Windows PC.

.DESCRIPTION
  One script for everything. Run it from PowerShell in the chat folder:

    .\scripts\artache-chat.ps1 setup            First time only. Picks the server name, makes the
                                                 invite token, starts the server, opens it to friends.
    .\scripts\artache-chat.ps1 status           Is it running, and at which address.
    .\scripts\artache-chat.ps1 start | stop     Start or stop the server.
    .\scripts\artache-chat.ps1 invite           Make a new invite token (old one stops working).
    .\scripts\artache-chat.ps1 backup           Copy everything to the backup folder (server pauses
                                                 for a few seconds).
    .\scripts\artache-chat.ps1 restore -From "<backup folder>"
                                                 Put a backup back. Makes a safety backup first.
    .\scripts\artache-chat.ps1 update -Version v2.0.1
                                                 Back up, then move to another server release.
    .\scripts\artache-chat.ps1 logs             Last 100 lines of the server log.

  Needs Docker Desktop and Tailscale installed and signed in. Nothing here touches the network
  on a timer. Every log line it writes goes to logs\artache-chat.log beside this script.

.PARAMETER Reach
  setup only. "public" (default): friends reach the server at an https://...ts.net address
  through Tailscale Funnel, with no app to install besides their chat app. "tailnet": only
  devices in your Tailscale network can reach it; each friend installs Tailscale and you
  share this PC with them.
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet("setup", "status", "start", "stop", "invite", "backup", "restore", "update", "logs", "help")]
  [string]$Command = "help",
  [ValidateSet("public", "tailnet")]
  [string]$Reach = "public",
  [string]$ServerName,
  [string]$Version,
  [string]$From,
  [string]$BackupFolder = (Join-Path $env:USERPROFILE "Documents\Artache Chat backups"),
  [int]$KeepBackups = 7
)

$ErrorActionPreference = "Stop"
$ChatRoot = Split-Path -Parent $PSScriptRoot
$ServerDir = Join-Path $ChatRoot "server"
$EnvFile = Join-Path $ServerDir ".env"
$TokenFile = Join-Path $ServerDir "secrets\invite-token"
# Database and media live in the Docker volume "artache-chat_db", at this path in the container.
$DbVolume = "artache-chat_db"
$DbPath = "/var/lib/tuwunel"
$ComposeFile = Join-Path $ServerDir "docker-compose.yml"
$LogDir = Join-Path $ChatRoot "logs"
$Port = 8008

function Write-Log([string]$Message) {
  if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
  $line = "{0}  {1}  {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Command, $Message
  Add-Content -Path (Join-Path $LogDir "artache-chat.log") -Value $line
  Write-Host $Message
}

function Fail([string]$Message) {
  Write-Log "ERROR: $Message"
  exit 1
}

# A plain function (no param block) so that flags like -d pass straight through to docker.
function Invoke-Compose {
  & docker compose --project-directory $ServerDir -f $ComposeFile @args
  if ($LASTEXITCODE -ne 0) { Fail "docker compose $($args -join ' ') failed." }
}

# Copies the database out of the stopped server into $Target\db. Returns $true on success.
function Save-Backup([string]$Target) {
  New-Item -ItemType Directory -Path $Target -Force | Out-Null
  $wasUp = Test-ServerUp
  # A stopped server guarantees a consistent copy of the database.
  if ($wasUp) { Invoke-Compose stop }
  & docker compose --project-directory $ServerDir -f $ComposeFile cp "homeserver:$DbPath" (Join-Path $Target "db")
  $ok = ($LASTEXITCODE -eq 0)
  if ($ok) {
    Copy-Item $EnvFile $Target
    Copy-Item (Join-Path $ServerDir "tuwunel.toml") $Target
    Copy-Item $ComposeFile $Target
  }
  if ($wasUp) { Invoke-Compose up -d }
  return $ok
}

function Assert-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail "Docker is not installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop/ and run this again."
  }
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) { Fail "Docker Desktop is installed but not running. Open Docker Desktop, wait for 'Engine running', then run this again." }
}

function Get-TailscaleExe {
  $cmd = Get-Command tailscale -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $default = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
  if (Test-Path $default) { return $default }
  return $null
}

function Get-TailscaleName {
  $ts = Get-TailscaleExe
  if (-not $ts) { Fail "Tailscale is not installed. Install it from https://tailscale.com/download/windows, sign in, and run this again." }
  $json = & $ts status --json | Out-String | ConvertFrom-Json
  if ($json.BackendState -ne "Running") { Fail "Tailscale is installed but not signed in. Open Tailscale from the tray, sign in, then run this again." }
  return $json.Self.DNSName.TrimEnd(".")
}

function Read-ServerName {
  if (-not (Test-Path $EnvFile)) { return $null }
  foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*SERVER_NAME\s*=\s*(.+?)\s*$') { return $Matches[1] }
  }
  return $null
}

function New-InviteToken {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token = [Convert]::ToBase64String($bytes).Replace("+", "").Replace("/", "").Replace("=", "")
  $dir = Split-Path -Parent $TokenFile
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  # No newline: the server compares the whole file.
  [System.IO.File]::WriteAllText($TokenFile, $token)
  return $token
}

function Test-ServerUp {
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/_matrix/client/versions" -TimeoutSec 5
    return [bool]$r.versions
  } catch { return $false }
}

function Wait-ServerUp {
  for ($i = 0; $i -lt 30; $i++) {
    if (Test-ServerUp) { return }
    Start-Sleep -Seconds 1
  }
  Fail "The server did not answer within 30 seconds. Run '.\scripts\artache-chat.ps1 logs' to see why."
}

function Show-FriendNote([string]$Name, [string]$Token) {
  Write-Host ""
  Write-Host "Send this to a friend (by a private channel):" -ForegroundColor Cyan
  Write-Host "  1. Install a Matrix app, for now Element X (phone) or Element (computer)."
  Write-Host "  2. Choose 'Create account' and change the server to: https://$Name"
  Write-Host "  3. When asked for a registration token, paste: $Token"
  Write-Host "  4. Your ID will be @yourname:$Name. Mine is the one I give you."
  Write-Host ""
}

switch ($Command) {

  "setup" {
    Assert-Docker
    $existing = Read-ServerName
    if ($existing) {
      Fail "Already set up as '$existing'. The server name cannot change without wiping the chat history. Use 'start' instead."
    }
    if (-not $ServerName) { $ServerName = Get-TailscaleName }
    Write-Log "Server name will be: $ServerName (permanent, it ends every ID)."
    $answer = Read-Host "Type YES to continue"
    if ($answer -ne "YES") { Fail "Stopped before changing anything." }

    Set-Content -Path $EnvFile -Value "SERVER_NAME=$ServerName" -Encoding ascii
    $token = New-InviteToken
    Write-Log "Made the first invite token."

    Invoke-Compose up -d
    Wait-ServerUp
    Write-Log "Server is running on this PC at http://127.0.0.1:$Port."

    $ts = Get-TailscaleExe
    if ($ts) {
      if ($Reach -eq "public") {
        & $ts funnel --bg $Port
        Write-Log "Opened to friends through Tailscale Funnel at https://$ServerName."
      } else {
        & $ts serve --bg $Port
        Write-Log "Opened to your Tailscale network at https://$ServerName."
      }
      if ($LASTEXITCODE -ne 0) { Write-Log "Tailscale could not open the port. Run 'tailscale funnel --bg $Port' by hand and follow the link it prints to allow Funnel." }
    }

    Write-Host ""
    Write-Host "Next: make YOUR account first, it becomes the admin." -ForegroundColor Yellow
    Show-FriendNote $ServerName $token
  }

  "status" {
    Assert-Docker
    $name = Read-ServerName
    if (-not $name) { Fail "Not set up yet. Run '.\scripts\artache-chat.ps1 setup'." }
    Invoke-Compose ps
    if (Test-ServerUp) { Write-Host "Server answers on this PC. Address for apps: https://$name" -ForegroundColor Green }
    else { Write-Host "Server is not answering." -ForegroundColor Red }
    $ts = Get-TailscaleExe
    if ($ts) { & $ts funnel status }
  }

  "start" {
    Assert-Docker
    if (-not (Read-ServerName)) { Fail "Not set up yet. Run '.\scripts\artache-chat.ps1 setup'." }
    Invoke-Compose up -d
    Wait-ServerUp
    Write-Log "Server started."
  }

  "stop" {
    Assert-Docker
    Invoke-Compose stop
    Write-Log "Server stopped. Friends cannot connect until you start it again."
  }

  "invite" {
    $name = Read-ServerName
    if (-not $name) { Fail "Not set up yet." }
    $token = New-InviteToken
    Write-Log "Made a new invite token. The previous one no longer works."
    Show-FriendNote $name $token
  }

  "backup" {
    Assert-Docker
    if (-not (Read-ServerName)) { Fail "Not set up yet, nothing to back up." }
    $target = Join-Path $BackupFolder (Get-Date -Format "yyyy-MM-dd_HHmmss")
    if (-not (Save-Backup $target)) { Fail "Copy failed. The server was restarted; nothing was removed." }
    Write-Log "Backed up to $target"
    # Only dated backups count; "before-restore_" safety copies are kept until you delete them.
    $all = Get-ChildItem $BackupFolder -Directory | Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_' } | Sort-Object Name -Descending
    $all | Select-Object -Skip $KeepBackups | ForEach-Object {
      Remove-Item $_.FullName -Recurse -Force
      Write-Log "Removed old backup $($_.Name) (keeping $KeepBackups)."
    }
  }

  "restore" {
    Assert-Docker
    if (-not $From) { Fail "Say which backup, for example: -From `"$BackupFolder\2026-11-25_183000`"" }
    $source = Join-Path $From "db"
    if (-not (Test-Path (Join-Path $source "CURRENT"))) { Fail "'$From' does not look like an Artache Chat backup (no db\CURRENT file)." }
    Write-Log "This replaces everything on the server with the backup in $From."
    $answer = Read-Host "Type RESTORE to continue"
    if ($answer -ne "RESTORE") { Fail "Stopped before changing anything." }
    $safety = Join-Path $BackupFolder ("before-restore_" + (Get-Date -Format "yyyy-MM-dd_HHmmss"))
    if (-not (Save-Backup $safety)) { Fail "Safety backup failed, so nothing was restored." }
    Write-Log "Safety backup of the current server in $safety"
    Invoke-Compose down
    & docker volume rm $DbVolume | Out-Null
    Invoke-Compose create
    # The trailing \. copies the folder's contents, not the folder itself.
    Invoke-Compose cp "$source\." "homeserver:$DbPath"
    Invoke-Compose start
    Wait-ServerUp
    Write-Log "Restored from $From."
  }

  "update" {
    Assert-Docker
    if (-not $Version) { Fail "Say which release, for example: -Version v2.0.1 (see https://github.com/matrix-construct/tuwunel/releases)." }
    & $PSCommandPath backup -BackupFolder $BackupFolder -KeepBackups $KeepBackups
    if ($LASTEXITCODE -ne 0) { Fail "Backup failed, so the update did not run." }
    $compose = Get-Content $ComposeFile -Raw
    $updated = $compose -replace 'image: jevolk/tuwunel:\S+', "image: jevolk/tuwunel:$Version"
    Set-Content -Path $ComposeFile -Value $updated -NoNewline
    Invoke-Compose pull
    Invoke-Compose up -d
    Wait-ServerUp
    Write-Log "Updated the server to $Version."
  }

  "logs" {
    Assert-Docker
    Invoke-Compose logs --tail 100 --no-color homeserver
  }

  default { Get-Help $PSCommandPath -Detailed }
}
