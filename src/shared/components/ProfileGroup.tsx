// React Imports
import React from "react";
import { View, Image, StyleSheet, ImageSourcePropType } from "react-native";
import { borderRadius } from "core/theme/theme.ts";

// Component Imports
import image1 from "assets/images/meet-1.png";
import image2 from "assets/images/meet-2.png";
import image3 from "assets/images/meet-3.png";

export const ProfileGroup = () => {
  const images: ImageSourcePropType[] = [image1, image2, image3];

  return (
    <View style={styles.container}>
      {images.map((image, index) => (
        <View
          key={index}
          style={[
            styles.imageContainer,
            {
              width: index === 1 ? 56 : 48,
              height: index === 1 ? 56 : 48,
              marginLeft: index > 0 ? -16 : 0,
              zIndex: index == 1 ? 10 : 1,
              backgroundColor: ["#D7E3E8", "#CFCBDC", "#D6CFB7"][index]
            }
          ]}
        >
          <Image source={image} style={styles.image} resizeMode="cover" />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center"
  },
  imageContainer: {
    borderRadius: borderRadius["md"],
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#FFFFFF"
  },
  image: {
    width: "100%",
    height: "100%"
  }
});
