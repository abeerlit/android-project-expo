/**
 * Notification token types
 */
export type NotificationTokenType = "ios_remote" | "ios_voip" | "android_fcm";

/**
 * Notification token information
 */
export interface NotificationToken {
  /** The token string */
  token: string;
  /** The type of token */
  type: NotificationTokenType;
  /** Timestamp when the token was received */
  timestamp: number;
}

/**
 * Notification types
 */
export type NotificationType = "chat" | "call" | "system";

/**
 * Notification payload structure
 */
export interface NotificationPayload {
  /** Notification title */
  title?: string;
  /** Notification body */
  body?: string;
  /** Additional data payload */
  data?: Record<string, string>;
  /** Associated conversation ID */
  conversationId?: string;
  /** Associated call ID */
  callId?: string;
  /** Type of notification */
  type: NotificationType;
}

/**
 * Call data structure for VoIP notifications
 */
export interface CallData {
  /** Unique call identifier */
  callId: string;
  /** Caller name */
  callerName: string;
  /** Caller ID or number */
  callerId: string;
  /** Call handle (usually the phone number) */
  handle: string;
  /** Whether the call has video */
  hasVideo: boolean;
  /** Additional call data */
  additionalData?: Record<string, string>;
}

/**
 * Error types for notification operations
 */
export enum NotificationErrorType {
  PERMISSION_DENIED = "PERMISSION_DENIED",
  INITIALIZATION_FAILED = "INITIALIZATION_FAILED",
  TOKEN_REGISTRATION_FAILED = "TOKEN_REGISTRATION_FAILED",
  INVALID_CONFIGURATION = "INVALID_CONFIGURATION",
  UNKNOWN = "UNKNOWN"
}

/**
 * Notification error structure
 */
export interface NotificationError {
  /** Error type */
  type: NotificationErrorType;
  /** Error message */
  message: string;
  /** Original error object */
  originalError?: unknown;
}

/**
 * Notification event types
 */
export enum NotificationEventType {
  NOTIFICATION_RECEIVED = "NOTIFICATION_RECEIVED",
  NOTIFICATION_PRESSED = "NOTIFICATION_PRESSED",
  TOKEN_RECEIVED = "TOKEN_RECEIVED",
  CONVERSATION_UPDATED = "CONVERSATION_UPDATED",
  CALL_RECEIVED = "CALL_RECEIVED",
  CALL_ENDED = "CALL_ENDED",
  ERROR = "ERROR"
}

/**
 * Notification callbacks
 */
export interface NotificationCallbacks {
  /** Called when a notification is pressed */
  onNotificationPressed: (payload: NotificationPayload) => void;
  /** Called when a token is received */
  onTokenReceived: (token: NotificationToken) => void;
  /** Called when a conversation is updated */
  onConversationUpdated: (conversationId: string) => void;
  /** Called when a call is received */
  onCallReceived: (callData: CallData) => void;
}

/**
 * Notification permissions status
 */
export interface NotificationPermissions {
  /** Whether notifications are authorized */
  authorized: boolean;
  /** Whether notifications are denied */
  denied: boolean;
  /** Whether notifications are provisionally authorized (iOS only) */
  provisional?: boolean;
}
