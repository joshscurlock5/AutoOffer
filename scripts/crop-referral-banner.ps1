# Crops the referral banner photo to a chosen region and saves a JPG.
# Usage: pass L T R B (pixels in the 3172x1344 source) + output path.
param(
  [int]$L = 0,
  [int]$T = 270,
  [int]$R = 2620,
  [int]$B = 1110,
  [string]$Out = "C:\Users\joshu\AppData\Local\Temp\referral-crop-test.jpg",
  [int]$MaxW = 2200
)
Add-Type -AssemblyName System.Drawing
$srcPath = "C:\Users\joshu\Downloads\Dad w phone banner.png"
$src = New-Object System.Drawing.Bitmap $srcPath
$cw = $R - $L
$ch = $B - $T
# optional downscale to keep file size reasonable
$scale = 1.0
if ($cw -gt $MaxW) { $scale = $MaxW / $cw }
$ow = [int][Math]::Round($cw * $scale)
$oh = [int][Math]::Round($ch * $scale)
$dst = New-Object System.Drawing.Bitmap $ow, $oh
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$destRect = New-Object System.Drawing.Rectangle 0, 0, $ow, $oh
$g.DrawImage($src, $destRect, $L, $T, $cw, $ch, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
# save JPEG at quality 88
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]88)
$dst.Save($Out, $enc, $ep)
$src.Dispose(); $dst.Dispose()
$kb = [Math]::Round((Get-Item $Out).Length / 1KB, 1)
Write-Output ("crop [{0},{1}]-[{2},{3}] = {4}x{5} -> {6}x{7}  ({8} KB)  {9}" -f $L,$T,$R,$B,$cw,$ch,$ow,$oh,$kb,$Out)
