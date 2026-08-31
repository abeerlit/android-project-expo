import type { SharedMediaItem } from "core/navigation/types/types.ts";

export type { SharedMediaItem };

export type ShareDestination =
  | { kind: "sendbird"; channelUrl: string; name: string }
  | {
      kind: "sms";
      conversationId: number;
      participants: string;
      sourceDID: string;
      name: string;
    };
