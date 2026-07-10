import { SEND_BIRD_APP_ID, SEND_BIRD_APP_TOKEN } from "@env";
import { Logger } from "shared/utils/Logger.ts";

const logger = new Logger("Chat API: ");

export const getPublicChannels = async (
  tenantId: string,
  channelName: string = "",
  nextToken?: string
): Promise<any[] | undefined> => {
  let url:
    | string
    | null = `https://api-${SEND_BIRD_APP_ID}.sendbird.com/v3/group_channels?limit=50&custom_type=Open_${tenantId}&public_mode=public&show_empty=true&show_member=true&name_contains=${channelName}`;

  if (nextToken) url += `&token=${nextToken}`;
  try {
    const response: Response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Api-Token": SEND_BIRD_APP_TOKEN
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ? data.error : "Something went wrong!");
    }
    return data.channels as any;
  } catch (error) {
    logger.error("getPublicChannels(): ", error);
    return;
  }
};

// Add user in channel.
export const createUserInSendbird = async (
  userId: string,
  nickname: string,
  profileUrl?: string
) => {
  try {
    const response = await fetch(
      `https://api-${SEND_BIRD_APP_ID}.sendbird.com/v3/users`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Token": SEND_BIRD_APP_TOKEN
        },
        body: JSON.stringify({
          user_id: userId,
          nickname: nickname,
          profile_url: profileUrl || "",
          issue_access_token: false
        })
      }
    );

    if (!response.ok && response.status !== 400) {
      const data = await response.json();
      throw new Error(data.error || "Failed to create user");
    }

    return await response.json();
  } catch (e) {
    logger.error(`Error creating user in Sendbird: ${e}`);
    throw e;
  }
};

// Update user in Sendbird
export const updateUserInSendbird = async (
  userId: string,
  nickname: string,
  profileUrl?: string
) => {
  try {
    const response = await fetch(
      `https://api-${SEND_BIRD_APP_ID}.sendbird.com/v3/users/${userId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Api-Token": SEND_BIRD_APP_TOKEN
        },
        body: JSON.stringify({
          nickname: nickname,
          profile_url: profileUrl || ""
        })
      }
    );

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to update user");
    }

    return await response.json();
  } catch (e) {
    logger.error(`Error updating user in Sendbird: ${e}`);
    throw e;
  }
};

export const removeUserFromChannel = async (
  channelUrl: string,
  userIdToRemove: string
) => {
  try {
    await fetch(
      `https://api-${SEND_BIRD_APP_ID}.sendbird.com/v3/group_channels/${channelUrl}/leave`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Api-Token": SEND_BIRD_APP_TOKEN
        },
        body: JSON.stringify({
          channel_url: channelUrl,
          user_ids: [userIdToRemove],
          should_remove_operator_status: "false",
          should_leave_all: "false"
        })
      }
    );
  } catch (e) {
    logger.error(`Error leaving channel ${e}`);
    throw e;
  }
};
