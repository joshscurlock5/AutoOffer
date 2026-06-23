# Draws a labeled 200px grid over the source image so we can read pixel coords.
Add-Type -AssemblyName System.Drawing
$srcPath = "C:\Users\joshu\Downloads\Dad w phone banner.png"
$out = "C:\Users\joshu\AppData\Local\Temp\referral-grid.jpg"
$src = New-Object System.Drawing.Bitmap $srcPath
$w = $src.Width; $h = $src.Height
$g = [System.Drawing.Graphics]::FromImage($src)
$penMinor = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(140,255,80,80)), 2
$penMajor = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(220,0,255,255)), 2
$font = New-Object System.Drawing.Font "Arial", 26, ([System.Drawing.FontStyle]::Bold)
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::Yellow)
$shadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::Black)
for ($x = 0; $x -le $w; $x += 200) {
  $pen = if ($x % 1000 -eq 0) { $penMajor } else { $penMinor }
  $g.DrawLine($pen, $x, 0, $x, $h)
  $g.DrawString("$x", $font, $shadow, ($x+4), 6)
  $g.DrawString("$x", $font, $brush, ($x+2), 4)
}
for ($y = 0; $y -le $h; $y += 200) {
  $pen = if ($y % 1000 -eq 0) { $penMajor } else { $penMinor }
  $g.DrawLine($pen, 0, $y, $w, $y)
  $g.DrawString("$y", $font, $shadow, 6, ($y+4))
  $g.DrawString("$y", $font, $brush, 4, ($y+2))
}
$g.Dispose()
# downscale for viewing
$ow = 1600; $oh = [int]($h * $ow / $w)
$dst = New-Object System.Drawing.Bitmap $ow, $oh
$dg = [System.Drawing.Graphics]::FromImage($dst)
$dg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$dg.DrawImage($src, 0, 0, $ow, $oh)
$dg.Dispose()
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]90)
$dst.Save($out, $enc, $ep)
$src.Dispose(); $dst.Dispose()
Write-Output ("grid saved {0}  (source {1}x{2}, shown {3}x{4})" -f $out,$w,$h,$ow,$oh)
