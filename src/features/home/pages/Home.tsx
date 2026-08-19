// React Imports
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef
} from "react";
import { AppState, View, Platform, ScrollView as RNScrollView } from "react-native";
import {
  Gesture,
  GestureDetector,
  ScrollView as GHScrollView
} from "react-native-gesture-handler";
import { HomeScrollGestureContext } from "../context/HomeScrollGestureContext.tsx";
import messaging from "@react-native-firebase/messaging";

// Hooks
import { useSelector, useDispatch } from "react-redux";
import { useDebounceFn, useRequest } from "ahooks";
import { useTheme } from "hooks/use-theme.ts";
import { useStableTopBarAvatar } from "hooks/use-stable-top-bar-avatar.ts";
import { usePermissions } from "core/permissions/use-permissions.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { useNotifications } from "hooks/use-notifications.ts";
import * as userActions from "store/users/actions.ts";
import { store } from "store/global-store.ts";
import { normalizeUserDnd } from "shared/utils/user-dnd.ts";
import * as textActions from "store/text/actions.ts";
import NotificationManager, {
  NotificationToken
} from "core/notifications/NotificationManager.ts";
import { hasCompletedOnboardingPrompts } from "core/permissions/permission-prompt-store.ts";
import {
  registerPushTokenForAppLaunch,
  registerPushTokenOnRefresh,
  resetPushRegistrationForProcess
} from "core/notifications/register-push-on-launch.ts";

// Typesf
import { State } from "store/types.ts";
import { GroupChannel } from "@sendbird/chat/groupChannel";
import {
  CustomChannelType,
  NormalizedPublicChannel,
  FilteredDMChannel,
  FilteredChannel
} from "features/chat/types.ts";
import { SendbirdChannel } from "shared/api/chat/types.ts";

// API
import { getAgentQueues, queueAgentDND } from "shared/api/queues/methods.ts";
import { getPublicChannels } from "shared/api/chat/methods.ts";

// Components
import { Screen } from "shared/components/utils/Screen.tsx";
import { TopBar } from "shared/components/TopBar.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import SearchBar from "shared/components/utils/SearchBar.tsx";
import SearchResults from "../components/SearchResults";
import ChannelsSection from "../components/ChannelsSection";
import DirectMessagesSection from "../components/DirectMessagesSection";
import CallCenterSection from "../components/CallCenterSection";

// Utils
import { Logger } from "shared/utils/Logger.ts";
import { toast } from "@backpackapp-io/react-native-toast";
import { findContactByPhoneNumber } from "features/calling/utils/contact-lookup.ts";

// Styles
import { homeStyles } from "../styles/home-styles.ts";
import { padding } from "core/theme/theme.ts";

const logger = new Logger("Home");

