export type EditorMention = {
  userId: string;
  label: string;
};

export type EditorMessage = {
  id: string | null;
  html: string;
  text: string;
  mentions: EditorMention[];
  files: File[];
  customType?: string;
  data?: any;
  meta?: any;
};

export type ThumbnailObject = {
  name: string;
  url: string;
  fileURL?: string;
  size?: string;
  isImage: boolean;
  isVideo: boolean;
  isAudio: boolean;
};

export type Metadata = {
  title?: string;
  description?: string;
  keywords?: string[];
  favicon?: string;
  author?: string;
  theme_color?: string;
  canonical_url?: string;
  url?: string;
  linkUrl?: string;
  oEmbed?: OEmbedPhoto | OEmbedVideo | OEmbedLink | OEmbedRich;
  twitter_card: {
    card: string;
    site?: string;
    creator?: string;
    creator_id?: string;
    title?: string;
    description?: string;
    players?: {
      url: string;
      stream?: string;
      height?: number;
      width?: number;
    }[];
    apps: {
      iphone: {
        id: string;
        name: string;
        url: string;
      };
      ipad: {
        id: string;
        name: string;
        url: string;
      };
      googleplay: {
        id: string;
        name: string;
        url: string;
      };
    };
    images: {
      url: string;
      alt: string;
    }[];
  };
  open_graph: {
    title: string;
    type: string;
    images?: {
      url: string;
      secure_url?: string;
      type: string;
      width: number;
      height: number;
      alt?: string;
    }[];
    url?: string;
    audio?: {
      url: string;
      secure_url?: string;
      type: string;
    }[];
    description?: string;
    determiner?: string;
    site_name?: string;
    locale: string;
    locale_alt: string;
    videos: {
      url: string;
      stream?: string;
      height?: number;
      width?: number;
      tags?: string[];
    }[];
    article: {
      published_time?: string;
      modified_time?: string;
      expiration_time?: string;
      author?: string;
      section?: string;
      tags?: string[];
    };
  };
};

type OEmbedBase = {
  type: "photo" | "video" | "link" | "rich";
  version: string;
  title?: string;
  author_name?: string;
  author_url?: string;
  provider_name?: string;
  provider_url?: string;
  cache_age?: number;
  thumbnails?: [
    {
      url?: string;
      width?: number;
      height?: number;
    }
  ];
};

export type OEmbedPhoto = OEmbedBase & {
  type: "photo";
  url: string;
  width: number;
  height: number;
};

export type OEmbedVideo = OEmbedBase & {
  type: "video";
  html: string;
  width: number;
  height: number;
};

export type OEmbedLink = OEmbedBase & {
  type: "link";
};

export type OEmbedRich = OEmbedBase & {
  type: "rich";
  html: string;
  width: number;
  height: number;
};

// Toolbar Types
export interface CustomToolbarProps {
  editor: any; // EditorBridge type
}

export interface MentionItemProps {
  item: {
    userId: string;
    name: string;
    subText?: string;
    channelMention?: boolean;
    avatarPath?: string | null;
  };
}

export interface ToolbarButtonProps {
  onPress: () => void;
  isActive?: boolean;
  iconName: string;
  iconSize?: number;
  style?: any;
}

export interface LinkDialogState {
  visible: boolean;
  link: string;
  title: string;
}

export interface MentionSuggestionsProps {
  mentionList: any[];
  onMentionPress: (item: any) => void;
}

export interface LinkDialogProps {
  state: LinkDialogState;
  onStateChange: (state: LinkDialogState) => void;
  onSave: (link: string, title: string) => void;
}

// Threads
interface ThreadUser {
  userId: string;
  nickname: string;
  plainProfileUrl?: string;
  connectionStatus?: string;
  isActive?: boolean;
  lastSeenAt?: number | null;
  friendName?: string | null;
  friendDiscoveryKey?: string | null;
  preferredLanguages?: string[] | null;
  requireAuth?: boolean;
  metaData?: Record<string, any>;
  _iid?: string;
  _hashValue?: number;
  _updatedAt?: number;
}

export interface ThreadInfoData {
  replyCount: number;
  unreadReplyCount?: number;
  mostRepliedUsers: ThreadUser[];
  lastRepliedAt?: number;
  memberCount?: number;
  updatedAt?: number;
  isPushNotificationEnabled?: boolean;
  _iid?: string;
}
