declare module "*.svg" {
  import type { FC } from "react";
  import type { SvgProps } from "react-native-svg";
  const content: FC<SvgProps>;
  export default content;
}

declare module "*.png" {
  const value: number;
  export default value;
}

declare module "assets/*" {
  const value: number;
  export default value;
}
