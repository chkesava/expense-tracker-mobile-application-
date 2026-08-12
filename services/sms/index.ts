export type { SmsReader, SmsReaderCapability, SmsReadOptions } from "./smsReader";
export {
  stubSmsReader,
  androidSmsReader,
  defaultSmsReader,
} from "./smsReader";

export {
  checkSmsPermission,
  requestSmsPermission,
  openSmsPermissionSettings,
  isSmsPermissionGranted,
  getSmsPermissionPlatformStatus,
  type SmsPermissionStatus,
} from "./smsPermissions";

export {
  loadSmsAutomationPrefs,
  saveSmsAutomationPrefs,
  updateSmsAutomationPrefs,
  subscribeSmsAutomationPrefs,
  SMS_AUTOMATION_PREFS_DEFAULTS,
  type SmsAutomationPrefs,
} from "./smsAutomationPrefs";

export {
  parseBankSms,
  SMS_AUTO_COMMIT_CONFIDENCE,
  type SmsParseContext,
} from "./smsParser";

export {
  detectSmsTransaction,
  isMoneyMovementKind,
  isExpenseOrIncomeKind,
  type SmsDetectionResult,
} from "./smsDetector";

export {
  extractSmsFields,
  extractAmount,
  extractMerchant,
  extractBank,
  extractPaymentMethod,
  extractAccountLast4,
  extractReferenceId,
  type SmsExtractedFields,
  type SmsPaymentMethod,
} from "./smsFieldExtractor";

export { buildSmsFingerprint } from "./smsDedupe";

export {
  filterRelevantSms,
  isRelevantTransactionSms,
} from "./smsRelevanceFilter";

export {
  adaptParsedSmsToWritePayload,
  type AdaptSmsOptions,
} from "./expenseAdapter";

export {
  processSmsInbox,
  processRawSmsMessages,
  type SmsPipelineDeps,
  type SmsPipelineResult,
} from "./smsPipeline";

export { readNativeInbox, type NativeInboxQuery } from "./nativeInbox";

export {
  startSmsListening,
  stopSmsListening,
  isSmsListening,
  addSmsReceivedListener,
  type SmsInboundListener,
} from "./smsListener";

export {
  processIncomingSmsMessages,
  type ProcessIncomingSmsResult,
} from "./smsTransactionProcessor";

export {
  loadSmsInboundStatus,
  saveSmsInboundStatus,
  patchSmsInboundStatus,
  SMS_INBOUND_STATUS_DEFAULTS,
  type SmsInboundStatus,
} from "./smsInboundStatus";
