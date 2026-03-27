import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@^0.21.0"

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
    const finalUserName = userName || 'Amigo';
    
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
    
    const { data: txs, error: dbError } = await supabaseClient
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', startOfMonth)
      .order('date', { ascending: false });

    if (dbError) console.error('Error fetching txs:', dbError);

    const totalGastos = (txs || []).filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
    const totalIngresos = (txs || []).filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
    const txHistory = (txs || []).slice(0, 10).map((t: any) => 
      `${t.type === 'income' ? '+' : '-'}$${t.amount} en ${t.category} (${t.description || ''})`
    ).join(', ');

    // Configuración de Gemini
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      console.error('ERROR: GEMINI_API_KEY no configurada');
      throw new Error('Configuración de IA incompleta (API Key faltante)');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      Eres Santy, la asistente financiera inteligente de ${finalUserName}.
      
      CONTEXTO DEL MES ACTUAL:
      - Ingresos totales: $${totalIngresos}
      - Gastos totales: $${totalGastos}
      - Balance: $${totalIngresos - totalGastos}
      - Últimos movimientos: ${txHistory || 'Sin movimientos aún'}

      INSTRUCCIONES:
      1. Ayuda al usuario a registrar gastos o ingresos detectando montos, categorías y descripciones.
      2. Responde dudas sobre sus finanzas basándote en el contexto proporcionado.
      3. Sé amable, breve y profesional.

      REGLA DE FORMATO (OBLIGATORIO):
      Responde EXCLUSIVAMENTE en formato JSON con esta estructura:
      {
        "reply": "Tu mensaje aquí",
        "action": null o {"amount": número, "category": "Nombre", "type": "expense" o "income", "description": "detalle"}
      }
      
      Mensaje del usuario: "${text}"
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let responseText = response.text();
    
    // Limpieza de posible formato markdown sobrante
    responseText = responseText.replace(/```json|```/g, '').trim();
    
    console.log('Gemini processed response:', responseText);

    // Validamos que sea un JSON válido
    try {
      JSON.parse(responseText);
    } catch (e) {
      console.error('JSON Parse Error:', e, 'Raw text:', responseText);
      // Fallback si la IA falla el formato
      responseText = JSON.stringify({
        reply: "Lo siento, tuve un pequeño error al procesar tu solicitud. ¿Podrías repetirlo?",
        action: null
      });
    }
    
    return new Response(responseText, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Edge Function Main Catch:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error interno' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})


