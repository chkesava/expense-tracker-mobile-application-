package expo.modules.apkinstaller

import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.File
import java.io.FileInputStream

class ApkContextException : CodedException("React context is unavailable")

class ApkFileException(path: String) :
  CodedException("APK file is missing or unreadable: $path")

class ApkInstallerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ApkInstaller")

    AsyncFunction("canRequestPackageInstalls") {
      val context = appContext.reactContext ?: throw ApkContextException()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.packageManager.canRequestPackageInstalls()
      } else {
        true
      }
    }

    AsyncFunction("openUnknownSourcesSettings") {
      val context = appContext.reactContext ?: throw ApkContextException()
      val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
        data = Uri.parse("package:${context.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }

    AsyncFunction("installApk") { filePath: String, promise: Promise ->
      val context = appContext.reactContext ?: throw ApkContextException()
      val apk = resolveApkFile(filePath)
      if (!apk.isFile || apk.length() <= 0L) {
        throw ApkFileException(filePath)
      }

      ApkInstallBridge.pending = promise

      val installer = context.packageManager.packageInstaller
      val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
      params.setAppPackageName(context.packageName)

      val sessionId = installer.createSession(params)
      val session = installer.openSession(sessionId)
      try {
        session.openWrite("package", 0, apk.length()).use { out ->
          FileInputStream(apk).use { input ->
            input.copyTo(out)
          }
          session.fsync(out)
        }

        val statusIntent = Intent(context, ApkInstallResultReceiver::class.java).apply {
          action = ApkInstallBridge.ACTION_INSTALL_STATUS
          setPackage(context.packageName)
        }
        val flags =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
          } else {
            PendingIntent.FLAG_UPDATE_CURRENT
          }
        val pendingIntent = PendingIntent.getBroadcast(context, sessionId, statusIntent, flags)
        session.commit(pendingIntent.intentSender)
      } catch (error: Exception) {
        session.abandon()
        ApkInstallBridge.pending = null
        throw error
      }
    }
  }

  private fun resolveApkFile(filePath: String): File {
    val trimmed = filePath.trim()
    if (trimmed.startsWith("file://")) {
      return File(Uri.parse(trimmed).path ?: trimmed.removePrefix("file://"))
    }
    return File(trimmed)
  }
}
