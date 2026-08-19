import React, { ReactNode } from "react";
import {
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle
} from "react-native";
import LoginBG from "assets/bg/bg_grid.svg";
import Icon from "shared/components/Icon.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { Text } from "shared/components/Text.tsx";
import { useTheme } from "hooks/use-theme.ts";
import { useNavigation } from "@react-navigation/core";
import RippleBG from "assets/bg/bg_ripple_full.svg";

export type IconBackgroundHeaderProps = {
  icon: string;
  iconType?: "solid" | "outline";
  bg: "box" | "circle";
  mainHeader?: string | ReactNode;
  secondHeader: string | ReactNode;
  iconWidth: number;
  iconHeight: number;
  backgroundStyle?: StyleProp<ViewStyle>;
  backgroundIconStyle?: StyleProp<ViewStyle>;
};

export function IconBackgroundHeader({
  icon,
  iconType,
  bg,
  mainHeader,
  secondHeader,
  iconWidth,
  iconHeight,
  backgroundStyle,
  backgroundIconStyle
}: IconBackgroundHeaderProps) {
  const navigation = useNavigation();
  const theme = useTheme();

  const getBackground = () => {
    switch (bg) {
      case "box":
        return (
          <View style={backgroundStyle}>
            <LoginBG
              width={iconWidth}
              height={iconHeight}
              stroke={theme.colors.backgroundSvg}
            />
          </View>
        );
      case "circle":
        return (
          <View style={backgroundStyle}>
            <RippleBG
              width={iconWidth}
              height={iconHeight}
              stroke={theme.colors.backgroundSvg}
              style={backgroundIconStyle}
            />
          </View>
        );
    }
  };
  return (
    <View>
      {getBackground()}
      <TouchableOpacity
        onPress={() => {
          navigation.goBack();
        }}
        style={styles.crossIcon}
      >
        <Icon
          name={"x-close"}
          type={"outline"}
          size={30}
          stroke={theme.colors.backgroundSvgHighOpacity}
        />
      </TouchableOpacity>
      <WhiteSpace height={25} />
      <View style={styles.container}>
        <View
          style={[
            styles.iconContainer,
            {
              borderColor: theme.colors.backgroundSvgHighOpacity,
              backgroundColor: theme.colors.backgroundColor
            }
          ]}
        >
          <Icon name={icon} type={iconType} size={20} />
        </View>
        <WhiteSpace height={10} />
        {mainHeader && (
          <View>
            <WhiteSpace height={20} />
            <Text weight={"medium"} size={20}>
              {mainHeader}
            </Text>
          </View>
        )}
        <WhiteSpace height={10} />
        <Text size={15}>{secondHeader}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    display: "flex",
    flexDirection: "column"
  },
  iconContainer: {
    width: 40,
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10
  },
  crossIcon: {
    position: "absolute",
    right: 20,
    top: 32.5,
    zIndex: 1
  }
});
