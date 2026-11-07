import { spawnSync } from 'node:child_process'
import { deflateSync } from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const uploadDir = path.resolve(scriptDir, '../../uploads')

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i]
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0)
  }
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function fallbackPngBuffer() {
  const width = 640
  const height = 360
  const raw = Buffer.alloc(height * (1 + width * 3))
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 3)
    raw[rowStart] = 0
    for (let x = 0; x < width; x += 1) {
      const p = rowStart + 1 + x * 3
      const goldBand = y >= height - 10
      raw[p] = goldBand ? 233 : 15
      raw[p + 1] = goldBand ? 162 : 76
      raw[p + 2] = goldBand ? 59 : 92
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

export function wrapJpegInPdf(jpegBytes, widthPx, heightPx) {
  // Standard A4 in points: 595 x 842
  const pageW = 595
  const pageH = 842
  const contentStream = Buffer.from(`q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`, 'ascii')
  const chunks = []
  const offsets = []
  const push = (buf) => {
    chunks.push(typeof buf === 'string' ? Buffer.from(buf, 'ascii') : buf)
  }
  const byteLength = () => chunks.reduce((sum, b) => sum + b.length, 0)
  const startObj = (id) => {
    offsets[id] = byteLength()
    push(`${id} 0 obj\n`)
  }
  const endObj = () => push('\nendobj\n')

  push('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n')

  startObj(1)
  push('<< /Type /Catalog /Pages 2 0 R >>')
  endObj()

  startObj(2)
  push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  endObj()

  startObj(3)
  push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  endObj()

  startObj(4)
  push(`<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`)
  push(jpegBytes)
  push('\nendstream')
  endObj()

  startObj(5)
  push(`<< /Length ${contentStream.length} >>\nstream\n`)
  push(contentStream)
  push('\nendstream')
  endObj()

  const xrefOffset = byteLength()
  push('xref\n0 6\n0000000000 65535 f \n')
  for (let i = 1; i <= 5; i += 1) {
    push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  }
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)
  return Buffer.concat(chunks)
}

