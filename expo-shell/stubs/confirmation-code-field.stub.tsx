/**
 * Fallback only if Metro aliases this package — mirrors real CodeField tap/focus behavior.
 */
import React, { useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextInputProps
} from "react-native";

export const Cursor = () => null;

type CellLayout = { x: number; xEnd: number; y: number; yEnd: number };

function findCellIndex(
  locationX: number,
  locationY: number,
  map: Record<string, CellLayout>
): number {
  for (const [index, { x, y, xEnd, yEnd }] of Object.entries(map)) {
    if (x < locationX && locationX < xEnd && y < locationY && locationY < yEnd) {
      return parseInt(index, 10);
    }
  }
  return -1;
}

export function useClearByFocusCell(options: {
  value: string;
  setValue: (v: string) => void;
}) {
  const valueRef = useRef(options);
  const cellsLayouts = useRef<Record<string, CellLayout>>({});
  valueRef.current = options;

  const getCellOnLayoutHandler = (index: number) => (event: LayoutChangeEvent) => {
    const { width, height, x, y } = event.nativeEvent.layout;
    cellsLayouts.current[`${index}`] = {
      x,
      xEnd: x + width,
      y,
      yEnd: y + height
    };
  };

  const clearCodeByCoords = (locationX: number, locationY: number) => {
    const index = findCellIndex(locationX, locationY, cellsLayouts.current);
    if (index !== -1) {
      const { value, setValue } = valueRef.current;
      setValue((value || "").slice(0, index));
    }
  };

  const rootProps = useMemo(
    () =>
      Platform.select({
        default: {
          onPressOut: (e: NativeSyntheticEvent<{ locationX: number; locationY: number }>) => {
            clearCodeByCoords(e.nativeEvent.locationX, e.nativeEvent.locationY);
          }
        }
      }) ?? {},
    []
  );

  return [rootProps, getCellOnLayoutHandler] as const;
}

export function useBlurOnFulfill(_opts: { value: string; cellCount: number }) {
  return useRef<TextInput>(null);
}

type CodeFieldProps = TextInputProps & {
  value: string;
  onChangeText: (text: string) => void;
  cellCount: number;
  renderCell: (opts: {
    index: number;
    symbol: string;
    isFocused: boolean;
  }) => React.ReactNode;
  rootStyle?: object;
};

export function CodeField({
  value,
  onChangeText,
  cellCount,
  renderCell,
  rootStyle,
  ...rest
}: CodeFieldProps) {
  const [focused, setFocused] = useState(false);
  const symbols = useMemo(() => {
    const chars = (value || "").split("");
    while (chars.length < cellCount) chars.push("");
    return chars.slice(0, cellCount);
  }, [value, cellCount]);

  return (
    <View style={[styles.root, rootStyle]}>
      {symbols.map((symbol, index) => {
        const isFirstEmpty = symbols.indexOf("") === index;
        return (
          <React.Fragment key={index}>
            {renderCell({
              index,
              symbol,
              isFocused: focused && isFirstEmpty
            })}
          </React.Fragment>
        );
      })}
      <TextInput
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/\D/g, "").slice(0, cellCount))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        maxLength={cellCount}
        caretHidden
        style={styles.textInput}
        accessibilityLabel="Verification code"
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    justifyContent: "space-between",
    position: "relative"
  },
  textInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.02,
    fontSize: 1,
    color: "transparent"
  }
});
