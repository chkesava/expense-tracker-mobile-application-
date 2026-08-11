package expo.modules.smsreader

import android.Manifest
import android.content.pm.PackageManager
import android.provider.Telephony
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsPermissionException :
  CodedException("READ_SMS permission is not granted")

class SmsContextException :
  CodedException("React context is unavailable")

class SmsReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SmsReader")

    /**
     * Reads SMS from the device inbox via ContentResolver.
     * Results stay on-device — never uploaded by this module.
     *
     * @param limit Max messages (1..500)
     * @param minDateMs Only messages with date > minDateMs (0 = no lower bound)
     * @param afterId Optional: only messages with _id > afterId (stringified long)
     */
    AsyncFunction("readInbox") { limit: Int, minDateMs: Double, afterId: String? ->
      val context = appContext.reactContext ?: throw SmsContextException()

      if (
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS)
        != PackageManager.PERMISSION_GRANTED
      ) {
        throw SmsPermissionException()
      }

      val safeLimit = limit.coerceIn(1, 500)
      val selectionParts = mutableListOf<String>()
      val selectionArgs = mutableListOf<String>()

      if (minDateMs > 0.0) {
        selectionParts.add("${Telephony.Sms.DATE} > ?")
        selectionArgs.add(minDateMs.toLong().toString())
      }

      if (!afterId.isNullOrBlank()) {
        selectionParts.add("${Telephony.Sms._ID} > ?")
        selectionArgs.add(afterId.trim())
      }

      val selection =
        if (selectionParts.isEmpty()) null else selectionParts.joinToString(" AND ")
      val args =
        if (selectionArgs.isEmpty()) null else selectionArgs.toTypedArray()

      val projection = arrayOf(
        Telephony.Sms._ID,
        Telephony.Sms.ADDRESS,
        Telephony.Sms.BODY,
        Telephony.Sms.DATE,
        Telephony.Sms.READ
      )

      val results = ArrayList<Map<String, Any?>>(safeLimit)

      context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        projection,
        selection,
        args,
        "${Telephony.Sms.DATE} DESC"
      )?.use { cursor ->
        val idIdx = cursor.getColumnIndexOrThrow(Telephony.Sms._ID)
        val addressIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
        val bodyIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
        val dateIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
        val readIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.READ)

        var count = 0
        while (cursor.moveToNext() && count < safeLimit) {
          results.add(
            mapOf(
              "id" to cursor.getLong(idIdx).toString(),
              "address" to (cursor.getString(addressIdx) ?: ""),
              "body" to (cursor.getString(bodyIdx) ?: ""),
              "receivedAtMs" to cursor.getLong(dateIdx).toDouble(),
              "read" to (cursor.getInt(readIdx) == 1)
            )
          )
          count++
        }
      }

      results
    }
  }
}
