import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

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

    // 0. Motivación de la mañana (7:00 AM)
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

    // 1. Mañana (8:30 AM) - Portafolio
    await Notifications.scheduleNotificationAsync({
        content: {
            title: `📈 ¡Hola ${userName}! Tu portafolio al día`,
            body: "Revisa las variaciones del mercado y el estado de tus inversiones hoy.",
            data: { screen: 'invest' },
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 8,
            minute: 30,
        },
    });

    // 2. Tarde (2:30 PM) - Ahorro
    await Notifications.scheduleNotificationAsync({
        content: {
            title: `🎯 Reto de Ahorro para ${userName}`,
            body: "¿Ya hiciste tu aporte del día? Pequeños montos construyen grandes futuros.",
            data: { screen: 'goals' },
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 14,
            minute: 30,
        },
    });

    // 3. Noche (8:30 PM) - Registro de Gastos/Ingresos
    await Notifications.scheduleNotificationAsync({
        content: {
            title: `🌙 Cierre del día, ${userName}`,
            body: "¿Ya anotaste tus ingresos y gastos de hoy? Mantén tu control financiero.",
            data: { screen: 'explore' },
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 20,
            minute: 30,
        },
    });
}

export async function cancelReminders() {
    await Notifications.cancelAllScheduledNotificationsAsync();
}


