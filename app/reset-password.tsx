import { supabase } from '@/utils/supabase';
import { Feather } from '@expo/vector-icons';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRouter } from 'expo-router';
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
    StatusBar,
} from 'react-native';

export default function ResetPasswordScreen() {
    const colors = useThemeColors();
    const isDark = colors.isDark;
    const router = useRouter();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [showConfirmPass, setShowConfirmPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const handleSubmit = async () => {
        setError('');
        setSuccessMsg('');
        
        if (password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden.');
            return;
        }

        setLoading(true);
        Keyboard.dismiss();

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            });

            if (updateError) {
                setError(updateError.message);
                setLoading(false);
            } else {
                setSuccessMsg('¡Contraseña actualizada con éxito! Cerrando sesión para que ingreses de nuevo...');
                
                // Cerramos sesión explícitamente para limpiar tokens temporales
                await supabase.auth.signOut();
                
                setTimeout(() => {
                    setLoading(false);
                    // Redirigir al inicio de sesión (login)
                    router.replace('/login');
                }, 2500);
            }
        } catch (e: any) {
            setLoading(false);
            setError(e.message || 'Error al actualizar la contraseña.');
        }
    };

    const isValid = password.length >= 6 && confirmPassword.length >= 6;

    const content = (
        <View style={[styles.container, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
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
                            <Text style={[styles.headerTitle, { color: isDark ? '#FFF' : '#0F172A' }]}>Nueva Contraseña</Text>
                            <Text style={[styles.headerSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                                Escribe tu nueva contraseña de acceso
                            </Text>
                        </View>

                        {/* ── Form Card ── */}
                        <View style={[styles.formCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                            <View style={styles.formFields}>
                                <View style={[styles.inputField, { borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                                    <Feather name="lock" size={18} color="#94A3B8" />
                                    <TextInput
                                        style={[styles.input, { color: isDark ? '#FFF' : '#0F172A' }]}
                                        placeholder="Nueva contraseña"
                                        placeholderTextColor="#94A3B8"
                                        value={password}
                                        onChangeText={setPassword}
                                        secureTextEntry={!showPass}
                                        autoCapitalize="none"
                                    />
                                    <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                                        <Feather name={showPass ? 'eye-off' : 'eye'} size={18} color="#94A3B8" />
                                    </TouchableOpacity>
                                </View>

                                <View style={[styles.inputField, { borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                                    <Feather name="lock" size={18} color="#94A3B8" />
                                    <TextInput
                                        style={[styles.input, { color: isDark ? '#FFF' : '#0F172A' }]}
                                        placeholder="Confirmar contraseña"
                                        placeholderTextColor="#94A3B8"
                                        value={confirmPassword}
                                        onChangeText={setConfirmPassword}
                                        secureTextEntry={!showConfirmPass}
                                        autoCapitalize="none"
                                    />
                                    <TouchableOpacity onPress={() => setShowConfirmPass(!showConfirmPass)}>
                                        <Feather name={showConfirmPass ? 'eye-off' : 'eye'} size={18} color="#94A3B8" />
                                    </TouchableOpacity>
                                </View>

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
                                        <Text style={styles.submitBtnText}>Actualizar Contraseña</Text>
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity 
                                    onPress={() => router.replace('/login')} 
                                    style={{ alignSelf: 'center', marginTop: 8 }}
                                >
                                    <Text style={{ color: isDark ? '#93C5FD' : '#2563EB', fontSize: 14, fontWeight: '700' }}>
                                        Volver al Iniciar Sesión (Login)
                                    </Text>
                                </TouchableOpacity>
                            </View>
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
    container: { flex: 1 },
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
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    logoImg: { width: 100, height: 100, borderRadius: 24 },
    headerTitle: {
        fontSize: 32,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 15,
        fontWeight: '500',
        marginTop: 6,
    },
    formCard: {
        borderRadius: 32,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.05,
        shadowRadius: 30,
        elevation: 10,
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
    },
    submitBtnDisabled: {
        backgroundColor: '#94A3B8',
        elevation: 0,
    },
    submitBtnText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
});
