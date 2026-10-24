import { useState, type ReactNode } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";

/** Élément qu'on atteint à la télécommande (cadre blanc, léger zoom) ou qu'on touche au téléphone. */
export function Focus({ onPress, onFocus, style, focusStyle, children, preferred, label, ring = true }: {
  onPress?: () => void; onFocus?: () => void; style?: StyleProp<ViewStyle>; focusStyle?: StyleProp<ViewStyle>;
  children: ReactNode | ((focused: boolean) => ReactNode); preferred?: boolean; label?: string; ring?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => { setFocused(true); onFocus?.(); }}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={preferred}
      accessibilityLabel={label}
      style={[style, focused && ring && { borderColor: "#fff", transform: [{ scale: 1.06 }] }, focused && focusStyle]}
    >
      {typeof children === "function" ? children(focused) : children}
    </Pressable>
  );
}
