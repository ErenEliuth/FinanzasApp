const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

// ── Messages by type (using {name} placeholder) ────────────────────────────────
const MESSAGES = {
  morning: [
    { title: '🌅 Buenos días, {name}', body: 'Empieza el día revisando tu saldo. Un minuto de finanzas puede cambiarlo todo.' },
    { title: '☕ Recordatorio para {name}', body: '¿Aportaste a tu meta de ahorro esta semana? Hoy es un buen día para hacerlo.' },
    { title: '🌟 Oportunidad para {name}', body: 'Los mercados abrieron. Revisa el precio de tus activos en tu portafolio antes de que pase el día.' },
    { title: '💡 Consejo para {name}', body: 'Registra cada gasto hoy, por pequeño que sea. Los detalles hacen la diferencia.' },
    { title: '🎯 Hacia tu meta, {name}', body: '¿Cuánto te falta para tu próxima meta de ahorro? Ábrela y verifica tu progreso.' },
  ],
  evening: [
    { title: '🌙 Resumen nocturno para {name}', body: '¿Registraste todos tus gastos de hoy? Tómate 2 minutos antes de dormir.' },
    { title: '💰 ¿Cómo estuvo tu día, {name}?', body: 'Un buen hábito: revisar tus transacciones cada noche. Mantén tu control financiero.' },
    { title: '📊 Recordatorio para {name}', body: 'Llevar el control diario de tus finanzas te salvará de sorpresas a fin de mes.' },
    { title: '🔔 Recordatorio de ahorro, {name}', body: '¿Pusiste algo en tu fondo de emergencia hoy? Cada peso acumulado cuenta.' },
    { title: '😴 {name}, antes de dormir...', body: 'Revisa si tienes deudas o compromisos próximos. Mejor prevenidos.' },
  ],
  weekly: [
    { title: '📅 Resumen semanal para {name}', body: 'Es domingo, momento perfecto para revisar tus gastos de la semana y planear la siguiente.' },
    { title: '🏆 Tu semana financiera, {name}', body: 'Mira cuánto gastaste esta semana versus tu presupuesto. ¿Estás en camino a tu meta?' },
    { title: '🗓️ Planifica tu semana, {name}', body: 'Antes de que empiece la semana: define un límite de gastos y comprométete con él.' },
  ],
  motivation: [
    { title: '💡 Inspiración matutina, {name}', body: '"El interés compuesto es la octava maravilla del mundo. Quien lo entiende, lo gana; quien no, lo paga." — Albert Einstein' },
    { title: '💡 Inspiración matutina, {name}', body: '"La mejor inversión que puedes hacer es en ti mismo." — Warren Buffett' },
    { title: '💡 Inspiración matutina, {name}', body: '"No ahorres lo que queda después de gastar; gasta lo que queda después de ahorrar." — Warren Buffett' },
    { title: '💡 Inspiración matutina, {name}', body: '"La riqueza no consiste en tener muchas posesiones, sino en tener pocas necesidades." — Epicteto' },
    { title: '💡 Inspiración matutina, {name}', body: '"El camino hacia la riqueza depende fundamentalmente de dos palabras: trabajo y ahorro." — Benjamin Franklin' },
    { title: '💡 Inspiración matutina, {name}', body: '"El dinero es un buen sirviente, pero un mal amo." — Francis Bacon' },
    { title: '💡 Inspiración matutina, {name}', body: '"No compres cosas que no necesitas con dinero que no tienes para impresionar a gente que no te agrada." — Dave Ramsey' },
    { title: '💡 Inspiración matutina, {name}', body: '"Comprar un activo es comprar un flujo de ingresos que trabaja para ti." — Robert Kiyosaki' },
    { title: '💡 Inspiración matutina, {name}', body: '"La paciencia y el tiempo hacen más que la fuerza y la pasión." — Jean de La Fontaine' }
  ],
};

// ── Fetch reminders from Supabase and build personalized messages ──────────────
async function getPersonalizedMessages(supabase, userId, type) {
  const msgs = [];
  let name = 'Usuario';

  if (userId) {
    try {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
      if (!userError && userData && userData.user) {
        name = userData.user.user_metadata?.name || userData.user.email?.split('@')[0] || 'Usuario';
      }
    } catch (e) {
      console.error('Error fetching user info for notifications:', e);
    }
  }

  // 1. Check upcoming debt due dates (within 3 days)
  try {
    if (userId) {
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
            title: `⚠️ ${name}, vencimiento próximo: ${d.client}`,
            body: `${d.client} vence ${daysLeft === 0 ? 'hoy' : `en ${daysLeft} día${daysLeft > 1 ? 's' : ''}`}. Prepara tu pago.`,
            url: '/debts'
          });
        });
      }
    }
  } catch (e) { /* ignore */ }

  // 2. Check goals close to target (Savings progress)
  try {
    if (userId) {
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
              title: `🎯 ¡Casi llegas, ${name}!`,
              body: `Tu meta "${g.name}" está al ${Math.round(progress)}%. Un último empujón y la alcanzas.`,
              url: '/goals'
            });
          }
        });
      }
    }
  } catch (e) { /* ignore */ }

  // 3. Check reminders table
  try {
    if (userId) {
      const { data: reminders } = await supabase
        .from('reminders')
        .select('title, amount, due_day')
        .eq('user_id', userId);

      if (reminders && reminders.length > 0) {
        const today = new Date();
        const currentDay = today.getDate();

        reminders.forEach(r => {
          if (r.due_day === currentDay) {
            msgs.push({
              title: `📌 ${name}, recordatorio: ${r.title}`,
              body: r.amount
                ? `Tienes programado un recordatorio de $${Number(r.amount).toLocaleString('es-CO')} hoy.`
                : `Tienes un recordatorio agendado para hoy: ${r.title}`,
              url: '/profile'
            });
          }
        });
      }
    }
  } catch (e) { /* ignore */ }

  // 4. Check investments/portfolio updates
  try {
    if (userId) {
      const { data: investments } = await supabase
        .from('investments')
        .select('ticker, shares')
        .eq('user_id', userId);

      if (investments && investments.length > 0) {
        msgs.push({
          title: `📊 ${name}, revisa tu portafolio`,
          body: `Tienes ${investments.length} activo${investments.length > 1 ? 's' : ''} en seguimiento. Revisa cómo se cotizan hoy.`,
          url: '/invest'
        });
      }
    }
  } catch (e) { /* ignore */ }

  // If we have personalized messages, replace placeholders and return them
  if (msgs.length > 0 && type !== 'motivation') {
    return msgs;
  }

  // Fallback to random generic message from pool
  const pool = MESSAGES[type] || MESSAGES.morning;
  const rawMsg = pool[Math.floor(Math.random() * pool.length)];
  return [{
    title: rawMsg.title.replace(/{name}/g, name),
    body: rawMsg.body.replace(/{name}/g, name),
    url: '/'
  }];
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
