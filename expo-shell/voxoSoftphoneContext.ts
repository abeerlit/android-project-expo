/**
 * Single Metro module identity for SoftphoneContext (avoids duplicate contexts when
 * Re-exports vendored src/core/softphone/SoftphoneContext for a single bundle identity.
 */
export {
  SoftphoneContext,
  type SoftphoneContextState,
  type SoftphoneContextMethods,
  type SoftphoneContextValue,
  type ContextCallInfo
} from "../src/core/softphone/SoftphoneContext.ts";
