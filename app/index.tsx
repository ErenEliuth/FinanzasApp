import { useAuth } from '@/utils/auth';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
    Animated,
    Dimensions,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

const { width, height } = Dimensions.get('window');

/**
 * Simplest possible WelcomeScreen:
 * - Minimalist visual (clean icon)
 * - Clear headline
 * - Single direct action button
 */
export default function WelcomeScreen() {
    const router = useRouter();
    const { user, loading, theme } = useAuth();
    const isDark = theme === 'dark';

    const fade = useRef(new Animated.Value(0)).current;
    const slideUp = useRef(new Animated.Value(30)).current;

    useEffect(() => {
        if (loading) return;

        Animated.parallel([
            Animated.timing(fade, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.timing(slideUp, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]).start();
    }, [loading]);

    const handleStart = () => {
        router.push(user ? '/(tabs)' : '/login');
    };

    const bgColor = isDark ? '#0F172A' : '#FFFFFF';
    const textColor = isDark ? '#F8FAFC' : '#1E293B';
    const subColor = isDark ? '#94A3B8' : '#64748B';
    const cardBg = isDark ? '#1E293B' : '#F5F3FF';

    return (
        <View style={[styles.root, { backgroundColor: bgColor }]}>
            <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bgColor} />

            {/* ── Visual Section ─────────────────────────────── */}
            <View style={styles.visual}>
                <Animated.View style={[styles.iconContainer, { opacity: fade }]}>
                    <View style={[styles.iconBackground, { backgroundColor: cardBg }]}>
                        <Ionicons name="wallet-outline" size={60} color="#7C3AED" />
                    </View>
                </Animated.View>
            </View>

            {/* ── Content Section ────────────────────────────── */}
            <SafeAreaView style={styles.content}>
                <Animated.View style={{ opacity: fade, transform: [{ translateY: slideUp }] }}>

                    <Text style={[styles.headline, { color: textColor }]}>
                        Gestiona tu dinero{'\n'}
                        <Text style={styles.headlineAccent}>fácilmente.</Text>
                    </Text>

                    <Text style={[styles.sub, { color: subColor }]}>
                        Toma el control de tus finanzas personales con una herramienta simple y segura.
                    </Text>

                    {/* Action Button */}
                    <TouchableOpacity style={styles.btn} onPress={handleStart} activeOpacity={0.8}>
                        <Text style={styles.btnText}>Continuar</Text>
                        <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                </Animated.View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },

    // Visual Area: Centered and clean
    visual: {
        height: height * 0.45,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconContainer: {
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
    },
    iconBackground: {
        width: 140,
        height: 140,
        borderRadius: 70,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Content Area
    content: {
        flex: 1,
        paddingHorizontal: 32,
        justifyContent: 'flex-start',
    },
    headline: {
        fontSize: 34,
        fontWeight: '800',
        lineHeight: 42,
        letterSpacing: -0.5,
        marginBottom: 16,
    },
    headlineAccent: {
        color: '#7C3AED'
    },
    sub: {
        fontSize: 16,
        lineHeight: 24,
        marginBottom: 44,
        maxWidth: '92%',
    },

    // Refined Button: Solid Primary Color
    btn: {
        backgroundColor: '#7C3AED',
        borderRadius: 18,
        height: 62,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
        gap: 8,
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 8,
    },
    btnText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF'
    },
});
