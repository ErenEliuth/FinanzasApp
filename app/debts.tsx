import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function DebtsScreen() {
    const router = useRouter();

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <IconSymbol name="chevron.left.forwardslash.chevron.right" size={24} color="#F8FAFC" /> {/* use back icon ideally, but using what's mapped */}
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Control de Cartera</Text>
                <View style={{ width: 40 }} /> {/* Spacer */}
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Total Card */}
                <View style={styles.totalCard}>
                    <Text style={styles.totalLabel}>Total Mensual Faltante</Text>
                    <Text style={styles.totalAmount}>$ 319.300</Text>
                </View>

                <Text style={styles.sectionTitle}>Préstamos y Deudas</Text>

                {/* Debts List */}
                <View style={styles.debtsList}>
                    {DEBTS.map((debt, i) => (
                        <View key={i} style={styles.debtItem}>
                            <View style={styles.debtHeader}>
                                <View>
                                    <Text style={styles.debtClient}>{debt.client}</Text>
                                    <Text style={styles.debtDate}>Vence: {debt.dueDate}</Text>
                                </View>
                                <View style={[styles.statusBadge, debt.status === 'Vencida' ? styles.statusVencida : styles.statusVigente]}>
                                    <Text style={[styles.statusText, debt.status === 'Vencida' ? styles.statusTextVencida : styles.statusTextVigente]}>
                                        {debt.status}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.debtDetailsRow}>
                                <View style={styles.debtDetailCol}>
                                    <Text style={styles.detailLabel}>Valor</Text>
                                    <Text style={styles.detailValue}>${debt.value}</Text>
                                </View>
                                <View style={styles.debtDetailCol}>
                                    <Text style={styles.detailLabel}>Abonos</Text>
                                    <Text style={styles.detailValue}>${debt.abonos}</Text>
                                </View>
                                <View style={styles.debtDetailCol}>
                                    <Text style={styles.detailLabel}>Saldo</Text>
                                    <Text style={[styles.detailValue, { color: '#8B5CF6' }]}>${debt.saldo}</Text>
                                </View>
                            </View>

                            <View style={styles.daysRow}>
                                <Text style={styles.daysText}>
                                    {debt.status === 'Vencida' ? 'Días vencidos:' : 'Faltan días:'}
                                </Text>
                                <Text style={[styles.daysValue, debt.status === 'Vencida' ? { color: '#EF4444' } : { color: '#10B981' }]}>
                                    {debt.daysLeft}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>
                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const DEBTS = [
    { client: 'MAMA', dueDate: '4/03/2026', status: 'Vigente', value: '100.000', abonos: '0', saldo: '100.000', daysLeft: '1' },
    { client: 'ODONTOLOGIA', dueDate: '7/03/2026', status: 'Vigente', value: '85.000', abonos: '0', saldo: '85.000', daysLeft: '4' },
    { client: 'Cuota', dueDate: '16/03/2026', status: 'Vigente', value: '84.300', abonos: '0', saldo: '84.300', daysLeft: '13' },
    { client: 'Telefono', dueDate: '3/03/2026', status: 'Vigente', value: '50.000', abonos: '0', saldo: '50.000', daysLeft: '0' },
];

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F172A',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 60 : 20,
        paddingBottom: 20,
        backgroundColor: '#1E293B',
        borderBottomWidth: 1,
        borderBottomColor: '#334155',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        color: '#F8FAFC',
        fontSize: 20,
        fontWeight: '700',
    },
    scrollContent: {
        padding: 20,
    },
    totalCard: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        marginBottom: 30,
    },
    totalLabel: {
        color: '#F8FAFC',
        fontSize: 16,
        marginBottom: 8,
    },
    totalAmount: {
        color: '#EF4444',
        fontSize: 32,
        fontWeight: '800',
    },
    sectionTitle: {
        color: '#F8FAFC',
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 15,
    },
    debtsList: {
        gap: 15,
    },
    debtItem: {
        backgroundColor: '#1E293B',
        borderRadius: 16,
        padding: 20,
    },
    debtHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 15,
    },
    debtClient: {
        color: '#F8FAFC',
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 4,
    },
    debtDate: {
        color: '#94A3B8',
        fontSize: 14,
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    statusVigente: {
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
    },
    statusVencida: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
    },
    statusText: {
        fontSize: 12,
        fontWeight: '700',
    },
    statusTextVigente: {
        color: '#10B981',
    },
    statusTextVencida: {
        color: '#EF4444',
    },
    debtDetailsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: '#0F172A',
        padding: 15,
        borderRadius: 12,
        marginBottom: 15,
    },
    debtDetailCol: {
        alignItems: 'center',
    },
    detailLabel: {
        color: '#94A3B8',
        fontSize: 12,
        marginBottom: 4,
    },
    detailValue: {
        color: '#F8FAFC',
        fontSize: 16,
        fontWeight: '700',
    },
    daysRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#334155',
        paddingTop: 15,
    },
    daysText: {
        color: '#94A3B8',
        fontSize: 14,
    },
    daysValue: {
        fontSize: 16,
        fontWeight: '700',
    },
});
