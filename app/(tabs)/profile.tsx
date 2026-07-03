import { useAuth } from '@/utils/auth';
import { THEMES, ThemeName } from '@/constants/Themes';
import { supabase } from '@/utils/supabase';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useThemeColors } from '@/hooks/useThemeColors';
import { formatCurrency, convertCurrency, CURRENCIES } from '@/utils/currency';
import { uploadImage } from '@/utils/storage';
import { syncUp, SYNC_KEYS } from '@/utils/sync';
import { parseLocalDate } from '@/utils/dateUtils';
import * as Notifications from '@/utils/notifications';
import {
    Alert,
    Dimensions,
    Image,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_NAMES_FULL = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DAY_HEADERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const toKey = (d: Date) => {
    // Usamos componentes locales para asegurar consistencia
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmt = (n: number, currency: string, rates: Record<string, number>, isHidden: boolean) => 
    formatCurrency(convertCurrency(n, currency, rates), currency, isHidden);

const FIXED_EXPENSE_CATEGORIES = ['Gasto Fijo', 'Tarjetas', 'Deudas'];

type ExpenseSplit = {
    fixed: number;
    variable: number;
    total: number;
};

const isIgnoredCategory = (category?: string) => category === 'Ahorro' || category === 'Transferencia';

const isExpenseTx = (tx: any) => tx.type === 'expense' && !isIgnoredCategory(tx.category);

const isIncomeTx = (tx: any) => tx.type === 'income' && tx.category !== 'Transferencia';

const isFixedExpense = (tx: any) => FIXED_EXPENSE_CATEGORIES.includes(tx.category || '');

const sumAmounts = (items: any[]) => items.reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);

const splitExpenses = (items: any[]): ExpenseSplit => {
    const expenses = items.filter(isExpenseTx);
    const fixed = expenses.filter(isFixedExpense).reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
    const total = sumAmounts(expenses);
    return { fixed, variable: Math.max(0, total - fixed), total };
};

type ExpenseSplitDetailed = {
    fixed: number;
    variable: number;
    savings: number;
    total: number;
};

const splitExpensesDetailed = (items: any[]): ExpenseSplitDetailed => {
    const expenses = items.filter(t => t.type === 'expense');
    const savings = expenses.filter(t => t.category === 'Ahorro' || t.category === 'InversiÃ³n').reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
    const actualExpenses = expenses.filter(t => t.category !== 'Ahorro' && t.category !== 'InversiÃ³n' && t.category !== 'Transferencia');
    const fixed = actualExpenses.filter(isFixedExpense).reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
    const total = sumAmounts(actualExpenses);
    return {
        fixed,
        variable: Math.max(0, total - fixed),
        savings,
        total: total + savings
    };
};

const getMonthTxs = (transactions: any[], month: number, year: number) => transactions.filter(t => {
    const d = parseLocalDate(t.date);
    return d.getMonth() === month && d.getFullYear() === year;
});

const getWeekWindow = (offsetDays = 0) => {
    const end = new Date();
    end.setDate(end.getDate() - offsetDays);
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end };
};

const getRangeTxs = (transactions: any[], start: Date, end: Date) => transactions.filter(t => {
    const d = parseLocalDate(t.date);
    return d >= start && d <= end;
});

