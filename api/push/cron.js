const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

// ── Messages by type ──────────────────────────────────────────────────────────
const MESSAGES = {
  morning: [
    { title: '🌅 Buenos días, Santy aquí', body: 'Empieza el día revisando tu saldo. Un minuto de finanzas puede cambiarlo todo.' },
    { title: '☕ Recordatorio matutino', body: '¿Aportaste a tu meta de ahorro esta semana? Hoy es un buen día para hacerlo.' },
    { title: '🌟 Nueva oportunidad financiera', body: 'Los mercados abrieron. Revisa el precio de tus activos antes de que pase el día.' },
    { title: '💡 Consejo de Santy', body: 'Registra cada gasto hoy, por pequeño que sea. Los detalles hacen la diferencia.' },
    { title: '🎯 Hacia tu meta', body: '¿Cuánto te falta para tu próxima meta de ahorro? Ábrela y verifica tu progreso.' },
  ],
  evening: [
    { title: '🌙 Resumen nocturno', body: '¿Registraste todos tus gastos de hoy? Tómate 2 minutos antes de dormir.' },
    { title: '💰 ¿Cómo estuvo tu día financiero?', body: 'Un buen hábito: revisar tus transacciones cada noche. Abre Zenly.' },
    { title: '📊 Santy te recuerda', body: 'Llevar el control diario de tus finanzas puede salvarte de sorpresas a fin de mes.' },
    { title: '🔔 Recordatorio de ahorro', body: '¿Pusiste algo en tu fondo de emergencia hoy? Cada peso acumulado cuenta.' },
    { title: '😴 Antes de dormir...', body: 'Revisa si tienes deudas o compromisos próximos. Mejor prevenidos.' },
  ],
  weekly: [
    { title: '📅 Resumen semanal de Santy', body: 'Es domingo, momento perfecto para revisar tus gastos de la semana y planear la siguiente.' },
    { title: '🏆 Tu semana financiera', body: 'Mira cuánto gastaste esta semana versus tu presupuesto. ¿Estás en camino a tu meta?' },
    { title: '🗓️ Planifica tu semana', body: 'Antes de que empiece la semana: define un límite de gastos y comprométete con él.' },
  ],
};

// ── Fetch reminders from Supabase and build personalized messages ──────────────
async function getPersonalizedMessages(supabase, userId, type) {
  const msgs = [];

  // Check upcoming debt due dates (within 3 days)
  try {
    const { data: debts } = await supabase
      .from('debts')
      .select('client, due_date, value, paid, debt_type')
      .eq('user_id', userId)
      .eq('debt_type', 'fixed');

    if (debts && debts.length > 0) {
      const today = new Date();
      const in3Days = new Date(today);
      in3Days.setDate(today.getDate() + 3);

      const upcoming = debts.filter(d => {
        if (!d.due_date) return false;
        const due = new Date(d.due_date);
        return due >= today && due <= in3Days && d.paid < d.value;
      });

      upcoming.forEach(d => {
        const dueDate = new Date(d.due_date);
        const daysLeft = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        msgs.push({
          title: `⚠️ Vencimiento próximo: ${d.client}`,
          body: `${d.client} vence ${daysLeft === 0 ? 'hoy' : `en ${daysLeft} día${daysLeft > 1 ? 's' : ''}`}. Prepara el pago.`,
          url: '/debts'
        });
      });
    }
  } catch (e) { /* ignore */ }

  // Check goals close to target
  try {
    const { data: goals } = await supabase
      .from('goals')
      .select('name, target_amount, current_amount')
      .eq('user_id', userId);

    if (goals && goals.length > 0) {
      goals.forEach(g => {
        if (!g.target_amount || g.target_amount <= 0) return;
        const progress = (g.current_amount / g.target_amount) * 100;
        if (progress >= 80 && progress < 100) {
          msgs.push({
            title: `🎯 ¡Casi llegas a "${g.name}"!`,
            body: `Tu meta está al ${Math.round(progress)}%. Un último empujón y la alcanzas.`,
            url: '/goals'
          });
        }
      });
    }
  } catch (e) { /* ignore */ }

  // Check reminders table
  try {
    const { data: reminders } = await supabase
      .from('reminders')
      .select('title, amount, date')
      .eq('user_id', userId);

    if (reminders && reminders.length > 0) {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().split('T')[0];

      reminders.forEach(r => {
        if (r.date === todayStr || r.date === tomorrowStr) {
          msgs.push({
            title: `📌 Recordatorio: ${r.title}`,
            body: r.amount
              ? `Tienes programado un recordatorio de $${Number(r.amount).toLocaleString('es-CO')} hoy.`
              : `Tienes un recordatorio agendado: ${r.title}`,
            url: '/profile'
          });
        }
      });
    }
  } catch (e) { /* ignore */ }

  // If we have personalized messages, return them; otherwise use generic
  if (msgs.length > 0) return msgs;

  const pool = MESSAGES[type] || MESSAGES.morning;
  return [pool[Math.floor(Math.random() * pool.length)]];
}

// ── Handler ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://nhbnltdlzxaigztukbfy.supabase.co';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@zenly.app';

    webpush.setVapidDetails(
      vapidSubject.trim(),
      vapidPublicKey.trim(),
      vapidPrivateKey.trim()
    );

    const type = (req.query && req.query.type) || 'morning';

    // Get all active subscriptions
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*');

    if (error) return res.status(500).json({ error: error.message });
    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({ message: 'No subscriptions' });
    }

    // Group subscriptions by user so we can personalize per user
    const byUser = {};
    subscriptions.forEach(sub => {
      const uid = sub.user_id || 'anonymous';
      if (!byUser[uid]) byUser[uid] = [];
      byUser[uid].push(sub);
    });

    let totalSent = 0;

    for (const [userId, subs] of Object.entries(byUser)) {
      // Get personalized messages for this user
      const messages = await getPersonalizedMessages(
        supabase,
        userId === 'anonymous' ? null : userId,
        type
      );

      // Limit to 1 message per cron run per user (pick most relevant)
      const msg = messages[0];
      const payload = JSON.stringify({
        title: msg.title,
        body: msg.body,
        url: msg.url || '/'
      });

      for (const sub of subs) {
        const pushSub = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        };
        try {
          await webpush.sendNotification(pushSub, payload);
          totalSent++;
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          }
        }
      }
    }

    return res.status(200).json({ success: true, type, sent: totalSent });
  } catch (err) {
    console.error('Cron error:', err);
    return res.status(500).json({ error: err.message });
  }
};
