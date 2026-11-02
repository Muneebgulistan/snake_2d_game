Add-Type -AssemblyName System.Drawing

$assetDir = Join-Path $PSScriptRoot '..\assets'
$resDir = Join-Path $PSScriptRoot '..\android\app\src\main\res'
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null

function New-SerpentArtwork([int]$size, [bool]$withBackground, [bool]$adaptiveSafeArea) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $scale = $size / 1024.0
    $graphics.ScaleTransform($scale, $scale)

    if ($withBackground) {
        $bg = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
            [System.Drawing.Rectangle]::new(0, 0, 1024, 1024),
            [System.Drawing.Color]::FromArgb(255, 7, 23, 46),
            [System.Drawing.Color]::FromArgb(255, 2, 6, 23),
            45.0
        )
        $graphics.FillRectangle($bg, 0, 0, 1024, 1024)
        $bg.Dispose()
        $aura = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(28, 0, 210, 240))
        $graphics.FillEllipse($aura, 155, 155, 714, 714)
        $aura.Dispose()
        $ring = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(48, 56, 189, 248), 3)
        $graphics.DrawEllipse($ring, 92, 92, 840, 840)
        $ring.Dispose()
        $star = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(150, 165, 243, 252))
        foreach ($p in @(@(210,288,5),@(800,275,4),@(817,710,6),@(264,770,4),@(690,846,3),@(345,188,3))) {
            $graphics.FillEllipse($star, $p[0], $p[1], $p[2] * 2, $p[2] * 2)
        }
        $star.Dispose()
    }

    if ($adaptiveSafeArea) {
        $graphics.TranslateTransform(512, 512)
        $graphics.ScaleTransform(0.78, 0.78)
        $graphics.TranslateTransform(-512, -512)
    }

    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.StartFigure()
    $path.AddBezier([single]760,[single]785,[single]650,[single]900,[single]365,[single]874,[single]302,[single]700)
    $path.AddBezier([single]302,[single]700,[single]224,[single]485,[single]585,[single]490,[single]683,[single]352)
    $path.AddBezier([single]683,[single]352,[single]770,[single]229,[single]644,[single]130,[single]505,[single]196)

    foreach ($width in @(224, 188, 160)) {
        $glow = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(20, 0, 220, 255), $width)
        $glow.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $glow.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $glow.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
        $graphics.DrawPath($glow, $path)
        $glow.Dispose()
    }

    $outline = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 2, 6, 23), 192)
    $outline.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $outline.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $outline.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $graphics.DrawPath($outline, $path)
    $outline.Dispose()

    $bodyBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.Rectangle]::new(220, 120, 560, 780),
        [System.Drawing.Color]::FromArgb(255, 3, 105, 161),
        [System.Drawing.Color]::FromArgb(255, 103, 232, 249),
        40.0
    )
    $body = [System.Drawing.Pen]::new($bodyBrush, 150)
    $body.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $body.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $body.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $graphics.DrawPath($body, $path)
    $body.Dispose()
    $bodyBrush.Dispose()

    $highlight = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(118, 207, 250, 254), 14)
    $highlight.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $highlight.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawBezier($highlight, 716, 808, 604, 871, 393, 835, 343, 690)
    $graphics.DrawBezier($highlight, 343, 690, 285, 520, 600, 514, 667, 365)
    $highlight.Dispose()

    $graphics.TranslateTransform(493, 190)
    $graphics.RotateTransform(154)
    $headOutline = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 2, 6, 23))
    $head = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 103, 232, 249))
    $eyeWhite = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 248, 250, 252))
    $pupil = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 8, 47, 73))
    $shine = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $graphics.FillEllipse($headOutline, -112, -88, 224, 176)
    $graphics.FillEllipse($head, -101, -77, 202, 154)
    $graphics.FillEllipse($eyeWhite, 16, -47, 54, 62)
    $graphics.FillEllipse($pupil, 36, -39, 24, 38)
    $graphics.FillEllipse($shine, 44, -34, 10, 10)
    $tongue = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 251, 113, 133), 10)
    $tongue.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $tongue.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawLine($tongue, 78, 18, 116, 38)
    $graphics.DrawLine($tongue, 103, 31, 119, 22)
    $graphics.DrawLine($tongue, 103, 31, 119, 43)
    $tongue.Dispose()
    $headOutline.Dispose(); $head.Dispose(); $eyeWhite.Dispose(); $pupil.Dispose(); $shine.Dispose()
    $graphics.ResetTransform()
    $path.Dispose()
    $graphics.Dispose()
    return $bitmap
}

