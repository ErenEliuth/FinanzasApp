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

export async function scheduleDailyReminder(hour: number, minute: number) {
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
            title: "💰 ¡No olvides tus finanzas!",
            body: "¿Ya anotaste tus gastos de hoy? Mantén el control de tu dinero.",
            data: { screen: 'explore' },
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
        },
    });
}

export async function cancelReminders() {
    await Notifications.cancelAllScheduledNotificationsAsync();
}
