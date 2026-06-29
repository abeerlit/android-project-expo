export interface ChannelResponse {
  channels: any[];
  next: string;
}

export interface SendbirdMember {
  user_id: string;
  state: string;
  // Add other member properties if needed
}

export interface SendbirdChannel {
  members: SendbirdMember[];
  channel_url: string;
  name: string;
  custom_type: string;
  is_public: boolean;
  unread_message_count: number;
  created_at: number;
  data?: string; // for any other properties
}