$storeIcon = New-SerpentArtwork 1024 $true $false
$storeIcon.Save((Join-Path $assetDir 'play-store-icon-1024.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$smallStoreIcon = [System.Drawing.Bitmap]::new($storeIcon, 512, 512)
$smallStoreIcon.Save((Join-Path $assetDir 'play-store-icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$splashLogo = New-SerpentArtwork 512 $false $false

if (Test-Path $resDir) {
    $fullSizes = @{ 'mipmap-mdpi' = 48; 'mipmap-hdpi' = 72; 'mipmap-xhdpi' = 96; 'mipmap-xxhdpi' = 144; 'mipmap-xxxhdpi' = 192 }
    $foregroundSizes = @{ 'mipmap-mdpi' = 108; 'mipmap-hdpi' = 162; 'mipmap-xhdpi' = 216; 'mipmap-xxhdpi' = 324; 'mipmap-xxxhdpi' = 432 }
    foreach ($folder in $fullSizes.Keys) {
        $dir = Join-Path $resDir $folder
        $full = New-SerpentArtwork $fullSizes[$folder] $true $false
        $full.Save((Join-Path $dir 'ic_launcher.png'), [System.Drawing.Imaging.ImageFormat]::Png)
        $full.Save((Join-Path $dir 'ic_launcher_round.png'), [System.Drawing.Imaging.ImageFormat]::Png)
        $full.Dispose()
        $foreground = New-SerpentArtwork $foregroundSizes[$folder] $false $true
        $foreground.Save((Join-Path $dir 'ic_launcher_foreground.png'), [System.Drawing.Imaging.ImageFormat]::Png)
        $foreground.Dispose()
    }
    $colorFile = Join-Path $resDir 'values\ic_launcher_background.xml'
    @'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#020617</color>
</resources>
'@ | Set-Content -LiteralPath $colorFile -Encoding utf8

    foreach ($splashPath in (Get-ChildItem -Path $resDir -Recurse -Filter splash.png).FullName) {
        $original = [System.Drawing.Image]::FromFile($splashPath)
        $splashWidth = $original.Width
        $splashHeight = $original.Height
        $original.Dispose()
        $splash = [System.Drawing.Bitmap]::new($splashWidth, $splashHeight)
        $g = [System.Drawing.Graphics]::FromImage($splash)
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.Clear([System.Drawing.Color]::FromArgb(255, 2, 6, 23))
        $logoSize = [Math]::Min($splashWidth, $splashHeight) * 0.62
        $logoRect = [System.Drawing.RectangleF]::new(($splashWidth - $logoSize) / 2, ($splashHeight - $logoSize) / 2 - $logoSize * 0.12, $logoSize, $logoSize)
        $g.DrawImage($splashLogo, $logoRect)
        $fontSize = [Math]::Max(12, [Math]::Min($splashWidth, $splashHeight) * 0.055)
        $font = [System.Drawing.Font]::new('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 165, 243, 252))
        $format = [System.Drawing.StringFormat]::new()
        $format.Alignment = [System.Drawing.StringAlignment]::Center
        $textRect = [System.Drawing.RectangleF]::new(0, $splashHeight * 0.71, $splashWidth, $fontSize * 1.6)
        $g.DrawString('NEON SERPENTS', $font, $textBrush, $textRect, $format)
        $format.Dispose(); $textBrush.Dispose(); $font.Dispose(); $g.Dispose()
        $splash.Save($splashPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $splash.Dispose()
    }

    $stylesPath = Join-Path $resDir 'values\styles.xml'
    $stylesXml = Get-Content -LiteralPath $stylesPath -Raw
    if ($stylesXml -notmatch 'windowSplashScreenBackground') {
        $replacement = '$1' + "`r`n        <item name=`"android:windowSplashScreenBackground`">#020617</item>"
        $stylesXml = $stylesXml -replace '(<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">)', $replacement
        Set-Content -LiteralPath $stylesPath -Value $stylesXml -Encoding utf8
    }
}

$storeIcon.Dispose(); $smallStoreIcon.Dispose(); $splashLogo.Dispose()
Write-Output 'Created the 512px Play listing icon and Android launcher icons.'
