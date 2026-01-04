/**
 * Guardrails module
 *
 * Enforces non-custodial constraints on the co-purchase platform.
 */

export {
  type BlockedActionType,
  BlockedActionError,
  assertNonCustodial,
  isActionBlocked,
  getAllBlockedActions,
  BLOCKED_ACTION_DISCLAIMER,
  UI_DISCLAIMER_SHORT,
  UI_DISCLAIMER_BANNER,
  containsCustodialKeywords,
  getCustodialWarning,
} from './blocked-actions';
