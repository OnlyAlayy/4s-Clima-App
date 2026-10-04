import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de peticiones CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Inicializar cliente con permisos de Dios (Admin)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // 2. Extraer el token del usuario que hace el click
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')

    // 3. Verificar si el token es válido
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    if (userError || !user) throw new Error('No autorizado (Token inválido)')

    // 4. Verificar si realmente es un administrador o dueño
    const { data: profile } = await supabaseClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || (profile.role !== 'admin' && profile.role !== 'owner')) {
      throw new Error('No tienes permisos de Administrador para hacer esto.')
    }

    // 5. Leer los datos enviados desde la web
    const { userId, newPassword } = await req.json()

    if (!userId || !newPassword || newPassword.length < 6) {
      throw new Error('Faltan datos o la contraseña es muy corta.')
    }

    // 5.5. Verificar el rol del usuario objetivo para prevenir escalada
    const { data: targetProfile } = await supabaseClient
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()
      
    if (profile.role === 'admin' && targetProfile && targetProfile.role !== 'tecnico') {
      throw new Error('Un administrador solo puede cambiar la contraseña de técnicos.')
    }

    // 6. Cambiar la contraseña de forma segura usando la API Admin
    const { error: updateError } = await supabaseClient.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    )

    if (updateError) throw updateError

    // 7. Todo salió bien
    return new Response(
      JSON.stringify({ success: true, message: 'Contraseña actualizada correctamente' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
