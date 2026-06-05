const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const supabaseUrl = 'https://nhbnltdlzxaigztukbfy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; // we can run without it, using anon key or placeholder

// Let's use the actual VAPID keys we generated
const vapidPublicKey = 'BDc8JcLSHCdTUZDsNl8hlAzLPfOz4jWar4OGO9odsf8_8vePGp_uM9tPbjsJx0hTz3rUvDE48ygpPlvL5_eyrio';
const vapidPrivateKey = 'xyXeRYqlzjNd2i4tzpUi1nuIV_OW8NXX9ndUAiSAzlQ';
const vapidSubject = 'mailto:admin@zenly.app';

try {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  console.log('VAPID details set successfully.');
} catch (e) {
  console.error('Error setting VAPID details:', e);
}

const supabase = createClient(supabaseUrl, 'sb_publishable_toQlACMIWfpUG4vH-o24WA_gxdlIEkT');

async function testQuery() {
  try {
    const { data: subscriptions, error } = await supabase.from('push_subscriptions').select('*').eq('user_id', '6ca9b5e1-e30e-4187-b0af-8c90e6c8c862');
    if (error) {
      console.error('Query error:', error);
      return;
    }
    console.log('Fetched subscriptions:', subscriptions.length);
    if (subscriptions.length > 0) {
      const sub = subscriptions[0];
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };
      
      const payload = JSON.stringify({
        title: 'Santy te aconseja 🧠',
        body: 'Prueba local',
        url: '/goals'
      });

      console.log('Sending push notification to:', sub.endpoint);
      // Let's try sending it!
      const result = await webpush.sendNotification(pushSubscription, payload);
      console.log('Notification sent successfully. Result:', result.statusCode);
    }
  } catch (err) {
    console.error('Unexpected runtime error:', err);
  }
}

testQuery();
