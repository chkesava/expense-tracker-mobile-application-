package expo.modules.pdfrenderer

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

class PdfContextException : CodedException("React context is unavailable")

class PdfFileException(path: String) :
  CodedException("PDF file is missing or unreadable: $path")

class PdfEncryptedException :
  CodedException("The PDF is password protected or encrypted and cannot be rendered in-app")

class PdfRenderException(message: String) :
  CodedException("Failed to render PDF: $message")

class PdfRendererModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PdfRenderer")

    AsyncFunction("renderPages") { rawFilePath: String, maxPages: Int, maxDimension: Int ->
      val context = appContext.reactContext ?: throw PdfContextException()
      val cleanPath = if (rawFilePath.startsWith("file://")) {
        Uri.parse(rawFilePath).path ?: rawFilePath.removePrefix("file://")
      } else {
        rawFilePath
      }

      val pdfFile = File(cleanPath)
      if (!pdfFile.exists() || !pdfFile.canRead()) {
        throw PdfFileException(cleanPath)
      }

      val pfd: ParcelFileDescriptor
      val renderer: PdfRenderer
      try {
        pfd = ParcelFileDescriptor.open(pdfFile, ParcelFileDescriptor.MODE_READ_ONLY)
        renderer = PdfRenderer(pfd)
      } catch (e: SecurityException) {
        throw PdfEncryptedException()
      } catch (e: Exception) {
        throw PdfRenderException(e.message ?: "Could not open PDF file")
      }

      try {
        val totalPages = renderer.pageCount
        val pagesToRender = if (maxPages > 0) minOf(totalPages, maxPages) else totalPages
        val outDir = File(context.cacheDir, "pdf_previews")
        if (!outDir.exists()) {
          outDir.mkdirs()
        }

        val baseName = pdfFile.nameWithoutExtension.replace("[^a-zA-Z0-9_-]".toRegex(), "_")
        val renderedPages = mutableListOf<Map<String, Any>>()
        val targetDimension = if (maxDimension in 400..3000) maxDimension else 1600

        for (i in 0 until pagesToRender) {
          val page = renderer.openPage(i)
          try {
            val pageWidth = page.width
            val pageHeight = page.height

            val scale = if (pageWidth > pageHeight) {
              targetDimension.toFloat() / pageWidth.toFloat()
            } else {
              targetDimension.toFloat() / pageHeight.toFloat()
            }.coerceAtMost(3.0f).coerceAtLeast(0.5f)

            val scaledWidth = (pageWidth * scale).toInt().coerceAtLeast(1)
            val scaledHeight = (pageHeight * scale).toInt().coerceAtLeast(1)

            val bitmap = Bitmap.createBitmap(scaledWidth, scaledHeight, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(Color.WHITE)

            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

            val outFile = File(outDir, "${baseName}_p${i}_${System.currentTimeMillis()}.png")
            FileOutputStream(outFile).use { fos ->
              bitmap.compress(Bitmap.CompressFormat.PNG, 90, fos)
            }
            bitmap.recycle()

            renderedPages.add(
              mapOf(
                "uri" to "file://${outFile.absolutePath}",
                "width" to scaledWidth,
                "height" to scaledHeight,
                "pageIndex" to i
              )
            )
          } finally {
            page.close()
          }
        }

        mapOf(
          "totalPages" to totalPages,
          "renderedPages" to renderedPages
        )
      } finally {
        try {
          renderer.close()
        } catch (_: Exception) {}
        try {
          pfd.close()
        } catch (_: Exception) {}
      }
    }
  }
}
