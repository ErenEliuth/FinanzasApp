import { useAuth } from '@/utils/auth';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    ActivityIndicator,
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
} from 'react-native';

type Mode = 'login' | 'register';

export default function LoginScreen() {
    const { login, register, signInWithGoogle, theme } = useAuth();
    const isDark = theme === 'dark';
    const colors = {
        bg: isDark ? '#0F172A' : '#F4F6FF',
        card: isDark ? '#1E293B' : '#FFFFFF',
        text: isDark ? '#F1F5F9' : '#1E293B',
        sub: isDark ? '#94A3B8' : '#64748B',
        input: isDark ? '#334155' : '#F1F5F9',
        border: isDark ? '#475569' : '#E2E8F0',
    };

    const [mode, setMode] = useState<Mode>('login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const switchMode = (m: Mode) => {
        setMode(m);
        setError('');
        setName('');
        setEmail('');
        setPassword('');
    };

    const [successMsg, setSuccessMsg] = useState('');

    const handleSubmit = async () => {
        setError('');
        setSuccessMsg('');
        setLoading(true);
        Keyboard.dismiss();

        let result;
        if (mode === 'login') {
            result = await login(email, password);
        } else {
            result = await register(name, email, password);
        }

        setLoading(false);
        if (!result.success) {
            setError(result.message);
        } else if (mode === 'register') {
            // Si el registro va bien pero requiere confirmación de email
            setSuccessMsg('¡Cuenta creada! Revisa tu correo para confirmar tu cuenta y luego inicia sesión.');
        }
        // Si es login exitoso, el guard en _layout.tsx redirige automáticamente
    };

    const isValid =
        mode === 'login'
            ? email.trim().length > 0 && password.length >= 6
            : name.trim().length > 0 && email.trim().length > 0 && password.length >= 6;

    const content = (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Logo / Header */}
                    <View style={styles.logoArea}>
                        <View style={styles.logoCircle}>
                            <Ionicons name="wallet" size={40} color="#FFFFFF" />
                        </View>
                        <Text style={styles.appName}>FinanzasApp</Text>
                        <Text style={styles.appTagline}>Tu dinero, bajo control</Text>
                    </View>

                    {/* Card */}
                    <View style={[styles.card, { backgroundColor: colors.card }]}>
                        {/* Tabs */}
                        <View style={styles.tabRow}>
                            <TouchableOpacity
                                style={[styles.tab, mode === 'login' && styles.tabActive]}
                                onPress={() => switchMode('login')}
                            >
                                <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>
                                    Iniciar Sesión
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tab, mode === 'register' && styles.tabActive]}
                                onPress={() => switchMode('register')}
                            >
                                <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>
                                    Crear Cuenta
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Nombre (solo en registro) */}
                        {mode === 'register' && (
                            <View style={[styles.inputWrap, isDark && { backgroundColor: '#334155', borderColor: '#475569' }]}>
                                <View style={styles.inputIcon}>
                                    <MaterialIcons name="person" size={20} color="#6366F1" />
                                </View>
                                <TextInput
                                    style={[styles.input, isDark && { color: '#F1F5F9' }]}
                                    placeholder="Tu nombre"
                                    placeholderTextColor="#94A3B8"
                                    value={name}
                                    onChangeText={setName}
                                    autoCapitalize="words"
                                    returnKeyType="next"
                                />
                            </View>
                        )}
                        {/* Inputs de Correo y Contraseña */}
                        <View style={{ gap: 14 }}>
                            {/* Email */}
                            <View style={[styles.inputWrap, isDark && { backgroundColor: '#334155', borderColor: '#475569' }]}>
                                <View style={styles.inputIcon}>
                                    <MaterialIcons name="email" size={20} color="#6366F1" />
                                </View>
                                <TextInput
                                    style={[styles.input, isDark && { color: '#F1F5F9' }]}
                                    placeholder="Correo electrónico"
                                    placeholderTextColor="#94A3B8"
                                    value={email}
                                    onChangeText={setEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    returnKeyType="next"
                                />
                            </View>

                            {/* Sugerencias de Dominio */}
                            {email.length > 0 && !email.includes('@') && (
                                <View style={styles.suggestionsRow}>
                                    {['@gmail.com', '@hotmail.com', '@outlook.com'].map((domain) => (
                                        <TouchableOpacity
                                            key={domain}
                                            style={[styles.suggestionChip, isDark && { backgroundColor: '#334155', borderColor: '#475569' }]}
                                            onPress={() => setEmail(email + domain)}
                                        >
                                            <Text style={[styles.suggestionText, isDark && { color: '#94A3B8' }]}>{domain}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            {/* Contraseña */}
                            <View style={[styles.inputWrap, isDark && { backgroundColor: '#334155', borderColor: '#475569' }]}>
                                <View style={styles.inputIcon}>
                                    <MaterialIcons name="lock" size={20} color="#6366F1" />
                                </View>
                                <TextInput
                                    style={[styles.input, { flex: 1 }, isDark && { color: '#F1F5F9' }]}
                                    placeholder="Contraseña (mín. 6 caracteres)"
                                    placeholderTextColor="#94A3B8"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPass}
                                    returnKeyType="done"
                                    onSubmitEditing={handleSubmit}
                                />
                                <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.showPassBtn}>
                                    <Ionicons name={showPass ? 'eye-off' : 'eye'} size={20} color={isDark ? '#94A3B8' : '#94A3B8'} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Mensaje de éxito */}
                        {successMsg.length > 0 && (
                            <View style={[styles.errorBox, { backgroundColor: 'rgba(16,185,129,0.08)' }]}>
                                <MaterialIcons name="check-circle" size={16} color="#10B981" />
                                <Text style={[styles.errorText, { color: '#10B981' }]}>{successMsg}</Text>
                            </View>
                        )}

                        {/* Error */}
                        {error.length > 0 && (
                            <View style={styles.errorBox}>
                                <MaterialIcons name="error-outline" size={16} color="#EF4444" />
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        )}

                        {/* Botón Principal (Entrar / Crear) */}
                        <TouchableOpacity
                            style={[styles.submitBtn, (!isValid || loading) && styles.submitBtnDisabled]}
                            onPress={handleSubmit}
                            disabled={!isValid || loading}
                            activeOpacity={0.85}
                        >
                            {loading ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <>
                                    <Ionicons
                                        name={mode === 'login' ? 'log-in' : 'person-add'}
                                        size={20}
                                        color="#FFF"
                                    />
                                    <Text style={styles.submitBtnText}>
                                        {mode === 'login' ? 'Entrar' : 'Crear mi cuenta'}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>

                        {/* Divider y Redes Sociales */}
                        <View style={styles.dividerRow}>
                            <View style={[styles.dividerLine, isDark && { backgroundColor: '#334155' }]} />
                            <Text style={styles.dividerText}>o entra con</Text>
                            <View style={[styles.dividerLine, isDark && { backgroundColor: '#334155' }]} />
                        </View>

                        {/* Botón de Google */}
                        <TouchableOpacity
                            style={[styles.googleBtn, isDark && { backgroundColor: '#334155', borderColor: '#475569' }]}
                            onPress={signInWithGoogle}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="logo-google" size={20} color={isDark ? '#F1F5F9' : '#1E293B'} />
                            <Text style={[styles.googleBtnText, { color: colors.text }]}>Google</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Info de seguridad */}
                    <View style={styles.infoRow}>
                        <Ionicons name="shield-checkmark" size={14} color="#94A3B8" />
                        <Text style={styles.infoText}>
                            Tus datos se guardan localmente en tu dispositivo
                        </Text>
                    </View>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );

    if (Platform.OS === 'web') {
        return content;
    }

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            {content}
        </TouchableWithoutFeedback>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F4F6FF',
    },
    scroll: {
        flexGrow: 1,
        padding: 24,
        paddingTop: Platform.OS === 'android' ? 60 : 40,
        justifyContent: 'center',
    },

    // Logo
    logoArea: {
        alignItems: 'center',
        marginBottom: 32,
    },
    logoCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#6366F1',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14,
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 10,
    },
    appName: {
        fontSize: 30,
        fontWeight: '800',
        color: '#1E293B',
        letterSpacing: -0.5,
    },
    appTagline: {
        fontSize: 14,
        color: '#94A3B8',
        marginTop: 4,
    },

    // Card
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 6,
        marginBottom: 16,
    },

    // Tabs
    tabRow: {
        flexDirection: 'row',
        backgroundColor: '#F1F5F9',
        borderRadius: 14,
        padding: 4,
        marginBottom: 24,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 11,
        alignItems: 'center',
    },
    tabActive: {
        backgroundColor: '#6366F1',
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 4,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#94A3B8',
    },
    tabTextActive: {
        color: '#FFFFFF',
    },

    // Inputs
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        marginBottom: 14,
        paddingHorizontal: 12,
        height: 54,
    },
    inputIcon: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    input: {
        flex: 1,
        fontSize: 15,
        color: '#1E293B',
    },
    showPassBtn: {
        padding: 4,
    },

    // Error
    errorBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(239,68,68,0.08)',
        borderRadius: 10,
        padding: 12,
        gap: 8,
        marginBottom: 14,
    },
    errorText: {
        flex: 1,
        fontSize: 13,
        color: '#EF4444',
        fontWeight: '500',
    },

    // Submit
    submitBtn: {
        height: 54,
        backgroundColor: '#6366F1',
        borderRadius: 14,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 6,
        marginTop: 4,
    },
    submitBtnDisabled: {
        opacity: 0.5,
    },
    submitBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '700',
    },

    // Info
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    infoText: {
        fontSize: 12,
        color: '#94A3B8',
    },

    // Google Button & Divider
    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#E2E8F0',
    },
    dividerText: {
        marginHorizontal: 12,
        fontSize: 12,
        color: '#94A3B8',
        fontWeight: '600',
    },
    googleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        paddingVertical: 12,
        gap: 10,
        marginBottom: 10,
    },
    googleBtnText: {
        fontSize: 15,
        fontWeight: '700',
    },
    // Sugerencias de Email
    suggestionsRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 14,
        flexWrap: 'wrap',
    },
    suggestionChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#F1F5F9',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    suggestionText: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '600',
    },
});
