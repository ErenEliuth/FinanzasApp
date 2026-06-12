import { useAuth } from '@/utils/auth';
import { supabase } from '@/utils/supabase';
import { Feather } from '@expo/vector-icons';
import { useThemeColors } from '@/hooks/useThemeColors';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
    Dimensions,
    StatusBar,
} from 'react-native';

const { width, height } = Dimensions.get('window');

type Mode = 'login' | 'register' | 'forgot';

export default function LoginScreen() {
    const { login, register } = useAuth();
    const colors = useThemeColors();
    const isDark = colors.isDark;

    const [mode, setMode] = useState<Mode>('login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const switchMode = (m: Mode) => {
        setMode(m);
        setError('');
        setSuccessMsg('');
        setName('');
        setEmail('');
        setPassword('');
    };

    const handleSubmit = async () => {
        setError('');
        setSuccessMsg('');
        setLoading(true);
        Keyboard.dismiss();

        if (mode === 'forgot') {
            try {
                const { error: resetError } = await supabase.auth.resetPasswordForEmail(
                    email.trim().toLowerCase(),
                    { redirectTo: 'appmobile://reset-password' }
                );
                setLoading(false);
                if (resetError) {
                    setError(resetError.message);
                } else {
                    setSuccessMsg('¡Enlace enviado! Revisa tu correo electrónico para restablecer tu contraseña.');
                }
            } catch (e: any) {
                setLoading(false);
                setError(e.message || 'Error al enviar el correo de recuperación.');
            }
            return;
        }

        const result = mode === 'login'
            ? await login(email, password)
            : await register(name, email, password);

        setLoading(false);

        if (!result.success) {
            setError(result.message);
        } else if (mode === 'register') {
            setSuccessMsg('¡Cuenta creada! Revisa tu correo si es necesario confirmarla.');
        }
    };

    const isValid =
        mode === 'login'
            ? email.trim().length > 0 && password.length >= 6
            : mode === 'register'
            ? name.trim().length > 0 && email.trim().length > 0 && password.length >= 6
            : email.trim().length > 0;

    const content = (
        <View style={styles.container}>
            <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
            
            <SafeAreaView style={{ flex: 1 }}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <ScrollView
                        contentContainerStyle={styles.scroll}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {/* ── Header ── */}
                        <View style={styles.header}>
                            <View style={styles.logoShadowWrap}>
                                <Image
                                    source={require('@/assets/images/icon.png')}
                                    style={styles.logoImg}
                                    resizeMode="contain"
                                />
                            </View>
                            <Text style={[styles.headerTitle, { color: isDark ? '#FFF' : '#0F172A' }]}>Zenly</Text>
                            <Text style={[styles.headerSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                                {mode === 'login' ? 'Bienvenido de nuevo' : mode === 'register' ? 'Crea tu futuro financiero' : 'Recupera el acceso a tu cuenta'}
                            </Text>
                        </View>

                        {/* ── Form Card ── */}
                        <View style={[styles.formCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                            {/* ── Tabs ── */}
                            {mode !== 'forgot' && (
                                <View style={[styles.tabContainer, { backgroundColor: isDark ? '#0F172A50' : '#F1F5F9' }]}>
                                    <TouchableOpacity
                                        style={[styles.tab, mode === 'login' && [styles.tabActive, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]]}
                                        onPress={() => switchMode('login')}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive, { color: isDark ? (mode === 'login' ? '#FFF' : '#94A3B8') : (mode === 'login' ? '#0F172A' : '#64748B') }]}>
                                            Entrar
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.tab, mode === 'register' && [styles.tabActive, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]]}
                                        onPress={() => switchMode('register')}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive, { color: isDark ? (mode === 'register' ? '#FFF' : '#94A3B8') : (mode === 'register' ? '#0F172A' : '#64748B') }]}>
                                            Registro
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            <View style={styles.formFields}>
                                {mode === 'forgot' && (
                                    <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 14, fontWeight: '500', marginBottom: 8, textAlign: 'center', lineHeight: 20 }}>
                                        Ingresa tu correo electrónico y te enviaremos un enlace seguro para restablecer tu contraseña.
                                    </Text>
                                )}

                                {mode === 'register' && (
                                    <View style={[styles.inputField, { borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                                        <Feather name="user" size={18} color="#94A3B8" />
                                        <TextInput
                                            style={[styles.input, { color: isDark ? '#FFF' : '#0F172A' }]}
                                            placeholder="Nombre completo"
                                            placeholderTextColor="#94A3B8"
                                            value={name}
                                            onChangeText={setName}
                                            autoCapitalize="words"
                                        />
                                    </View>
                                )}

                                <View style={[styles.inputField, { borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                                    <Feather name="mail" size={18} color="#94A3B8" />
                                    <TextInput
                                        style={[styles.input, { color: isDark ? '#FFF' : '#0F172A' }]}
                                        placeholder="Email"
                                        placeholderTextColor="#94A3B8"
                                        value={email}
                                        onChangeText={setEmail}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                    />
                                </View>

                                {mode !== 'forgot' && (
                                    <View style={[styles.inputField, { borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                                        <Feather name="lock" size={18} color="#94A3B8" />
                                        <TextInput
                                            style={[styles.input, { color: isDark ? '#FFF' : '#0F172A' }]}
                                            placeholder="Contraseña"
                                            placeholderTextColor="#94A3B8"
                                            value={password}
                                            onChangeText={setPassword}
                                            secureTextEntry={!showPass}
                                        />
                                        <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                                            <Feather name={showPass ? 'eye-off' : 'eye'} size={18} color="#94A3B8" />
                                        </TouchableOpacity>
                                    </View>
                                )}

                                {mode === 'login' && (
                                    <TouchableOpacity 
                                        onPress={() => switchMode('forgot')} 
                                        style={{ alignSelf: 'flex-end', marginTop: -4 }}
                                    >
                                        <Text style={{ color: isDark ? '#93C5FD' : '#2563EB', fontSize: 13, fontWeight: '600' }}>
                                            ¿Olvidaste tu contraseña?
                                        </Text>
                                    </TouchableOpacity>
                                )}

                                {error.length > 0 && (
                                    <View style={styles.errorContainer}>
                                        <Feather name="alert-circle" size={14} color="#EF4444" />
                                        <Text style={styles.errorText}>{error}</Text>
                                    </View>
                                )}

                                {successMsg.length > 0 && (
                                    <View style={styles.successContainer}>
                                        <Feather name="check-circle" size={14} color="#10B981" />
                                        <Text style={styles.successText}>{successMsg}</Text>
                                    </View>
                                )}

                                <TouchableOpacity
                                    style={[styles.submitBtn, (!isValid || loading) && styles.submitBtnDisabled, { backgroundColor: isDark ? '#4F46E5' : '#0F172A' }]}
                                    onPress={handleSubmit}
                                    disabled={!isValid || loading}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#FFF" />
                                    ) : (
                                        <Text style={styles.submitBtnText}>
                                            {mode === 'login' ? 'Entrar ahora' : mode === 'register' ? 'Crear mi cuenta' : 'Enviar enlace'}
                                        </Text>
                                    )}
                                </TouchableOpacity>

                                {mode === 'forgot' && (
                                    <TouchableOpacity 
                                        onPress={() => switchMode('login')} 
                                        style={{ alignSelf: 'center', marginTop: 8 }}
                                    >
                                        <Text style={{ color: isDark ? '#93C5FD' : '#2563EB', fontSize: 14, fontWeight: '700' }}>
                                            Volver a Iniciar Sesión
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        <View style={styles.footer}>
                            <Text style={[styles.footerText, { color: isDark ? '#64748B' : '#94A3B8' }]}>🔐 Tus datos están encriptados y seguros</Text>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );

    if (Platform.OS === 'web') return content;
    return <TouchableWithoutFeedback onPress={Keyboard.dismiss}>{content}</TouchableWithoutFeedback>;
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' },
    scroll: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'android' ? 60 : 40,
        paddingBottom: 40,
        justifyContent: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
    },
    logoShadowWrap: {
        width: 100,
        height: 100,
        borderRadius: 24,
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    logoImg: { width: 100, height: 100, borderRadius: 24 },
    headerTitle: {
        fontSize: 36,
        fontWeight: '900',
        color: '#FFFFFF',
        letterSpacing: -1,
    },
    headerSubtitle: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
        fontWeight: '500',
        marginTop: 4,
    },
    formCard: {
        borderRadius: 32,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.2,
        shadowRadius: 30,
        elevation: 20,
    },
    tabContainer: {
        flexDirection: 'row',
        padding: 5,
        borderRadius: 16,
        marginBottom: 24,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    tabActive: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 4,
    },
    tabText: {
        fontSize: 15,
        fontWeight: '600',
    },
    tabTextActive: {
        fontWeight: '700',
    },
    formFields: {
        gap: 16,
    },
    inputField: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1.5,
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 56,
        gap: 12,
    },
    input: {
        flex: 1,
        fontSize: 16,
        fontWeight: '500',
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#EF444410',
        padding: 12,
        borderRadius: 12,
    },
    errorText: {
        color: '#EF4444',
        fontSize: 13,
        fontWeight: '600',
        flex: 1,
    },
    successContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#10B98110',
        padding: 12,
        borderRadius: 12,
    },
    successText: {
        color: '#10B981',
        fontSize: 13,
        fontWeight: '600',
        flex: 1,
    },
    submitBtn: {
        height: 60,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
        shadowColor: '#4F46E5',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    submitBtnDisabled: {
        backgroundColor: '#94A3B8',
        shadowOpacity: 0,
        elevation: 0,
    },
    submitBtnText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    footer: {
        marginTop: 24,
    },
    footerStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 24,
    },
    footerText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
        marginTop: 24,
    },
});
