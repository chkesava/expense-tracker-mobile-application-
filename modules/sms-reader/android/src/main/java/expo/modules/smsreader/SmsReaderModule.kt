package expo.modules.smsreader

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Telephony
import android.telephony.SmsMessage
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsPermissionException :
  CodedException("READ_SMS permission is not granted")

class SmsReceivePermissionException :
  CodedException("RECEIVE_SMS permission is not granted")

class SmsContextException :
  CodedException("React context is unavailable")

/**
 * Event-driven SMS inbox query + runtime BroadcastReceiver for new messages.
 * Receiver is registered only while listening — no polling / no persistent wake locks.
 */
class SmsReaderModule : Module() {
  private var smsReceiver: BroadcastReceiver? = null
  private var listening: Boolean = false

  override fun definition() = ModuleDefinition {
    Name("SmsReader")

    Events("onSmsReceived")

    OnDestroy {
      unregisterReceiverSafely()
    }

    /**
     * Reads SMS from the device inbox via ContentResolver.
     * Results stay on-device — never uploaded by this module.
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
          val id = cursor.getLong(idIdx).toString()
          val address = cursor.getString(addressIdx) ?: ""
          val body = cursor.getString(bodyIdx) ?: ""
          val receivedAtMs = cursor.getLong(dateIdx).toDouble()
          results.add(
            mapOf(
              "id" to id,
              "smsId" to id,
              "address" to address,
              "sender" to address,
              "body" to body,
              "receivedAtMs" to receivedAtMs,
              "timestamp" to receivedAtMs,
              "read" to (cursor.getInt(readIdx) == 1)
            )
          )
          count++
        }
      }

      results
    }

    /**
     * Register a runtime SMS_RECEIVED receiver. Idle when no SMS arrives.
     */
    AsyncFunction("startListening") {
      val context = appContext.reactContext ?: throw SmsContextException()

      if (
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS)
        != PackageManager.PERMISSION_GRANTED
      ) {
        throw SmsReceivePermissionException()
      }

      if (listening && smsReceiver != null) {
        return@AsyncFunction true
      }

      val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
          if (intent?.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
          val messages = extractMessages(intent)
          if (messages.isEmpty()) return
          sendEvent(
            "onSmsReceived",
            mapOf("messages" to messages)
          )
        }
      }

      val filter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION)
      // High priority so Vault can observe alongside the default SMS app.
      filter.priority = IntentFilter.SYSTEM_HIGH_PRIORITY

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        ContextCompat.registerReceiver(
          context,
          receiver,
          filter,
          ContextCompat.RECEIVER_EXPORTED
        )
      } else {
        @Suppress("UnspecifiedRegisterReceiverFlag")
        context.registerReceiver(receiver, filter)
      }

      smsReceiver = receiver
      listening = true
      true
    }

    AsyncFunction("stopListening") {
      unregisterReceiverSafely()
      true
    }

    AsyncFunction("isListening") {
      listening && smsReceiver != null
    }
  }

  private fun unregisterReceiverSafely() {
    val context = appContext.reactContext
    val receiver = smsReceiver
    if (context != null && receiver != null) {
      try {
        context.unregisterReceiver(receiver)
      } catch (_: IllegalArgumentException) {
        // Already unregistered
      }
    }
    smsReceiver = null
    listening = false
  }

  /**
   * Collapse multipart PDU segments into one message per originating address.
   * No inbox _id yet — use a stable synthetic id (not uploaded).
   */
  private fun extractMessages(intent: Intent): List<Map<String, Any?>> {
    val pdus: Array<SmsMessage> =
      Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return emptyList()
    if (pdus.isEmpty()) return emptyList()

    data class Acc(var address: String, var body: StringBuilder, var timestampMs: Long)

    val byAddress = LinkedHashMap<String, Acc>()
    for (part in pdus) {
      val address = part.displayOriginatingAddress ?: part.originatingAddress ?: ""
      val bodyPart = part.displayMessageBody ?: part.messageBody ?: ""
      val ts = part.timestampMillis
      val key = address.ifBlank { "_unknown_" }
      val existing = byAddress[key]
      if (existing == null) {
        byAddress[key] = Acc(address, StringBuilder(bodyPart), ts)
      } else {
        existing.body.append(bodyPart)
        if (ts > existing.timestampMs) existing.timestampMs = ts
      }
    }

    return byAddress.values.map { acc ->
      val body = acc.body.toString()
      val receivedAtMs = if (acc.timestampMs > 0L) acc.timestampMs else System.currentTimeMillis()
      val syntheticId =
        "rx:${receivedAtMs}:${acc.address.hashCode()}:${body.hashCode()}"
      mapOf(
        "id" to syntheticId,
        "smsId" to syntheticId,
        "address" to acc.address,
        "sender" to acc.address,
        "body" to body,
        "receivedAtMs" to receivedAtMs.toDouble(),
        "timestamp" to receivedAtMs.toDouble(),
        "read" to false
      )
    }
  }
}
