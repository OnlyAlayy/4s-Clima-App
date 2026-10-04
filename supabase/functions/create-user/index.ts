import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Inicializar cliente Supabase seguro (Admin)
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

    // 2. Extraer el JWT del usuario que hace la petición
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')

    // 3. Verificar quién es el usuario y si tiene permiso
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    if (userError || !user) throw new Error('No autorizado (Token inválido)')

    // 4. Buscar el rol del usuario que está intentando crear otro usuario
    const { data: profile } = await supabaseClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || (profile.role !== 'admin' && profile.role !== 'owner')) {
      throw new Error('No tienes permisos de Administrador para hacer esto.')
    }

    // 5. Leer los datos enviados desde la web
    const { email, password, name, phone, role } = await req.json()

    // Regla de negocio: Si es admin, solo puede crear técnicos. Si es owner, puede crear lo que quiera.
    if (profile.role === 'admin' && role !== 'tecnico') {
      throw new Error('Un administrador solo puede crear técnicos. Solo el dueño puede crear otros administradores.')
    }

    // 6. Crear el usuario en auth.users sin user_metadata para evitar crasheos de base de datos
    const { data: newAuthUser, error: createError } = await supabaseClient.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true
    })

    if (createError) throw createError

    // 7. Insertar o actualizar el perfil en public.users
    // Usamos upsert por si hay un Trigger en auth.users que ya lo insertó (con datos por defecto)
    const userId = newAuthUser.user.id
    const { error: insertError } = await supabaseClient
      .from('users')
      .upsert({
        id: userId,
        email: email,
        name: name,
        role: role,
        phone: phone || null,
        active: true
      })

    if (insertError) {
      // Si falla insertar el perfil, borramos el usuario de auth para no dejar fantasmas
      await supabaseClient.auth.admin.deleteUser(userId)
      throw insertError
    }

    // 8. Todo salió bien
    return new Response(
      JSON.stringify({ success: true, message: 'Usuario creado correctamente' }),
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
