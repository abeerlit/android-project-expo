// Sendbird Redux Reducer
import * as actionTypes from "./actions.ts";
import { SendbirdActionTypes } from "./actions.ts";

export interface SendbirdState {
  channels: any[];
  dmChannels: any[];
  lastSync: number | null;
}

const initialState: SendbirdState = {
  channels: [],
  dmChannels: [],
  lastSync: null
};

export const sendbirdReducer = (
  state = initialState,
  action: SendbirdActionTypes
): SendbirdState => {
  switch (action.type) {
    case actionTypes.STORE_CHANNELS: {
      const newState = {
        ...state,
        channels: action.channels.map((ch: any) => {
          // Preserve existing customUnreadCount from Redux state
          const existingChannel = state.channels.find(
            (existing: any) => existing.url === ch.url
          );
          const clonedChannel: any = {
            ...ch,
            customUnreadCount:
              existingChannel?.customUnreadCount || ch.customUnreadCount || 0
          };
          // ✅ FIX: Deep clone members array and their nested properties (including metaData)
          if (ch.members) {
            clonedChannel.members = ch.members.map((member: any) => {
              const clonedMember: any = { ...member };
              if (member.metaData) {
                clonedMember.metaData = { ...member.metaData };
              }
              return clonedMember;
            });
          }
          return clonedChannel;
        })
      };

      return newState;
    }

    case actionTypes.STORE_DM_CHANNELS:
      return {
        ...state,
        dmChannels: action.dmChannels
      };

    case actionTypes.UPDATE_CHANNEL: {
      const channelIndex = state.channels.findIndex(
        (ch) => ch.url === action.channel.url
      );

      if (channelIndex >= 0) {
        // Update existing channel, preserve customUnreadCount
        const updatedChannels = [...state.channels];
        const existingChannel = state.channels[channelIndex];

        // ✅ FIX: Deep clone nested objects to prevent mutations
        const clonedChannel = {
          ...action.channel,
          customUnreadCount: existingChannel.customUnreadCount || 0,
          // Deep clone members array and their nested properties (including metaData)
          members: action.channel.members
            ? action.channel.members.map((member: any) => {
                const clonedMember: any = {
                  ...member
                };
                // Deep clone metaData if it exists
                if (member.metaData) {
                  clonedMember.metaData = { ...member.metaData };
                }
                return clonedMember;
              })
            : action.channel.members
        };

        updatedChannels[channelIndex] = clonedChannel;
        return {
          ...state,
          channels: updatedChannels
        };
      } else {
        // Add new channel - also deep clone
        const newChannel = {
          ...action.channel,
          customUnreadCount: 0,
          members: action.channel.members
            ? action.channel.members.map((member: any) => {
                const clonedMember: any = {
                  ...member
                };
                // Deep clone metaData if it exists
                if (member.metaData) {
                  clonedMember.metaData = { ...member.metaData };
                }
                return clonedMember;
              })
            : action.channel.members
        };
        return {
          ...state,
          channels: [newChannel, ...state.channels]
        };
      }
    }

    case actionTypes.REMOVE_CHANNEL:
      return {
        ...state,
        channels: state.channels.filter((ch) => ch.url !== action.channelUrl),
        dmChannels: state.dmChannels.filter(
          (ch) => ch.url !== action.channelUrl
        )
      };

    case actionTypes.SET_LAST_SYNC:
      return {
        ...state,
        lastSync: action.timestamp
      };

    case actionTypes.INCREMENT_CHANNEL_UNREAD: {
      if (
        !action.channelUrl ||
        typeof action.channelUrl !== "string" ||
        action.channelUrl.length === 0
      ) {
        console.error(
          "❌ [sendbirdReducer] INCREMENT_CHANNEL_UNREAD: Invalid channel URL, skipping"
        );
        return state;
      }

      const channelIndex = state.channels.findIndex(
        (ch) => ch.url === action.channelUrl
      );

      if (channelIndex >= 0) {
        const updatedChannels = [...state.channels];
        updatedChannels[channelIndex] = {
          ...updatedChannels[channelIndex],
          customUnreadCount:
            (updatedChannels[channelIndex].customUnreadCount || 0) + 1
        };
        return {
          ...state,
          channels: updatedChannels
        };
      } else {
        console.warn(
          "⚠️ [sendbirdReducer] INCREMENT_CHANNEL_UNREAD: Channel not found, skipping minimal entry creation:",
          {
            channelUrl: action.channelUrl,
            totalChannels: state.channels.length
          }
        );
        return state;
      }
    }

    case actionTypes.RESET_CHANNEL_UNREAD: {
      const channelIndex = state.channels.findIndex(
        (ch) => ch.url === action.channelUrl
      );

      if (channelIndex >= 0) {
        const updatedChannels = [...state.channels];
        updatedChannels[channelIndex] = {
          ...updatedChannels[channelIndex],
          customUnreadCount: 0
        };
        return {
          ...state,
          channels: updatedChannels
        };
      }
      return state;
    }

    case actionTypes.CLEAR_SENDBIRD_DATA: {
      const clearedState = initialState;
      return clearedState;
    }

    default:
      return state;
  }
};
