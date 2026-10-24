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
  pause: <Path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" fill="currentColor" />,
  volume: <><Path d="M4 9v6h4l5 4V5L8 9z" /><Path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></>,
  mute: <><Path d="M4 9v6h4l5 4V5L8 9z" /><Path d="m17 9 5 6M22 9l-5 6" /></>,
  fullscreen: <Path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  shrink: <Path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" />,
  cc: <><Rect x="3" y="5" width="18" height="14" rx="2.5" /><Path d="M10.5 10.2a2.2 2.2 0 1 0 0 3.6M17 10.2a2.2 2.2 0 1 0 0 3.6" /></>,
  audio: <><Path d="M4 12a8 8 0 0 1 16 0v5a2 2 0 0 1-2 2h-1v-6h3M4 13h3v6H6a2 2 0 0 1-2-2z" /></>,
  speed: <><Path d="M4.5 17a8.5 8.5 0 1 1 15 0" /><Path d="m12 13 4-4" /></>,
  rewind: <><Path d="M3 12a9 9 0 1 0 3-6.7" /><Path d="M3 4v5h5" /><Path d="M10 9.5v5M13.5 9.5h2.5v5h-2.5z" /></>,
  forward: <><Path d="M21 12a9 9 0 1 1-3-6.7" /><Path d="M21 4v5h-5" /><Path d="M8 9.5v5M11.5 9.5H14v5h-2.5z" /></>,
  layers: <><Path d="m12 3 9 5-9 5-9-5z" /><Path d="m3 13 9 5 9-5" /></>,
  skip: <><Path d="M5 5v14l10-7z" fill="currentColor" /><Path d="M19 5v14" /></>,
  plus: <Path d="M12 5v14M5 12h14" />,
  check: <Path d="m5 12.5 4.5 4.5L19 7" />,
  link: <Path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  user: <><Circle cx="12" cy="8" r="4" /><Path d="M4 21c1-4 4.5-6 8-6s7 2 8 6" /></>,
  screen: <><Rect x="3" y="5" width="18" height="14" rx="2" /><Path d="m10 9 5 3-5 3z" /></>,
  shield: <Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  sync: <Path d="M20 12a8 8 0 0 1-14 5M4 12a8 8 0 0 1 14-5M18 3v4h-4M6 21v-4h4" />,
  globe: <><Circle cx="12" cy="12" r="9" /><Path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  people: <><Circle cx="9" cy="8" r="3.5" /><Path d="M2.5 20c.8-3.5 3.5-5 6.5-5s5.7 1.5 6.5 5" /><Circle cx="17" cy="9" r="2.5" /><Path d="M17 14c2.5 0 4 1.4 4.5 4" /></>,
  info: <><Circle cx="12" cy="12" r="9" /><Path d="M12 11v6M12 7.5v.5" /></>,
};
export type IconName = keyof typeof SHAPES;

export function Icon({ name, size = 20, color = "currentColor" }: { name: IconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} color={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {SHAPES[name]}
    </Svg>
  );
}
