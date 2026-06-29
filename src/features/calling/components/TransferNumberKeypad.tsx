import React, { useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { borderRadius, padding } from "core/theme/theme.ts";
import { Button } from "shared/components/Button.tsx";
import { Text } from "shared/components/Text.tsx";

/** Same layout as in-call DTMF keypad; used for collecting a destination number (no DTMF). */
export const TRANSFER_KEYPAD_ROWS: {
  digit: string;
  letters: string;
}[][] = [
  [
    { digit: "1", letters: "" },
    { digit: "2", letters: "ABC" },
    { digit: "3", letters: "DEF" }
  ],
  [
    { digit: "4", letters: "GHI" },
    { digit: "5", letters: "JKL" },
    { digit: "6", letters: "MNO" }
  ],
  [
    { digit: "7", letters: "PQRS" },
    { digit: "8", letters: "TUV" },
    { digit: "9", letters: "WXYZ" }
  ],
  [
    { digit: "*", letters: "" },
    { digit: "0", letters: "+" },
    { digit: "#", letters: "" }
  ]
];

/** Matches TransferContactDrawer content horizontal padding (padding["2xl"] each side). */
const CONTENT_HORIZONTAL_PAD = padding["2xl"] * 2;

type TransferNumberKeypadProps = {
  onDigitPress: (digit: string) => void;
};

/**
 * Digit grid for entering a phone number (transfer / dial destination). Does not send DTMF.
 * Key size scales from window width so the grid fits narrow screens.
 */
export function TransferNumberKeypad({ onDigitPress }: TransferNumberKeypadProps) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();

  const layout = useMemo(() => {
    const available = Math.max(0, windowWidth - CONTENT_HORIZONTAL_PAD);
    const gap = Math.min(24, Math.max(8, Math.round(windowWidth * 0.02)));
    const rawKey = Math.floor((available - 2 * gap) / 3);
    const keySize = Math.max(52, Math.min(72, rawKey));
    const digitSize = Math.round(keySize * 0.42);
    const lineHeight = Math.round(keySize * 0.5);
    const letterSize = Math.max(9, Math.min(12, Math.round(keySize * 0.17)));
    return { keySize, gap, digitSize, lineHeight, letterSize };
  }, [windowWidth]);

  return (
    <View style={styles.grid}>
      {TRANSFER_KEYPAD_ROWS.map((row, rowIndex) => (
        <View
          key={`row-${rowIndex}`}
          style={[styles.row, { gap: layout.gap, marginBottom: padding.md }]}
        >
          {row.map((key) => (
            <Button
              key={key.digit}
              onPress={() => onDigitPress(key.digit)}
              containerStyle={[
                styles.keyButtonBase,
                {
                  width: layout.keySize,
                  height: layout.keySize,
                  backgroundColor:
                    theme.colors["color-colors-background-bg-secondary"],
                  borderColor:
                    theme.colors["color-colors-border-border-secondary"],
                  borderWidth: 1
                }
              ]}
            >
              <View style={styles.keyContent}>
                <Text
                  size={layout.digitSize}
                  lineHeight={layout.lineHeight}
                  weight="bold"
                  align="center"
                  color="color-colors-text-text-primary"
                >
                  {key.digit}
                </Text>
                {!!key.letters && (
                  <Text
                    size={layout.letterSize}
                    weight="semiBold"
                    align="center"
                    color="color-colors-text-text-secondary"
                  >
                    {key.letters}
                  </Text>
                )}
              </View>
            </Button>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    alignItems: "center"
  },
  row: {
    flexDirection: "row",
    justifyContent: "center"
  },
  keyButtonBase: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 0,
    paddingVertical: 0
  },
  keyContent: {
    alignItems: "center",
    justifyContent: "center"
  }
});
