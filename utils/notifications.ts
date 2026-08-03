import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';


Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
    }),
});

export async function registerForPushNotificationsAsync() {
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#6366F1',
        });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }
    return finalStatus === 'granted';
}

export async function scheduleDailyReminder(hour: number, minute: number, title?: string, body?: string) {
    // Cancelar previos para no duplicar
    await Notifications.cancelAllScheduledNotificationsAsync();

    if (Platform.OS === 'web') {
        // En Web no existe programación nativa diaria en local
        // Usamos un pequeño hack: agendamos una alarma en memoria si el app está abierta
        console.log(`[Web] Agendado para las ${hour}:${minute}`);
        return;
    }

    await Notifications.scheduleNotificationAsync({
        content: {
            title: title || "💰 ¡No olvides tus finanzas!",
            body: body || "¿Ya anotaste tus gastos de hoy? Mantén el control de tu dinero.",
            data: { screen: 'explore' },
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
        },
    });
}

const MOTIVATIONAL_QUOTES = [
    { quote: "El interés compuesto es la octava maravilla del mundo. Quien lo entiende, lo gana; quien no, lo paga.", author: "Albert Einstein" },
    { quote: "La mejor inversión que puedes hacer es en ti mismo.", author: "Warren Buffett" },
    { quote: "No ahorres lo que queda después de gastar; gasta lo que queda después de ahorrar.", author: "Warren Buffett" },
    { quote: "La riqueza no consiste en tener muchas posesiones, sino en tener pocas necesidades.", author: "Epicteto" },
    { quote: "El camino hacia la riqueza depende fundamentalmente de dos palabras: trabajo y ahorro.", author: "Benjamin Franklin" },
    { quote: "El dinero es un buen sirviente, pero un mal amo.", author: "Francis Bacon" },
    { quote: "No compres cosas que no necesitas con dinero que no tienes para impresionar a gente que no te agrada.", author: "Dave Ramsey" },
    { quote: "Comprar un activo es comprar un flujo de ingresos que trabaja para ti.", author: "Robert Kiyosaki" },
    { quote: "La paciencia y el tiempo hacen más que la fuerza y la pasión.", author: "Jean de La Fontaine" }
];

export async function scheduleCoherentReminders(name: string) {
    // Cancelar previos para no duplicar
    await Notifications.cancelAllScheduledNotificationsAsync();

    if (Platform.OS === 'web') {
        console.log(`[Web] Notificaciones configuradas para ${name}`);
        return;
    }

    const userName = name || 'Usuario';
    const randomQuote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];

    // 1. Motivación de la mañana (7:00 AM)
    await Notifications.scheduleNotificationAsync({
        content: {
            title: `💡 Inspiración matutina, ${userName}`,
            body: `"${randomQuote.quote}" — ${randomQuote.author}`,
            data: { screen: 'explore' },
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 7,
            minute: 0,
        },
    });

    // 2. Registro de Gastos/Ingresos de la noche (7:00 PM / 19:00)
    await Notifications.scheduleNotificationAsync({
        content: {
            title: `🌙 Cierre de jornada, ${userName}`,
            body: "¿Ya anotaste tus ingresos y gastos de hoy? Mantén tu control financiero.",
            data: { screen: 'explore' },
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 19,
            minute: 0,
        },
    });
}

export async function cancelReminders() {
    await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Revisa los gastos fijos y deudas que vencen HOY y envía una notificación local inmediata.
 * Ejemplo: "Hoy tienes que pagar el plan del telefono"
 */
export async function checkAndNotifyDueExpensesToday(debts: any[], reminders: any[] = [], userName: string = 'Usuario') {
    if (Platform.OS === 'web') return;

    try {
        const today = new Date();
        const currentDay = today.getDate();
        const todayKey = `${today.getFullYear()}-${today.getMonth() + 1}-${currentDay}`;

        const itemsToNotify: { id: string; name: string; amount?: number }[] = [];

        // 1. Revisar Gastos Fijos y Deudas
        (debts || []).forEach(d => {
            if (Number(d.paid || 0) >= Number(d.value || 0)) return; // Ya pagado

            let isDueToday = false;
            let dayNumber = 0;

            if (d.debt_type === 'fixed') {
                if (d.due_date) {
                    const cleanStr = String(d.due_date).trim();
                    if (cleanStr.includes('-')) {
                        const parts = cleanStr.split('-');
                        dayNumber = parseInt(parts[parts.length - 1], 10);
                    } else if (cleanStr.includes('/')) {
                        const parts = cleanStr.split('/');
                        dayNumber = parseInt(parts[0], 10);
                    } else {
                        dayNumber = parseInt(cleanStr, 10);
                    }
                }
                if (dayNumber === currentDay) {
                    isDueToday = true;
                }
            } else if (d.due_date) {
                const cleanStr = String(d.due_date).trim();
                const due = new Date(cleanStr.includes('T') ? cleanStr : `${cleanStr}T12:00:00`);
                if (!isNaN(due.getTime())) {
                    if (due.getDate() === currentDay && due.getMonth() === today.getMonth() && due.getFullYear() === today.getFullYear()) {
                        isDueToday = true;
                    }
                }
            }

            if (isDueToday) {
                itemsToNotify.push({
                    id: `debt_${d.id}`,
                    name: d.client || 'Gasto Fijo',
                    amount: d.value,
                });
            }
        });

        // 2. Revisar tabla de Reminders
        (reminders || []).forEach(r => {
            if (r.is_paid) return;
            if (r.due_day === currentDay) {
                itemsToNotify.push({
                    id: `rem_${r.id}`,
                    name: r.title || 'Recordatorio',
                    amount: r.amount,
                });
            }
        });

        // 3. Notificar inmediatamente si no se ha notificado hoy
        for (const item of itemsToNotify) {
            const notifKey = `@notified_due_${item.id}_${todayKey}`;
            const alreadySent = await AsyncStorage.getItem(notifKey);
            if (!alreadySent) {
                await Notifications.scheduleNotificationAsync({
                    content: {
                        title: `📌 Recordatorio de Pago`,
                        body: `Hoy tienes que pagar ${item.name}`,
                        data: { screen: 'debts' },
                    },
                    trigger: null, // Inmediato
                });
                await AsyncStorage.setItem(notifKey, 'true');
            }
        }
    } catch (e) {
        console.error('Error enviando notificaciones de pago de hoy:', e);
    }
}