export function Home() {
  // =========================
  // HOOKS AND STATE MANAGEMENT
  // =========================
  const theme = useTheme();
  const dispatch = useDispatch();
  const { checkPermissions, ensureOnboardingPermissions, permissions } =
    usePermissions();
  const {
    channels,
    filteredGroupChannels,
    filteredDMChannels,
    setPushNotification,
    isConnected,
    connecting,
    isChannelsLoading
  } = useSendbirdContext();

  useNotifications();

  // Track notification permission from both local state and permissions hook
  const notificationPermissionFromHook =
    permissions?.notifications?.granted ?? false;
  const [notificationPermissionGranted, setNotificationPermissionGranted] =
    useState(false);
  const [
    prevNotificationPermissionGranted,
    setPrevNotificationPermissionGranted
  ] = useState(false);
  // Direct Firebase permission check (most reliable)
  const [firebasePermissionGranted, setFirebasePermissionGranted] =
    useState(false);

  // Local State
  const [searchVal, setSearchVal] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [publicChannels, setPublicChannels] = useState<GroupChannel[]>();
  const [, setSearching] = useState(false);

  // Redux State
  const { user, shouldResetTokenRegistration } = useSelector(
    (state: State) => state.userReducer
  );

  // console.log("🔵 [Home] user", JSON.stringify(user, null, 2));


  const { accessToken, isLoggedIn } = useSelector(
    (state: State) => state.authReducer
  );
  const { directory, personalContacts, companyContacts, phoneContacts } =
    useSelector((state: State) => state.directoryReducer);
  const { conversations: smsConversations, provisionedNumbers } = useSelector(
    (state: State) => state.textReducer
  );
  const sendbirdReduxChannels = useSelector(
    (state: State) => state.sendbirdReducer.channels
  );

  const unreadByChannelUrl = useMemo(() => {
    const m = new Map<string, number>();
    (sendbirdReduxChannels || []).forEach((ch: { url?: string; customUnreadCount?: number }) => {
      if (ch?.url) {
        m.set(ch.url, ch.customUnreadCount || 0);
      }
    });
    return m;
  }, [sendbirdReduxChannels]);

  const mergedUnreadForChannel = useCallback(
    (channel: GroupChannel) => {
      const sdk = channel.unreadMessageCount || 0;
      const custom = unreadByChannelUrl.get(channel.url) ?? 0;
      return sdk > custom ? sdk : custom;
    },
    [unreadByChannelUrl]
  );

  const [lastRegisteredToken, setLastRegisteredToken] =
    useState<NotificationToken | null>(null);
  const [permissionsOnboardingDone, setPermissionsOnboardingDone] =
    useState(false);
  /** Prevents overlapping onboarding permission runs. */
  const permissionsOnboardingInFlightRef = useRef(false);
  const { avatarSource: topBarAvatarSource, avatarName: topBarAvatarName } =
    useStableTopBarAvatar();

  const { data, runAsync } = useRequest(
    () => getAgentQueues(accessToken, user?.peerName as string),
    {
      manual: true,
      onError: (error) => {
        logger.error("Failed to fetch agent queues:", error);
        toast.error("Error fetching queues");
      },
      onSuccess: (agentData) => {
        if (agentData?.extDND === undefined || agentData.extDND === null) {
          return;
        }
        const next = normalizeUserDnd(agentData.extDND);
        const current = normalizeUserDnd(
          store.getState().userReducer?.user?.dnd
        );
        if (next !== current) {
          dispatch(userActions.updateUser({ dnd: next }));
        }
      }
    }
  );

  const normalizePublicChannel = (
    raw: SendbirdChannel
  ): NormalizedPublicChannel => {
    const userMember = raw.members.find(
      (member) => member.user_id === user?.id.toString()
    );
    const hasJoined = userMember?.state === "joined";
    const res = {
      url: raw.channel_url,
      name: raw.name,
      customType: raw.custom_type,
      isPublic: raw.is_public,
      unreadMessageCount: raw.unread_message_count,
      createdAt: raw.created_at,
      joinedAt: hasJoined ? raw.created_at ?? 0 : 0
    };
    return res;
  };

  const handlePublicChannels = async (channelName: string) => {
    const res = await getPublicChannels(
      user?.tenantId.toString() as string,
      channelName
    );
    if (res && res.length) {
      const normalizedChannels = res.map((channel: SendbirdChannel) => {
        return normalizePublicChannel(channel);
      });
      setPublicChannels(normalizedChannels as GroupChannel[]);
    }
  };

  const { run } = useDebounceFn(handlePublicChannels, {
    wait: 500
  });

  const isChannelDM = useCallback(
    (channel: GroupChannel): boolean => {
      return (
        channel.customType ===
          CustomChannelType.dmChannel(user?.tenantId || -1) ||
        channel.customType ===
          CustomChannelType.personalChannel(user?.tenantId || -1)
      );
    },
    [user?.tenantId]
  );

  const formatDMChannel = useCallback(
    (channel: GroupChannel): FilteredDMChannel => {
      const members = channel.members.filter(
        (member) => parseInt(member.userId) !== user?.id
      );
      const memberContacts = directory.filter((contact) =>
        members.some((member) => contact.userId?.toString() === member.userId)
      );

      const isPersonal =
        channel.customType ===
        CustomChannelType.personalChannel(user?.tenantId || -1);

      if (isPersonal) {
        return {
          name: user?.extName || "",
          avatar: user?.avatarPath || "",
          url: channel.url,
          connectionStatus: "online",
          unreadCount: mergedUnreadForChannel(channel),
          personal: true,
          memberUserIds: [user?.id?.toString() || ""]
        };
      }

      const memberName = memberContacts
        .map((member) => member.name.trim())
        .join(", ");
      const name =
        memberName.length > 30 ? `${memberName.slice(0, 30)}....` : memberName;

      const channelMemberIds = channel.members.map((member) => member.userId);
      const memberUserIds = directory
        .filter(
          (contact) =>
            contact.userId &&
            channelMemberIds.includes(contact.userId.toString())
        )
        .map((contact) => contact.userId!.toString());

      return {
        avatar:
          memberContacts[0]?.avatarThumbnailPath ||
          memberContacts[0]?.avatarPath ||
          "",
        name: name || channel.name,
        connectionStatus: members[0]?.connectionStatus || "offline",
        url: channel.url,
        unreadCount: mergedUnreadForChannel(channel),
        memberUserIds
      };
    },
    [
      user?.id,
      user?.extName,
      user?.avatarPath,
      user?.tenantId,
      directory,
      mergedUnreadForChannel
    ]
  );

  const formatGroupChannel = useCallback(
    (channel: GroupChannel): FilteredChannel => {
      // Get member user IDs from directory for this channel
      const channelMemberIds = channel.members?.map((member) => member.userId);
      const memberUserIds = directory
        .filter(
          (contact) =>
            contact.userId &&
            channelMemberIds?.includes(contact.userId.toString())
        )
        .map((contact) => contact.userId!.toString());

      return {
        name: channel.name,
        url: channel.url,
        unreadCount: mergedUnreadForChannel(channel),
        isPublic: channel.isPublic,
        joined: channel.joinedAt !== 0,
        memberUserIds
      };
    },
    [directory, mergedUnreadForChannel]
  );

  const handleDNDToggle = useCallback(
    async (
      queueId: number,
      isReceivingQueueCalls: boolean,
      queueName: string
    ): Promise<void> => {
      if (!user?.peerName) {
        logger.error("Cannot toggle DND: No peer name available");
        return;
      }

      console.log("🔵 [Home] handleDNDToggle", {
        queueId,
        isReceivingQueueCalls,
        queueName
      });
      
      try {
        const newDndState = isReceivingQueueCalls;
        await queueAgentDND(user.peerName, queueId, newDndState);
        await runAsync();

        if (isReceivingQueueCalls) {
          toast.success(
            `You'll no longer receive calls from ${queueName}.`
          );
        } else {
          toast.success(`You'll now receive calls from ${queueName}.`);
        }
      } catch (error) {
        logger.error("Failed to toggle queue availability:", error);
        toast.error("Couldn't update queue call settings");
      }
    },
    [user?.peerName, runAsync]
  );

  const handleRefetch = useCallback(async (): Promise<void> => {
    await runAsync();
  }, [runAsync]);

  const handleSearchCancel = useCallback(() => {
    setSearchVal("");
  }, []);

  const handleSearchFocusChange = useCallback(
    async (isFocused: boolean) => {
      if (isFocused) {
        await run("");
      }
      setIsSearchFocused(isFocused);
    },
    [run]
  );

  const filteredResults = useMemo(() => {
    setSearching(true);
    if (!searchVal.trim()) {
      setSearching(false);
      return [];
    }

    const normalizedSearch = searchVal.toLowerCase().trim();
    const allChannel: GroupChannel[] = [...(publicChannels || []), ...channels];

    if (allChannel.length < 1) {
      setSearching(false);
      return [];
    }

    // Remove duplicates using Map (keeps the first occurrence)
    const channelMap = new Map<string, GroupChannel>();
    allChannel.forEach((channel) => {
      if (!channelMap.has(channel.url)) {
        channelMap.set(channel.url, channel);
      }
    });

    // Convert back to array, filter, and sort
    const filteredChannels = Array.from(channelMap.values())
      .filter((channel) => {
        // Check channel name
        if (
          channel.name &&
          typeof channel.name === "string" &&
          channel.name.toLowerCase().includes(normalizedSearch)
        ) {
          return true;
        }

        // Check member nicknames
        if (channel.members && channel.members.length > 0) {
          return channel.members.some((member) =>
            member.nickname?.toLowerCase().includes(normalizedSearch)
          );
        }

        return false;
      })
      .sort((a, b) => {
        const aTime = a.createdAt || 0;
        const bTime = b.createdAt || 0;
        return bTime - aTime;
      });

    setSearching(false);
    return filteredChannels;
  }, [searchVal, publicChannels, channels]);

  const orderedDMChannels = useMemo(() => {
    if (filteredDMChannels.length === 0) return [];

    const personalChannelIndex = filteredDMChannels.findIndex(
      (c) => c.personal === true
    );

    if (personalChannelIndex > -1) {
      const personalChannel = filteredDMChannels[personalChannelIndex];
      const otherChannels = [
        ...filteredDMChannels.slice(0, personalChannelIndex),
        ...filteredDMChannels.slice(personalChannelIndex + 1)
      ];
      const slicedChannels = otherChannels.slice(0, 9);
      return [...slicedChannels, personalChannel];
    }

    return filteredDMChannels;
  }, [filteredDMChannels]);

  /** Read FCM auth state only — do not call requestPermission() (onboarding owns dialogs). */
  const readFirebaseNotificationPermission = useCallback(async () => {
    try {
      const authStatus = await messaging().hasPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      logger.debug("🔍 [Home] Firebase notification status (read-only):", {
        authStatus,
        enabled
      });

      const wasGranted = firebasePermissionGranted;
      setFirebasePermissionGranted(enabled);
      return { enabled, justGranted: !wasGranted && enabled };
    } catch (error) {
      logger.error("🔍 [Home] Error reading Firebase permission:", error);
      return { enabled: false, justGranted: false };
    }
  }, [firebasePermissionGranted]);

  const runPermissionOnboarding = useCallback(async (): Promise<void> => {
    if (permissionsOnboardingInFlightRef.current) {
      return;
    }
    if (Platform.OS === "android") {
      const alreadyDone = await hasCompletedOnboardingPrompts();
      if (alreadyDone && permissionsOnboardingDone) {
        return;
      }
    }

    permissionsOnboardingInFlightRef.current = true;

    try {
      await checkPermissions();
      const result = await ensureOnboardingPermissions();
      const firebaseResult = await readFirebaseNotificationPermission();

      const sequenceDone =
        result.sequenceComplete ||
        (Platform.OS === "android" && (await hasCompletedOnboardingPrompts()));

      setPermissionsOnboardingDone(sequenceDone);

      const wasGranted = notificationPermissionGranted;
      setNotificationPermissionGranted(
        result.allGranted || result.results.notifications.granted
      );
      setPrevNotificationPermissionGranted(wasGranted);

      if (sequenceDone && Platform.OS === "android") {
        await NotificationManager.syncAndroidNotifeeAfterOnboarding();
      }

      if (firebaseResult.justGranted) {
        logger.debug("🔔 [Home] Firebase notification just granted");
      }

      if (result.results.notifications.granted) {
        logger.debug(
          "🔔 [Home] Notification permission granted - token registration will be triggered"
        );
      }

      if (!result.allGranted) {
        logger.warn("Not all permissions granted:", result.results);
      }

      if (!sequenceDone) {
        logger.warn(
          "Permission onboarding incomplete — will retry when app is active"
        );
      }
    } catch (error) {
      logger.error("Failed to check or request permissions:", error);
      toast.error("Error with app permissions");
      setNotificationPermissionGranted(false);
    } finally {
      permissionsOnboardingInFlightRef.current = false;
    }
  }, [
    checkPermissions,
    ensureOnboardingPermissions,
    readFirebaseNotificationPermission,
    notificationPermissionGranted,
    permissionsOnboardingDone
  ]);

  useEffect(() => {
    void runPermissionOnboarding();
  }, [runPermissionOnboarding]);

  /** Resume permission chain after notification sheet closes (Android activity resume). */
  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        return;
      }
      void (async () => {
        const done = await hasCompletedOnboardingPrompts();
        if (!done) {
          void runPermissionOnboarding();
        }
      })();
    });

    return () => sub.remove();
  }, [runPermissionOnboarding]);

  const hasNotificationPermission =
    firebasePermissionGranted ||
    notificationPermissionFromHook ||
    notificationPermissionGranted;

  const setPushNotificationRef = useRef(setPushNotification);
  setPushNotificationRef.current = setPushNotification;
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  const syncLastRegisteredTokenFromFirebase = useCallback(async () => {
    const notificationTokenType: "ios_remote_notifications" | "android_fcm" =
      Platform.OS === "ios" ? "ios_remote_notifications" : "android_fcm";
    try {
      const token =
        Platform.OS === "ios"
          ? await messaging().getAPNSToken()
          : await messaging().getToken();

          console.log("🔍 [Home] Syncing last registered token from Firebase", {
            token,
            notificationTokenType
          });
      if (token) {
        setLastRegisteredToken({
          token,
          tokenType: notificationTokenType,
          timestamp: Date.now()
        });
      }
    } catch {
      /* UI/debug only */
    }
  }, []);

  useEffect(() => {
    if (shouldResetTokenRegistration) {
      logger.debug(
        "🔄 [Home] Logout detected - resetting token registration state"
      );
      setLastRegisteredToken(null);
      resetPushRegistrationForProcess();
    }
  }, [shouldResetTokenRegistration]);

  /** Once per cold launch: Sendbird + backend even when FCM token string is unchanged */
  useEffect(() => {
    if (!permissionsOnboardingDone) {
      return;
    }

    if (
      !isLoggedIn ||
      !accessToken?.trim() ||
      !user?.id ||
      !isConnected ||
      !hasNotificationPermission
    ) {
      return;
    }

    void (async () => {
      const ok = await registerPushTokenForAppLaunch({
        isLoggedIn,
        accessToken,
        userId: user.id,
        hasNotificationPermission: true,
        isSendbirdConnected: isConnected,
        setPushNotification: (...args) =>
          setPushNotificationRef.current(...args),
        dispatch: (action) => dispatchRef.current(action)
      });
      if (ok) {
        await syncLastRegisteredTokenFromFirebase();
      }
    })();
  }, [
    permissionsOnboardingDone,
    isLoggedIn,
    accessToken,
    user?.id,
    isConnected,
    hasNotificationPermission,
    syncLastRegisteredTokenFromFirebase
  ]);

  useEffect(() => {
    if (Platform.OS !== "android" || !isConnected) {
      return;
    }

    if (!isLoggedIn || !accessToken?.trim() || !user?.id || !hasNotificationPermission) {
      return;
    }

    const unsubscribe = messaging().onTokenRefresh(async (refreshedToken) => {
      if (
        lastRegisteredToken &&
        lastRegisteredToken.token === refreshedToken &&
        lastRegisteredToken.tokenType === "android_fcm"
      ) {
        return;
      }

      const ok = await registerPushTokenOnRefresh({
        isLoggedIn,
        accessToken,
        userId: user?.id,
        hasNotificationPermission: true,
        isSendbirdConnected: isConnected,
        setPushNotification: (...args) =>
          setPushNotificationRef.current(...args),
        dispatch: (action) => dispatchRef.current(action),
        refreshedToken
      });

      if (ok) {
        setLastRegisteredToken({
          token: refreshedToken,
          tokenType: "android_fcm",
          timestamp: Date.now()
        });
      }
    });

    return () => unsubscribe();
  }, [
    isConnected,
    isLoggedIn,
    accessToken,
    user?.id,
    hasNotificationPermission,
    lastRegisteredToken
  ]);

  useEffect(() => {
    run(searchVal);
  }, [searchVal, run]);

  const enrichedSmsConversations = useMemo(() => {
    if (!smsConversations || smsConversations.length === 0) {
      return smsConversations;
    }

    return smsConversations.map((conversation) => {
      // If conversation already has a name, return as is
      if (conversation.conversationName) {
        return conversation;
      }

      // Get participants (excluding the source DID)
      const participants = conversation.participants
        ?.split(",")
        .filter((p) => p !== conversation.sourceDID);

      if (!participants || participants.length === 0) {
        return conversation;
      }

      // Look up contact names for all participants
      const participantNames = participants
        .map((phoneNumber) => {
          const contactInfo = findContactByPhoneNumber(
            phoneNumber,
            personalContacts || [],
            companyContacts || [],
            directory || [],
            phoneContacts || []
          );

          // Return contact name if found, otherwise return null
          return contactInfo ? contactInfo.name : null;
        })
        .filter((name) => name !== null) as string[];

      // If we found any contact names, use them
      if (participantNames.length > 0) {
        return {
          ...conversation,
          conversationName: participantNames.join(", ")
        };
      }

      // If no contacts found, return original conversation
      return conversation;
    });
  }, [
    smsConversations,
    personalContacts,
    companyContacts,
    directory,
    phoneContacts
  ]);

  // Initial fetch of agent queues
  useEffect(() => {
    if (user?.peerName && accessToken) {
      void runAsync();
    }
  }, []);

  const [hasFetchedSms, setHasFetchedSms] = useState(false);
  useEffect(() => {
    if (accessToken && !hasFetchedSms) {
      if (smsConversations.length === 0) {
        logger.debug("Fetching conversations - no cached data");
        dispatch(textActions.fetchConversations());
      }
      if (!provisionedNumbers || provisionedNumbers.length === 0) {
        logger.debug("Fetching provisioned numbers - no cached data");
        dispatch(textActions.fetchProvisionedNumbers());
      }
      setHasFetchedSms(true);
    }
  }, [
    accessToken,
    dispatch,
    smsConversations.length,
    provisionedNumbers,
    hasFetchedSms
  ]);

  // Combined search results: Sendbird channels + enriched SMS conversations
  const combinedSearchResults = useMemo(() => {
    if (!searchVal.trim()) {
      return filteredResults;
    }

    const normalizedSearch = searchVal.toLowerCase().trim();

    // Filter enriched SMS conversations by name or phone number
    const filteredSms = (enrichedSmsConversations || []).filter(
      (conv) =>
        conv.conversationName?.toLowerCase().includes(normalizedSearch) ||
        conv.participants?.toLowerCase().includes(normalizedSearch)
    );

    console.log("🔍 Combined Search:", {
      searchQuery: normalizedSearch,
      sendbirdResults: filteredResults.length,
      smsResults: filteredSms.length,
      totalEnrichedSms: enrichedSmsConversations?.length || 0
    });

    return [...filteredResults, ...filteredSms];
  }, [searchVal, filteredResults, enrichedSmsConversations]);

  // iOS: Native gesture + GestureDetector lets ReanimatedSwipeable share the scroll pan.
  // Android: wrapping ScrollView in GestureDetector breaks vertical scroll — use RN ScrollView only.
  const homeScrollNativeGesture = useMemo(
    () => (Platform.OS === "ios" ? Gesture.Native() : undefined),
    []
  );

  const scrollContent = (
    <>
      {isSearchFocused ? (
        <SearchResults
          results={combinedSearchResults}
          isChannelDM={isChannelDM}
          searchVal={searchVal}
          formatDMChannel={formatDMChannel}
          formatGroupChannel={formatGroupChannel}
        />
      ) : (
        <View style={homeStyles.accordionContainer}>
          <ChannelsSection
            channels={filteredGroupChannels as FilteredChannel[]}
            isLoading={isChannelsLoading}
          />
          <DirectMessagesSection
            channels={orderedDMChannels}
            enrichedSmsConversations={enrichedSmsConversations}
            isLoading={connecting || isChannelsLoading}
          />
          <CallCenterSection
            data={data ? { ...data, paused: !!data.paused } : data}
            handleDNDToggle={handleDNDToggle}
            handleRefetch={handleRefetch}
            theme={theme}
          />
        </View>
      )}
    </>
  );

  return (
    <Screen paddingHorizontal>
      <TopBar
        title="Home"
        avatarSource={topBarAvatarSource}
        avatarName={topBarAvatarName}
      />
      <WhiteSpace height={padding.md} />
      <SearchBar
        containerStyle={homeStyles.searchBarContainer}
        placeholder="Search"
        value={searchVal}
        onChangeText={setSearchVal}
        onCancel={handleSearchCancel}
        onFocusChange={handleSearchFocusChange}
      />
      <HomeScrollGestureContext.Provider value={homeScrollNativeGesture}>
        {Platform.OS === "android" ? (
          <RNScrollView
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            contentContainerStyle={homeStyles.scrollContentContainer}
            nestedScrollEnabled
          >
            {scrollContent}
          </RNScrollView>
        ) : (
          <GestureDetector gesture={homeScrollNativeGesture!}>
            <GHScrollView
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
              contentContainerStyle={homeStyles.scrollContentContainer}
            >
              {scrollContent}
            </GHScrollView>
          </GestureDetector>
        )}
      </HomeScrollGestureContext.Provider>
    </Screen>
  );
}
