import { Image, type ImageStyle, type StyleProp } from "react-native";

import { GANESH_ART, type GaneshArtName } from "./sources";

export function GaneshArt({
  name,
  width,
  height,
  opacity,
  style,
  resizeMode = "contain",
}: {
  name: GaneshArtName;
  width?: number;
  height?: number;
  opacity?: number;
  style?: StyleProp<ImageStyle>;
  resizeMode?: "contain" | "cover";
}) {
  return (
    <Image
      source={GANESH_ART[name]}
      resizeMode={resizeMode}
      style={[{ width, height, opacity }, style]}
    />
  );
}
