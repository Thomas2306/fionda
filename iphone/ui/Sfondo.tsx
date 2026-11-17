// Sfondo di Fionda: notte viola con due grandi luci morbide e stelline che respirano piano.
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Scintilla } from './Icona';

export function Sfondo() {
  const { width: W, height: H } = useWindowDimensions();
  const respiro = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(respiro, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(respiro, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [respiro]);
  // stelline sempre nello stesso posto (niente salti tra un rendering e l'altro)
  const stelle = useMemo(() => {
    let s = 7;
    const caso = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 22 }, () => ({ x: caso() * W, y: caso() * H, d: 5 + caso() * 7, fase: caso() }));
  }, [W, H]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="luce1" cx="15%" cy="8%" rx="75%" ry="45%">
            <Stop offset="0" stopColor="#5B3BFF" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#07070F" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="luce2" cx="95%" cy="85%" rx="70%" ry="40%">
            <Stop offset="0" stopColor="#14A9DE" stopOpacity="0.28" />
            <Stop offset="1" stopColor="#07070F" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width={W} height={H} fill="#07070F" />
        <Rect width={W} height={H} fill="url(#luce1)" />
        <Rect width={W} height={H} fill="url(#luce2)" />
      </Svg>
      {stelle.map((st, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', left: st.x, top: st.y,
          opacity: respiro.interpolate({ inputRange: [0, 1], outputRange: st.fase > 0.5 ? [0.15, 0.6] : [0.6, 0.12] }),
        }}>
          <Scintilla dim={st.d} colore={i % 3 ? '#BBA8FF' : '#8EF0FF'} />
        </Animated.View>
      ))}
    </View>
  );
}