export async function generateGuideMedia(guides) {
  fs.mkdirSync(uploadDir, { recursive: true })
  const manifestPath = path.join(uploadDir, '_seed_manifest.json')
  const items = guides.map((guide, index) => {
    const num = String(index + 1).padStart(12, '0')
    const imageName = `00000000-0000-4000-8000-${num}.png`
    const pdfName = `00000000-0000-4000-8000-${num}.pdf`
    const jpgTempName = `_temp_${num}.jpg`
    return {
      index: index + 1,
      category: guide.category,
      title: guide.title,
      intro: guide.intro,
      detail: guide.detail || '',
      steps: guide.steps || [],
      featured: Boolean(guide.featured),
      imagePath: path.join(uploadDir, imageName),
      pdfPath: path.join(uploadDir, pdfName),
      jpgTempPath: path.join(uploadDir, jpgTempName),
      imageUrl: `/uploads/${imageName}`,
      pdfUrl: guide.status === 'DRAFT' ? null : `/uploads/${pdfName}`,
    }
  })

  fs.writeFileSync(manifestPath, JSON.stringify(items, null, 2), 'utf8')

  const psScriptPath = path.join(uploadDir, '_render_media.ps1')
  const psScript = `
param([string]$ManifestFile)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$items = Get-Content -Raw -Encoding UTF8 $ManifestFile | ConvertFrom-Json
$fontName = 'Leelawadee UI'

foreach ($item in $items) {
  # 1. Generate 1200x675 Cover PNG
  $bmp = New-Object System.Drawing.Bitmap(1200, 675)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $rectFull = New-Object System.Drawing.Rectangle(0, 0, 1200, 675)
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rectFull,
    [System.Drawing.Color]::FromArgb(255, 8, 45, 56),
    [System.Drawing.Color]::FromArgb(255, 16, 86, 102),
    25
  )
  $g.FillRectangle($bgBrush, $rectFull)

  # Subtle decorative circles
  $glowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(28, 243, 190, 92))
  $g.FillEllipse($glowBrush, 760, -90, 520, 520)
  $glowBrush2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(22, 255, 255, 255))
  $g.FillEllipse($glowBrush2, 840, 260, 420, 420)

  # Top gold bar & bottom gold bar
  $goldBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 233, 162, 59))
  $g.FillRectangle($goldBrush, 0, 0, 1200, 10)
  $g.FillRectangle($goldBrush, 0, 661, 1200, 14)

  # Header badge & agency title
  $badgeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(45, 255, 255, 255))
  $g.FillRectangle($badgeBrush, 64, 48, 62, 62)
  $goldPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(220, 243, 190, 92), 2)
  $g.DrawRectangle($goldPen, 64, 48, 62, 62)

  $whiteBrush = [System.Drawing.Brushes]::White
  $goldTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 246, 213, 142))
  $mutedWhiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(215, 235, 244, 245))

  $fLogo = New-Object System.Drawing.Font($fontName, 18, [System.Drawing.FontStyle]::Bold)
  $fAgency = New-Object System.Drawing.Font($fontName, 15, [System.Drawing.FontStyle]::Bold)
  $fSub = New-Object System.Drawing.Font($fontName, 12, [System.Drawing.FontStyle]::Regular)
  $fCat = New-Object System.Drawing.Font($fontName, 14, [System.Drawing.FontStyle]::Bold)
  $fTitle = New-Object System.Drawing.Font($fontName, 30, [System.Drawing.FontStyle]::Bold)
  $fStepHead = New-Object System.Drawing.Font($fontName, 14, [System.Drawing.FontStyle]::Bold)
  $fStep = New-Object System.Drawing.Font($fontName, 13, [System.Drawing.FontStyle]::Regular)

  $g.DrawString('ICT', $fLogo, $whiteBrush, 73, 62)
  $g.DrawString('ศูนย์พัฒนาทักษะและการเรียนรู้ ICT เทศบาลนครขอนแก่น', $fAgency, $goldTextBrush, 142, 50)
  $g.DrawString('KHON KAEN ICT LEARNING CENTER • WWW.KKICT.NET', $fSub, $mutedWhiteBrush, 142, 80)

  # Category pill
  $catBg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 233, 162, 59))
  $darkTealBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 7, 43, 53))
  $g.FillRectangle($catBg, 64, 142, 340, 38)
  $g.DrawString($item.category, $fCat, $darkTealBrush, 78, 148)

  # Guide title (wrapped in left column)
  $titleRect = New-Object System.Drawing.RectangleF(64, 204, 650, 175)
  $g.DrawString($item.title, $fTitle, $whiteBrush, $titleRect)

  # Intro excerpt in left column
  $introRect = New-Object System.Drawing.RectangleF(64, 388, 640, 195)
  $g.DrawString($item.intro, $fStep, $mutedWhiteBrush, $introRect)

  # Footer caption on cover
  $g.DrawString(('เอกสารคู่มือมาตรฐาน ลำดับที่ #' + $item.index + ' · บริการประชาชนและบุคลากร'), $fSub, $goldTextBrush, 64, 610)

  # Right-side white preview card showing key steps
  $cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(250, 255, 254, 250))
  $g.FillRectangle($cardBrush, 748, 130, 392, 470)
  $g.FillRectangle($goldBrush, 748, 130, 392, 8)
  $tealBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 76, 92))
  $inkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 27, 42, 51))
  $stepBgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 232, 242, 243))

  $g.DrawString('สรุปขั้นตอนการปฏิบัติ (Step-by-step)', $fStepHead, $tealBrush, 774, 158)
  $y = 204
  $maxSteps = [Math]::Min(4, $item.steps.Count)
  for ($s = 0; $s -lt $maxSteps; $s++) {
    $g.FillRectangle($stepBgBrush, 774, $y, 340, 82)
    $g.FillEllipse($tealBrush, 786, ($y + 14), 30, 30)
    $g.DrawString([string]($s + 1), $fStepHead, $whiteBrush, 795, ($y + 16))
    $sRect = New-Object System.Drawing.RectangleF(826, ($y + 10), 278, 66)
    $g.DrawString($item.steps[$s], $fStep, $inkBrush, $sRect)
    $y += 94
  }

  $bmp.Save($item.imagePath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()

  # 2. Generate 1240x1754 A4 Manual Page JPEG for PDF
  if ($item.pdfUrl) {
    $pageBmp = New-Object System.Drawing.Bitmap(1240, 1754)
    $pg = [System.Drawing.Graphics]::FromImage($pageBmp)
    $pg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $pg.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $pg.Clear([System.Drawing.Color]::FromArgb(255, 252, 250, 245))

    # Top header banner
    $hdrRect = New-Object System.Drawing.Rectangle(0, 0, 1240, 190)
    $hdrBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      $hdrRect,
      [System.Drawing.Color]::FromArgb(255, 8, 45, 56),
      [System.Drawing.Color]::FromArgb(255, 15, 76, 92),
      0
    )
    $pg.FillRectangle($hdrBrush, $hdrRect)
    $pg.FillRectangle($goldBrush, 0, 190, 1240, 10)

    $pfTitle = New-Object System.Drawing.Font($fontName, 26, [System.Drawing.FontStyle]::Bold)
    $pfSub = New-Object System.Drawing.Font($fontName, 15, [System.Drawing.FontStyle]::Regular)
    $pfH2 = New-Object System.Drawing.Font($fontName, 19, [System.Drawing.FontStyle]::Bold)
    $pfBody = New-Object System.Drawing.Font($fontName, 15, [System.Drawing.FontStyle]::Regular)

    $pg.DrawString('เอกสารคู่มือมาตรฐานคลังความรู้ด้านเทคโนโลยีสารสนเทศ (KKICT)', $fAgency, $goldTextBrush, 80, 46)
    $pg.DrawString('ศูนย์พัฒนาทักษะและการเรียนรู้ ICT เทศบาลนครขอนแก่น · www.kkict.net', $pfSub, $whiteBrush, 80, 86)
    $pg.DrawString(('หมวดหมู่: ' + $item.category + '   |   รหัสเอกสาร: KKICT-KB-' + ([string]$item.index).PadLeft(3, '0')), $fSub, $mutedWhiteBrush, 80, 130)

    # Document Title
    $docTitleRect = New-Object System.Drawing.RectangleF(80, 236, 1080, 110)
    $pg.DrawString($item.title, $pfTitle, $darkTealBrush, $docTitleRect)
    $pg.FillRectangle($goldBrush, 80, 348, 120, 6)

    # Intro box
    $boxBrush = [System.Drawing.Brushes]::White
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 214, 208, 196), 2)
    $pg.FillRectangle($boxBrush, 80, 378, 1080, 260)
    $pg.DrawRectangle($borderPen, 80, 378, 1080, 260)
    $pg.DrawString('1. บทนำและคำแนะนำเบื้องต้น', $pfH2, $tealBrush, 108, 400)
    $introBodyRect = New-Object System.Drawing.RectangleF(108, 444, 1024, 180)
    $pg.DrawString(($item.intro + [Environment]::NewLine + [Environment]::NewLine + $item.detail), $pfBody, $inkBrush, $introBodyRect)

    # Steps section
    $pg.DrawString('2. ขั้นตอนการปฏิบัติ (Step-by-step)', $pfH2, $tealBrush, 80, 668)
    $sy = 716
    for ($i = 0; $i -lt $item.steps.Count; $i++) {
      $pg.FillRectangle($boxBrush, 80, $sy, 1080, 122)
      $pg.DrawRectangle($borderPen, 80, $sy, 1080, 122)
      $pg.FillRectangle($tealBrush, 80, $sy, 10, 122)
      $pg.FillEllipse($tealBrush, 112, ($sy + 36), 48, 48)
      $pg.DrawString([string]($i + 1), $pfH2, $whiteBrush, 126, ($sy + 42))
      $stepTextRect = New-Object System.Drawing.RectangleF(180, ($sy + 24), 950, 84)
      $pg.DrawString($item.steps[$i], $pfBody, $inkBrush, $stepTextRect)
      $sy += 138
    }

    # Footer
    $pg.FillRectangle($tealBrush, 0, 1650, 1240, 104)
    $pg.FillRectangle($goldBrush, 0, 1644, 1240, 6)
    $pg.DrawString('ศูนย์พัฒนาทักษะและการเรียนรู้ ICT เทศบาลนครขอนแก่น · ชั้น 2 ตลาดสดเทศบาล 1 ถนนกลางเมือง จ.ขอนแก่น 40000', $fSub, $whiteBrush, 80, 1674)
    $pg.DrawString('โทรศัพท์: 084-583-0208 · อีเมล: info.kkict@gmail.com · เว็บไซต์: https://www.kkict.net/', $fSub, $goldTextBrush, 80, 1704)

    $pageBmp.Save($item.jpgTempPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $pg.Dispose()
    $pageBmp.Dispose()
  }
}
`
  fs.writeFileSync(psScriptPath, `\uFEFF${psScript}`, 'utf8')
  const res = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScriptPath, '-ManifestFile', manifestPath], {
    encoding: 'utf8',
    timeout: 60000,
  })

  for (const item of items) {
    if (!fs.existsSync(item.imagePath)) {
      fs.writeFileSync(item.imagePath, fallbackPngBuffer())
    }
    if (item.pdfUrl) {
      if (fs.existsSync(item.jpgTempPath)) {
        const jpgBytes = fs.readFileSync(item.jpgTempPath)
        fs.writeFileSync(item.pdfPath, wrapJpegInPdf(jpgBytes, 1240, 1754))
        fs.unlinkSync(item.jpgTempPath)
      }
    }
  }

  try { fs.unlinkSync(manifestPath) } catch { /* ignore */ }
  try { fs.unlinkSync(psScriptPath) } catch { /* ignore */ }

  if (res.status !== 0 && res.stderr) {
    console.warn('Media render fallback used:', res.stderr.slice(0, 200))
  }
  return items
}
