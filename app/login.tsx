import { useAuth } from '@/utils/auth';
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';
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
} from 'react-native';

type Mode = 'login' | 'register';

export default function LoginScreen() {
    const { login, register } = useAuth();

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

        const result = mode === 'login'
            ? await login(email, password)
            : await register(name, email, password);

        setLoading(false);
        if (!result.success) {
            setError(result.message);
        } else if (mode === 'register') {
            setSuccessMsg('¡Revisa tu correo para confirmar la cuenta y entra!');
        }
    };

    const isValid =
        mode === 'login'
            ? email.trim().length > 0 && password.length >= 6
            : name.trim().length > 0 && email.trim().length > 0 && password.length >= 6;

    const content = (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* ── Logo con estilo de App Icon ── */}
                    <View style={styles.logoArea}>
                        <View style={styles.logoShadowWrap}>
                            <Image
                                source={require('@/assets/images/zenly-logo.png')}
                                style={styles.logoImg}
                                resizeMode="cover"
                            />
                        </View>
                    </View>

                    {/* ── Tabs elegantes ── */}
                    <View style={styles.tabContainer}>
                        <TouchableOpacity
                            style={[styles.tab, mode === 'login' && styles.tabActive]}
                            onPress={() => switchMode('login')}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>
                                Entrar
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, mode === 'register' && styles.tabActive]}
                            onPress={() => switchMode('register')}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>
                                Registrarse
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* ── Formulario minimalista ── */}
                    <View style={styles.formContainer}>
                        
                        {/* Nombre */}
                        {mode === 'register' && (
                            <View style={styles.inputWrap}>
                                <Feather name="user" size={18} color="#94A3B8" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Nombre completo"
                                    placeholderTextColor="#94A3B8"
                                    value={name}
                                    onChangeText={setName}
                                    autoCapitalize="words"
                                    returnKeyType="next"
                                />
                            </View>
                        )}

                        {/* Email */}
                        <View style={styles.inputWrap}>
                            <Feather name="mail" size={18} color="#94A3B8" style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="Correo electrónico"
                                placeholderTextColor="#94A3B8"
                                value={email}
                                onChangeText={setEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                returnKeyType="next"
                            />
                        </View>

                        {/* Sugerencias de correo rápidas */}
                        {email.length > 0 && !email.includes('@') && (
                            <View style={styles.suggestionsRow}>
                                {['@gmail.com', '@hotmail.com', '@outlook.com'].map(domain => (
                                    <TouchableOpacity
                                        key={domain}
                                        style={styles.chip}
                                        onPress={() => setEmail(email + domain)}
                                    >
                                        <Text style={styles.chipText}>{domain}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {/* Contraseña */}
                        <View style={styles.inputWrap}>
                            <Feather name="lock" size={18} color="#94A3B8" style={styles.inputIcon} />
                            <TextInput
                                style={[styles.input, { flex: 1 }]}
                                placeholder="Contraseña (mín. 6)"
                                placeholderTextColor="#94A3B8"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPass}
                                returnKeyType="done"
                                onSubmitEditing={handleSubmit}
                            />
                            <TouchableOpacity onPress={() => setShowPass(!showPass)} style={{ padding: 4 }}>
                                <Feather name={showPass ? 'eye-off' : 'eye'} size={18} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>

                        {/* Mensajes */}
                        {successMsg.length > 0 && (
                            <View style={[styles.msgBox, styles.msgSuccess]}>
                                <Feather name="check-circle" size={16} color="#059669" />
                                <Text style={[styles.msgText, { color: '#059669' }]}>{successMsg}</Text>
                            </View>
                        )}

                        {error.length > 0 && (
                            <View style={[styles.msgBox, styles.msgError]}>
                                <Feather name="alert-circle" size={16} color="#DC2626" />
                                <Text style={[styles.msgText, { color: '#DC2626' }]}>{error}</Text>
                            </View>
                        )}

                        {/* Botón Principal */}
                        <TouchableOpacity
                            style={[styles.submitBtn, (!isValid || loading) && styles.submitBtnDisabled]}
                            onPress={handleSubmit}
                            disabled={!isValid || loading}
                            activeOpacity={0.8}
                        >
                            {loading ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <Text style={styles.submitBtnText}>
                                    {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
                                </Text>
                            )}
                        </TouchableOpacity>

                        {/* Pie / Seguridad */}
                        <View style={styles.footerRow}>
                            <Feather name="shield" size={14} color="#94A3B8" />
                            <Text style={styles.footerText}>Conexión segura y encriptada</Text>
                        </View>

                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );

    if (Platform.OS === 'web') return content;
    return <TouchableWithoutFeedback onPress={Keyboard.dismiss}>{content}</TouchableWithoutFeedback>;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF', // Fondo blanco puro
    },
    scroll: {
        flexGrow: 1,
        paddingHorizontal: 28,
        paddingTop: Platform.OS === 'android' ? 60 : 40,
        paddingBottom: 40,
        justifyContent: 'center',
    },

    // ── Logo como App Icon ──
    logoArea: {
        alignItems: 'center',
        marginBottom: 44,
    },
    logoShadowWrap: {
        width: 110,
        height: 110,
        borderRadius: 26,
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.1,
        shadowRadius: 24,
        elevation: 10, // Sombra suave para darle volumen
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoImg: {
        width: 110,
        height: 110,
        borderRadius: 26,
        overflow: 'hidden',
    },

    // ── Tabs Modernos ──
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#F8FAFC', // Gris súper sutil
        borderRadius: 16,
        padding: 6,
        marginBottom: 32,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    tabActive: {
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    tabText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#64748B',
    },
    tabTextActive: {
        color: '#0F172A',
        fontWeight: '700',
    },

    // ── Formulario Minimalista ──
    formContainer: {
        gap: 16,
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        paddingHorizontal: 16,
        height: 60,
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: '#0F172A',
        fontWeight: '500',
    },

    // ── Sugerencias ──
    suggestionsRow: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
        marginTop: -6,
        marginBottom: 2,
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        backgroundColor: '#F1F5F9',
        borderRadius: 20,
    },
    chipText: {
        fontSize: 13,
        color: '#475569',
        fontWeight: '600',
    },

    // ── Mensajes ──
    msgBox: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        padding: 14,
        gap: 10,
        borderWidth: 1,
    },
    msgSuccess: {
        backgroundColor: '#ECFDF5',
        borderColor: '#A7F3D0',
    },
    msgError: {
        backgroundColor: '#FEF2F2',
        borderColor: '#FECACA',
    },
    msgText: {
        flex: 1,
        fontSize: 14,
        fontWeight: '500',
    },

    // ── Botón ──
    submitBtn: {
        height: 60,
        backgroundColor: '#0F172A', // Dark casi negro
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8,
        marginTop: 8,
    },
    submitBtnDisabled: {
        backgroundColor: '#94A3B8',
        shadowOpacity: 0,
        elevation: 0,
    },
    submitBtnText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: 0.3,
    },

    // ── Pie ──
    footerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 16,
    },
    footerText: {
        fontSize: 13,
        color: '#94A3B8',
        fontWeight: '500',
    },
});
