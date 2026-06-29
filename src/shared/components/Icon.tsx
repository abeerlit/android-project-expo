import React, { SVGProps } from "react";
import { TouchableOpacity, View } from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import * as Solid from "../../assets/icons/solid"; // Import all solid icons
import * as Outline from "../../assets/icons/outline";
import { toPascalCase } from "shared/utils/utils.ts";
import { Logger } from "shared/utils/Logger.ts"; // Import all outline icons
//
export interface IconProps extends SVGProps<IconProps> {
  name: string;
  size?: number;
  type?: "solid" | "outline";
  onPress?: () => void;
}

const logger = new Logger("Icon: ");

// Assert that Solid and Outline are objects with string keys and React component values
const solidIcons = Solid as Record<
  string,
  React.FC<React.SVGProps<SVGSVGElement>>
>;
const outlineIcons = Outline as Record<
  string,
  React.FC<React.SVGProps<SVGSVGElement>>
>;

function Icon({
  name,
  size = 20,
  type = "outline",
  color,
  style,
  onPress,
  ...props
}: IconProps) {
  // Hooks
  const theme = useTheme();

  // Constants
  const pascalName = toPascalCase(name);
  const IconComponent =
    type === "solid" ? solidIcons[pascalName] : outlineIcons[pascalName];
  const iconStyle = {
    color: color || theme.colors.primary,
    ...style
  };

  if (!IconComponent) {
    logger.warn(`Icon ${name} not found in ${type} type.`);
    return null; // or return a default icon
  }

  return (
    <View>
      {onPress ? (
        <TouchableOpacity onPress={onPress}>
          <IconComponent
            height={size}
            width={size}
            style={iconStyle}
            {...props}
          />
        </TouchableOpacity>
      ) : (
        <View>
          <IconComponent
            height={size}
            width={size}
            style={iconStyle}
            {...props}
          />
        </View>
      )}
    </View>
  );
}

export default Icon;