const getPercentChange = (current: number, previous: number) => {
    if (previous <= 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
};

const getTopExpenseCategory = (items: any[]) => {
    const totals: Record<string, number> = {};
    items.filter(isExpenseTx).forEach(t => {
        const cat = t.category || 'Otros';
        totals[cat] = (totals[cat] || 0) + Math.abs(Number(t.amount) || 0);
    });
    return Object.entries(totals).sort((a, b) => b[1] - a[1])[0] || null;
};

const getMonthProjection = (monthExpenseTotal: number, today = new Date()) => {
    const day = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    if (day <= 0) return monthExpenseTotal;
    return (monthExpenseTotal / day) * daysInMonth;
};

function InsightCard({ text, colorsNav, tone = 'info' }: { text: string; colorsNav: any; tone?: 'info' | 'warn' | 'good' }) {
    const color = tone === 'warn' ? '#EF4444' : tone === 'good' ? '#10B981' : colorsNav.accent;
    const icon = tone === 'warn' ? 'warning' : tone === 'good' ? 'check-circle' : 'lightbulb-outline';
    return (
        <View style={[statStyle.insightCard, { backgroundColor: color + '12', borderColor: color + '25' }]}>
            <MaterialIcons name={icon as any} size={18} color={color} />
            <Text style={[statStyle.insightText, { color: colorsNav.text }]}>{text}</Text>
        </View>
    );
}

function getReminderIcon(title: string, defaultColor: string) {
    const t = title.toLowerCase();
    
    // Brand mappings
    if (t.includes('netflix')) return { name: 'netflix', library: 'MaterialCommunityIcons', color: '#E50914' };
    if (t.includes('spotify')) return { name: 'spotify', library: 'MaterialCommunityIcons', color: '#1DB954' };
    if (t.includes('apple')) return { name: 'apple', library: 'MaterialCommunityIcons', color: '#FFFFFF' };
    if (t.includes('youtube')) return { name: 'youtube', library: 'MaterialCommunityIcons', color: '#FF0000' };
    if (t.includes('amazon') || t.includes('prime')) return { name: 'amazon', library: 'MaterialCommunityIcons', color: '#FF9900' };
    if (t.includes('starbucks')) return { name: 'starbucks', library: 'MaterialCommunityIcons', color: '#00704A' };
    if (t.includes('google')) return { name: 'google', library: 'MaterialCommunityIcons', color: '#4285F4' };
    if (t.includes('playstation') || t.includes('psn')) return { name: 'playstation', library: 'MaterialCommunityIcons', color: '#0037AE' };
    if (t.includes('xbox')) return { name: 'xbox', library: 'MaterialCommunityIcons', color: '#107C10' };
    if (t.includes('steam')) return { name: 'steam', library: 'MaterialCommunityIcons', color: '#000000' };
    if (t.includes('disney')) return { name: 'alpha-d-circle', library: 'MaterialCommunityIcons', color: '#113CCF' };
    if (t.includes('hbo')) return { name: 'alpha-h-circle', library: 'MaterialCommunityIcons', color: '#9B51E0' };
    
    // Services / Bills mappings
    if (t.includes('agua') || t.includes('triple a')) return { name: 'water', library: 'MaterialCommunityIcons', color: '#2F80ED' };
    if (t.includes('luz') || t.includes('electricidad') || t.includes('energia') || t.includes('aire')) return { name: 'flash', library: 'MaterialCommunityIcons', color: '#F2C94C' };
    if (t.includes('gas')) return { name: 'fire', library: 'MaterialCommunityIcons', color: '#F2994A' };
    if (t.includes('internet') || t.includes('wifi') || t.includes('claro') || t.includes('movistar') || t.includes('tigo') || t.includes('une')) return { name: 'wifi', library: 'MaterialCommunityIcons', color: '#2D9CDB' };
    if (t.includes('celular') || t.includes('plan') || t.includes('telefono')) return { name: 'cellphone', library: 'MaterialCommunityIcons', color: '#9B51E0' };
    
    // Other common categories
    if (t.includes('arriendo') || t.includes('alquiler') || t.includes('casa') || t.includes('apto') || t.includes('apartamento')) return { name: 'home', library: 'MaterialCommunityIcons', color: '#27AE60' };
    if (t.includes('gym') || t.includes('gimnasio') || t.includes('fit')) return { name: 'dumbbell', library: 'MaterialCommunityIcons', color: '#EB5757' };
    if (t.includes('seguro') || t.includes('eps') || t.includes('salud') || t.includes('medico')) return { name: 'heart-pulse', library: 'MaterialCommunityIcons', color: '#EB5757' };
    if (t.includes('tarjeta') || t.includes('banco') || t.includes('credit') || t.includes('visa') || t.includes('mastercard') || t.includes('amex') || t.includes('bancolombia') || t.includes('davivienda') || t.includes('nu')) return { name: 'credit-card', library: 'MaterialCommunityIcons', color: '#F2C94C' };
    if (t.includes('prestamo') || t.includes('credito') || t.includes('deuda')) return { name: 'cash', library: 'MaterialCommunityIcons', color: '#6FCF97' };
    if (t.includes('colegio') || t.includes('u') || t.includes('universidad') || t.includes('pension') || t.includes('estudio')) return { name: 'school', library: 'MaterialCommunityIcons', color: '#2F80ED' };
    if (t.includes('carro') || t.includes('moto') || t.includes('soat') || t.includes('taller') || t.includes('gasolina')) return { name: 'car', library: 'MaterialCommunityIcons', color: '#F2994A' };

    // Generic
    return { name: 'calendar-check', library: 'MaterialCommunityIcons', color: defaultColor };
}

function MonthHeatmap({ activeDays, colorsNav, onDayPress, reminders }: {
    activeDays: Map<string, number>;
    colorsNav: any;
    onDayPress: (date: Date) => void;
    reminders: any[];
}) {
    const today = new Date();
    const todayKey = toKey(today);
    const month = today.getMonth();
    const year = today.getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekDay = new Date(year, month, 1).getDay();
    const startOffset = (firstWeekDay === 0 ? 6 : firstWeekDay - 1); 

    const cells: (number | null)[] = [
        ...Array(startOffset).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const totalActive = [...activeDays.keys()].filter(k => {
        const d = new Date(k + 'T12:00:00');
        return d.getMonth() === month && d.getFullYear() === year;
    }).length;

    return (
        <View style={[mSt.card, { backgroundColor: colorsNav.card }]}>
            <View style={mSt.header}>
                <View>
                    <Text style={[mSt.monthName, { color: colorsNav.text }]}>
                        {MONTH_NAMES_FULL[month]} {year}
                    </Text>
                    <Text style={[mSt.subtitle, { color: colorsNav.sub }]}>Tu agenda financiera</Text>
                </View>
                <View style={[mSt.pill, { backgroundColor: colorsNav.accent + '20' }]}>
                    <Text style={[mSt.pillTxt, { color: colorsNav.accent }]}>{totalActive} dÃ­as activos</Text>
                </View>
            </View>
            <View style={mSt.weekRow}>
                {DAY_HEADERS.map((d, i) => (
                    <View key={i} style={[mSt.dayHeader, { backgroundColor: colorsNav.isDark ? '#2C2C2E' : '#E5E5EA' }]}>
                        <Text style={[mSt.dayHeaderTxt, { color: colorsNav.text }]}>{d}</Text>
                    </View>
                ))}
            </View>
            {Array.from({ length: cells.length / 7 }, (_, row) => (
                <View key={row} style={mSt.weekRow}>
                    {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
                        if (day === null) return <View key={col} style={mSt.cell} />;
                        const dateObj = new Date(year, month, day);
                        const k = toKey(dateObj);
                        const count = activeDays.get(k) ?? 0;
                        const isToday = k === todayKey;
                        const isFuture = dateObj > today;
                        
                        const dayReminders = reminders.filter(r => {
                            if (r.due_day === day) return true;
                            if (r.due_date) {
                                const normalized = r.due_date.includes('T') ? r.due_date : `${r.due_date}T12:00:00`;
                                return toKey(new Date(normalized)) === k;
                            }
                            return false;
                        });
                        
                        const hasReminder = dayReminders.length > 0;
                        const hasUnpaidReminder = dayReminders.some(r => !r.is_paid);
                        const hasPaidReminder = hasReminder && !hasUnpaidReminder;
                        const isOverdue = hasUnpaidReminder && dateObj < new Date(today.getFullYear(), today.getMonth(), today.getDate());

                        // Base background styling
                        let cellBg = colorsNav.isDark ? '#1C1C1E' : '#F2F2F7';
                        if (isFuture) {
                            cellBg = colorsNav.isDark ? '#1C1C1E40' : '#F2F2F740';
                        } else if (count > 0 && !hasReminder) {
                            // Heatmap tint for standard active days
                            cellBg = colorsNav.accent + '20';
                        }

                        // Dot indicators
                        let dotColor = null;
                        if (hasReminder) {
                            if (isOverdue) dotColor = '#EF4444';
                            else if (hasUnpaidReminder) dotColor = '#F59E0B';
                            else if (hasPaidReminder) dotColor = '#10B981';
                        }

                        // Get icon details if there's a reminder
                        const firstReminder = dayReminders[0];
                        const iconInfo = hasReminder ? getReminderIcon(firstReminder.title, colorsNav.accent) : null;

                        return (
                            <TouchableOpacity 
                                key={col} 
                                style={mSt.cell}
                                onPress={() => onDayPress(dateObj)}
                            >
                                <View style={[
                                    mSt.dayCircle,
                                    { backgroundColor: cellBg },
                                    isToday && { borderWidth: 1.5, borderColor: colorsNav.accent },
                                ]}>
                                    {iconInfo ? (
                                        <>
                                            <MaterialCommunityIcons 
                                                name={iconInfo.name as any} 
                                                size={18} 
                                                color={iconInfo.color} 
                                                style={{ marginTop: -4 }}
                                            />
                                            {dotColor && (
                                                <View style={[mSt.reminderDot, { backgroundColor: dotColor }]} />
                                            )}
                                            <Text style={[mSt.dayNumSub, { color: colorsNav.sub }]}>
                                                {day}
                                            </Text>
                                        </>
                                    ) : (
                                        <>
                                            <Text style={[
                                                mSt.dayNum,
                                                { color: isFuture ? colorsNav.sub + '80' : colorsNav.text },
                                                isToday && { fontWeight: '900', color: colorsNav.accent }
                                            ]}>
                                                {day}
                                            </Text>
                                            {count > 0 && (
                                                <View style={[mSt.transactionDot, { backgroundColor: colorsNav.accent }]} />
                                            )}
                                        </>
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ))}
        </View>
    );
}

const mSt = StyleSheet.create({
    card: { borderRadius: 24, padding: 16, marginBottom: 16 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    monthName: { fontSize: 16, fontWeight: '800' },
    subtitle: { fontSize: 11, marginTop: 2 },
    pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    pillTxt: { fontSize: 10, fontWeight: '800' },
    weekRow: { flexDirection: 'row', marginBottom: 4, gap: 4 },
    dayHeader: { flex: 1, alignItems: 'center', paddingVertical: 4, borderRadius: 8 },
    dayHeaderTxt: { fontSize: 9, fontWeight: '800' },
    cell: { flex: 1, aspectRatio: 1 },
    dayCircle: { 
        width: '100%', 
        height: '100%', 
        borderRadius: 10, 
        justifyContent: 'center', 
        alignItems: 'center', 
        position: 'relative',
        padding: 4
    },
    dayNum: { fontSize: 12, fontWeight: '700' },
    dayNumSub: { fontSize: 8, fontWeight: '800', position: 'absolute', bottom: 3, right: 4 },
    reminderDot: { position: 'absolute', top: 4, right: 4, width: 5, height: 5, borderRadius: 2.5 },
    transactionDot: { width: 3, height: 3, borderRadius: 1.5, marginTop: 1 },
});

const CAT_INFO: Record<string, any> = {
    'Hogar': { icon: 'home', color: '#4CAF50', bg: '#E8F5E9' },
    'Transporte': { icon: 'directions-car', color: '#00BCD4', bg: '#E0F7FA' },
    'Comida': { icon: 'restaurant', color: '#F59E0B', bg: '#FFF0E0' },
    'Supermercado': { icon: 'shopping-cart', color: '#F59E0B', bg: '#FFF0E0' },
    'Salud': { icon: 'favorite', color: '#E91E63', bg: '#FCE4EC' },
    'EducaciÃ³n': { icon: 'school', color: '#3B82F6', bg: '#E3F0FF' },
    'Entretenimiento': { icon: 'sports-esports', color: '#EC4899', bg: '#FDF2F8' },
    'Otros': { icon: 'more-horiz', color: '#94A3B8', bg: '#F1F5F9' },
};

import { LineChart } from 'react-native-chart-kit';

function CategoryStatistics({ transactions, colorsNav, isHidden, currency, rates }: { 
    transactions: any[]; 
    colorsNav: any; 
    isHidden: boolean; 
    currency: string;
    rates: Record<string, number>;
}) {
    const today = new Date();
    const currMonth = today.getMonth();
    const currYear = today.getFullYear();
    
    // Gastos del mes
    const thisMonthExpenses = transactions.filter(t => {
        const d = parseLocalDate(t.date);
        return t.type === 'expense' && t.category !== 'Ahorro' && t.category !== 'Transferencia' && d.getMonth() === currMonth && d.getFullYear() === currYear;
    });
    
    // Ingresos del mes
    const thisMonthIncome = transactions.filter(t => {
        const d = parseLocalDate(t.date);
        return t.type === 'income' && t.category !== 'Transferencia' && d.getMonth() === currMonth && d.getFullYear() === currYear;
    });

    const thisMonthExpTotal = thisMonthExpenses.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
    const thisMonthIncTotal = thisMonthIncome.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
    const prevMonthDate = new Date(currYear, currMonth - 1, 1);
    const prevMonthTxs = getMonthTxs(transactions, prevMonthDate.getMonth(), prevMonthDate.getFullYear());
    const prevMonthExpTotal = sumAmounts(prevMonthTxs.filter(isExpenseTx));
    const monthChangePct = getPercentChange(thisMonthExpTotal, prevMonthExpTotal);
    
    const thisMonthAllTxs = getMonthTxs(transactions, currMonth, currYear);
    const monthlySplitDetailed = splitExpensesDetailed(thisMonthAllTxs);
    const monthlyDetailedTotal = monthlySplitDetailed.fixed + monthlySplitDetailed.variable + monthlySplitDetailed.savings;
    const mFixedPct = monthlyDetailedTotal > 0 ? (monthlySplitDetailed.fixed / monthlyDetailedTotal) * 100 : 0;
    const mVariablePct = monthlyDetailedTotal > 0 ? (monthlySplitDetailed.variable / monthlyDetailedTotal) * 100 : 0;
    const mSavingsPct = monthlyDetailedTotal > 0 ? (monthlySplitDetailed.savings / monthlyDetailedTotal) * 100 : 0;

    const topCategory = getTopExpenseCategory(thisMonthExpenses);
    const projectedClose = getMonthProjection(thisMonthExpTotal, today);
    const balance = thisMonthIncTotal - thisMonthExpTotal;
    
    const projectionInsight = projectedClose > 0
        ? `Si sigues asÃ­, cerrarÃ¡s el mes con gastos cercanos a ${fmt(projectedClose, currency, rates, isHidden)}.`
        : 'Registra gastos para predecir tu cierre de mes.';

    const categoryTotals: Record<string, number> = {};
    thisMonthExpenses.forEach(t => {
        const cat = t.category || 'Otros';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(t.amount || 0);
    });
    const sortedCats = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
    const maxVal = Math.max(...sortedCats.map(c => c[1]), 1);

    const chartLabels: string[] = [];
    const chartExpData: number[] = [];
    const chartIncData: number[] = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(currYear, currMonth - i, 1);
        chartLabels.push(MONTH_NAMES[d.getMonth()]);
        
        const mExp = transactions.filter(t => {
            const td = parseLocalDate(t.date);
            return t.type === 'expense' && t.category !== 'Ahorro' && t.category !== 'Transferencia' && td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
        }).reduce((s, t) => s + Math.abs(t.amount || 0), 0);
        
        const mInc = transactions.filter(t => {
            const td = parseLocalDate(t.date);
            return t.type === 'income' && t.category !== 'Transferencia' && td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
        }).reduce((s, t) => s + Math.abs(t.amount || 0), 0);

        chartExpData.push(mExp);
        chartIncData.push(mInc);
    }

    return (
        <View style={{ gap: 24 }}>

            <View style={[statStyle.card, { backgroundColor: colorsNav.card }]}>
                <Text style={[statStyle.title, { color: colorsNav.text, marginBottom: 15 }]}>Comparativa Ingresos vs Gastos</Text>
                <LineChart
                    data={{ 
                        labels: chartLabels, 
                        datasets: [
                            { data: chartIncData, color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`, strokeWidth: 3 }, // Verde para ingresos
                            { data: chartExpData, color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})`, strokeWidth: 3 } // Rojo para gastos
                        ],
                        legend: ["Ingresos", "Gastos"]
                    }}
                    width={Dimensions.get('window').width - 70}
                    height={200}
                    chartConfig={{
                        backgroundColor: colorsNav.card,
                        backgroundGradientFrom: colorsNav.card,
                        backgroundGradientTo: colorsNav.card,
                        decimalPlaces: 0,
                        color: (opacity = 1) => colorsNav.accent,
                        labelColor: (opacity = 1) => colorsNav.sub,
                        style: { borderRadius: 16 },
                        propsForDots: { r: "4", strokeWidth: "2", stroke: colorsNav.card }
                    }}
                    bezier
                    style={{ marginVertical: 8, borderRadius: 16, marginLeft: -15 }}
                />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[statStyle.card, { backgroundColor: colorsNav.card, flex: 1 }]}>
                    <Text style={[statStyle.title, { color: colorsNav.text, fontSize: 14 }]}>Ingresos Mes</Text>
                    <Text style={[statStyle.compVal, { color: '#10B981', fontSize: 18 }]} adjustsFontSizeToFit={true} numberOfLines={1}>{fmt(thisMonthIncTotal, currency, rates, isHidden)}</Text>
                </View>
                <View style={[statStyle.card, { backgroundColor: colorsNav.card, flex: 1 }]}>
                    <Text style={[statStyle.title, { color: colorsNav.text, fontSize: 14 }]}>Gastos Mes</Text>
                    <Text style={[statStyle.compVal, { color: '#EF4444', fontSize: 18 }]} adjustsFontSizeToFit={true} numberOfLines={1}>{fmt(thisMonthExpTotal, currency, rates, isHidden)}</Text>
                    <Text style={{ color: monthChangePct > 0 ? '#EF4444' : '#10B981', fontSize: 11, fontWeight: '800', marginTop: 6 }}>
                        {monthChangePct >= 0 ? '+' : ''}{monthChangePct.toFixed(0)}% vs mes anterior
                    </Text>
                </View>
            </View>

            <View style={[statStyle.card, { backgroundColor: colorsNav.card }]}>
                <Text style={[statStyle.title, { color: colorsNav.text, marginBottom: 16 }]}>Estructura del gasto mensual</Text>
                <View style={statStyle.splitTrack}>
                    <View style={[statStyle.splitFixed, { width: `${Math.max(0, mFixedPct)}%` }]} />
                    <View style={[statStyle.splitVariable, { width: `${Math.max(0, mVariablePct)}%` }]} />
                    <View style={[statStyle.splitSavings, { width: `${Math.max(0, mSavingsPct)}%`, backgroundColor: '#10B981' }]} />
                </View>
                <View style={{ flexDirection: 'row', gap: 4, marginTop: 16 }}>
                    <View style={[statStyle.splitBox, { backgroundColor: '#EF444410', paddingVertical: 8, paddingHorizontal: 4 }]}>
                        <Text style={[statStyle.splitLabel, { color: '#EF4444', fontSize: 9 }]}>FIJOS</Text>
                        <Text style={[statStyle.splitValue, { color: colorsNav.text, fontSize: 11 }]} adjustsFontSizeToFit={true} numberOfLines={1}>{fmt(monthlySplitDetailed.fixed, currency, rates, isHidden)}</Text>
                    </View>
                    <View style={[statStyle.splitBox, { backgroundColor: '#3B82F610', paddingVertical: 8, paddingHorizontal: 4 }]}>
                        <Text style={[statStyle.splitLabel, { color: '#3B82F6', fontSize: 9 }]}>VARIABLES</Text>
                        <Text style={[statStyle.splitValue, { color: colorsNav.text, fontSize: 11 }]} adjustsFontSizeToFit={true} numberOfLines={1}>{fmt(monthlySplitDetailed.variable, currency, rates, isHidden)}</Text>
                    </View>
                    <View style={[statStyle.splitBox, { backgroundColor: '#10B98110', paddingVertical: 8, paddingHorizontal: 4 }]}>
                        <Text style={[statStyle.splitLabel, { color: '#10B981', fontSize: 9 }]}>AHORRO/INV</Text>
                        <Text style={[statStyle.splitValue, { color: colorsNav.text, fontSize: 11 }]} adjustsFontSizeToFit={true} numberOfLines={1}>{fmt(monthlySplitDetailed.savings, currency, rates, isHidden)}</Text>
                    </View>
                </View>
            </View>

            <View style={[statStyle.card, { backgroundColor: colorsNav.card }]}>
                <Text style={[statStyle.title, { color: colorsNav.text, marginBottom: 20 }]}>Gastos por CategorÃ­a</Text>
                {sortedCats.map(([cat, val]) => {
                    const info = CAT_INFO[cat] || CAT_INFO['Otros'];
                    return (
                        <View key={cat} style={statStyle.barRow}>
                            <View style={[statStyle.barIcon, { backgroundColor: info.bg }]}>
                                <MaterialIcons name={info.icon} size={18} color={info.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <View style={statStyle.barHeaders}>
                                    <Text style={[statStyle.barLabel, { color: colorsNav.text }]}>{cat}</Text>
                                    <Text style={[statStyle.barAmount, { color: colorsNav.text }]}>{fmt(val, currency, rates, isHidden)}</Text>
                                </View>
                                <View style={[statStyle.barTrack, { backgroundColor: colorsNav.bg }]}>
                                    <View style={[statStyle.barFill, { width: `${(val / maxVal) * 100}%`, backgroundColor: info.color }]} />
                                </View>
                            </View>
                        </View>
                    );
                })}
            </View>
            <InsightCard
                text={projectionInsight}
                colorsNav={colorsNav}
                tone={balance < 0 ? 'warn' : 'good'}
            />
        </View>
    );
}

const statStyle = StyleSheet.create({
    card: { borderRadius: 24, padding: 24 },
    title: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
    compVal: { fontSize: 24, fontWeight: '900' },
    insightCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 18, borderWidth: 1 },
    insightText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '700' },
    splitTrack: { height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', backgroundColor: '#EEF2F7' },
    splitFixed: { height: '100%', backgroundColor: '#EF4444' },
    splitVariable: { height: '100%', backgroundColor: '#3B82F6' },
    splitSavings: { height: '100%', backgroundColor: '#10B981' },
    splitBox: { flex: 1, padding: 14, borderRadius: 16 },
    splitLabel: { fontSize: 10, fontWeight: '900', marginBottom: 4, letterSpacing: 0.5 },
    splitValue: { fontSize: 16, fontWeight: '900' },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
    barIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    barHeaders: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    barLabel: { fontSize: 14, fontWeight: '700' },
    barAmount: { fontSize: 14, fontWeight: '800' },
    barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 4 },
});

export default function ProfileScreen() {
    const router = useRouter();
    const { user, theme, setThemeConfig, currency, setCurrencyConfig, rates, ratesUpdatedAt, syncRates, isHidden, logout } = useAuth();
    const isFocused = useIsFocused();
    const colorsNav = useThemeColors();
    const isDark = colorsNav.isDark;

    const [themeModalVisible, setThemeModalVisible] = useState(false);
    const [isModalDark, setIsModalDark] = useState(isDark);
    const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
    const [statsModalVisible, setStatsModalVisible] = useState(false);
    const [weeklyModalVisible, setWeeklyModalVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [isSyncingRates, setIsSyncingRates] = useState(false);
    const [smartSavingsEnabled, setSmartSavingsEnabled] = useState<boolean | null>(null);



    const [dayDetailModalVisible, setDayDetailModalVisible] = useState(false);
    const [addReminderModalVisible, setAddReminderModalVisible] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [reminders, setReminders] = useState<any[]>([]);
    const [newReminderTitle, setNewReminderTitle] = useState('');
    const [newReminderAmount, setNewReminderAmount] = useState('');

    const [transactions, setTransactions] = useState<any[]>([]);
    const [activeDays, setActiveDays] = useState<Map<string, number>>(new Map());
    const [newName, setNewName] = useState(user?.user_metadata?.name || '');
    const [avatarUri, setAvatarUri] = useState<string | null>(null);
    const [weeklySpending, setWeeklySpending] = useState(0);
    const [weeklyIncome, setWeeklyIncome] = useState(0);
    const [weeklySummaryData, setWeeklySummaryData] = useState<[string, number][]>([]);
    const [pushEnabled, setPushEnabled] = useState(false);

    const scrollRef = useRef<any>(null);

    useEffect(() => { 
        if (isFocused) {
            loadData(); 
            checkPushSubscription();
            scrollRef.current?.scrollTo({ y: 0, animated: false });
        }
    }, [isFocused]);

    const urlBase64ToUint8Array = (base64String: string) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    };

    const checkPushSubscription = async () => {
        if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            const stored = await AsyncStorage.getItem('push_notifications_enabled');
            setPushEnabled(!!sub && stored === 'true');
        } catch (e) {
            console.error('Error checking push subscription:', e);
        }
    };

    const togglePushNotifications = async () => {
        if (Platform.OS !== 'web' || typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
            Alert.alert('Solo Web', 'Las notificaciones estÃ¡n disponibles en la versiÃ³n web.');
            return;
        }
        try {
            if (pushEnabled) {
                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.getSubscription();
                if (sub) {
                    await sub.unsubscribe();
                }
                await AsyncStorage.setItem('push_notifications_enabled', 'false');
                setPushEnabled(false);
                Alert.alert('Desactivadas', 'Ya no recibirÃ¡s recordatorios.');
            } else {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    const reg = await navigator.serviceWorker.ready;
                    const VAPID_PUBLIC_KEY = 'BDc8JcLSHCdTUZDsNl8hlAzLPfOz4jWar4OGO9odsf8_8vePGp_uM9tPbjsJx0hTz3rUvDE48ygpPlvL5_eyrio';
                    
                    const sub = await reg.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                    });

                    const response = await fetch('/api/push/subscribe', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            subscription: sub,
                            userId: user?.id
                        })
                    });

                    if (response.ok) {
                        await AsyncStorage.setItem('push_notifications_enabled', 'true');
                        setPushEnabled(true);
                        Alert.alert('Â¡Activadas!', 'RecibirÃ¡s recordatorios y consejos diariamente.');
                    } else {
                        const errData = await response.json();
                        throw new Error(errData.error || 'Fallo en la suscripciÃ³n del servidor');
                    }
                } else {
                    Alert.alert('Permiso Denegado', 'Habilita las notificaciones en los ajustes de tu navegador.');
                }
            }
        } catch (e: any) {
            console.error('Push toggle error:', e);
            Alert.alert('Error', `Hubo un problema al configurar las notificaciones: ${e.message || e}`);
        }
    };

    const sendTestPush = async () => {
        if (Platform.OS !== 'web' || typeof Notification === 'undefined') return;
        try {
            if (Notification.permission !== 'granted') {
                Alert.alert('Permiso Requerido', 'Primero activa las notificaciones.');
                return;
            }
            const tips = [
                'Â¡Recuerda aportar a tu fondo de emergencia hoy! Cada peso cuenta.',
                'Revisa tus gastos de la semana. Â¿Hubo alguno innecesario?',
                'El interÃ©s compuesto trabaja mientras duermes. Â¡Sigue ahorrando!',
                'Tip: Automatiza tus aportes para no olvidarlos nunca.',
                'Â¿SabÃ­as que el 10% de tus ingresos puede cambiar tu futuro financiero?'
            ];
            const randomTip = tips[Math.floor(Math.random() * tips.length)];

            const name = user?.user_metadata?.name || 'Usuario';
            const response = await fetch('/api/push/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: `ðŸ’¡ Consejo para ${name}`,
                    body: randomTip,
                    userId: user?.id,
                    url: '/goals'
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Error al enviar notificaciÃ³n de prueba');
            }
        } catch (e: any) { 
            console.error('Test push error:', e);
            Alert.alert('Error', `No se pudo enviar la notificaciÃ³n de prueba: ${e.message || e}`);
        }
    };
    useEffect(() => {
        const url = user?.user_metadata?.avatar_url;
        if (url) setAvatarUri(url);
    }, [user]);

    const loadData = async () => {
        if (!user) return;
        const { data } = await supabase.from('transactions').select('*').eq('user_id', user.id);
        const txs = data || [];
        setTransactions(txs);
        const map = new Map<string, number>();
        txs.forEach(tx => {
            const k = toKey(parseLocalDate(tx.date));
            map.set(k, (map.get(k) ?? 0) + 1);
        });
        setActiveDays(map);
        const weekWindow = getWeekWindow(0);
        const weekTxs = getRangeTxs(txs, weekWindow.start, weekWindow.end);

        const wExpenses = weekTxs.filter(t => t.type === 'expense' && t.category !== 'Ahorro' && t.category !== 'Transferencia');
        const wIncome = weekTxs.filter(t => t.type === 'income' && t.category !== 'Transferencia');

        setWeeklySpending(wExpenses.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0));
        setWeeklyIncome(wIncome.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0));

        const catMap: Record<string, number> = {};
        wExpenses.forEach(t => { catMap[t.category || 'Otros'] = (catMap[t.category || 'Otros'] || 0) + Math.abs(t.amount || 0); });
        setWeeklySummaryData(Object.entries(catMap).sort((a, b) => b[1] - a[1]));

        // Fetch reminders and all debts
        const [remRes, debtsRes] = await Promise.all([
            supabase.from('reminders').select('*').eq('user_id', user.id),
            supabase.from('debts').select('*').eq('user_id', user.id)
        ]);

        const remData = remRes.data || [];
        const debtsData = (debtsRes.data || []).map(f => {
            const isFixed = f.debt_type === 'fixed';
            return {
                ...f,
                is_fixed_expense: isFixed,
                title: f.client,
                amount: f.value,
                due_day: isFixed ? new Date(f.due_date + 'T12:00:00').getDate() : undefined,
                due_date: isFixed ? undefined : f.due_date,
                is_paid: f.paid >= f.value
            };
        });

        // Fetch smart savings state
        const rawPref = await AsyncStorage.getItem(SYNC_KEYS.SMART_SAVINGS(user.id));
        setSmartSavingsEnabled(rawPref === 'enabled');

        setReminders([...remData, ...debtsData]);
    };

    const handleAddReminder = async () => {
        if (!newReminderTitle.trim() || !user) return;
        const amount = parseFloat(newReminderAmount.replace(/\D/g, '')) || 0;
        const day = selectedDate ? selectedDate.getDate() : new Date().getDate();
        
        const { error } = await supabase.from('reminders').insert([{
            user_id: user.id,
            title: newReminderTitle.trim(),
            amount: amount,
            due_day: day
        }]);

        if (!error) {
            setAddReminderModalVisible(false);
            setNewReminderTitle('');
            setNewReminderAmount('');
            loadData();
        }
    };

    const handleDeleteReminder = async (id: string) => {
        const { error } = await supabase.from('reminders').delete().eq('id', id);
        if (!error) loadData();
    };

    const handleDayPress = (date: Date) => {
        setSelectedDate(date);
        setDayDetailModalVisible(true);
    };

    const getDayTransactions = (date: Date | null) => {
        if (!date) return [];
        const key = toKey(date);
        return transactions.filter(t => {
            return toKey(parseLocalDate(t.date)) === key && t.category !== 'Transferencia';
        });
    };

    const handleTogglePaid = async (reminder: any) => {
        if (reminder.is_fixed_expense) {
            const newValue = reminder.is_paid ? 0 : reminder.amount;
            const { error } = await supabase.from('debts').update({ paid: newValue }).eq('id', reminder.id);
            if (!error) loadData();
            return;
        }
        const { error } = await supabase.from('reminders').update({ is_paid: !reminder.is_paid }).eq('id', reminder.id);
        if (!error) loadData();
    };

    const getDayReminders = (date: Date | null) => {
        if (!date) return [];
        const day = date.getDate();
        const key = toKey(date);
        return reminders.filter(r => {
            if (r.due_day === day) return true;
            if (r.due_date) {
                const normalized = r.due_date.includes('T') ? r.due_date : `${r.due_date}T12:00:00`;
                if (toKey(new Date(normalized)) === key) return true;
            }
            return false;
        });
    };

    const handleUpdateName = async () => {
        if (!newName.trim()) return;
        await supabase.auth.updateUser({ data: { name: newName.trim() } });
        try {
            if (user?.id) {
                await AsyncStorage.setItem(`@user_name_${user.id}`, newName.trim());
                await syncUp(user.id);
                const isEnabled = await AsyncStorage.getItem(SYNC_KEYS.REMINDERS(user.id));
                if (isEnabled) {
                    await Notifications.scheduleCoherentReminders(newName.trim());
                }
            }
        } catch (e) {
            console.error('Error updating reminders after name change:', e);
        }
        setEditModalVisible(false);
    };

    const handleLogout = async () => { await logout(); router.replace('/login'); };

    const handlePickAvatar = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({ 
            mediaTypes: ['images'], 
            allowsEditing: true, 
            aspect: [1, 1], 
            quality: 0.5 
        });
        
        if (!result.canceled && result.assets[0] && user) {
            const sourceUri = result.assets[0].uri;
            setAvatarUri(sourceUri); // Feedback inmediato
            
            try {
                const fileName = `avatar_${user.id}_${Date.now()}.jpg`;
                const publicUrl = await uploadImage(sourceUri, 'avatars', fileName);
                
                if (publicUrl) {
                    setAvatarUri(publicUrl);
                    await supabase.auth.updateUser({ 
                        data: { avatar_url: publicUrl } 
                    });
                }
            } catch (e) {
                console.error("Error subiendo avatar:", e);
                Alert.alert("Error", "No se pudo sincronizar la imagen de perfil.");
            }
        }
    };
    const toggleSmartSavings = async () => {
        if (!user?.id) return;
        const newState = !smartSavingsEnabled;
        setSmartSavingsEnabled(newState);
        await AsyncStorage.setItem(SYNC_KEYS.SMART_SAVINGS(user.id), newState ? 'enabled' : 'disabled');
        await syncUp(user.id);
    };

    const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Usuario';
    const initials = displayName.slice(0, 2).toUpperCase();
    const currentWeekWindow = getWeekWindow(0);
    const previousWeekWindow = getWeekWindow(7);
    const currentWeekTxs = getRangeTxs(transactions, currentWeekWindow.start, currentWeekWindow.end);
    const previousWeekTxs = getRangeTxs(transactions, previousWeekWindow.start, previousWeekWindow.end);
    const currentWeekExpenses = currentWeekTxs.filter(isExpenseTx);
    const previousWeekExpenses = previousWeekTxs.filter(isExpenseTx);
    
    const weeklySplit = splitExpenses(currentWeekExpenses);
    const weeklySplitDetailed = splitExpensesDetailed(currentWeekTxs);
    const previousWeekSpending = sumAmounts(previousWeekExpenses);
    const weeklyChangePct = getPercentChange(weeklySplit.total, previousWeekSpending);

    const weeklyDetailedTotal = weeklySplitDetailed.fixed + weeklySplitDetailed.variable + weeklySplitDetailed.savings;
    const weeklyFixedPct = weeklyDetailedTotal > 0 ? (weeklySplitDetailed.fixed / weeklyDetailedTotal) * 100 : 0;
    const weeklyVariablePct = weeklyDetailedTotal > 0 ? (weeklySplitDetailed.variable / weeklyDetailedTotal) * 100 : 0;
    const weeklySavingsPct = weeklyDetailedTotal > 0 ? (weeklySplitDetailed.savings / weeklyDetailedTotal) * 100 : 0;

    const weeklyTopCategory = getTopExpenseCategory(currentWeekExpenses);
    
    // Generar frases de insights dinÃ¡micas para el periodo semanal
    const weeklyDiff = weeklySplit.total - previousWeekSpending;
    const weeklyCompareText = weeklyDiff > 0 
        ? `Gastaste ${fmt(weeklyDiff, currency, rates, isHidden)} mÃ¡s que la semana pasada.` 
        : weeklyDiff < 0 
            ? `Gastaste ${fmt(Math.abs(weeklyDiff), currency, rates, isHidden)} menos que la semana pasada.` 
            : 'Gastaste lo mismo que la semana pasada.';
    
    const weeklyTopCategoryText = weeklyTopCategory 
        ? `${weeklyTopCategory[0] === 'Gasto Fijo' || weeklyTopCategory[0] === 'Deudas' || weeklyTopCategory[0] === 'Tarjetas' ? 'Gasto Fijo' : weeklyTopCategory[0]} fue tu mayor gasto esta semana.`
        : '';
        
    const weeklyInsight = `${weeklyCompareText} ${weeklyTopCategoryText}`.trim();
    const currentMonthTxs = getMonthTxs(transactions, new Date().getMonth(), new Date().getFullYear());
    const currentMonthExpenses = currentMonthTxs.filter(isExpenseTx);
    const currentMonthExpenseTotal = sumAmounts(currentMonthExpenses);
    const monthCommitments = reminders.filter(r => {
        if (r.due_date) {
            const d = new Date(r.due_date.includes('T') ? r.due_date : `${r.due_date}T12:00:00`);
            const now = new Date();
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        return !!r.due_day;
    });
    const pendingCommitments = monthCommitments.filter(r => !r.is_paid);
    const paidCommitments = monthCommitments.filter(r => r.is_paid);
    const pendingCommitmentTotal = pendingCommitments.reduce((sum, r) => sum + Math.abs(Number(r.amount) || 0), 0);
    const paidCommitmentTotal = paidCommitments.reduce((sum, r) => sum + Math.abs(Number(r.amount) || 0), 0);
    const selectedDayTxs = getDayTransactions(selectedDate);
    const selectedDayExpenses = selectedDayTxs.filter(isExpenseTx);
    const selectedDayExpenseTotal = sumAmounts(selectedDayExpenses);
    const selectedDayWeekShare = weeklySplit.total > 0 ? (selectedDayExpenseTotal / weeklySplit.total) * 100 : 0;
    const selectedDayMonthShare = currentMonthExpenseTotal > 0 ? (selectedDayExpenseTotal / currentMonthExpenseTotal) * 100 : 0;
    const selectedDayTopCategory = getTopExpenseCategory(selectedDayExpenses);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colorsNav.bg }]}>
            <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                <View style={styles.header}>
                    <Text style={[styles.headerTitle, { color: colorsNav.text }]}>Perfil</Text>
                    <TouchableOpacity style={[styles.themeBtn, { backgroundColor: colorsNav.card }]} onPress={() => { setIsModalDark(isDark); setThemeModalVisible(true); }}>
                        <Ionicons name="color-palette" size={22} color={colorsNav.accent} />
                    </TouchableOpacity>
                </View>

                <View style={[styles.profileCard, { backgroundColor: colorsNav.card }]}>
                    <View style={styles.profileTop}>
                        <TouchableOpacity style={[styles.avatar, { backgroundColor: colorsNav.accent }]} onPress={handlePickAvatar}>
                            {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatarImg} /> : <Text style={styles.avatarTxt}>{initials}</Text>}
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                            <View style={styles.nameRow}>
                                <Text style={[styles.name, { color: colorsNav.text }]}>{displayName}</Text>
                                <TouchableOpacity onPress={() => setEditModalVisible(true)}><MaterialIcons name="edit" size={16} color={colorsNav.sub} /></TouchableOpacity>
                            </View>
                            <Text style={[styles.email, { color: colorsNav.sub }]}>{user?.email}</Text>
                        </View>
                    </View>
                    <View style={styles.actionRow}>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? '#3A3A52' : '#F5EDE0' }]} onPress={handleLogout}>
                            <MaterialIcons name="logout" size={18} color="#EF4444" /><Text style={{ color: '#EF4444', fontWeight: '800' }}>Salir</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.optionsGrid}>
                    <TouchableOpacity style={[styles.optBtn, { backgroundColor: '#FF8A6520' }]} onPress={() => setWeeklyModalVisible(true)}>
                        <View style={[styles.optIcon, { backgroundColor: '#FF8A65' }]}><MaterialIcons name="auto-graph" size={20} color="#FFF" /></View>
                        <Text style={[styles.optTitle, { color: colorsNav.text }]}>Semanal</Text>
                        <Text style={{ fontSize: 11, color: colorsNav.sub }}>Gasto Ãºltimos 7 dÃ­as</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.optBtn, { backgroundColor: colorsNav.accent + '20' }]} onPress={() => setStatsModalVisible(true)}>
                        <View style={[styles.optIcon, { backgroundColor: colorsNav.accent }]}><MaterialIcons name="analytics" size={20} color="#FFF" /></View>
                        <Text style={[styles.optTitle, { color: colorsNav.text }]}>EstadÃ­sticas</Text>
                        <Text style={{ fontSize: 11, color: colorsNav.sub }}>AnÃ¡lisis de consumos</Text>
                    </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={[styles.sectionTitle, { color: colorsNav.sub, marginTop: 0, marginBottom: 0 }]}>AGENDA FINANCIERA</Text>
                </View>
                <View style={styles.agendaLegend}>
                    <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} /><Text style={[styles.legendText, { color: colorsNav.sub }]}>Pendiente</Text></View>
                    <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#10B981' }]} /><Text style={[styles.legendText, { color: colorsNav.sub }]}>Pagado</Text></View>
                    <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} /><Text style={[styles.legendText, { color: colorsNav.sub }]}>Vencido</Text></View>
                </View>
                <MonthHeatmap activeDays={activeDays} colorsNav={colorsNav} reminders={reminders} onDayPress={handleDayPress} />

                
                {/* BotÃ³n de Presupuestos abajo del calendario */}
                <TouchableOpacity 
                    style={[styles.budgetFullBtn, { backgroundColor: colorsNav.card }]} 
                    onPress={() => router.push('/budgets')}
                >
                    <View style={[styles.optIcon, { backgroundColor: '#3B82F6', marginBottom: 0 }]}>
                        <MaterialIcons name="savings" size={20} color="#FFF" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.optTitle, { color: colorsNav.text }]}>Presupuestos</Text>
                        <Text style={{ fontSize: 11, color: colorsNav.sub }}>Controla tus lÃ­mites de gasto</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color={colorsNav.sub} />
                </TouchableOpacity>

                <Text style={[styles.sectionTitle, { color: colorsNav.sub, marginTop: 24 }]}>AJUSTES DE LA APP</Text>
                <View style={[styles.profileCard, { backgroundColor: colorsNav.card, paddingVertical: 10 }]}>
                    <TouchableOpacity style={styles.listItem} onPress={() => setCurrencyModalVisible(true)}>
                        <View style={[styles.listIcon, { backgroundColor: colorsNav.accent + '15' }]}><MaterialIcons name="payments" size={20} color={colorsNav.accent} /></View>
                        <View style={{ flex: 1 }}><Text style={[styles.listTitle, { color: colorsNav.text }]}>Moneda</Text><Text style={[styles.listSub, { color: colorsNav.sub }]}>{currency}</Text></View>
                        <MaterialIcons name="chevron-right" size={24} color={colorsNav.sub} />
                    </TouchableOpacity>

                    <View style={[styles.listItem, { borderTopWidth: 1, borderTopColor: colorsNav.bg }]}>
                        <View style={[styles.listIcon, { backgroundColor: '#8B5CF615' }]}><MaterialIcons name="auto-awesome" size={20} color="#8B5CF6" /></View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.listTitle, { color: colorsNav.text }]}>Ahorro Inteligente</Text>
                            <Text style={[styles.listSub, { color: colorsNav.sub }]}>Sugerencias automÃ¡ticas</Text>
                        </View>
                        <TouchableOpacity 
                            onPress={toggleSmartSavings}
                            style={{ 
                                width: 44, 
                                height: 24, 
                                borderRadius: 12, 
                                backgroundColor: smartSavingsEnabled ? '#8B5CF6' : colorsNav.bg,
                                justifyContent: 'center',
                                paddingHorizontal: 3,
                                borderWidth: 1,
                                borderColor: smartSavingsEnabled ? '#8B5CF6' : colorsNav.border
                            }}
                        >
                            <View style={{ 
                                width: 18, 
                                height: 18, 
                                borderRadius: 9, 
                                backgroundColor: '#FFF',
                                alignSelf: smartSavingsEnabled ? 'flex-end' : 'flex-start',
                                elevation: 2,
                                shadowColor: '#000',
                                shadowOpacity: 0.2,
                                shadowRadius: 2
                            }} />
                        </TouchableOpacity>
                    </View>

                    {/* â”€â”€ Web Push Notification Controls â”€â”€ */}
                    {Platform.OS === 'web' && (
                        <>
                            <View style={[styles.listItem, { borderTopWidth: 1, borderTopColor: colorsNav.bg }]}>
                                <View style={[styles.listIcon, { backgroundColor: '#10B98115' }]}><MaterialIcons name="notifications-active" size={20} color="#10B981" /></View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.listTitle, { color: colorsNav.text }]}>Notificaciones Push</Text>
                                    <Text style={[styles.listSub, { color: colorsNav.sub }]}>Recordatorios diarios en navegador</Text>
                                </View>
                                <TouchableOpacity 
                                    onPress={togglePushNotifications}
                                    style={{ 
                                        width: 44, 
                                        height: 24, 
                                        borderRadius: 12, 
                                        backgroundColor: pushEnabled ? '#10B981' : colorsNav.bg,
                                        justifyContent: 'center',
                                        paddingHorizontal: 3,
                                        borderWidth: 1,
                                        borderColor: pushEnabled ? '#10B981' : colorsNav.border
                                    }}
                                >
                                    <View style={{ 
                                        width: 18, 
                                        height: 18, 
                                        borderRadius: 9, 
                                        backgroundColor: '#FFF',
                                        alignSelf: pushEnabled ? 'flex-end' : 'flex-start',
                                        elevation: 2,
                                        shadowColor: '#000',
                                        shadowOpacity: 0.2,
                                        shadowRadius: 2
                                    }} />
                                </TouchableOpacity>
                            </View>

                            {pushEnabled && (
                                <TouchableOpacity 
                                    style={[styles.listItem, { borderTopWidth: 1, borderTopColor: colorsNav.bg }]} 
                                    onPress={sendTestPush}
                                >
                                    <View style={[styles.listIcon, { backgroundColor: '#3B82F615' }]}><MaterialIcons name="send" size={20} color="#3B82F6" /></View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.listTitle, { color: colorsNav.text }]}>Enviar NotificaciÃ³n de Prueba</Text>
                                        <Text style={[styles.listSub, { color: colorsNav.sub }]}>Probar alertas al instante</Text>
                                    </View>
                                    <MaterialIcons name="chevron-right" size={24} color={colorsNav.sub} />
                                </TouchableOpacity>
                            )}
                        </>
                    )}
                </View>
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Modals */}
            <Modal visible={themeModalVisible} transparent animationType="slide">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <View style={[styles.themeSheet, { backgroundColor: colorsNav.card }]}>
                        <View style={styles.sheetHandle} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                            <View>
                                <Text style={[styles.modalTitle, { color: colorsNav.text, marginBottom: 2 }]}>Personaliza tu app</Text>
                                <Text style={{ fontSize: 12, color: colorsNav.sub }}>Elige el estilo que mÃ¡s te guste</Text>
                            </View>
                            <TouchableOpacity style={[styles.closeCircle, { backgroundColor: isDark ? '#333' : '#F1F1F1' }]} onPress={() => setThemeModalVisible(false)}>
                                <Ionicons name="close" size={20} color={colorsNav.text} />
                            </TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: 'row', backgroundColor: colorsNav.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', padding: 4, borderRadius: 12, marginBottom: 20 }}>
                            <TouchableOpacity
                                style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, backgroundColor: !isModalDark ? colorsNav.accent : 'transparent' }}
                                onPress={() => setIsModalDark(false)}
                            >
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: !isModalDark ? '#FFF' : colorsNav.sub }} />
                                <Text style={{ color: !isModalDark ? '#FFF' : colorsNav.text, fontWeight: '800', fontSize: 13, letterSpacing: 0.5 }}>CLARO</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, backgroundColor: isModalDark ? colorsNav.accent : 'transparent' }}
                                onPress={() => setIsModalDark(true)}
                            >
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isModalDark ? '#FFF' : colorsNav.sub }} />
                                <Text style={{ color: isModalDark ? '#FFF' : colorsNav.text, fontWeight: '800', fontSize: 13, letterSpacing: 0.5 }}>OSCURO</Text>
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View style={{ flexDirection: 'column', gap: 12 }}>
                                {[
                                    { label: 'Sanctuary', light: 'light' as ThemeName, dark: 'dark' as ThemeName, lightColor: '#4A7C59', darkColor: '#4A7C59', lightText: '#FFF8F0', darkText: '#FFF8F0' },
                                    { label: 'Lavanda', light: 'lavender' as ThemeName, dark: 'lavender_dark' as ThemeName, lightColor: '#7C5DBA', darkColor: '#9D7FE0', lightText: '#F8F7FF', darkText: '#1A1625' },
                                    { label: 'OcÃ©ano', light: 'ocean' as ThemeName, dark: 'ocean_dark' as ThemeName, lightColor: '#008080', darkColor: '#26A69A', lightText: '#F0F9FA', darkText: '#0A1A1A' },
                                    { label: 'Rosa', light: 'rose' as ThemeName, dark: 'rose_dark' as ThemeName, lightColor: '#E05C6E', darkColor: '#E07080', lightText: '#FFF5F5', darkText: '#1A0E0E' },
                                    { label: 'Ãmbar', light: 'amber' as ThemeName, dark: 'amber_dark' as ThemeName, lightColor: '#D97706', darkColor: '#F59E0B', lightText: '#FFFBF0', darkText: '#1A1400' },
                                    { label: 'Ãndigo', light: 'slate' as ThemeName, dark: 'midnight' as ThemeName, lightColor: '#3B5BDB', darkColor: '#818CF8', lightText: '#F5F7FA', darkText: '#0D0D1A' },
                                    { label: 'Nieve', light: 'snow' as ThemeName, dark: 'dark' as ThemeName, lightColor: '#1F2937', darkColor: '#4A7C59', lightText: '#FFFFFF', darkText: '#FFF8F0' },
                                ].map((group) => {
                                    const targetTheme = isModalDark ? group.dark : group.light;
                                    const isActive = theme === targetTheme;
                                    const accColor = isModalDark ? group.darkColor : group.lightColor;
                                    const textColor = isModalDark ? group.darkText : group.lightText;

                                    return (
                                        <TouchableOpacity
                                            key={group.label}
                                            style={[
                                                { 
                                                    backgroundColor: accColor, 
                                                    padding: 16,
                                                    borderRadius: 4,
                                                    borderWidth: isActive ? 3 : 0,
                                                    borderColor: 'rgba(255,255,255,0.9)',
                                                    marginBottom: 0
                                                }
                                            ]}
                                            onPress={() => { setThemeConfig(targetTheme); setThemeModalVisible(false); }}
                                        >
                                            {isActive && (
                                                <View style={{ position: 'absolute', top: 10, right: 10, width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(255,255,255,0.9)' }} />
                                            )}
                                            <Text style={{ fontSize: 22, fontWeight: '900', color: textColor, letterSpacing: -0.5, textTransform: 'uppercase' }}>
                                                {group.label}
                                            </Text>
                                            
                                            <View style={{ flexDirection: 'row', marginTop: 12, justifyContent: 'space-between' }}>
                                                <View>
                                                    <Text style={{ fontSize: 9, color: textColor, opacity: 0.75, fontWeight: '700', marginBottom: 2, letterSpacing: 1 }}>HEX</Text>
                                                    <Text style={{ fontSize: 12, color: textColor, fontWeight: '800' }}>{accColor.toUpperCase()}</Text>
                                                </View>
                                                <View>
                                                    <Text style={{ fontSize: 9, color: textColor, opacity: 0.75, fontWeight: '700', marginBottom: 2, letterSpacing: 1 }}>MODO</Text>
                                                    <Text style={{ fontSize: 12, color: textColor, fontWeight: '800' }}>{isModalDark ? 'OSCURO' : 'CLARO'}</Text>
                                                </View>
                                                <View>
                                                    <Text style={{ fontSize: 9, color: textColor, opacity: 0.75, fontWeight: '700', marginBottom: 2, letterSpacing: 1 }}>ESTADO</Text>
                                                    <Text style={{ fontSize: 12, color: textColor, fontWeight: '800' }}>{isActive ? 'ACTIVO âœ“' : 'INACTIVO'}</Text>
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                            <View style={{ height: 30 }} />
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <Modal visible={statsModalVisible} animationType="slide">
                <SafeAreaView style={{ flex: 1, backgroundColor: colorsNav.bg }}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setStatsModalVisible(false)}><MaterialIcons name="close" size={28} color={colorsNav.text} /></TouchableOpacity>
                        <Text style={[styles.modalHeaderTitle, { color: colorsNav.text }]}>AnÃ¡lisis de Gastos</Text>
                        <View style={{ width: 28 }} />
                    </View>
                    <ScrollView contentContainerStyle={{ padding: 20 }}>
                        <CategoryStatistics transactions={transactions} colorsNav={colorsNav} isHidden={isHidden} currency={currency} rates={rates} />
                    </ScrollView>
                </SafeAreaView>
            </Modal>

            <Modal visible={weeklyModalVisible} animationType="slide" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
                    <View style={[styles.modalBox, { backgroundColor: colorsNav.card, borderTopLeftRadius: 32, borderTopRightRadius: 32, width: '100%' }]}>
                        <View style={{ width: 40, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <Text style={[styles.modalTitle, { color: colorsNav.text, marginBottom: 0 }]}>Gasto Semanal</Text>
                            <TouchableOpacity onPress={() => setWeeklyModalVisible(false)}><MaterialIcons name="close" size={24} color={colorsNav.sub} /></TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 12, marginVertical: 20 }}>
                            <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#EF444410', padding: 16, borderRadius: 20 }}>
                                <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '800' }}>GASTOS 7 DÃAS</Text>
                                <Text style={{ fontSize: 24, fontWeight: '900', color: '#EF4444' }}>{fmt(weeklySpending, currency, rates, isHidden)}</Text>
                                <Text style={{ color: weeklyChangePct > 0 ? '#EF4444' : '#10B981', fontSize: 10, fontWeight: '800', marginTop: 4 }}>
                                    {weeklyChangePct >= 0 ? '+' : ''}{weeklyChangePct.toFixed(0)}% vs semana anterior
                                </Text>
                            </View>
                            <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#10B98110', padding: 16, borderRadius: 20 }}>
                                <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '800' }}>INGRESOS 7 DÃAS</Text>
                                <Text style={{ fontSize: 24, fontWeight: '900', color: '#10B981' }}>{fmt(weeklyIncome, currency, rates, isHidden)}</Text>
                            </View>
                        </View>

                        <View style={[statStyle.card, { backgroundColor: colorsNav.bg, padding: 16, marginTop: 14, marginBottom: 16 }]}>
                            <Text style={[statStyle.title, { color: colorsNav.text, fontSize: 14, marginBottom: 12 }]}>DistribuciÃ³n del flujo semanal</Text>
                            <View style={statStyle.splitTrack}>
                                <View style={[statStyle.splitFixed, { width: `${Math.max(0, weeklyFixedPct)}%` }]} />
                                <View style={[statStyle.splitVariable, { width: `${Math.max(0, weeklyVariablePct)}%` }]} />
                                <View style={[statStyle.splitSavings, { width: `${Math.max(0, weeklySavingsPct)}%`, backgroundColor: '#10B981' }]} />
                            </View>
                            <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
                                <View style={[statStyle.splitBox, { backgroundColor: '#EF444410', padding: 10 }]}>
                                    <Text style={[statStyle.splitLabel, { color: '#EF4444', fontSize: 9 }]}>FIJOS</Text>
                                    <Text style={[statStyle.splitValue, { color: colorsNav.text, fontSize: 13 }]}>{fmt(weeklySplitDetailed.fixed, currency, rates, isHidden)}</Text>
                                </View>
                                <View style={[statStyle.splitBox, { backgroundColor: '#3B82F610', padding: 10 }]}>
                                    <Text style={[statStyle.splitLabel, { color: '#3B82F6', fontSize: 9 }]}>VARIABLES</Text>
                                    <Text style={[statStyle.splitValue, { color: colorsNav.text, fontSize: 13 }]}>{fmt(weeklySplitDetailed.variable, currency, rates, isHidden)}</Text>
                                </View>
                                <View style={[statStyle.splitBox, { backgroundColor: '#10B98110', padding: 10 }]}>
                                    <Text style={[statStyle.splitLabel, { color: '#10B981', fontSize: 9 }]}>AHORRO/INV</Text>
                                    <Text style={[statStyle.splitValue, { color: colorsNav.text, fontSize: 13 }]}>{fmt(weeklySplitDetailed.savings, currency, rates, isHidden)}</Text>
                                </View>
                            </View>
                        </View>
                        <ScrollView style={{ maxHeight: 300 }}>
                            {weeklySummaryData.map(([cat, amt]) => {
                                const info = CAT_INFO[cat] || CAT_INFO['Otros'];
                                return (
                                    <View key={cat} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 15 }}>
                                        <View style={[mSt.dayCircle, { backgroundColor: info.bg, width: 36, height: 36 }]}><MaterialIcons name={info.icon} size={18} color={info.color} /></View>
                                        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colorsNav.text }}>{cat}</Text>
                                        <Text style={{ fontSize: 14, fontWeight: '800', color: colorsNav.text }}>{fmt(amt, currency, rates, isHidden)}</Text>
                                    </View>
                                );
                            })}
                        </ScrollView>
                        <InsightCard
                            text={weeklyInsight}
                            colorsNav={colorsNav}
                            tone={weeklyChangePct > 20 ? 'warn' : 'info'}
                        />
                        <TouchableOpacity style={{ padding: 18, backgroundColor: colorsNav.accent, borderRadius: 18, alignItems: 'center', marginTop: 16 }} onPress={() => setWeeklyModalVisible(false)}>
                            <Text style={{ color: '#FFF', fontWeight: '800' }}>Cerrar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={currencyModalVisible} transparent animationType="slide">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
                    <View style={[styles.modalBox, { backgroundColor: colorsNav.card, borderTopLeftRadius: 32, borderTopRightRadius: 32 }]}>
                        {/* Title row with refresh button */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <Text style={[styles.modalTitle, { color: colorsNav.text, marginBottom: 0 }]}>Moneda Principal</Text>
                            <TouchableOpacity
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: isSyncingRates ? colorsNav.border : colorsNav.accent + '15' }}
                                disabled={isSyncingRates}
                                onPress={async () => {
                                    setIsSyncingRates(true);
                                    await syncRates();
                                    setIsSyncingRates(false);
                                }}
                            >
                                <MaterialIcons name="sync" size={14} color={isSyncingRates ? colorsNav.sub : colorsNav.accent} />
                                <Text style={{ color: isSyncingRates ? colorsNav.sub : colorsNav.accent, fontSize: 11, fontWeight: '800' }}>
                                    {isSyncingRates ? 'Actualizando...' : 'Actualizar'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Last updated label */}
                        {ratesUpdatedAt && (
                            <Text style={{ color: colorsNav.sub, fontSize: 10, fontWeight: '600', marginBottom: 16 }}>
                                Tasas al: {new Date(ratesUpdatedAt).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        )}

                        {/* Currency list with live rates */}
                        {CURRENCIES.map(curr => {
                            const isActive = currency === curr.code;
                            const rate = curr.code === 'COP' ? null : rates[curr.code];
                            return (
                                <TouchableOpacity
                                    key={curr.code}
                                    style={[styles.listItem, isActive && { backgroundColor: colorsNav.accent + '12', borderRadius: 14, marginHorizontal: -4, paddingHorizontal: 12 }]}
                                    onPress={() => { setCurrencyConfig(curr.code); setCurrencyModalVisible(false); }}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colorsNav.text, fontWeight: '700', fontSize: 15 }}>
                                            {curr.symbol} {curr.name}
                                        </Text>
                                        {rate && (
                                            <Text style={{ color: colorsNav.sub, fontSize: 11, fontWeight: '600', marginTop: 2 }}>
                                                1 {curr.code} = {new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(rate)} COP
                                            </Text>
                                        )}
                                    </View>
                                    {isActive && <MaterialIcons name="check-circle" size={20} color={colorsNav.accent} />}
                                </TouchableOpacity>
                            );
                        })}

                        <TouchableOpacity style={{ marginTop: 20, alignItems: 'center' }} onPress={() => setCurrencyModalVisible(false)}>
                            <Text style={{ color: colorsNav.sub, fontWeight: '700' }}>Cerrar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={editModalVisible} transparent animationType="fade">
                <View style={styles.overlay}>
                    <View style={[styles.modalBox, { backgroundColor: colorsNav.card }]}>
                        <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Editar Nombre</Text>
                        <TextInput style={{ borderWidth: 1, borderColor: colorsNav.border, borderRadius: 12, padding: 16, color: colorsNav.text, marginBottom: 20 }} value={newName} onChangeText={setNewName} />
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colorsNav.bg, alignItems: 'center' }} onPress={() => setEditModalVisible(false)}><Text style={{ color: colorsNav.text }}>Cancelar</Text></TouchableOpacity>
                            <TouchableOpacity style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: colorsNav.accent, alignItems: 'center' }} onPress={handleUpdateName}><Text style={{ color: '#FFF', fontWeight: '800' }}>Guardar</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* MODAL DETALLE DEL DÃA */}
            <Modal visible={dayDetailModalVisible} animationType="fade" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}>
                    <View style={[styles.modalBox, { backgroundColor: colorsNav.card }]}>

                        {/* HEADER */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <View>
                                <Text style={{ fontSize: 22, fontWeight: '900', color: colorsNav.text }}>
                                    {selectedDate ? `${selectedDate.getDate()} de ${MONTH_NAMES_FULL[selectedDate.getMonth()]}` : ''}
                                </Text>
                                <Text style={{ color: colorsNav.sub, fontSize: 12 }}>Detalle de la jornada</Text>
                            </View>
                            <TouchableOpacity onPress={() => setDayDetailModalVisible(false)} style={styles.closeCircle}>
                                <Ionicons name="close" size={22} color={colorsNav.text} />
                            </TouchableOpacity>
                        </View>

                        {/* INGRESOS / GASTOS */}
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                            <View style={{ flex: 1, backgroundColor: '#10B98115', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#10B98130' }}>
                                <Text style={{ fontSize: 9, fontWeight: '900', color: '#10B981', letterSpacing: 0.6, marginBottom: 3 }}>INGRESOS</Text>
                                <Text style={{ fontSize: 15, fontWeight: '900', color: '#10B981' }}>
                                    {fmt(getDayTransactions(selectedDate).filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0), currency, rates, isHidden)}
                                </Text>
                            </View>
                            <View style={{ flex: 1, backgroundColor: '#EF444415', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#EF444430' }}>
                                <Text style={{ fontSize: 9, fontWeight: '900', color: '#EF4444', letterSpacing: 0.6, marginBottom: 3 }}>GASTOS</Text>
                                <Text style={{ fontSize: 15, fontWeight: '900', color: '#EF4444' }}>
                                    {fmt(getDayTransactions(selectedDate).filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(t.amount), 0), currency, rates, isHidden)}
                                </Text>
                            </View>
                        </View>

                        {/* INSIGHT */}
                        {selectedDayExpenseTotal > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, backgroundColor: colorsNav.accent + '10', borderRadius: 12, marginBottom: 14 }}>
                                <MaterialIcons name="insights" size={16} color={colorsNav.accent} style={{ marginTop: 1 }} />
                                <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: colorsNav.text, fontWeight: '500' }}>
                                    Este dÃ­a representa {selectedDayWeekShare.toFixed(0)}% de tus gastos semanales y {selectedDayMonthShare.toFixed(0)}% del mes.
                                    {selectedDayTxs.some(isFixedExpense) ? ' Este pago afectÃ³ tu categorÃ­a Gasto Fijo.' : ''}
                                </Text>
                            </View>
                        )}

                        {/* MOVIMIENTOS */}
                        {getDayTransactions(selectedDate).length > 0 && (
                            <>
                                <Text style={{ fontSize: 10, fontWeight: '900', color: colorsNav.sub, marginBottom: 6, letterSpacing: 0.6 }}>MOVIMIENTOS</Text>
                                <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
                                    {getDayTransactions(selectedDate).map((t, idx) => (
                                        <View key={idx} style={{
                                            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                            paddingVertical: 7,
                                            borderBottomWidth: 1, borderBottomColor: colorsNav.bg,
                                        }}>
                                            <Text style={{ color: colorsNav.text, fontWeight: '600', fontSize: 13 }}>{t.category}</Text>
                                            <Text style={{ color: t.type === 'income' ? '#10B981' : '#EF4444', fontWeight: '800', fontSize: 13 }}>
                                                {t.type === 'income' ? '+' : '-'}{fmt(Math.abs(t.amount), currency, rates, isHidden)}
                                            </Text>
                                        </View>
                                    ))}
                                </ScrollView>
                            </>
                        )}
                        {getDayTransactions(selectedDate).length === 0 && getDayReminders(selectedDate).length === 0 && (
                            <Text style={{ color: colorsNav.sub, fontStyle: 'italic', fontSize: 13, paddingVertical: 8 }}>Sin movimientos registrados.</Text>
                        )}

                        {/* COMPROMISOS */}
                        {getDayReminders(selectedDate).length > 0 && (
                            <>
                                <Text style={{ fontSize: 10, fontWeight: '900', color: colorsNav.sub, marginTop: 14, marginBottom: 6, letterSpacing: 0.6 }}>COMPROMISOS / FACTURAS</Text>
                                <ScrollView style={{ maxHeight: 130 }} showsVerticalScrollIndicator={false}>
                                    {getDayReminders(selectedDate).map((r, idx) => (
                                        <View key={idx} style={{
                                            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                            paddingVertical: 8, paddingHorizontal: 10,
                                            backgroundColor: colorsNav.bg, borderRadius: 10, marginBottom: 6,
                                            opacity: r.is_paid ? 0.6 : 1,
                                        }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
                                                <TouchableOpacity onPress={() => handleTogglePaid(r)}>
                                                    <Ionicons name={r.is_paid ? 'checkbox' : 'square-outline'} size={20} color={r.is_paid ? '#10B981' : colorsNav.sub} />
                                                </TouchableOpacity>
                                                <View>
                                                    <Text style={{ color: colorsNav.text, fontWeight: '700', fontSize: 13, textDecorationLine: r.is_paid ? 'line-through' : 'none' }}>{r.title}</Text>
                                                    <Text style={{ color: colorsNav.sub, fontSize: 11 }}>{fmt(r.amount, currency, rates, isHidden)}</Text>
                                                </View>
                                            </View>
                                            <TouchableOpacity onPress={() => {
                                                if (r.is_fixed_expense) {
                                                    router.push('/(tabs)/debts');
                                                    setDayDetailModalVisible(false);
                                                } else {
                                                    handleDeleteReminder(r.id);
                                                }
                                            }}>
                                                <MaterialIcons name={r.is_fixed_expense ? 'arrow-forward' : 'delete-outline'} size={18} color={r.is_fixed_expense ? colorsNav.accent : '#EF4444'} />
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </ScrollView>
                            </>
                        )}

                        {/* CLOSE BUTTON */}
                        <TouchableOpacity
                            style={{ backgroundColor: colorsNav.accent, paddingVertical: 13, borderRadius: 16, alignItems: 'center', marginTop: 16 }}
                            onPress={() => setDayDetailModalVisible(false)}
                        >
                            <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 14 }}>Cerrar</Text>
                        </TouchableOpacity>
                    </View>
                </View>

            {/* MODAL NUEVO RECORDATORIO */}
            <Modal visible={addReminderModalVisible} animationType="slide" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <View style={[styles.modalBox, { backgroundColor: colorsNav.card, borderTopLeftRadius: 32, borderTopRightRadius: 32 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <Text style={[styles.modalTitle, { color: colorsNav.text }]}>Nuevo Compromiso</Text>
                            <TouchableOpacity onPress={() => setAddReminderModalVisible(false)}>
                                <Ionicons name="close" size={24} color={colorsNav.sub} />
                            </TouchableOpacity>
                        </View>
                        
                        <Text style={{ fontSize: 12, color: colorsNav.sub, marginBottom: 8 }}>TÃTULO (Ej. Arriendo)</Text>
                        <TextInput 
                            style={{ backgroundColor: colorsNav.bg, borderRadius: 12, padding: 15, color: colorsNav.text, marginBottom: 15 }}
                            value={newReminderTitle}
                            onChangeText={setNewReminderTitle}
                            placeholder="Nombre del compromiso"
                        />
                        
                        <Text style={{ fontSize: 12, color: colorsNav.sub, marginBottom: 8 }}>VALOR ESTIMADO</Text>
                        <TextInput 
                            style={{ backgroundColor: colorsNav.bg, borderRadius: 12, padding: 15, color: colorsNav.text, marginBottom: 20 }}
                            value={newReminderAmount}
                            onChangeText={setNewReminderAmount}
                            keyboardType="numeric"
                            placeholder="$ 0"
                        />

                        <Text style={{ fontSize: 12, color: colorsNav.sub, marginBottom: 15 }}>
                            Se repetirÃ¡ todos los meses el dÃ­a {selectedDate ? selectedDate.getDate() : 'seleccionado'}.
                        </Text>

                        <TouchableOpacity 
                            style={{ backgroundColor: colorsNav.accent, paddingVertical: 18, borderRadius: 18, alignItems: 'center' }}
                            onPress={handleAddReminder}
                        >
                            <Text style={{ color: '#FFF', fontWeight: '800' }}>Guardar Compromiso</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 40 : 10, marginBottom: 10 },
    headerTitle: { fontSize: 24, fontWeight: '800' },
    themeBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    scroll: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 140 },
    profileCard: { borderRadius: 28, padding: 20, marginBottom: 12, elevation: 2 },
    profileTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
    avatar: { width: 56, height: 56, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    avatarImg: { width: 56, height: 56, borderRadius: 20 },
    avatarTxt: { color: '#FFF', fontSize: 20, fontWeight: '800' },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { fontSize: 18, fontWeight: '800' },
    email: { fontSize: 12, marginTop: 1, opacity: 0.7 },
    actionRow: { flexDirection: 'row', gap: 10 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 14 },
    optionsGrid: { flexWrap: 'wrap', flexDirection: 'row', gap: 12, marginBottom: 12 },
    optBtn: { flex: 1, padding: 14, borderRadius: 20, gap: 2 },
    optIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
    optTitle: { fontSize: 14, fontWeight: '800' },
    budgetFullBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, elevation: 1 },
    agendaSummaryRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    agendaSummaryCard: { flex: 1, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 10 },
    agendaSummaryLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6, marginBottom: 4 },
    agendaSummaryValue: { fontSize: 12, fontWeight: '900' },
    agendaLegend: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 6, marginBottom: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 10, fontWeight: '700' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
    modalBox: { borderRadius: 32, padding: 24 },
    modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 20 },
    listItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14, justifyContent: 'space-between' },
    listIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    listTitle: { fontSize: 15, fontWeight: '700' },
    listSub: { fontSize: 12, marginTop: 2 },
    sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginLeft: 6, marginBottom: 12, opacity: 0.8 },
    themeSheet: { borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 24, paddingTop: 14, maxHeight: '85%' },
    sheetHandle: { width: 40, height: 4, backgroundColor: '#CCC', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
    closeCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    themeRow: { marginBottom: 12 },
    themeRowLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
    themeEmoji: { fontSize: 16 },
    themeGroupName: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
    themeSwatchRow: { flexDirection: 'row', gap: 10 },
    swatch: { flex: 1, height: 54, borderRadius: 16, borderWidth: 2, borderColor: 'transparent', justifyContent: 'center', alignItems: 'center', gap: 5, position: 'relative', paddingHorizontal: 8 },
    swatchActive: { borderWidth: 2, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, elevation: 4 },
    swatchDot: { width: 16, height: 16, borderRadius: 8 },
    swatchDotSm: { width: 10, height: 10, borderRadius: 5 },
    swatchLabel: { fontSize: 10, fontWeight: '800' },
    swatchCheck: { position: 'absolute', top: 6, right: 6, width: 15, height: 15, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
    modalHeaderTitle: { fontSize: 18, fontWeight: '800' },
    newSwatchCard: { width: '48%', padding: 10, borderRadius: 20, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, position: 'relative' },
    paletteCircle: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 3, borderWidth: 1 },
    paletteDot: { width: 10, height: 10, borderRadius: 5 },
    paletteDotSm: { width: 7, height: 7, borderRadius: 3.5 },
    newSwatchLabel: { fontSize: 13, fontWeight: '800' },
    newSwatchCheck: { width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
});
