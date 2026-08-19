// React Imports
import { useDispatch } from "react-redux";
import { useTheme } from "hooks/use-theme.ts";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import * as directoryActions from "store/directory/actions.ts";
import { Platform } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { ensureContactsPermissionForAndroid } from "core/permissions/ensure-contacts-permission.ts";

// Type Imports
import React, { useMemo, useCallback, useEffect } from "react";
import { StyleSheet } from "react-native";

// Component Imports
import { View } from "react-native";
import Icon from "shared/components/Icon.tsx";
import { Button } from "shared/components/Button.tsx";
import { Screen } from "shared/components/utils/Screen.tsx";
import { ContactsTabNavigator } from "core/navigation/navigators/ContactsTabNavigator.tsx";
import { PersonalContactForm } from "features/contacts/components/PersonalContactForm.tsx";
import { TopBar } from "shared/components/TopBar.tsx";
import { useStableTopBarAvatar } from "hooks/use-stable-top-bar-avatar.ts";

export function Contacts() {
  const theme = useTheme();
  const { openDrawer, closeDrawer } = useDrawer();
  const isFocused = useIsFocused();

  // Redux State
  const { avatarSource, avatarName } = useStableTopBarAvatar();
  const dispatch = useDispatch();

  useEffect(() => {
    if (!isFocused || Platform.OS !== "android") {
      return;
    }
    void ensureContactsPermissionForAndroid();
  }, [isFocused]);

  const buttonColor = useMemo(
    () =>
      theme.colors[
        "color-component-colors-components-buttons-tertiary-color-button-tertiary-color-fg"
      ],
    [theme.colors]
  );

  const handleCloseDrawer = useCallback(() => {
    closeDrawer();
    dispatch({ type: directoryActions.FETCH_PERSONAL_CONTACTS });
  }, [closeDrawer, dispatch]);

  const handleForm = useCallback(() => {
    openDrawer(
      <PersonalContactForm context={"create"} onSubmit={handleCloseDrawer} />
    );
  }, [openDrawer, handleCloseDrawer]);

  return (
    <Screen paddingHorizontal>
      <TopBar 
        title="Contacts" 
        avatarSource={avatarSource}
        avatarName={avatarName}
      />
      <View style={styles.container}>
        <ContactsTabNavigator />
        {/* Create Contact Button */}
        <Button type={"text"} onPress={handleForm} style={styles.absoluteStyle}>
          <Icon name={"user-plus-01"} size={20} color={buttonColor} />
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  absoluteStyle: {
    position: "absolute",
    top: 8,
    right: 0,
    zIndex: 1
  }
});
