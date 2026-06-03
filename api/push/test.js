module.exports = async function handler(req, res) {
  let webpushLoaded = false;
  let errorMsg = null;
  
  try {
    const webpush = require('web-push');
    webpushLoaded = true;
  } catch (e) {
    errorMsg = e.message;
  }

  return res.status(200).json({
    success: true,
    webpushLoaded,
    errorMsg,
    env: {
      hasSubject: !!process.env.VAPID_SUBJECT,
      hasPublicKey: !!process.env.VAPID_PUBLIC_KEY,
      hasPrivateKey: !!process.env.VAPID_PRIVATE_KEY,
      hasPrivateKeyWithSpace: !!process.env['VAPID PRIVATE KEY'],
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    }
  });
};
