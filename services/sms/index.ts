export type { SmsReader, SmsReaderCapability, SmsReadOptions } from "./smsReader";
export {
  stubSmsReader,
  androidSmsReader,
  defaultSmsReader,
} from "./smsReader";

export {
  checkSmsPermission,
  checkSmsPermissionDetails,
  requestSmsPermission,
  openSmsPermissionSettings,
  isSmsPermissionGranted,
  getSmsPermissionPlatformStatus,
  emptySmsPermissionDetails,
  type SmsPermissionStatus,
  type SmsPermissionDetails,
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
  needsSmsAiFallback,
  applySmsAiFallback,
} from "./smsAiFallback";

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

export {
  resolveAccountFromSms,
  type AccountResolution,
  type AccountResolutionStatus,
  type AccountMatchSignal,
  type AccountResolverSmsInput,
} from "@/shared/utils/accountResolver";

export { readNativeInbox, type NativeInboxQuery } from "./nativeInbox";

export {
  toSmsLocalMetadata,
  type SmsLocalMetadata,
} from "./smsLocalMetadata";

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
  type SmsWriteReadyEntry,
  type SmsDispatchResult,
} from "./smsAutoAdd";

export {
  buildDetectedNotification,
  buildAutoAddedNotification,
  buildRecurringDetectedNotification,
  type SmsNotificationCopy,
} from "./smsNotificationCopy";

export {
  requestSmsNotificationPermission,
  notifySmsDispatch,
  SMS_NOTIFICATION_CHANNEL_ID,
} from "./smsNotifications";

export {
  detectRecurringPatterns,
  matchesExistingSubscription,
  patternToSubscription,
  type RecurringPattern,
} from "./smsRecurringDetector";

export { commitSmsWritePayload } from "./smsExpenseWriter";

export {
  loadSmsInboundStatus,
  saveSmsInboundStatus,
  patchSmsInboundStatus,
  SMS_INBOUND_STATUS_DEFAULTS,
  type SmsInboundStatus,
} from "./smsInboundStatus";
