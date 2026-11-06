import React from "react";
import { Text } from "react-native-web";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
import font from "@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf";
const face=new FontFace("GxlIonicons",`url(${font})`);face.load().then(value=>document.fonts.add(value)).catch(()=>{});
export function Ionicons({name,size=20,color,style,...props}:any){return <Text {...props} style={[{fontFamily:"GxlIonicons",fontSize:size,color,fontWeight:"normal",fontStyle:"normal"},style]}>{String.fromCodePoint((glyphs as Record<string,number>)[name]||0x25cf)}</Text>;}
