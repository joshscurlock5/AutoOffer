Add-Type -AssemblyName System.Drawing

$cs = @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class CarCut {
  public static string Process(string src, string dst, int work, int outSize, double margin, int near) {
    using (var orig = new Bitmap(src))
    using (var wb = new Bitmap(work, work, PixelFormat.Format32bppArgb)) {
      using (var g = Graphics.FromImage(wb)) {
        g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
        g.PixelOffsetMode   = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
        g.DrawImage(orig, 0, 0, work, work);
      }
      var rect = new Rectangle(0, 0, work, work);
      var data = wb.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
      int stride = data.Stride;
      byte[] bytes = new byte[stride * work];
      Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
      int N = work * work;

      Func<int,bool> isBg = (p) => {
        int o = (p / work) * stride + (p % work) * 4;
        int b = bytes[o], gg = bytes[o+1], r = bytes[o+2];
        int min = Math.Min(b, Math.Min(gg, r)), max = Math.Max(b, Math.Max(gg, r));
        return min >= near && (max - min) <= 16;
      };

      byte[] alpha = new byte[N];
      for (int i = 0; i < N; i++) alpha[i] = 255;
      bool[] vis = new bool[N];
      var st = new Stack<int>();
      for (int x = 0; x < work; x++) { int t = x, bm = (work-1)*work + x; if (isBg(t)) st.Push(t); if (isBg(bm)) st.Push(bm); }
      for (int y = 0; y < work; y++) { int l = y*work, rr = y*work + work-1; if (isBg(l)) st.Push(l); if (isBg(rr)) st.Push(rr); }
      while (st.Count > 0) {
        int p = st.Pop(); if (vis[p]) continue; vis[p] = true; alpha[p] = 0;
        int px = p % work, py = p / work;
        if (px > 0)        { int q = p-1;    if (!vis[q] && isBg(q)) st.Push(q); }
        if (px < work-1)   { int q = p+1;    if (!vis[q] && isBg(q)) st.Push(q); }
        if (py > 0)        { int q = p-work; if (!vis[q] && isBg(q)) st.Push(q); }
        if (py < work-1)   { int q = p+work; if (!vis[q] && isBg(q)) st.Push(q); }
      }

      // erode 1px to eat the light fringe ring
      byte[] er = new byte[N];
      for (int y = 0; y < work; y++) for (int x = 0; x < work; x++) {
        int p = y*work + x; byte m = alpha[p];
        if (m > 0 && ((x>0 && alpha[p-1]==0) || (x<work-1 && alpha[p+1]==0) || (y>0 && alpha[p-work]==0) || (y<work-1 && alpha[p+work]==0))) m = 0;
        er[p] = m;
      }
      // 3x3 box-blur the alpha -> feather edges, write into bytes
      for (int y = 0; y < work; y++) for (int x = 0; x < work; x++) {
        int sum = 0, cnt = 0;
        for (int dy = -1; dy <= 1; dy++) { int yy = y+dy; if (yy<0||yy>=work) continue;
          for (int dx = -1; dx <= 1; dx++) { int xx = x+dx; if (xx<0||xx>=work) continue; sum += er[yy*work+xx]; cnt++; } }
        bytes[y*stride + x*4 + 3] = (byte)(sum / cnt);
      }
      Marshal.Copy(bytes, 0, data.Scan0, bytes.Length);
      wb.UnlockBits(data);

      // trim to content bbox (alpha > 16)
      int minX = work, minY = work, maxX = -1, maxY = -1;
      for (int y = 0; y < work; y++) for (int x = 0; x < work; x++)
        if (bytes[y*stride + x*4 + 3] > 16) { if (x<minX)minX=x; if (x>maxX)maxX=x; if (y<minY)minY=y; if (y>maxY)maxY=y; }
      int cw = maxX-minX+1, ch = maxY-minY+1, cmax = Math.Max(cw, ch);
      int pad = (int)Math.Round(cmax * margin);
      int canvasW = cw + 2*pad, canvasH = ch + 2*pad;

      using (var sq = new Bitmap(canvasW, canvasH, PixelFormat.Format32bppArgb)) {
        using (var sg = Graphics.FromImage(sq)) {
          sg.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
          sg.DrawImage(wb, new Rectangle(pad, pad, cw, ch), minX, minY, cw, ch, GraphicsUnit.Pixel);
        }
        int outW = outSize;
        int outH = (int)Math.Round((double)canvasH * outW / canvasW);
        using (var fin = new Bitmap(outW, outH, PixelFormat.Format32bppArgb)) {
          using (var fg = Graphics.FromImage(fin)) {
            fg.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            fg.PixelOffsetMode   = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
            fg.DrawImage(sq, 0, 0, outW, outH);
          }
          fin.Save(dst, ImageFormat.Png);
        }
        return cw + "x" + ch + " -> " + outW + "x" + outH;
      }
    }
  }
}
"@

Add-Type -TypeDefinition $cs -ReferencedAssemblies System.Drawing

$dir    = "C:\Users\joshu\AutoOffer\public\icons"
$backup = Join-Path $dir "_original"
if (-not (Test-Path $backup)) { New-Item -ItemType Directory -Path $backup | Out-Null }
$files  = @("body-sedan.png","body-suv.png","body-truck.png","body-van.png","body-coupe.png","body-hatch.png")

foreach ($f in $files) {
  $path = Join-Path $dir $f
  $bk = Join-Path $backup $f
  if (-not (Test-Path $bk)) { Copy-Item $path $bk }
  $dims = [CarCut]::Process($bk, $path, 512, 400, 0.03, 232)
  $kb = [Math]::Round((Get-Item $path).Length/1KB,1)
  Write-Output ("{0}: {1} ({2} KB)" -f $f, $dims, $kb)
}
Write-Output "DONE"
