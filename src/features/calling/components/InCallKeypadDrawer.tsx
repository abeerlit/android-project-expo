import React, { useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";
import { Button } from "shared/components/Button.tsx";
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { useSoftphone } from "core/softphone/useSoftphone.ts";
import { TransferNumberKeypad } from "./TransferNumberKeypad.tsx";

type InCallKeypadDrawerProps = {
  callId: string;
  onClose: () => void;
};

export function InCallKeypadDrawer({ callId, onClose }: InCallKeypadDrawerProps) {
  const theme = useTheme();
  const { sendDTMF } = useSoftphone();
  const [enteredDigits, setEnteredDigits] = useState("");

  const displayDigits = useMemo(
    () => enteredDigits.slice(Math.max(0, enteredDigits.length - 24)),
    [enteredDigits]
  );

  const onDigitPress = async (digit: string) => {
    setEnteredDigits((prev) => prev + digit);
    try {
      await sendDTMF(callId, digit);
    } catch (error) {
      Alert.alert("DTMF Failed", "Unable to send keypad tone.");
    }
  };

  return (
    <View style={styles.container}>
      <Text size={fontSize.lg} weight="semiBold" align="center">
        Keypad
      </Text>
      <WhiteSpace height={padding.md} />
      <View
        style={[
          styles.digitsBox,
          {
            borderColor: theme.colors["color-colors-border-border-secondary"],
            backgroundColor: theme.colors["color-colors-background-bg-secondary"]
          }
        ]}
      >
        <Text
          size={fontSize.xl}
          weight="medium"
          align="center"
          color="color-colors-text-text-primary"
        >
          {displayDigits || " "}
        </Text>
      </View>

      <WhiteSpace height={padding.lg} />
      <TransferNumberKeypad onDigitPress={onDigitPress} />

      <WhiteSpace height={padding.lg} />
      <Button type="secondary" onPress={onClose}>
        Close
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: padding.xl,
    paddingTop: padding.lg,
    paddingBottom: padding["2xl"]
  },
  digitsBox: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    justifyContent: "center",
    paddingHorizontal: padding.md
  }
});
