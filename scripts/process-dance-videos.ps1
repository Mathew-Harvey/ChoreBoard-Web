# Processes raw `lvl{N}{|f}move.mp4` dance clips into clean VP9-alpha WebMs
# under `src/assets/avatars/video/`. The raw clips have:
#   - a near-white background that needs keying out so the figure sits over
#     the tier-coloured pedestal cleanly,
#   - a tiny "Grok" generator watermark in the bottom-right corner,
#   - inconsistent dimensions (368x816 vs 384x784).
#
# The pipeline normalises width to 288px (keeps the aspect, rounds height to
# even), nukes the watermark with a `drawbox`, keys the white background to
# alpha, and re-encodes with libvpx-vp9 + yuva420p so the WebM carries a
# proper alpha plane. Outputs come in at ~300-650 KB per 6-second clip.
#
# Source location: `src/assets/avatars/video/raw/` — sits right next to the
# processed WebM outputs so the relationship is obvious. The folder is
# git-ignored (see .gitignore) because the raw mp4s are LARGE (~30 MB
# total) and only the cleaned-up WebMs need to ship.
#
#   IMPORTANT: do NOT keep raw sources inside `dist/`. Vite's `build` step
#   empties that directory by default, so anything you store there will be
#   silently deleted on the next `npm run build`. An earlier version of
#   this script pointed at `dist/assets/video/` and we paid for it.
#
# Vite does not bundle files in this folder because no source file imports
# them — they are *inputs* to the build, not outputs.
#
# Run from the repo root:  pwsh scripts/process-dance-videos.ps1
#
# Re-running is safe — outputs are overwritten in place.

$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$SrcDir = Join-Path $RepoRoot 'src/assets/avatars/video/raw'
$OutDir = Join-Path $RepoRoot 'src/assets/avatars/video'

if (-not (Test-Path $SrcDir)) {
  Write-Warning "Source folder not found: $SrcDir"
  Write-Warning "Drop your raw mp4 clips (lvl{1..6}move.mp4 and lvl{1..6}fmove.mp4) into that directory and re-run."
  exit 1
}

if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$pairs = @(
  @{ src = 'lvl1move.mp4';  out = 'lvl1dance.webm'  },
  @{ src = 'lvl2move.mp4';  out = 'lvl2dance.webm'  },
  @{ src = 'lvl3move.mp4';  out = 'lvl3dance.webm'  },
  @{ src = 'lvl4move.mp4';  out = 'lvl4dance.webm'  },
  @{ src = 'lvl5move.mp4';  out = 'lvl5dance.webm'  },
  @{ src = 'lvl6move.mp4';  out = 'lvl6dance.webm'  },
  @{ src = 'lvl1fmove.mp4'; out = 'lvl1fdance.webm' },
  @{ src = 'lvl2fmove.mp4'; out = 'lvl2fdance.webm' },
  @{ src = 'lvl3fmove.mp4'; out = 'lvl3fdance.webm' },
  @{ src = 'lvl4fmove.mp4'; out = 'lvl4fdance.webm' },
  @{ src = 'lvl5fmove.mp4'; out = 'lvl5fdance.webm' },
  @{ src = 'lvl6fmove.mp4'; out = 'lvl6fdance.webm' }
)

$filterChain = 'drawbox=x=iw-92:y=ih-46:w=92:h=46:color=white@1.0:t=fill,scale=288:-2,format=rgba,colorkey=color=0xFFFFFF:similarity=0.10:blend=0.06,format=yuva420p'

foreach ($pair in $pairs) {
  $src = Join-Path $SrcDir $pair.src
  $out = Join-Path $OutDir $pair.out
  if (-not (Test-Path $src)) {
    Write-Warning "Missing source: $src - skipping"
    continue
  }
  Write-Host "Encoding $($pair.src) -> $($pair.out)"
  & ffmpeg -y -i $src -vf $filterChain -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -lag-in-frames 0 -metadata:s:v:0 alpha_mode=1 -b:v 280k -row-mt 1 -tile-columns 2 -threads 4 -deadline good -cpu-used 2 -an $out -loglevel error
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg failed for $($pair.src)"
  }
  $size = (Get-Item $out).Length
  Write-Host ("  -> {0:N0} bytes" -f $size)
}

Write-Host ""
Write-Host "Done. Output dir contents:"
Get-ChildItem $OutDir | Sort-Object Name | Format-Table Name, Length
