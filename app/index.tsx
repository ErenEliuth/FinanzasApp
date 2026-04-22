import { useAuth } from '@/utils/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SYNC_KEYS } from '@/utils/sync';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
    Animated,
    Dimensions,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    View
} from 'react-native';

const { width, height } = Dimensions.get('window');

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

        const timer = setTimeout(async () => {
            if (user) {
                // If logged in, check if setup and onboarding are done
                const isSetupDone = user.user_metadata?.currency_setup_done === true;
                const onboardingDone = await AsyncStorage.getItem(SYNC_KEYS.ONBOARDING_DONE(user.id));
                
                if (onboardingDone !== 'true') {
                    router.replace('/onboarding');
                } else if (!isSetupDone) {
                    router.replace('/currency-setup');
                } else {
                    router.replace('/(tabs)');
                }
            } else {
                const onboardingDone = await AsyncStorage.getItem('@onboarding_done');
                if (onboardingDone === 'true') {
                    router.replace('/login');
                } else {
                    router.replace('/onboarding');
                }
            }
        }, 2000);

        return () => clearTimeout(timer);
    }, [loading, user]);

    const bgColor = '#0F172A';

    return (
        <View style={[styles.root, { backgroundColor: bgColor }]}>
            <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bgColor} />

            <SafeAreaView style={styles.content}>
                <Animated.View style={[styles.brandContainer, { opacity: fade, transform: [{ translateY: slideUp }] }]}>
                    <View style={styles.logoRow}>
                        <Text style={styles.logoText}>Zenly</Text>
                        <View style={styles.accentDot} />
                    </View>
                    <View style={styles.taglineWrapper}>
                        <View style={styles.line} />
                        <Text style={styles.taglineText}>Tu Paz Financiera</Text>
                        <View style={styles.line} />
                    </View>
                </Animated.View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    brandContainer: {
        alignItems: 'center',
    },
    logoRow: {
        position: 'relative',
        marginBottom: -10,
    },
    logoText: {
        fontSize: 72,
        fontWeight: '900',
        color: '#FFFFFF',
        letterSpacing: -3,
    },
    accentDot: {
        position: 'absolute',
        top: 22,
        right: -12,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#FDBA74',
        shadowColor: '#FDBA74',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 15,
        elevation: 10,
    },
    taglineWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    taglineText: {
        fontSize: 14,
        color: '#FDBA74',
        fontWeight: '700',
        letterSpacing: 4,
        textTransform: 'uppercase',
    },
    line: {
        width: 20,
        height: 1,
        backgroundColor: 'rgba(253,186,116,0.3)',
    }
});
