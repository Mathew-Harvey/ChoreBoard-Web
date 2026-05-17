# Processes raw `lvl{N}{|f}move.mp4` dance clips into clean alpha-channel
# assets under `src/assets/avatars/video/`. The raw clips have:
#   - a near-white background that needs keying out so the figure sits over
#     the tier-coloured pedestal cleanly,
#   - a tiny "Grok" generator watermark in the bottom-right corner,
#   - inconsistent dimensions (368x816 vs 384x784).
#
# The pipeline normalises width to 288px (keeps the aspect, rounds height to
# even), nukes the watermark with a `drawbox`, keys the white background to
# alpha, and emits TWO formats per clip:
#
#   .webm  - libvpx-vp9 + yuva420p (alpha-side-block VP9). The compact
#            choice for Chromium / Firefox / Edge. ~300-650 KB per clip.
#
#   .webp  - libwebp_anim + alpha. The Apple-WebKit fallback because Safari
#            (iPadOS / Capacitor WKWebView) cannot decode VP9-alpha WebM —
#            iOS 16 drops the alpha block, older iOS fails the source
#            outright. Animated WebP with alpha works back to iOS 14, all
#            modern Chromium/Firefox releases, and gets us a true
#            transparent dance on the iPad. ~600 KB - 1.4 MB per clip.
#
# `<TierDancer>` picks the right one at runtime via UA sniff (see
# `src/ui/TierDancer.tsx`) — WebKit gets the .webp, everyone else the .webm.
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
  @{ src = 'lvl1move.mp4';  webm = 'lvl1dance.webm';  webp = 'lvl1dance.webp'  },
  @{ src = 'lvl2move.mp4';  webm = 'lvl2dance.webm';  webp = 'lvl2dance.webp'  },
  @{ src = 'lvl3move.mp4';  webm = 'lvl3dance.webm';  webp = 'lvl3dance.webp'  },
  @{ src = 'lvl4move.mp4';  webm = 'lvl4dance.webm';  webp = 'lvl4dance.webp'  },
  @{ src = 'lvl5move.mp4';  webm = 'lvl5dance.webm';  webp = 'lvl5dance.webp'  },
  @{ src = 'lvl6move.mp4';  webm = 'lvl6dance.webm';  webp = 'lvl6dance.webp'  },
  @{ src = 'lvl1fmove.mp4'; webm = 'lvl1fdance.webm'; webp = 'lvl1fdance.webp' },
  @{ src = 'lvl2fmove.mp4'; webm = 'lvl2fdance.webm'; webp = 'lvl2fdance.webp' },
  @{ src = 'lvl3fmove.mp4'; webm = 'lvl3fdance.webm'; webp = 'lvl3fdance.webp' },
  @{ src = 'lvl4fmove.mp4'; webm = 'lvl4fdance.webm'; webp = 'lvl4fdance.webp' },
  @{ src = 'lvl5fmove.mp4'; webm = 'lvl5fdance.webm'; webp = 'lvl5fdance.webp' },
  @{ src = 'lvl6fmove.mp4'; webm = 'lvl6fdance.webm'; webp = 'lvl6fdance.webp' }
)

# Shared video filter graph. The trailing `format=yuva420p` is the right
# alpha-bearing pixel format for BOTH downstream encoders below — libvpx-vp9
# splits it into VP9's BlockAdditional alpha sidecar, and libwebp_anim keeps
# it as a true 4th plane in the WebP container.
$filterChain = 'drawbox=x=iw-92:y=ih-46:w=92:h=46:color=white@1.0:t=fill,scale=288:-2,format=rgba,colorkey=color=0xFFFFFF:similarity=0.10:blend=0.06,format=yuva420p'

foreach ($pair in $pairs) {
  $src     = Join-Path $SrcDir $pair.src
  $webmOut = Join-Path $OutDir $pair.webm
  $webpOut = Join-Path $OutDir $pair.webp

  if (-not (Test-Path $src)) {
    Write-Warning "Missing source: $src - skipping"
    continue
  }

  # --- VP9 + alpha WebM (Chromium / Firefox / Edge) -----------------------
  Write-Host "Encoding $($pair.src) -> $($pair.webm)"
  & ffmpeg -y -i $src -vf $filterChain -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -lag-in-frames 0 -metadata:s:v:0 alpha_mode=1 -b:v 280k -row-mt 1 -tile-columns 2 -threads 4 -deadline good -cpu-used 2 -an $webmOut -loglevel error
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg (webm) failed for $($pair.src)"
  }
  Write-Host ("  -> {0:N0} bytes (webm)" -f (Get-Item $webmOut).Length)

  # --- Animated WebP with alpha (Apple WebKit fallback) -------------------
  # Note: libwebp_anim doesn't know how to apply rate-control across frames
  # the same way VP9 does. `-quality 75` + `-compression_level 6` lands
  # under ~1.5 MB per 6-second clip while keeping the figure crisp.
  # `-lossless 0` is the default but is explicit here so a future engineer
  # doesn't toggle it for a 4-5x size bloat.
  Write-Host "Encoding $($pair.src) -> $($pair.webp)"
  & ffmpeg -y -i $src -vf $filterChain -c:v libwebp_anim -pix_fmt yuva420p -loop 0 -compression_level 6 -quality 75 -lossless 0 -an $webpOut -loglevel error
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg (webp) failed for $($pair.src)"
  }
  Write-Host ("  -> {0:N0} bytes (webp)" -f (Get-Item $webpOut).Length)
}

Write-Host ""
Write-Host "Done. Output dir contents:"
Get-ChildItem $OutDir | Sort-Object Name | Format-Table Name, Length
