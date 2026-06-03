const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://nhbnltdlzxaigztukbfy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey || 'sb_publishable_toQlACMIWfpUG4vH-o24WA_gxdlIEkT');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405)
      .setHeader('Allow', 'POST')
      .json({ error: 'Method not allowed' });
  }

  const { subscription, userId } = req.body;

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Subscription missing or invalid' });
  }

  try {
    const { endpoint, keys } = subscription;
    const { p256dh, auth } = keys || {};

    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: userId || null,
        endpoint,
        p256dh,
        auth,
      }, { onConflict: 'endpoint' });

    if (error) {
      console.error('Supabase save error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Subscribe handler error:', err);
    return res.status(500).json({ error: err.message });
  }
};
