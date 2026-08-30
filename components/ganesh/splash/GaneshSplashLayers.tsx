import { StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";

import { GANESH_SPLASH } from "./ganeshSplashTheme";

export function MandalaLayer({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Circle cx={100} cy={100} r={92} stroke={GANESH_SPLASH.goldFaint} strokeWidth={0.8} fill="none" />
      <Circle cx={100} cy={100} r={74} stroke={GANESH_SPLASH.goldFaint} strokeWidth={0.6} fill="none" />
      <Circle cx={100} cy={100} r={52} stroke={GANESH_SPLASH.goldSoft} strokeWidth={0.7} fill="none" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        const x = 100 + Math.cos(a) * 80;
        const y = 100 + Math.sin(a) * 80;
        return <Circle key={i} cx={x} cy={y} r={2.2} fill={GANESH_SPLASH.goldFaint} />;
      })}
    </Svg>
  );
}

export function LightRaysLayer({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const x2 = 100 + Math.cos(a) * 96;
        const y2 = 100 + Math.sin(a) * 96;
        return (
          <Path
            key={i}
            d={`M100 100 L${x2.toFixed(1)} ${y2.toFixed(1)}`}
            stroke={GANESH_SPLASH.goldFaint}
            strokeWidth={1.2}
            strokeLinecap="round"
          />
        );
      })}
    </Svg>
  );
}

export function ToranLayer({ width }: { width: number }) {
  const count = 11;
  const gap = width / (count + 1);
  return (
    <Svg width={width} height={36} viewBox={`0 0 ${width} 36`}>
      <Path
        d={`M0 8 Q${width / 2} 22 ${width} 8`}
        stroke={GANESH_SPLASH.goldSoft}
        strokeWidth={1.5}
        fill="none"
      />
      {Array.from({ length: count }, (_, i) => {
        const x = gap * (i + 1);
        return (
          <Circle
            key={i}
            cx={x}
            cy={16 + (i % 2) * 5}
            r={i % 2 === 0 ? 5.5 : 4.2}
            fill={i % 2 === 0 ? GANESH_SPLASH.saffron : GANESH_SPLASH.gold}
            opacity={0.85}
          />
        );
      })}
    </Svg>
  );
}

function Bell({ x }: { x: number }) {
  return (
    <>
      <Path d={`M${x} 0 L${x} 10`} stroke={GANESH_SPLASH.gold} strokeWidth={1.2} />
      <Path
        d={`M${x - 7} 12 Q${x} 8 ${x + 7} 12 L${x + 6} 20 Q${x} 26 ${x - 6} 20 Z`}
        fill={GANESH_SPLASH.gold}
        opacity={0.9}
      />
      <Circle cx={x} cy={24} r={1.6} fill={GANESH_SPLASH.ivory} />
    </>
  );
}

export function BellsLayer({ width }: { width: number }) {
  return (
    <Svg width={width} height={32} viewBox={`0 0 ${width} 32`}>
      <Bell x={18} />
      <Bell x={width - 18} />
    </Svg>
  );
}

export function DiyaLayer({ size }: { size: number }) {
  return (
    <Svg width={size} height={size * 0.7} viewBox="0 0 48 34">
      <Ellipse cx={24} cy={26} rx={16} ry={6} fill={GANESH_SPLASH.goldSoft} />
      <Path d="M8 24 Q24 32 40 24 Q24 20 8 24Z" fill={GANESH_SPLASH.gold} />
      <Path d="M24 22 C22 14 26 8 24 4 C26 10 28 16 24 22Z" fill={GANESH_SPLASH.saffron} />
      <Circle cx={24} cy={8} r={2.2} fill={GANESH_SPLASH.ivory} opacity={0.85} />
    </Svg>
  );
}

export function Petal({ color }: { color: string }) {
  return (
    <View style={[styles.petal, { backgroundColor: color }]} />
  );
}

const styles = StyleSheet.create({
  petal: {
    width: 7,
    height: 10,
    borderRadius: 8,
    borderCurve: "continuous",
  },
});
