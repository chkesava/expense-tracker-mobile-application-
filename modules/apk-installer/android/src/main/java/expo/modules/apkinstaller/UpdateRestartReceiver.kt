package expo.modules.apkinstaller

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Relaunches Spendly after the package is replaced. Fires in the *new*
 * process, so the previously installed APK must already contain this receiver
 * for auto-reopen to work.
 */
class UpdateRestartReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return

    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    context.startActivity(launch)
  }
}
