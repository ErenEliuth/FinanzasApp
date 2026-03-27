import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { GoogleGenerativeAI } from "npm:@google/generative-ai@^0.21.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Manejo de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { text, userName } = await req.json()
    
    // Inicializar cliente de Supabase con el token del usuario
    const authHeader = req.headers.get('Authorization')
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader! } } }
    )

    // Verificar usuario
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      console.error('Auth error:', authError);
      throw new Error('No autorizado');
    }

    // Obtener contexto de transacciones del mes
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    const { data: txs } = await supabaseClient
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startOfMonth)
      .order('date', { ascending: false });

    const totalGastos = (txs || []).filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0);
    const totalIngresos = (txs || []).filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0);
    const txHistory = (txs || []).slice(0, 8).map((t: any) => 
      `${t.type === 'income' ? '+' : '-'}$${t.amount} en ${t.category}`
    ).join(', ');

    // Configuración de Gemini
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      console.error('ERROR: GEMINI_API_KEY no configurada');
      throw new Error('Configuración de IA incompleta (API Key faltante)');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // Usamos JSON mode para asegurar una respuesta parseable
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      Eres Santy, la asistente financiera de ${userName}.
      Contexto de este mes:
      - Ingresos: $${totalIngresos} | Gastos: $${totalGastos}
      - Balance Actual: $${totalIngresos - totalGastos}
      - Últimas transacciones: ${txHistory || 'Sin movimientos aún'}

      Objetivo: Ayudar a registrar gastos/ingresos o responder dudas financieras.
      REGLA CRÍTICA: Responde SIEMPRE en formato JSON con esta estructura exacta:
      {
        "reply": "Tu mensaje amable aquí",
        "action": null o {"amount": número, "category": "Nombre", "type": "expense" o "income", "description": "detalle"}
      }
      
      Mensaje del usuario: "${text}"
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();
    
    console.log('Gemini raw response:', responseText);

    // Validamos que sea un JSON válido antes de enviarlo
    try {
      JSON.parse(responseText);
    } catch (e) {
      console.error('Error parsing Gemini JSON:', responseText);
      throw new Error('La IA generó una respuesta inválida');
    }
    
    return new Response(responseText, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error en Edge Function:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

