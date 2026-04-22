import { useAuth } from '@/utils/auth';
import { syncUp, SYNC_KEYS } from '@/utils/sync';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    FlatList,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width, height } = Dimensions.get('window');

const SLIDES = [
    {
        id: '1',
        emoji: '💰',
        title: 'Controla tus Finanzas',
        desc: 'Registra tus ingresos y gastos en segundos. Visualiza a dónde va tu dinero con gráficos claros e intuitivos.',
        gradient: ['#6366F1', '#4F46E5'],
    },
    {
        id: '2',
        emoji: '🎯',
        title: 'Metas de Ahorro',
        desc: 'Crea metas personalizadas y observa tu progreso en tiempo real. Ahorra para lo que más importa.',
        gradient: ['#10B981', '#059669'],
    },
    {
        id: '3',
        emoji: '🔔',
        title: 'Nunca Pierdas un Pago',
        desc: 'Recibe alertas inteligentes antes de las fechas de corte y pago de tus tarjetas, deudas y suscripciones.',
        gradient: ['#F59E0B', '#D97706'],
    },
];

export default function OnboardingScreen() {
    const router = useRouter();
    const flatListRef = useRef<FlatList>(null);
    const scrollX = useRef(new Animated.Value(0)).current;
    const { user } = useAuth();
    const [currentIndex, setCurrentIndex] = useState(0);

    React.useEffect(() => {
        if (user?.id) {
            const checkStatus = async () => {
                const done = await AsyncStorage.getItem(SYNC_KEYS.ONBOARDING_DONE(user.id));
                const isSetupDone = user.user_metadata?.currency_setup_done === true;
                if (done === 'true' && isSetupDone) {
                    router.replace('/(tabs)');
                }
            };
            checkStatus();
        }
    }, [user]);

    const handleNext = () => {
        if (currentIndex < SLIDES.length - 1) {
            flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
            setCurrentIndex(currentIndex + 1);
        } else {
            completeOnboarding();
        }
    };

    const handleSkip = () => {
        completeOnboarding();
    };

    const completeOnboarding = async () => {
        if (user?.id) {
            await AsyncStorage.setItem(SYNC_KEYS.ONBOARDING_DONE(user.id), 'true');
            await syncUp(user.id);
            router.replace('/(tabs)');
        } else {
            await AsyncStorage.setItem('@onboarding_done', 'true');
            router.replace('/login');
        }
    };

    const renderSlide = ({ item, index }: { item: typeof SLIDES[0]; index: number }) => {
        const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
        const scale = scrollX.interpolate({ inputRange, outputRange: [0.8, 1, 0.8], extrapolate: 'clamp' });
        const opacity = scrollX.interpolate({ inputRange, outputRange: [0.4, 1, 0.4], extrapolate: 'clamp' });
        const translateY = scrollX.interpolate({ inputRange, outputRange: [30, 0, 30], extrapolate: 'clamp' });

        return (
            <View style={[styles.slide, { width }]}>
                <Animated.View style={[styles.emojiContainer, { transform: [{ scale }, { translateY }], opacity }]}>
                    <View style={[styles.emojiBg, { backgroundColor: item.gradient[0] + '20' }]}>
                        <Text style={styles.emoji}>{item.emoji}</Text>
                    </View>
                </Animated.View>

                <Animated.View style={{ opacity, transform: [{ translateY }] }}>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.desc}>{item.desc}</Text>
                </Animated.View>
            </View>
        );
    };

    const isLast = currentIndex === SLIDES.length - 1;

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

            {/* Skip Button */}
            {!isLast && (
                <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
                    <Text style={styles.skipText}>Omitir</Text>
                </TouchableOpacity>
            )}

            {/* Slides */}
            <Animated.FlatList
                ref={flatListRef}
                data={SLIDES}
                renderItem={renderSlide}
                keyExtractor={(item: { id: string; emoji: string; title: string; desc: string; gradient: string[] }) => item.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                bounces={false}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                    { useNativeDriver: false }
                )}
                onMomentumScrollEnd={(e: any) => {
                    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
                    setCurrentIndex(idx);
                }}
            />

            {/* Bottom area */}
            <View style={styles.bottomArea}>
                {/* Dots */}
                <View style={styles.dotsRow}>
                    {SLIDES.map((_, i) => {
                        const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
                        const dotWidth = scrollX.interpolate({ inputRange, outputRange: [8, 28, 8], extrapolate: 'clamp' });
                        const dotOpacity = scrollX.interpolate({ inputRange, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' });

                        return (
                            <Animated.View
                                key={i}
                                style={[styles.dot, { width: dotWidth, opacity: dotOpacity, backgroundColor: SLIDES[currentIndex].gradient[0] }]}
                            />
                        );
                    })}
                </View>

                {/* CTA Button */}
                <TouchableOpacity
                    style={[
                        styles.ctaBtn, 
                        { backgroundColor: SLIDES[currentIndex]?.gradient[0] || '#6366F1' },
                        Platform.OS === 'web' && { cursor: 'pointer' } as any
                    ]}
                    onPress={handleNext}
                    activeOpacity={0.85}
                >
                    <Text style={styles.ctaText}>{isLast ? '¡Empezar!' : 'Siguiente'}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F172A',
    },
    skipBtn: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 60 : 50,
        right: 24,
        zIndex: 10,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    skipText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        fontWeight: '600',
    },
    slide: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    emojiContainer: {
        marginBottom: 40,
    },
    emojiBg: {
        width: 140,
        height: 140,
        borderRadius: 70,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emoji: {
        fontSize: 72,
    },
    title: {
        fontSize: 32,
        fontWeight: '900',
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: 16,
        letterSpacing: -0.5,
    },
    desc: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        lineHeight: 24,
    },
    bottomArea: {
        paddingHorizontal: 24,
        paddingBottom: Platform.OS === 'ios' ? 50 : 40,
        alignItems: 'center',
    },
    dotsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 32,
    },
    dot: {
        height: 8,
        borderRadius: 4,
    },
    ctaBtn: {
        width: '100%',
        paddingVertical: 18,
        borderRadius: 20,
        alignItems: 'center',
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    ctaText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '800',
    },
});
