package expo.modules.apkinstaller

import android.content.pm.PackageInstaller
import expo.modules.kotlin.Promise

/**
 * Hands the PackageInstaller status broadcast back to the JS promise that
 * started the session. The process is usually killed on success, so the
 * promise may never resolve in that case — [UpdateRestartReceiver] relaunches.
 */
object ApkInstallBridge {
  const val ACTION_INSTALL_STATUS = "expo.modules.apkinstaller.INSTALL_STATUS"

  @Volatile
  var pending: Promise? = null

  fun resolve(status: String) {
    val promise = pending
    pending = null
    promise?.resolve(status)
  }

  fun reject(code: String, message: String) {
    val promise = pending
    pending = null
    promise?.reject(code, message, null)
  }

  fun statusName(status: Int): String {
    return when (status) {
      PackageInstaller.STATUS_SUCCESS -> "success"
      PackageInstaller.STATUS_FAILURE_ABORTED -> "aborted"
      else -> "failure"
    }
  }
}
