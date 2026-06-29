// React Imports
import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TouchableWithoutFeedback,
  Keyboard
} from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { componentSize, fontSize, padding } from "core/theme/theme.ts";
import { useNavigation } from "@react-navigation/native";
import { useSelector } from "react-redux";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { TextInput } from "shared/components/TextInput.tsx";
import RadioButton from "shared/components/utils/RadioButton.tsx";
import { Button } from "shared/components/Button.tsx";
import { toast } from "@backpackapp-io/react-native-toast";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { Logger } from "shared/utils/Logger.ts";

// Local Imports
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { Routes } from "core/navigation/types/types.ts";
import { ChatNavigationProp } from "features/chat/types.ts";
import { State } from "store/types.ts";

export const ChannelDrawer = () => {
  // Hooks
  const theme = useTheme();
  const logger = new Logger("ChannelDrawer");
  const { closeDrawer } = useDrawer();
  const navigation = useNavigation<ChatNavigationProp>();
  const { createOrJoinChannel } = useSendbirdContext();
  const { user } = useSelector((state: State) => state.userReducer);

  // Local State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Methods
  const handleCreateChannel = async () => {
    if (!name.trim()) {
      toast.error("Please enter a channel name");
      return;
    }

    if (!user) {
      toast.error("User not found");
      return;
    }

    setIsLoading(true);

    try {
      const result = await createOrJoinChannel(
        name.trim(),
        description.trim(),
        visibility === "private"
      );

      if (result.success && result.channelUrl) {
        // Reset form and close drawer on success
        setName("");
        setDescription("");
        setVisibility("public");
        closeDrawer();
        await new Promise((resolve) => setTimeout(resolve, 150));

        // Navigate to the channel
        navigation.navigate(Routes.Chat, { channelUrl: result.channelUrl });
        if (result.created) {
          toast.success("Channel created successfully!");
        }
      } else {
        // Failure: don't clear the state, don't close drawer, show error toast
        toast.error(result.error || "Channel couldn't be created");
        logger.error("Error creating channel:", result.error);
      }
    } catch (error) {
      // Failure: don't clear the state, don't close drawer, show error toast
      logger.error("Error creating channel:", error);
      toast.error("Channel couldn't be created");
    } finally {
      setIsLoading(false);
    }
  };

  // Render Methods
  const renderHeader = () => (
    <>
      <WhiteSpace height={3} />
      <View style={styles.headerContainer}>
        <Text
          size={fontSize.lg}
          style={[
            styles.headerText,
            { color: theme.colors["color-colors-text-text-primary"] }
          ]}
        >
          Create Channel
        </Text>
      </View>
      <WhiteSpace
        style={[
          styles.divider,
          { borderColor: theme.colors["color-colors-border-border-secondary"] }
        ]}
      />
    </>
  );

  const renderForm = () => (
    <View style={styles.formContainer}>
      <Text
        size={fontSize.sm}
        weight={"medium"}
        color={"colors-text-text-secondary"}
      >
        Name*
      </Text>
      <WhiteSpace height={padding.sm} />
      <TextInput
        variant={"outline"}
        value={name}
        onChangeText={(value) => {
          setName(value.replace(" ", "-"));
        }}
      />

      <WhiteSpace height={padding["2xl"]} />

      <Text
        size={fontSize.sm}
        weight={"medium"}
        color={"colors-text-text-secondary"}
      >
        Description
      </Text>
      <WhiteSpace height={padding.sm} />
      <TextInput
        variant={"outline"}
        value={description}
        onChangeText={setDescription}
      />

      <WhiteSpace height={padding["2xl"]} />

      <Text
        size={fontSize.sm}
        weight={"medium"}
        color={"colors-text-text-secondary"}
      >
        Visibility
      </Text>

      <WhiteSpace height={10} />
      <View>
        <RadioButton
          size={componentSize.sm}
          containerStyle={{ alignItems: "flex-start" }}
          label={
            <View style={{ alignItems: "flex-start", marginTop: -2.5 }}>
              <Text size={fontSize.sm} weight={"medium"}>
                Public
              </Text>
              <Text>Anyone on your team can join</Text>
            </View>
          }
          selected={visibility === "public"}
          onSelect={() => setVisibility("public")}
        />
        <WhiteSpace height={10} />
        <RadioButton
          size={componentSize.sm}
          containerStyle={{ alignItems: "flex-start" }}
          label={
            <View style={{ alignItems: "flex-start", marginTop: -2.5 }}>
              <Text size={fontSize.sm} weight={"medium"}>
                Private
              </Text>
              <Text>Can only be viewed or joined by invitation</Text>
            </View>
          }
          selected={visibility === "private"}
          onSelect={() => setVisibility("private")}
        />
      </View>
    </View>
  );

  const renderCreateButton = () => (
    <View style={styles.footerButtons}>
      <Button
        type="outline"
        style={[
          styles.backFooterButton,
          { backgroundColor: theme.colors["colors-background-bg-secondary"] }
        ]}
        onPress={closeDrawer}
      >
        Back
      </Button>
      <Button
        type="primary"
        style={styles.createButton}
        onPress={handleCreateChannel}
        loading={isLoading}
      >
        Create
      </Button>
    </View>
  );

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        {renderHeader()}
        {renderForm()}
        {renderCreateButton()}
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative"
  },
  headerContainer: {
    position: "relative",
    paddingHorizontal: padding.md,
    marginBottom: 20,
    justifyContent: "center"
  },
  headerRight: {
    position: "absolute",
    right: padding.md,
    top: 0
  },
  topBackButton: {
    paddingHorizontal: 18,
    paddingVertical: 8
  },
  headerText: {
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 0
  },
  divider: {
    borderStyle: "solid",
    borderWidth: 0.5
  },
  formContainer: {
    paddingTop: padding.xl,
    paddingHorizontal: padding["3xl"],
    alignItems: "flex-start",
    flex: 1
  },
  footerButtons: {
    marginHorizontal: padding["3xl"],
    marginBottom: padding["3xl"]
  },
  backFooterButton: {
    width: "100%",
    marginBottom: padding.md
  },
  createButton: {
    width: "100%"
  }
});
