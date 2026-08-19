import { Editor, Range } from "@tiptap/core";
import { Member } from "@sendbird/chat/groupChannel";
import { ChannelType } from "@sendbird/chat";
import { useRichEditor } from "features/chat/rich-editor/context/RichEditorContext.ts";
import { EditorMention } from "features/chat/rich-editor/types.ts";

export default {
  items: async ({ query }: { query: string; editor: Editor }) => {
    const userId = "YOUR_USER_ID"; // Get from your auth context

    // Get channel and members from your Sendbird context/state
    const currentChannel: ChannelType | null = null; // Get from your Sendbird context
    const existingThread: ChannelType | null = null; // Get from your Sendbird context
    const newChatMembers: Member[] = []; // Get from your Sendbird context

    // Get mentions from RichEditorContext
    const { mentions } = useRichEditor();
    const mentionedUserIds = mentions.map((mention) => mention.id.toString());

    const isChannelMentioned = mentionedUserIds.includes("-1");
    const isDirectMessage = currentChannel?.customType?.includes("DM");

    const channel = existingThread || currentChannel;
    let filteredMembers: EditorMention[] = [];

    if (channel && "url" in channel) {
      filteredMembers = channel.members
        .filter((member: Member) => member.userId !== userId)
        .map((member: Member) => ({
          id: member.userId,
          label: member.nickname || member.userId,
          directoryName: member.nickname || member.userId
        }));

      if (
        !isChannelMentioned &&
        mentionedUserIds.length === 0 &&
        !isDirectMessage
      ) {
        filteredMembers.unshift({
          id: "-1",
          label: "channel",
          directoryName: "@channel",
          subText: "Notify everyone in this channel.",
          channelMention: true
        });
      }

      const filteredMembersWithoutMentions = filteredMembers.filter(
        (member) => !mentionedUserIds.includes(member.id)
      );

      return filteredMembersWithoutMentions
        .filter(({ directoryName }) =>
          directoryName.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 5);
    } else if (newChatMembers.length) {
      filteredMembers = newChatMembers
        .filter((member) => member.userId !== userId)
        .map((member) => ({
          id: member.userId,
          label: member.nickname || member.userId,
          directoryName: member.nickname || member.userId
        }));

      if (!isChannelMentioned && mentionedUserIds.length === 0) {
        filteredMembers.unshift({
          id: "-1",
          label: "channel",
          directoryName: "@channel",
          subText: "Notify everyone in this channel.",
          channelMention: true
        });
      }

      const filteredMembersWithoutMentions = filteredMembers.filter(
        (member) => !mentionedUserIds.includes(member.id)
      );

      return filteredMembersWithoutMentions
        .filter(({ directoryName }) =>
          directoryName.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 5);
    }

    return undefined;
  },

  render: () => {
    let _suggestionRange: Range | null = null;
    let _suggestionProps: any = null;

    return {
      onStart: (props: any) => {
        _suggestionProps = props;
        _suggestionRange = props.range;
      },

      onUpdate(props: any) {
        _suggestionProps = props;
        _suggestionRange = props.range;
      },

      onKeyDown() {
        return false;
      },

      onExit() {
        _suggestionProps = null;
        _suggestionRange = null;
      }
    };
  }
};
