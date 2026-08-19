export const getAvatarFromDirectory = (
  participant: string,
  directory: any[],
  userExtNum?: string
) => {
  const memberFromDirectory = directory?.find((x) => {
    if (userExtNum === participant) return null;
    return x.number === participant && x.type === "company";
  });
  return (
    memberFromDirectory?.avatarThumbnailPath ||
    memberFromDirectory?.avatarPath ||
    null
  );
};

export const buildMentionList = (
  mentionQuery: string,
  mentions: any[],
  user: any,
  currentChannel: any,
  directoryReducer: any
) => {
  const userId = user?.id;
  const mentionedUserIds = mentions.map((mention) => mention.userId.toString());
  const isChannelMentioned = mentionedUserIds.includes("-1");
  const isDirectMessage = currentChannel?.customType.includes("DM");

  const channel = currentChannel;
  let filteredMembers: any[] = [];

  filteredMembers =
    channel?.members.filter((member: any) => +member.userId !== userId) || [];

  if (isChannelMentioned) return [];

  if (
    !isChannelMentioned &&
    mentionedUserIds.length === 0 &&
    !isDirectMessage
  ) {
    filteredMembers.unshift({
      userId: "-1",
      nickname: "channel",
      subText: "Notify everyone",
      channelMention: true
    });
  }

  const filteredMembersWithoutMentions = filteredMembers?.filter(
    (member: any) => !mentionedUserIds.includes(member.userId)
  );

  return filteredMembersWithoutMentions
    .filter((item) => {
      return item?.nickname?.toLowerCase().includes(mentionQuery.toLowerCase());
    })
    .slice(0, 5)
    .map((item) => ({
      userId: item.userId,
      name: item.nickname,
      subText: item.subText,
      channelMention: item.channelMention,
      avatarPath: getAvatarFromDirectory(
        item.metaData?.extensionNumber,
        directoryReducer?.directory || [],
        user?.extNum
      )
    }));
};
