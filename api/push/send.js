const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const supabaseUrl = process.env.SUPABASE_URL || 'https://nhbnltdlzxaigztukbfy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey || 'sb_publishable_toQlACMIWfpUG4vH-o24WA_gxdlIEkT');

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || 'BDc8JcLSHCdTUZDsNl8hlAzLPfOz4jWar4OGO9odsf8_8vePGp_uM9tPbjsJx0hTz3rUvDE48ygpPlvL5_eyrio';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || 'xyXeRYqlzjNd2i4tzpUi1nuIV_OW8NXX9ndUAiSAzlQ';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@zenly.app';

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, body, userId, url } = req.body;

  try {
    let query = supabase.from('push_subscriptions').select('*');
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: subscriptions, error } = await query;
    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({ success: true, sent: 0, message: 'No active subscriptions' });
    }

    const payload = JSON.stringify({
      title: title || 'Zenly',
      body: body || 'Recordatorio diario',
      url: url || '/'
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
          console.error(`Error sending push to ${sub.endpoint}:`, err);
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          }
          return { endpoint: sub.endpoint, success: false, error: err.message };
        }
      })
    );

    const successCount = results.filter(r => r.success).length;
    return res.status(200).json({ success: true, sent: successCount, total: subscriptions.length });
  } catch (err) {
    console.error('Send handler error:', err);
    return res.status(500).json({ error: err.message });
  }
};
