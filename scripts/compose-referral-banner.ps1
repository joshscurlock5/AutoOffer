# Builds the final referral banner image: crop the photo, pad its LEFT with the
# photo's own navy so the image aspect matches the wide banner box (keeps full
# height -> head + keys both survive object-cover). Also renders a simulation of
# the desktop banner (object-cover + gradient overlay) for visual verification.
Add-Type -AssemblyName System.Drawing
$srcPath = "C:\Users\joshu\Downloads\Dad w phone banner.png"

# --- crop region (source px) ---
$L = 0; $T = 150; $R = 2440; $B = 1150
$cw = $R - $L; $ch = $B - $T            # 2440 x 1000

# --- target padded canvas ---
$navy = [System.Drawing.Color]::FromArgb(0x0D,0x13,0x21)
$TARGET_ASPECT = 3.40
$finalH = 1000
$finalW = [int]($finalH * $TARGET_ASPECT)   # 3400
$padX   = $finalW - $cw                      # left padding width

$src = New-Object System.Drawing.Bitmap $srcPath
$final = New-Object System.Drawing.Bitmap $finalW, $finalH
$g = [System.Drawing.Graphics]::FromImage($final)
$g.Clear($navy)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$dest = New-Object System.Drawing.Rectangle $padX, 0, $cw, $ch
$g.DrawImage($src, $dest, $L, $T, $cw, $ch, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()

# save final JPG (q90)
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$ep = New-Object System.Drawing.Imaging.EncoderParameters 1
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]90)
$finalOut = "C:\Users\joshu\AppData\Local\Temp\referral-final.jpg"
$final.Save($finalOut, $enc, $ep)

# --- simulate desktop banner: object-cover into ~1326x397, objpos 72% 50% + gradient ---
$boxW = 1326; $boxH = 397; $objX = 0.72; $objY = 0.5
$sim = New-Object System.Drawing.Bitmap $boxW, $boxH
$sg = [System.Drawing.Graphics]::FromImage($sim)
$sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
# cover scale
$scale = [Math]::Max($boxW / $finalW, $boxH / $finalH)
$dw = $finalW * $scale; $dh = $finalH * $scale
$dx = ($boxW - $dw) * $objX
$dy = ($boxH - $dh) * $objY
$sg.DrawImage($final, $dx, $dy, $dw, $dh)
# gradient overlay: #16181D -> transparent at 55%
$gradRect = New-Object System.Drawing.Rectangle 0, 0, ([int]($boxW*0.55)), $boxH
$lg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $gradRect, ([System.Drawing.Color]::FromArgb(255,0x16,0x18,0x1D)), ([System.Drawing.Color]::FromArgb(0,0x16,0x18,0x1D)), ([System.Drawing.Drawing2D.LinearGradientMode]::Horizontal)
$sg.FillRectangle($lg, 0, 0, [int]($boxW*0.55), $boxH)
# mock text to check overlap
$tBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$f1 = New-Object System.Drawing.Font "Arial", 11, ([System.Drawing.FontStyle]::Bold)
$f2 = New-Object System.Drawing.Font "Arial", 26, ([System.Drawing.FontStyle]::Bold)
$f3 = New-Object System.Drawing.Font "Arial", 12
$sg.DrawString("Referral Program", $f1, $tBrush, 64, 70)
$sg.DrawString("Refer a friend, get `$100", $f2, $tBrush, 64, 110)
$sg.DrawString("Know someone selling their car? Send them to", $f3, $tBrush, 64, 175)
$sg.DrawString("DriveOffer - when we buy it, you get `$100.", $f3, $tBrush, 64, 200)
$sg.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,37,99,235))), 64, 250, 150, 40)
$sg.DrawString("Refer Someone", $f1, $tBrush, 80, 263)
$sg.Dispose()
$simOut = "C:\Users\joshu\AppData\Local\Temp\referral-sim.jpg"
$sim.Save($simOut, $enc, $ep)

$src.Dispose(); $final.Dispose(); $sim.Dispose()
$kb = [Math]::Round((Get-Item $finalOut).Length/1KB,1)
Write-Output ("final {0}x{1} (aspect {2:N3}, pad {3}px) {4}KB -> {5}" -f $finalW,$finalH,$TARGET_ASPECT,$padX,$kb,$finalOut)
Write-Output ("sim   {0}x{1} -> {2}" -f $boxW,$boxH,$simOut)
