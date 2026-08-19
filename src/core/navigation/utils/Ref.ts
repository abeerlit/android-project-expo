import {
  createNavigationContainerRef,
  StackActions
} from "@react-navigation/native";
import { ParamListBase } from "@react-navigation/native";
import { Routes } from "../types/types.ts";
import { whenNavigationReady } from "./whenNavigationReady.ts";

type NavigationParams = {
  [key: string]: unknown;
};

export const navigationRef = createNavigationContainerRef<ParamListBase>();

function dispatchNavigate(name: string, params?: NavigationParams) {
  const currentRoute = navigationRef.getCurrentRoute();

  if (currentRoute?.name === name) {
    const currentParams = (currentRoute.params as NavigationParams) || {};
    const newParams = params || {};

    const currentChannelUrl = currentParams.channelUrl as string | undefined;
    const newChannelUrl = newParams.channelUrl as string | undefined;
    const currentConversationId = currentParams.conversationId as
      | number
      | undefined;
    const newConversationId = newParams.conversationId as number | undefined;

    const paramsChanged =
      (newChannelUrl && currentChannelUrl !== newChannelUrl) ||
      (newConversationId && currentConversationId !== newConversationId);

    if (paramsChanged) {
      navigationRef.dispatch(
        StackActions.push(name as never, newParams as never)
      );
    }
    return;
  }

  navigationRef.dispatch(
    StackActions.push(name as never, (params || {}) as never)
  );
}

export function navigate(name: string, params?: NavigationParams) {
  whenNavigationReady(() => {
    navigationRef.navigate(name as keyof ParamListBase, params as never);
  });
}

/** Push stack screen when ready; skips duplicate push when params unchanged. */
export function navigateOrReplace(name: string, params?: NavigationParams) {
  whenNavigationReady(() => {
    dispatchNavigate(name, params);
  });
}

export function getCurrentRoute() {
  if (navigationRef.isReady()) {
    return navigationRef.getCurrentRoute();
  }
  return null;
}

export function goBack() {
  if (navigationRef.isReady()) {
    if (navigationRef?.canGoBack()) {
      navigationRef.goBack();
    } else {
      navigationRef.navigate(Routes.BottomTabNavigator as never);
    }
  }
}
