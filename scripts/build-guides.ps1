# Renders the three HTML guides in docs/ to PDF using headless Edge.
# Run from anywhere:  powershell -File scripts\build-guides.ps1

$ErrorActionPreference = "Stop"

$docs = Join-Path (Split-Path -Parent $PSScriptRoot) "docs"

$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $edge) { throw "Microsoft Edge not found - install it, or render the HTML with any Chromium browser's Print to PDF." }

$guides = @(
  @{ Source = "owner-guide.html";        Output = "GymOS-Owner-Guide.pdf" },
  @{ Source = "receptionist-guide.html"; Output = "GymOS-Receptionist-Guide.pdf" },
  @{ Source = "marketer-guide.html";     Output = "GymOS-Marketer-Guide.pdf" }
)

foreach ($guide in $guides) {
  $src = Join-Path $docs $guide.Source
  $out = Join-Path $docs $guide.Output
  $uri = ([System.Uri]$src).AbsoluteUri

  # Start-Process, not the call operator: Edge writes harmless diagnostics to
  # stderr, and Windows PowerShell turns redirected native stderr into
  # terminating errors. Routing it to a temp file sidesteps that entirely.
  # A throwaway profile forces a standalone instance. Without it Edge can hand
  # the job to an already-running copy and exit immediately, so -Wait returns
  # before the PDF has been written.
  $noise   = [System.IO.Path]::GetTempFileName()
  $profile = Join-Path ([System.IO.Path]::GetTempPath()) "gymos-guide-$([guid]::NewGuid())"

  # Each argument is quoted by hand: Start-Process joins an argument array with
  # plain spaces and quotes nothing, so a path containing a space (this project
  # lives in "GymOS 2.0") would reach Edge as two arguments and fail with
  # "Multiple targets are not supported in headless mode."
  $arguments = @(
    "--headless=new",
    "--disable-gpu",
    "`"--user-data-dir=$profile`"",
    "--no-pdf-header-footer",
    "`"--print-to-pdf=$out`"",
    "`"$uri`""
  ) -join " "

  Start-Process -FilePath $edge -Wait -NoNewWindow -RedirectStandardError $noise -ArgumentList $arguments

  Remove-Item $noise -Force -ErrorAction SilentlyContinue
  Remove-Item $profile -Recurse -Force -ErrorAction SilentlyContinue

  if (Test-Path $out) {
    $kb = [math]::Round((Get-Item $out).Length / 1KB)
    Write-Host "$($guide.Output) - $kb KB"
  } else {
    throw "Failed to render $($guide.Source)"
  }
}
