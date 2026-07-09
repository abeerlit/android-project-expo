import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { Button } from "shared/components/Button.tsx";
import { Avatar } from "shared/components/Avatar.tsx";

// Context
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { TransferContact } from "features/calling/components/TransferContactDrawer.tsx";
import { phoneNumberFormatter } from "shared/utils/utils.ts";

export type TransferType = "blind" | "attended";

interface TransferOptionsDrawerProps {
  contact: TransferContact;
  onTransferTypeSelected: (type: TransferType) => void;
  onCancel: () => void;
}

export const TransferOptionsDrawer = ({
  contact,
  onTransferTypeSelected,
  onCancel
}: TransferOptionsDrawerProps) => {
  const _theme = useTheme();
  const { closeDrawer } = useDrawer();

  const handleBlindTransfer = () => {
    onTransferTypeSelected("blind");
  };

  const handleAttendedTransfer = () => {
    onTransferTypeSelected("attended");
  };

  const handleCancel = () => {
    closeDrawer();
    onCancel();
  };

  const hasResolvedName = contact.name.trim().length > 0;
  const formattedNumber = phoneNumberFormatter(contact.number);

  return (
    <View style={styles.container}>
      {/* Header */}
      <Text
        size={fontSize.lg}
        weight="semiBold"
        align="center"
        color="color-colors-text-text-primary"
        style={styles.title}
      >
        Transfer Options
      </Text>
      <View style={styles.content}>
        <View style={styles.contactSection}>
          <WhiteSpace height={padding["3xl"]} />
          {hasResolvedName ? (
            <>
              <Avatar
                source={contact.avatarPath}
                name={contact.name}
                size={56}
                borderRadius={borderRadius.md}
              />

              <WhiteSpace height={padding.md} />

              <Text
                size={fontSize.lg}
                weight="semiBold"
                align="center"
                color="color-colors-text-text-primary"
              >
                {contact.name}
              </Text>

              <WhiteSpace height={padding.xs} />

              <Text
                size={fontSize.md}
                align="center"
                color="color-colors-text-text-secondary"
              >
                {formattedNumber}
              </Text>
            </>
          ) : (
            <Text
              size={fontSize["2xl"]}
              weight="semiBold"
              align="center"
              color="color-colors-text-text-primary"
            >
              {formattedNumber}
            </Text>
          )}
        </View>

        <WhiteSpace height={padding.xl} />
      </View>
      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {/* Cancel Button */}
        <Button onPress={handleCancel} type="text">
          Cancel
        </Button>

        {/* Ask First Button */}
        <Button
          onPress={handleAttendedTransfer}
          type="outline"
          style={styles.buttonWrapper}
        >
          Ask First
        </Button>

        <WhiteSpace height={padding.md} />

        {/* Transfer Button */}
        <Button
          onPress={handleBlindTransfer}
          type="secondary"
          style={styles.buttonWrapper}
        >
          Transfer
        </Button>

        <WhiteSpace height={padding.md} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  content: {
    flex: 1,
    paddingHorizontal: padding["2xl"],
    alignItems: "center",
    justifyContent: "space-between"
  },
  title: {
    marginTop: padding.md,
    marginBottom: padding.md
  },
  contactSection: {
    alignItems: "center",
    width: "100%"
  },
  descriptionSection: {
    alignItems: "center",
    width: "100%",
    paddingHorizontal: padding.lg
  },
  description: {
    lineHeight: 20
  },
  buttonContainer: {
    display: "flex",
    flexDirection: "row",
    gap: padding.xs,
    paddingHorizontal: padding.md,
    paddingBottom: padding.xl
  },
  buttonWrapper: {
    flex: 1
  }
});
