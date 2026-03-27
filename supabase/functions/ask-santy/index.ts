import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { GoogleGenerativeAI } from "npm:@google/generative-ai@^0.21.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { text, userName } = await req.json()
    
    // Auth client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('No autorizado')
    console.log('User auth ok:', user.id);

    // Context
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    const { data: txs } = await supabaseClient
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startOfMonth)
      .order('date', { ascending: false });

    const gastosM = (txs || []).filter((t: any) => t.type === 'expense');
    const ingresosM = (txs || []).filter((t: any) => t.type === 'income');
    const totalGastos = gastosM.reduce((s: number, t: any) => s + t.amount, 0);
    const totalIngresos = ingresosM.reduce((s: number, t: any) => s + t.amount, 0);
    const txHistory = (txs || []).slice(0, 8).map((t: any) => 
      `${t.type === 'income' ? '+' : '-'}$${t.amount} en ${t.category}`
    ).join(', ');

    // Gemini
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      console.error('ERROR: GEMINI_API_KEY no configurada en Supabase Secrets');
      throw new Error('Configuración de IA incompleta');
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Eres Santy, la asistente financiera de ${userName}.
      Contexto de este mes:
      - Ingresos: $${totalIngresos} | Gastos: $${totalGastos}
      - Balance: $${totalIngresos - totalGastos}
      - Últimas notas: ${txHistory || 'Ninguna'}

      Tu objetivo es ayudar a registrar gastos o responder dudas.
      Responde EXCLUSIVAMENTE en formato JSON crudo:
      {"reply": "Tu mensaje", "action": null o {"amount":X, "category":"X", "type":"expense/income", "description":"X"}}
      
      Mensaje del usuario: "${text}"
    `;

    const result = await model.generateContent(prompt);
    let responseText = result.response.text();
    responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return new Response(responseText, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
