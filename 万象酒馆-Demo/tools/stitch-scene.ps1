param(
  [string]$Directory = "assets/exploration/street-hd-v2"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;

public static class SceneStitch {
  public static int Offset(Bitmap left, Bitmap right) {
    if (left.Height != right.Height) throw new Exception("Tile heights must match; no resizing is performed.");
    double best = double.MaxValue;
    int result = 0;
    for (int offset = left.Width * 2 / 5; offset < left.Width * 23 / 25; offset += 2) {
      double error = 0;
      int samples = 0;
      for (int y = left.Height / 4; y < left.Height * 19 / 20; y += 13) {
        for (int x = 8; x < left.Width - offset - 8; x += 9) {
          Color a = left.GetPixel(offset + x, y), b = right.GetPixel(x, y);
          error += Math.Abs(a.R-b.R) + Math.Abs(a.G-b.G) + Math.Abs(a.B-b.B);
          samples++;
        }
      }
      if (samples > 0 && error / samples < best) { best = error / samples; result = offset; }
    }
    return result;
  }

  public static Bitmap Join(Bitmap left, Bitmap right, int offset, bool clearSkyEdge) {
    return Join(left, right, offset, clearSkyEdge, -1, 0, Int32.MaxValue, 0, 20);
  }

  public static Bitmap Join(Bitmap left, Bitmap right, int offset, bool clearSkyEdge, int fixedSeam, int seamStart, int seamEnd, int seamFade, int skyFeather) {
    int height = left.Height, overlap = left.Width - offset;
    int[,] path = new int[height, overlap];
    double[] previous = new double[overlap];
    for (int y = 0; y < height; y++) {
      double[] current = new double[overlap];
      for (int x = 0; x < overlap; x++) {
        Color a = left.GetPixel(offset + x, y), b = right.GetPixel(x, y);
        double cost = Math.Abs(a.R-b.R) + Math.Abs(a.G-b.G) + Math.Abs(a.B-b.B);
        if (x < 18 || x > overlap - 19) cost += 1000;
        int parent = x;
        if (x > 0 && previous[x-1] < previous[parent]) parent = x-1;
        if (x+1 < overlap && previous[x+1] < previous[parent]) parent = x+1;
        current[x] = cost + previous[parent];
        path[y,x] = parent;
      }
      previous = current;
    }
    int end = 0;
    for (int x = 1; x < overlap; x++) if (previous[x] < previous[end]) end = x;
    int[] seam = new int[height];
    for (int y = height-1; y >= 0; y--) { seam[y] = end; end = path[y,end]; }
    if (fixedSeam >= 0) {
      if (fixedSeam < 10 || fixedSeam > overlap-11) throw new Exception("Fixed seam must stay inside the overlap.");
      for (int y = 0; y < height; y++) {
        int distance = Math.Max(seamStart-y, y-seamEnd);
        double weight = distance <= 0 ? 1 : (seamFade > 0 ? Math.Max(0,1-distance/(double)seamFade) : 0);
        seam[y] = (int)Math.Round(seam[y]*(1-weight)+fixedSeam*weight);
      }
    }
    if (clearSkyEdge) {
      for (int y = 0; y < Math.Min(310,height); y++) {
        double weight = y < 230 ? 1 : (310-y)/80.0;
        seam[y] = (int)Math.Round(seam[y]*(1-weight)+(overlap-12)*weight);
      }
    }
    Bitmap output = new Bitmap(offset + right.Width, height, PixelFormat.Format32bppArgb);
    using (Graphics graphics = Graphics.FromImage(output)) graphics.DrawImageUnscaled(left, 0, 0);
    for (int y = 0; y < height; y++) {
      for (int x = 0; x < right.Width; x++) {
        Color b = right.GetPixel(x,y);
        double skyWeight = Math.Max(0, Math.Min(1, (height*0.28-y)/(height*0.08)));
        double feather = 20+(skyFeather-20)*skyWeight;
        double alpha = x < overlap ? Math.Max(0, Math.Min(1, (x-seam[y]+feather/2)/feather)) : 1;
        if (alpha <= 0) continue;
        if (alpha >= 1) { output.SetPixel(offset+x,y,b); continue; }
        Color a = left.GetPixel(offset+x,y);
        output.SetPixel(offset+x,y,Color.FromArgb(255,
          (int)Math.Round(a.R*(1-alpha)+b.R*alpha),
          (int)Math.Round(a.G*(1-alpha)+b.G*alpha),
          (int)Math.Round(a.B*(1-alpha)+b.B*alpha)));
      }
    }
    return output;
  }
}
'@

$artDirectory = (Resolve-Path -LiteralPath $Directory).Path
$layoutPath = Join-Path $artDirectory "layout.json"
if (Test-Path -LiteralPath $layoutPath) {
  $layout = Get-Content -LiteralPath $layoutPath -Raw | ConvertFrom-Json
  $composite = $null
  try {
    foreach ($tile in $layout.tiles) {
      $bitmap = [System.Drawing.Bitmap]::FromFile((Join-Path $artDirectory $tile.file))
      try {
        if ($null -eq $composite) {
          if ([int]$tile.offset -ne 0) { throw "The first tile must start at zero." }
          $composite = [System.Drawing.Bitmap]$bitmap.Clone()
        } else {
          if ($bitmap.Height -ne $composite.Height) { throw "Native tile heights must match." }
          $fixedSeam = -1
          if ($null -ne $tile.seamX) { $fixedSeam = [int]$tile.seamX }
          $seamStart = 0
          $seamEnd = [int]::MaxValue
          $seamFade = 0
          if ($null -ne $tile.seamBand) {
            $seamStart = [int]$tile.seamBand[0]
            $seamEnd = [int]$tile.seamBand[1]
            $seamFade = [int]$tile.seamBand[2]
          }
          $skyFeather = 20
          if ($null -ne $tile.skyFeather) { $skyFeather = [int]$tile.skyFeather }
          $next = [SceneStitch]::Join($composite, $bitmap, [int]$tile.offset, $false, $fixedSeam, $seamStart, $seamEnd, $seamFade, $skyFeather)
          $composite.Dispose()
          $composite = $next
        }
      } finally {
        $bitmap.Dispose()
      }
    }
    $outputPath = Join-Path $artDirectory "connected.png"
    $composite.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $record = [ordered]@{
      generator = "image_gen built-in"
      composition = "Native tiles at fixed source-crop positions; minimum-error or protected landmark seams and local feathering defined in layout.json. No resizing or camera recomposition."
      offsets = @($layout.tiles | ForEach-Object { [int]$_.offset })
      width = $composite.Width
      height = $composite.Height
      sha256 = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant()
      tiles = @($layout.tiles | ForEach-Object { $_.file })
    }
    $json = $record | ConvertTo-Json -Depth 4
    [System.IO.File]::WriteAllText((Join-Path $artDirectory "stitch.json"), $json, (New-Object System.Text.UTF8Encoding $false))
    $json
  } finally {
    if ($composite) { $composite.Dispose() }
  }
  exit
}
$left = [System.Drawing.Bitmap]::FromFile((Join-Path $artDirectory "left.png"))
$center = [System.Drawing.Bitmap]::FromFile((Join-Path $artDirectory "center.png"))
$right = [System.Drawing.Bitmap]::FromFile((Join-Path $artDirectory "right.png"))
$pair = $null
$result = $null
try {
  $firstOffset = [SceneStitch]::Offset($left, $center)
  $secondOffset = [SceneStitch]::Offset($center, $right)
  $pair = [SceneStitch]::Join($left, $center, $firstOffset, $true)
  $result = [SceneStitch]::Join($pair, $right, ($firstOffset + $secondOffset), $false)
  $outputPath = Join-Path $artDirectory "connected.png"
  $result.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $record = [ordered]@{
    generator = "image_gen built-in"
    composition = "Native tiles; horizontal registration, minimum-error seam and 20px feather. No resizing."
    offsets = @(0, $firstOffset, ($firstOffset + $secondOffset))
    width = $result.Width
    height = $result.Height
    sha256 = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant()
    tiles = @("left.png", "center.png", "right.png")
  }
  $record | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $artDirectory "stitch.json") -Encoding utf8
  $record | ConvertTo-Json -Depth 4
} finally {
  if ($result) { $result.Dispose() }
  if ($pair) { $pair.Dispose() }
  $left.Dispose()
  $center.Dispose()
  $right.Dispose()
}
