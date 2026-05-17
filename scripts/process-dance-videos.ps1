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
#   .webp  - Animated WebP with alpha — the Apple-WebKit fallback because
#            Safari (iPadOS / Capacitor WKWebView) cannot decode VP9-alpha
#            WebM (iOS 16 drops the alpha block, older iOS fails the
#            source outright).
#
#            History note: we tried two simpler encoders before this and
#            both broke on iPad —
#              - ffmpeg's `libwebp_anim` writes Dispose=0/Blend=0 (alpha-
#                blend over previous frame) with no exposed override.
#                Safari faithfully composites each frame on top of the
#                last, so the avatar leaves ghost trails of every prior
#                frame and the decoder paces playback far below source.
#              - ffmpeg's `apng` encoder has no inter-frame compression
#                (each frame is a self-contained PNG IDAT), producing
#                ~15 MB per 6 s clip — ~190 MB across the set. Not
#                shippable.
#
#            The fix is to drive cwebp + webpmux directly (from
#            `Google.Libwebp` — `winget install Google.Libwebp`). cwebp
#            encodes individual frames; webpmux assembles them with
#            EXPLICIT Dispose=1 (restore-to-background) and Blend=1
#            (source-replace) flags, which Safari renders cleanly. End
#            result: ~1.5–2 MB per clip, no ghosting, correct timing.
#
# `<TierDancer>` picks the right one at runtime via UA sniff (see
# `src/ui/TierDancer.tsx`) — WebKit gets the .webp, everyone else the
# .webm.
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

# Locate cwebp / webpmux. They land on PATH after `winget install
# Google.Libwebp`, but a fresh shell hasn't picked up the PATH update on
# the user's first run, so we look them up via Get-Command first and fall
# back to scanning the winget package directory before giving up.
function Find-WebPTool([string]$name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidate = Get-ChildItem `
    -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" `
    -Filter "$name.exe" -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 1 -ExpandProperty FullName
  if ($candidate) { return $candidate }
  return $null
}

$cwebp   = Find-WebPTool 'cwebp'
$webpmux = Find-WebPTool 'webpmux'
if (-not $cwebp -or -not $webpmux) {
  Write-Error "Could not find cwebp/webpmux. Install with: winget install Google.Libwebp"
  exit 1
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

# Shared filter graph for the WebM pass. Ends in `yuva420p` because VP9
# needs that exact pixel format to pack alpha into its BlockAdditional
# sidecar.
$webmFilter = 'drawbox=x=iw-92:y=ih-46:w=92:h=46:color=white@1.0:t=fill,scale=288:-2,format=rgba,colorkey=color=0xFFFFFF:similarity=0.10:blend=0.06,format=yuva420p'

# Filter graph for the WebP frame extraction. Same watermark / scale /
# colorkey but ends in `rgba` for the still PNGs that cwebp will eat.
# 12 fps keeps the dance idle readable while halving frame count vs. the
# 24 fps source — every extra frame is roughly another 25-30 KB in the
# final WebP because libwebp's inter-frame compression is far weaker
# than VP9's.
$frameFilter = 'drawbox=x=iw-92:y=ih-46:w=92:h=46:color=white@1.0:t=fill,fps=12,scale=288:-2,format=rgba,colorkey=color=0xFFFFFF:similarity=0.10:blend=0.06,format=rgba'

# WebP frame timing — must match the `fps=` above (1000 ms / 12 fps ≈ 83 ms).
$frameDurationMs = 83

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
  & ffmpeg -y -i $src -vf $webmFilter -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -lag-in-frames 0 -metadata:s:v:0 alpha_mode=1 -b:v 280k -row-mt 1 -tile-columns 2 -threads 4 -deadline good -cpu-used 2 -an $webmOut -loglevel error
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg (webm) failed for $($pair.src)"
  }
  Write-Host ("  -> {0:N0} bytes (webm)" -f (Get-Item $webmOut).Length)

  # --- Animated WebP with alpha (Apple WebKit fallback) ------------------
  # Three-stage pipeline because the only WebP encoder that exposes
  # per-frame disposal/blend control is `webpmux` — and webpmux only
  # accepts WebP frames as input, not PNGs.
  Write-Host "Encoding $($pair.src) -> $($pair.webp)"
  $framesDir = Join-Path $OutDir ("_frames_" + [IO.Path]::GetFileNameWithoutExtension($pair.webp))
  if (Test-Path $framesDir) { Remove-Item -Recurse -Force $framesDir }
  New-Item -ItemType Directory -Path $framesDir | Out-Null
  try {
    # 1) Extract alpha PNG frames at the target fps.
    & ffmpeg -y -i $src -vf $frameFilter -vsync 0 (Join-Path $framesDir 'f_%04d.png') -loglevel error
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg (frame extract) failed for $($pair.src)" }

    # 2) Lossy-encode each PNG to a single-frame WebP. `-exact` preserves
    #    RGB values under transparent pixels so the alpha edges don't
    #    bleed when the figure moves.
    $pngFrames = Get-ChildItem $framesDir -Filter '*.png' | Sort-Object Name
    foreach ($png in $pngFrames) {
      $wp = [IO.Path]::ChangeExtension($png.FullName, '.webp')
      & $cwebp -q 72 -m 6 -exact $png.FullName -o $wp -quiet
      if ($LASTEXITCODE -ne 0) { throw "cwebp failed for $($png.Name)" }
    }

    # 3) Mux into one animated WebP with EXPLICIT disposal/blend:
    #      +d           frame duration (ms)
    #      +0+0         no offset (full-frame replace)
    #      +1           Dispose=1 (restore canvas to background before
    #                   drawing the next frame — the fix for the iPad
    #                   ghost-trail bug)
    #      -b           Blend=source (overwrite pixels rather than
    #                   alpha-blend over the previous frame)
    $webpFrames = Get-ChildItem $framesDir -Filter '*.webp' | Sort-Object Name
    $muxArgs = @()
    foreach ($wf in $webpFrames) {
      $muxArgs += '-frame'
      $muxArgs += $wf.FullName
      $muxArgs += "+$frameDurationMs+0+0+1-b"
    }
    $muxArgs += @('-loop','0','-o',$webpOut)
    & $webpmux @muxArgs | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "webpmux failed for $($pair.webp)" }
  }
  finally {
    Remove-Item -Recurse -Force $framesDir -ErrorAction SilentlyContinue
  }
  Write-Host ("  -> {0:N0} bytes (webp)" -f (Get-Item $webpOut).Length)
}

Write-Host ""
Write-Host "Done. Output dir contents:"
Get-ChildItem $OutDir | Sort-Object Name | Format-Table Name, Length
