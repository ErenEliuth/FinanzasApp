const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const supabaseUrl = process.env.SUPABASE_URL || 'https://nhbnltdlzxaigztukbfy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey || 'sb_publishable_toQlACMIWfpUG4vH-o24WA_gxdlIEkT');

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || 'BDc8JcLSHCdTUZDsNl8hlAzLPfOz4jWar4OGO9odsf8_8vePGp_uM9tPbjsJx0hTz3rUvDE48ygpPlvL5_eyrio';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || 'xyXeRYqlzjNd2i4tzpUi1nuIV_OW8NXX9ndUAiSAzlQ';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@zenly.app';

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const tips = [
  '¡Recuerda aportar a tu fondo de emergencia hoy! Cada peso cuenta.',
  'Revisa tus gastos de la semana. ¿Hubo alguno innecesario?',
  'El interés compuesto trabaja mientras duermes. ¡Sigue ahorrando!',
  'Tip: Automatiza tus aportes para no olvidarlos nunca.',
  '¿Sabías que el 10% de tus ingresos puede cambiar tu futuro financiero?',
  'Compara precios antes de una compra grande. Tu billetera te lo agradecerá.',
  'Establece metas de ahorro a corto plazo para mantener la motivación alta.'
];

module.exports = async function handler(req, res) {
  try {
    const { data: subscriptions, error } = await supabase.from('push_subscriptions').select('*');
    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({ message: 'No subscriptions found' });
    }

    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    const payload = JSON.stringify({
      title: 'Consejo diario de Santy 🧠',
      body: randomTip,
      url: '/goals'
    });

    const results = await Promise.all(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };

        try {
          await webpush.sendNotification(pushSubscription, payload);
          return { endpoint: sub.endpoint, success: true };
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          }
          return { endpoint: sub.endpoint, success: false };
        }
      })
    );

    const successCount = results.filter(r => r.success).length;
    return res.status(200).json({ success: true, sent: successCount });
  } catch (err) {
    console.error('Cron handler error:', err);
    return res.status(500).json({ error: err.message });
  }
};
