module.exports = async function handler(req, res) {
  let webpushLoaded = false;
  let errorMsg = null;
  let vapidConfigured = false;
  let vapidError = null;
  
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@zenly.app';

  try {
    const webpush = require('web-push');
    webpushLoaded = true;

    try {
      webpush.setVapidDetails(
        vapidSubject.trim(),
        vapidPublicKey.trim(),
        vapidPrivateKey.trim()
      );
      vapidConfigured = true;
    } catch (e2) {
      vapidError = e2.message;
    }
  } catch (e) {
    errorMsg = e.message;
  }

  return res.status(200).json({
    success: true,
    webpushLoaded,
    errorMsg,
    vapidConfigured,
    vapidError,
    env: {
      hasSubject: !!process.env.VAPID_SUBJECT,
      hasPublicKey: !!process.env.VAPID_PUBLIC_KEY,
      hasPrivateKey: !!process.env.VAPID_PRIVATE_KEY,
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    }
  });
};
