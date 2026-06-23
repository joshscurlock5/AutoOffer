Add-Type -AssemblyName System.Drawing

$dir    = "C:\Users\joshu\AutoOffer\public\icons"
$backup = Join-Path $dir "_original"
if (-not (Test-Path $backup)) { New-Item -ItemType Directory -Path $backup | Out-Null }

$files     = @("referral-refer.png","referral-sell.png","referral-reward.png")
$OUT       = 256          # final square size
$MARGIN    = 0.07         # fraction of content size kept as padding on each side
$THRESHOLD = 244          # pixel counts as "content" if min(R,G,B) < this (white ~255)

foreach ($f in $files) {
  $path = Join-Path $dir $f

  # back up original once
  $bk = Join-Path $backup $f
  if (-not (Test-Path $bk)) { Copy-Item $path $bk }

  $src = New-Object System.Drawing.Bitmap $bk   # always crop from the pristine original
  $w = $src.Width; $h = $src.Height

  # fast pixel read via LockBits (BGRA)
  $rect = New-Object System.Drawing.Rectangle 0,0,$w,$h
  $data = $src.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $stride = $data.Stride
  $bytes = New-Object byte[] ($stride * $h)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $src.UnlockBits($data)

  $minX = $w; $minY = $h; $maxX = -1; $maxY = -1
  for ($y = 0; $y -lt $h; $y++) {
    $row = $y * $stride
    for ($x = 0; $x -lt $w; $x++) {
      $i = $row + ($x * 4)
      $b = $bytes[$i]; $g = $bytes[$i+1]; $r = $bytes[$i+2]
      $min = $b; if ($g -lt $min) { $min = $g }; if ($r -lt $min) { $min = $r }
      if ($min -lt $THRESHOLD) {
        if ($x -lt $minX) { $minX = $x }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }

  $cw = $maxX - $minX + 1
  $ch = $maxY - $minY + 1
  $contentMax = [Math]::Max($cw, $ch)
  $canvas = [int]([Math]::Round($contentMax * (1 + 2 * $MARGIN)))

  # square white canvas, content centered
  $square = New-Object System.Drawing.Bitmap $canvas, $canvas
  $sg = [System.Drawing.Graphics]::FromImage($square)
  $sg.Clear([System.Drawing.Color]::White)
  $sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $offX = [int](($canvas - $cw) / 2)
  $offY = [int](($canvas - $ch) / 2)
  $destRect = New-Object System.Drawing.Rectangle $offX, $offY, $cw, $ch
  $sg.DrawImage($src, $destRect, $minX, $minY, $cw, $ch, [System.Drawing.GraphicsUnit]::Pixel)
  $sg.Dispose()

  # downscale to final size
  $final = New-Object System.Drawing.Bitmap $OUT, $OUT
  $fg = [System.Drawing.Graphics]::FromImage($final)
  $fg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $fg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $fg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $fg.DrawImage($square, 0, 0, $OUT, $OUT)
  $fg.Dispose()

  $src.Dispose(); $square.Dispose()
  $final.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $final.Dispose()

  $sizeKB = [Math]::Round((Get-Item $path).Length / 1KB, 1)
  Write-Output ("{0}: content {1}x{2} -> canvas {3} -> {4}x{4}  ({5} KB)" -f $f, $cw, $ch, $canvas, $OUT, $sizeKB)
}
Write-Output "DONE"
