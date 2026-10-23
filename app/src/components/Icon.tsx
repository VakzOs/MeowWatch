import Svg, { Circle, Path, Rect } from "react-native-svg";

const SHAPES = {
  home: <Path d="M3 11 12 4l9 7v9h-6v-6H9v6H3z" />,
  compass: <><Circle cx="12" cy="12" r="9" /><Path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
  library: <Path d="M4 4v16M9 4v16M14 5l5 14.5" />,
  calendar: <><Rect x="3" y="5" width="18" height="16" rx="2" /><Path d="M3 10h18M8 3v4M16 3v4" /></>,
  puzzle: <Path d="M10 4a2 2 0 1 1 4 0v2h4v4h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H6v-4H4a2 2 0 1 1 0-4h2V6h4z" />,
  gear: <><Circle cx="12" cy="12" r="3" /><Path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  search: <><Circle cx="11" cy="11" r="7" /><Path d="m20 20-3.5-3.5" /></>,
  play: <Path d="M7 4v16l13-8z" fill="currentColor" />,
  back: <Path d="M15 5l-7 7 7 7" />,
  next: <Path d="M9 5l7 7-7 7" />,
  close: <Path d="M6 6l12 12M18 6 6 18" />,
  up: <Path d="m6 15 6-6 6 6" />,
  down: <Path d="m6 9 6 6 6-6" />,
  link: <Path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
};
export type IconName = keyof typeof SHAPES;

export function Icon({ name, size = 20, color = "currentColor" }: { name: IconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} color={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {SHAPES[name]}
    </Svg>
  );
}
