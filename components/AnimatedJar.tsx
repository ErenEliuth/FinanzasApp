import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Text, Easing } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop, Ellipse, Rect, Circle, G } from 'react-native-svg';

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

// Gold coin component
const GoldCoin = ({ size = 20, style }: { size?: number; style?: any }) => (
    <View style={[{ width: size, height: size }, style]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Defs>
                <SvgGrad id="coinGrad" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor="#FFD700" />
                    <Stop offset="0.3" stopColor="#FFEC80" />
                    <Stop offset="0.6" stopColor="#FFD700" />
                    <Stop offset="1" stopColor="#DAA520" />
                </SvgGrad>
            </Defs>
            <G transform="translate(12, 12) scale(1, 0.45) translate(-12, -12)">
                <Circle cx="12" cy="12" r="11" fill="url(#coinGrad)" stroke="#B8860B" strokeWidth="1.5" />
                <Circle cx="12" cy="12" r="8" fill="none" stroke="#B8860B" strokeWidth="0.5" opacity={0.4} />
                <Path d="M 10 8 L 14 8 L 13 11 L 15 11 L 10 17 L 11 13 L 9 13 Z" fill="#B8860B" opacity={0.5} />
            </G>
        </Svg>
    </View>
);

export default function AnimatedJar({ pct, tierColor, coinCount, isDark = true, showCoinDrop, showCoinRemove, onAnimDone }: Props) {
    const coinY = useRef(new Animated.Value(-80)).current;
    const coinX = useRef(new Animated.Value(75)).current;
    const coinOpacity = useRef(new Animated.Value(0)).current;
    const coinScale = useRef(new Animated.Value(0.5)).current;
    const coinRotate = useRef(new Animated.Value(0)).current;
    const handX = useRef(new Animated.Value(0)).current;
    const handY = useRef(new Animated.Value(0)).current;
    const handOpacity = useRef(new Animated.Value(0)).current;
    const removeOpacity = useRef(new Animated.Value(1)).current;
    const shimmer = useRef(new Animated.Value(0)).current;

    // Theme colors
    const glassStroke = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(60,60,60,0.3)';
    const bodyBorder = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(60,60,60,0.18)';
    const neckStroke = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(60,60,60,0.2)';
    const neckFill = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(120,120,120,0.08)';
    const rimC1 = isDark ? '#C0C0C0' : '#999';
    const rimC2 = isDark ? '#888' : '#666';
    const highlight1 = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)';
    const highlight2 = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.4)';
    const shadowFill = isDark ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.06)';
    const shimmerColor = isDark ? '#fff' : 'rgba(255,255,255,0.8)';
    const badgeBg = isDark ? '#FFF' : '#1a1a2e';
    const badgeText = isDark ? '#1a1a2e' : '#FFF';

    // Shimmer loop
    useEffect(() => {
        Animated.loop(Animated.sequence([
            Animated.timing(shimmer, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(shimmer, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])).start();
    }, []);

    // Coin drop animation
    useEffect(() => {
        if (showCoinDrop) {
            // Target is the next coin slot
            const newIndex = Math.min(coinCount, 19);
            const cols = 4;
            const row = Math.floor(newIndex / cols);
            const col = newIndex % cols;
            const offset = row % 2 === 1 ? 14 : 0;
            const targetX = 36 + col * 28 + offset;
            const targetY = 220 - row * 7;

            coinX.setValue(75);
            coinY.setValue(-80); 
            coinOpacity.setValue(1); 
            coinScale.setValue(1.5); 
            coinRotate.setValue(0);
            
            Animated.sequence([
                Animated.parallel([
                    Animated.timing(coinX, { toValue: targetX, duration: 750, easing: Easing.bezier(0.25, 0.1, 0.25, 1), useNativeDriver: true }),
                    Animated.timing(coinY, { toValue: targetY, duration: 750, easing: Easing.bounce, useNativeDriver: true }),
                    Animated.timing(coinScale, { toValue: 1, duration: 750, useNativeDriver: true }),
                    Animated.timing(coinRotate, { toValue: 2, duration: 750, useNativeDriver: true }),
                ]),
                Animated.timing(coinOpacity, { toValue: 0, duration: 0, delay: 50, useNativeDriver: true }),
            ]).start(() => onAnimDone?.());
        }
    }, [showCoinDrop]);

    // Coin remove (hand grab)
    useEffect(() => {
        if (showCoinRemove) {
            handX.setValue(80); handY.setValue(40); handOpacity.setValue(0); removeOpacity.setValue(1);
            Animated.sequence([
                Animated.parallel([
                    Animated.timing(handOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
                    Animated.timing(handX, { toValue: 5, duration: 450, easing: Easing.out(Easing.back(1.1)), useNativeDriver: true }),
                ]),
                Animated.delay(250),
                Animated.parallel([
                    Animated.timing(handX, { toValue: 90, duration: 500, easing: Easing.in(Easing.quad), useNativeDriver: true }),
                    Animated.timing(handY, { toValue: -50, duration: 500, useNativeDriver: true }),
                    Animated.timing(handOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
                    Animated.timing(removeOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
                ]),
            ]).start(() => onAnimDone?.());
        }
    }, [showCoinRemove]);

    const shimmerOp = shimmer.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.05, 0.3, 0.05] });
    const spin = coinRotate.interpolate({ inputRange: [0, 4], outputRange: ['0deg', '1440deg'] });

    // Coin layout inside jar - stacking from bottom
    const maxCoins = Math.min(coinCount, 20);
    const cols = 4;
    const coinSize = 24;
    const coinPositions = Array.from({ length: maxCoins }, (_, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const offset = row % 2 === 1 ? 14 : 0; // Stagger odd rows
        return {
            x: 36 + col * 28 + offset,
            y: 220 - row * 7,
        };
    });

    return (
        <View style={s.wrap}>
            {/* SVG Glass Jar */}
            <Svg width={180} height={250} viewBox="0 0 180 250" style={s.svg}>
                <Defs>
                    <SvgGrad id="glass" x1="0" y1="0" x2="1" y2="0">
                        <Stop offset="0" stopColor={isDark ? "#fff" : "#333"} stopOpacity={isDark ? 0.12 : 0.08} />
                        <Stop offset="0.35" stopColor={isDark ? "#fff" : "#333"} stopOpacity={isDark ? 0.04 : 0.02} />
                        <Stop offset="0.65" stopColor={isDark ? "#fff" : "#333"} stopOpacity={isDark ? 0.06 : 0.03} />
                        <Stop offset="1" stopColor={isDark ? "#fff" : "#333"} stopOpacity={isDark ? 0.15 : 0.1} />
                    </SvgGrad>
                    <SvgGrad id="rim" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={rimC1} stopOpacity={0.9} />
                        <Stop offset="1" stopColor={rimC2} stopOpacity={0.7} />
                    </SvgGrad>
                    <SvgGrad id="coinGradInner" x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0" stopColor="#FFD700" />
                        <Stop offset="0.3" stopColor="#FFEC80" />
                        <Stop offset="0.6" stopColor="#FFD700" />
                        <Stop offset="1" stopColor="#DAA520" />
                    </SvgGrad>
                </Defs>
                {/* Jar back/body */}
                <Path d="M 42 65 C 30 78, 25 95, 25 125 L 25 195 C 25 222, 42 238, 90 238 C 138 238, 155 222, 155 195 L 155 125 C 155 95, 150 78, 138 65 Z"
                    fill="url(#glass)" stroke={glassStroke} strokeWidth="2.5" />
                
                {/* Coins rendered directly inside SVG so they are contained and behind highlights */}
                {coinPositions.map((pos, i) => (
                    <Svg key={`coin-${i}`} x={pos.x} y={pos.y} width={coinSize} height={coinSize} viewBox="0 0 24 24">
                        <G transform="translate(12, 12) scale(1, 0.45) translate(-12, -12)">
                            <Circle cx="12" cy="12" r="11" fill="url(#coinGradInner)" stroke="#B8860B" strokeWidth="1.5" />
                            <Circle cx="12" cy="12" r="8" fill="none" stroke="#B8860B" strokeWidth="0.5" opacity={0.4} />
                            <Path d="M 10 8 L 14 8 L 13 11 L 15 11 L 10 17 L 11 13 L 9 13 Z" fill="#B8860B" opacity={0.5} />
                        </G>
                    </Svg>
                ))}

                {/* Neck */}
                <Rect x="48" y="42" width="84" height="24" rx="5" fill={neckFill} stroke={neckStroke} strokeWidth="1.5" />
                {/* Lid */}
                <Rect x="42" y="34" width="96" height="12" rx="6" fill="url(#rim)" />
                {/* Highlight left */}
                <Path d="M 35 85 C 32 110, 32 150, 35 190" stroke={highlight1} strokeWidth="3" strokeLinecap="round" fill="none" />
                {/* Highlight right */}
                <Path d="M 145 95 C 148 120, 148 160, 145 185" stroke={highlight2} strokeWidth="2" strokeLinecap="round" fill="none" />
                {/* Shadow */}
                <Ellipse cx="90" cy="234" rx="45" ry="5" fill={shadowFill} />
            </Svg>

            {/* Shimmer */}
            <AnimatedView style={[s.shimmer, { opacity: shimmerOp, backgroundColor: shimmerColor }]} />

            {/* Falling coin animation */}
            {showCoinDrop && (
                <AnimatedView style={[s.fallingCoin, {
                    transform: [{ translateX: coinX }, { translateY: coinY }, { scale: coinScale }, { rotate: spin }],
                    opacity: coinOpacity,
                }]}>
                    <GoldCoin size={24} />
                </AnimatedView>
            )}

            {/* Remove coin + hand */}
            {showCoinRemove && (
                <AnimatedView style={[s.hand, {
                    transform: [{ translateX: handX }, { translateY: handY }],
                    opacity: handOpacity,
                }]}>
                    <Text style={{ fontSize: 32 }}>🤏</Text>
                    <AnimatedView style={{ position: 'absolute', top: -5, left: -5, opacity: removeOpacity }}>
                        <GoldCoin size={22} />
                    </AnimatedView>
                </AnimatedView>
            )}

            {/* Percentage badge */}
            <View style={[s.badge, { backgroundColor: badgeBg }]}>
                <Text style={[s.badgeText, { color: badgeText }]}>{Math.round(pct)}%</Text>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    wrap: { width: 180, height: 280, alignItems: 'center', alignSelf: 'center' },
    svg: { position: 'absolute', top: 0, left: 0 },
    shimmer: {
        position: 'absolute', top: 70, left: 36, width: 3, height: 130, borderRadius: 2,
    },
    fallingCoin: { position: 'absolute', top: 0, left: 0 },
    hand: { position: 'absolute', top: 140, left: 80 },
    badge: {
        position: 'absolute', bottom: 0,
        paddingHorizontal: 18, paddingVertical: 7,
        borderRadius: 20, elevation: 6,
        shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    },
    badgeText: { fontWeight: '900', fontSize: 17 },
});
