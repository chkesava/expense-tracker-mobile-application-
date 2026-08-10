export type { SmsReader, SmsReaderCapability } from "./smsReader";
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
  SMS_AUTOMATION_PREFS_DEFAULTS,
  type SmsAutomationPrefs,
} from "./smsAutomationPrefs";

export {
  parseBankSms,
  SMS_AUTO_COMMIT_CONFIDENCE,
  type SmsParseContext,
} from "./smsParser";

export { buildSmsFingerprint } from "./smsDedupe";

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
