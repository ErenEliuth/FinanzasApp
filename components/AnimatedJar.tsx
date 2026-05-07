import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Text, Easing } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop, Ellipse, Rect } from 'react-native-svg';

const AnimatedView = Animated.View;

interface Props {
    pct: number;
    tierColor: string;
    coinCount: number;
    isDark?: boolean;
    showCoinDrop?: boolean;
    showCoinRemove?: boolean;
    onAnimDone?: () => void;
}

export default function AnimatedJar({ pct, tierColor, coinCount, isDark = true, showCoinDrop, showCoinRemove, onAnimDone }: Props) {
    const waterAnim = useRef(new Animated.Value(pct)).current;
    const coinY = useRef(new Animated.Value(-80)).current;
    const coinOpacity = useRef(new Animated.Value(0)).current;
    const coinScale = useRef(new Animated.Value(0.5)).current;
    const coinRotate = useRef(new Animated.Value(0)).current;
    const handX = useRef(new Animated.Value(0)).current;
    const handY = useRef(new Animated.Value(0)).current;
    const handOpacity = useRef(new Animated.Value(0)).current;
    const removeY = useRef(new Animated.Value(0)).current;
    const removeOpacity = useRef(new Animated.Value(1)).current;
    const shimmer = useRef(new Animated.Value(0)).current;
    const bubbleY1 = useRef(new Animated.Value(0)).current;
    const bubbleY2 = useRef(new Animated.Value(0)).current;
    const bubbleOp1 = useRef(new Animated.Value(0)).current;
    const bubbleOp2 = useRef(new Animated.Value(0)).current;

    // Glass colors based on theme
    const glassStroke = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)';
    const glassFill1 = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)';
    const glassFill2 = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
    const glassFill3 = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
    const glassFill4 = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)';
    const glassHighlight = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.6)';
    const glassHighlight2 = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.3)';
    const neckFill = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
    const neckStroke = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)';
    const rimColor1 = isDark ? '#C0C0C0' : '#888';
    const rimColor2 = isDark ? '#888' : '#555';
    const shimmerColor = isDark ? '#fff' : '#000';
    const shadowEllipse = isDark ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.12)';
    const badgeBg = isDark ? '#FFF' : '#1a1a2e';
    const badgeTextColor = isDark ? '#1a1a2e' : '#FFF';
    const bubbleColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.7)';

    useEffect(() => {
        Animated.spring(waterAnim, { toValue: pct, friction: 8, tension: 40, useNativeDriver: false }).start();
    }, [pct]);

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(shimmer, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(shimmer, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])
        ).start();
    }, []);

    useEffect(() => {
        if (pct > 5) {
            const bubbleLoop = () => {
                bubbleY1.setValue(0); bubbleOp1.setValue(0.6);
                bubbleY2.setValue(0); bubbleOp2.setValue(0.4);
                Animated.parallel([
                    Animated.timing(bubbleY1, { toValue: -40, duration: 2000, useNativeDriver: true }),
                    Animated.timing(bubbleOp1, { toValue: 0, duration: 2000, useNativeDriver: true }),
                    Animated.sequence([
                        Animated.delay(800),
                        Animated.timing(bubbleY2, { toValue: -35, duration: 1800, useNativeDriver: true }),
                        Animated.timing(bubbleOp2, { toValue: 0, duration: 500, useNativeDriver: true }),
                    ]),
                ]).start(() => setTimeout(bubbleLoop, 1500));
            };
            bubbleLoop();
        }
    }, [pct > 5]);

    useEffect(() => {
        if (showCoinDrop) {
            coinY.setValue(-80);
            coinOpacity.setValue(1);
            coinScale.setValue(0.6);
            coinRotate.setValue(0);
            Animated.sequence([
                Animated.parallel([
                    Animated.timing(coinY, { toValue: 60, duration: 600, easing: Easing.bezier(0.25, 0.1, 0.25, 1), useNativeDriver: true }),
                    Animated.timing(coinScale, { toValue: 1, duration: 400, useNativeDriver: true }),
                    Animated.timing(coinRotate, { toValue: 3, duration: 600, useNativeDriver: true }),
                ]),
                Animated.timing(coinY, { toValue: 50, duration: 150, useNativeDriver: true }),
                Animated.timing(coinY, { toValue: 60, duration: 100, useNativeDriver: true }),
                Animated.parallel([
                    Animated.timing(coinY, { toValue: 90, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
                    Animated.timing(coinOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
                    Animated.timing(coinScale, { toValue: 0.7, duration: 500, useNativeDriver: true }),
                ]),
            ]).start(() => onAnimDone?.());
        }
    }, [showCoinDrop]);

    useEffect(() => {
        if (showCoinRemove) {
            handX.setValue(80);
            handY.setValue(20);
            handOpacity.setValue(0);
            removeY.setValue(0);
            removeOpacity.setValue(1);
            Animated.sequence([
                Animated.parallel([
                    Animated.timing(handOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
                    Animated.timing(handX, { toValue: 0, duration: 500, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
                ]),
                Animated.delay(200),
                Animated.parallel([
                    Animated.timing(handX, { toValue: 80, duration: 600, easing: Easing.in(Easing.quad), useNativeDriver: true }),
                    Animated.timing(handY, { toValue: -60, duration: 600, useNativeDriver: true }),
                    Animated.timing(handOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
                    Animated.timing(removeY, { toValue: -60, duration: 600, useNativeDriver: true }),
                    Animated.timing(removeOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
                ]),
            ]).start(() => onAnimDone?.());
        }
    }, [showCoinRemove]);

    const waterHeight = waterAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '78%'] });
    const shimmerOp = shimmer.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.1, 0.35, 0.1] });
    const spin = coinRotate.interpolate({ inputRange: [0, 3], outputRange: ['0deg', '1080deg'] });

    const maxCoins = Math.min(coinCount, 12);
    const coinPositions = Array.from({ length: maxCoins }, (_, i) => ({
        left: 25 + (i % 4) * 22 + (i % 2 ? 5 : 0),
        bottom: 8 + Math.floor(i / 4) * 16 + (i % 3) * 4,
    }));

    return (
        <View style={s.wrap}>
            <Svg width={160} height={240} viewBox="0 0 160 240" style={s.svg}>
                <Defs>
                    <SvgGrad id="glass" x1="0" y1="0" x2="1" y2="0">
                        <Stop offset="0" stopColor={isDark ? "#ffffff" : "#000000"} stopOpacity={isDark ? 0.15 : 0.06} />
                        <Stop offset="0.3" stopColor={isDark ? "#ffffff" : "#000000"} stopOpacity={isDark ? 0.05 : 0.03} />
                        <Stop offset="0.7" stopColor={isDark ? "#ffffff" : "#000000"} stopOpacity={isDark ? 0.08 : 0.04} />
                        <Stop offset="1" stopColor={isDark ? "#ffffff" : "#000000"} stopOpacity={isDark ? 0.2 : 0.08} />
                    </SvgGrad>
                    <SvgGrad id="rim" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={rimColor1} stopOpacity={0.8} />
                        <Stop offset="1" stopColor={rimColor2} stopOpacity={0.6} />
                    </SvgGrad>
                </Defs>
                {/* Jar body */}
                <Path d="M 35 60 C 25 70, 20 90, 20 120 L 20 190 C 20 215, 35 230, 80 230 C 125 230, 140 215, 140 190 L 140 120 C 140 90, 135 70, 125 60 Z"
                    fill="url(#glass)" stroke={glassStroke} strokeWidth="2" />
                {/* Jar neck */}
                <Rect x="40" y="38" width="80" height="22" rx="4" fill={neckFill} stroke={neckStroke} strokeWidth="1.5" />
                {/* Rim / lid */}
                <Rect x="35" y="32" width="90" height="10" rx="5" fill="url(#rim)" />
                {/* Glass highlight left */}
                <Path d="M 30 80 C 28 100, 28 140, 30 180" stroke={glassHighlight} strokeWidth="3" strokeLinecap="round" fill="none" />
                {/* Glass highlight right */}
                <Path d="M 130 90 C 132 110, 132 150, 130 175" stroke={glassHighlight2} strokeWidth="2" strokeLinecap="round" fill="none" />
                {/* Bottom shadow */}
                <Ellipse cx="80" cy="225" rx="40" ry="4" fill={shadowEllipse} />
            </Svg>

            {/* Water fill */}
            <Animated.View style={[s.water, { height: waterHeight, backgroundColor: tierColor + 'DD' }]}>
                <View style={[s.waterSurface, { backgroundColor: tierColor }]} />
                {coinPositions.map((pos, i) => (
                    <View key={i} style={[s.coinInJar, { left: pos.left, bottom: pos.bottom }]}>
                        <Text style={s.coinEmoji}>🪙</Text>
                    </View>
                ))}
                <AnimatedView style={[s.bubble, { left: '30%', transform: [{ translateY: bubbleY1 }], opacity: bubbleOp1, backgroundColor: bubbleColor }]} />
                <AnimatedView style={[s.bubble, s.bubbleSm, { left: '60%', transform: [{ translateY: bubbleY2 }], opacity: bubbleOp2, backgroundColor: bubbleColor }]} />
            </Animated.View>

            {/* Shimmer */}
            <AnimatedView style={[s.shimmer, { opacity: shimmerOp, backgroundColor: shimmerColor }]} />

            {/* Falling coin */}
            {showCoinDrop && (
                <AnimatedView style={[s.fallingCoin, {
                    transform: [{ translateY: coinY }, { scale: coinScale }, { rotate: spin }],
                    opacity: coinOpacity,
                }]}>
                    <Text style={{ fontSize: 32 }}>🪙</Text>
                </AnimatedView>
            )}

            {/* Remove coin + hand */}
            {showCoinRemove && (
                <>
                    <AnimatedView style={[s.removeCoin, {
                        transform: [{ translateY: removeY }], opacity: removeOpacity,
                    }]}>
                        <Text style={{ fontSize: 28 }}>🪙</Text>
                    </AnimatedView>
                    <AnimatedView style={[s.hand, {
                        transform: [{ translateX: handX }, { translateY: handY }], opacity: handOpacity,
                    }]}>
                        <Text style={{ fontSize: 30 }}>🤏</Text>
                    </AnimatedView>
                </>
            )}

            {/* Percentage badge */}
            <View style={[s.badge, { backgroundColor: badgeBg }]}>
                <Text style={[s.badgeText, { color: badgeTextColor }]}>{Math.round(pct)}%</Text>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    wrap: { width: 160, height: 270, alignItems: 'center', alignSelf: 'center' },
    svg: { position: 'absolute', top: 0, left: 0 },
    water: {
        position: 'absolute', bottom: 12, left: 22, right: 22,
        borderBottomLeftRadius: 40, borderBottomRightRadius: 40,
        overflow: 'hidden',
    },
    waterSurface: { height: 6, width: '100%', borderRadius: 3, opacity: 0.7 },
    coinInJar: { position: 'absolute' },
    coinEmoji: { fontSize: 16 },
    bubble: {
        position: 'absolute', bottom: 10, width: 6, height: 6, borderRadius: 3,
    },
    bubbleSm: { width: 4, height: 4, borderRadius: 2 },
    shimmer: {
        position: 'absolute', top: 65, left: 30, width: 4, height: 120, borderRadius: 2,
    },
    fallingCoin: { position: 'absolute', top: 20, alignSelf: 'center' },
    removeCoin: { position: 'absolute', top: 140, alignSelf: 'center' },
    hand: { position: 'absolute', top: 130, left: 90 },
    badge: {
        position: 'absolute', bottom: -5,
        paddingHorizontal: 16, paddingVertical: 6,
        borderRadius: 20, elevation: 6,
        shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    },
    badgeText: { fontWeight: '900', fontSize: 16 },
});
