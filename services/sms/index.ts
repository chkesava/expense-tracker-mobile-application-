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
  normalizeSmsAutomationPrefs,
  SMS_AUTOMATION_PREFS_DEFAULTS,
  type SmsAutomationPrefs,
  type SmsHandlingMode,
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
  classifySmsIncomeSource,
  SMS_INCOME_SOURCES,
  type SmsIncomeSource,
} from "./smsIncomeClassifier";

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

export {
  normalizeMerchantName,
  foldMerchantKey,
  type SmsMerchantNormalization,
} from "./smsMerchantNormalizer";

export { SMS_MERCHANT_CATALOG, type SmsMerchantEntry } from "./smsMerchantCatalog";

export {
  categorizeSmsMerchant,
  type SmsCategoryMatch,
} from "./smsCategorizer";

export {
  SMS_MERCHANT_CATEGORY_RULES,
  type SmsCategoryRule,
} from "./smsCategoryRules";

export {
  buildSmsFingerprint,
  buildSmsDedupeKeys,
  normalizeSmsReferenceId,
  findDuplicateSmsKey,
} from "./smsDedupe";

export {
  loadSmsDedupeKeys,
  mergeSmsDedupeKeys,
} from "./smsDedupeStore";

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
  briefSmsCategoryLabel,
  formatDetectedCount,
  reviewItemAmount,
  reviewItemMerchant,
} from "./smsReviewInbox";

export {
  loadSmsReviewInbox,
  enqueueSmsReviewItems,
  subscribeSmsReviewInbox,
} from "./smsReviewInboxStore";

export {
  enqueueWriteReadyForReview,
  ignoreSmsReviewItem,
  addSmsReviewItem,
} from "./smsReviewActions";

export {
  isHighConfidenceForAutoAdd,
  routeWriteReady,
  dispatchWriteReady,
} from "./smsAutoAdd";

export { commitSmsWritePayload } from "./smsExpenseWriter";

export {
  loadSmsInboundStatus,
  saveSmsInboundStatus,
  patchSmsInboundStatus,
  SMS_INBOUND_STATUS_DEFAULTS,
  type SmsInboundStatus,
} from "./smsInboundStatus";
