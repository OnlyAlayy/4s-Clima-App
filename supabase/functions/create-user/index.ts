import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Inicializar cliente Supabase administrativo seguro (Service Role)
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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No autorizado: Falta encabezado Authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const token = authHeader.replace('Bearer ', '')

    // 3. Verificar la identidad y validez del token del solicitante
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'No autorizado: Token inválido o expirado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Buscar el rol del solicitante en public.users
    const { data: profile, error: profileError } = await supabaseClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || (profile.role !== 'admin' && profile.role !== 'owner')) {
      return new Response(
        JSON.stringify({ error: 'Acceso Denegado (403): Se requieren permisos de Administrador o Propietario.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Leer y validar los datos del nuevo usuario
    const body = await req.json().catch(() => ({}))
    const { email, password, name, phone, role } = body

    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({ error: 'Datos incompletos: Nombre, email y contraseña son obligatorios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 6. VALIDACIÓN ESTRICTA DE SEGURIDAD (Separación de Deberes contra Escalada de Privilegios):
    // Si se solicita crear un usuario con rol 'admin' o 'owner',
    // verificar obligatoriamente que el solicitante sea explícitamente role === 'owner'.
    if (role === 'admin' || role === 'owner') {
      if (profile.role !== 'owner') {
        console.warn(`[SECURITY ALERT] Intento de escalada de privilegios bloqueado: Usuario ${user.id} (${profile.role}) intentó crear un usuario con rol ${role}.`);
        return new Response(
          JSON.stringify({ 
            error: 'Acceso Denegado (403): Solo el usuario con rol Owner (Dueño) tiene permisos para crear Administradores o Propietarios.' 
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Si es un admin normal, forzar que solo pueda dar de alta técnicos
    if (profile.role === 'admin' && role !== 'tecnico') {
      return new Response(
        JSON.stringify({ 
          error: 'Acceso Denegado (403): Un administrador solo tiene permisos para dar de alta usuarios con rol Técnico.' 
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const assignedRole = (role === 'admin' && profile.role === 'owner') ? 'admin' : 'tecnico'

    // 7. Crear el usuario en auth.users
    const { data: newAuthUser, error: createError } = await supabaseClient.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true
    })

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 8. Insertar o actualizar el perfil en public.users
    const userId = newAuthUser.user.id
    const { error: insertError } = await supabaseClient
      .from('users')
      .upsert({
        id: userId,
        email: email,
        name: name,
        role: assignedRole,
        phone: phone || null,
        active: true
      })

    if (insertError) {
      // Si falla insertar el perfil, borramos el usuario de auth para no dejar registros huérfanos
      await supabaseClient.auth.admin.deleteUser(userId)
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 9. Éxito
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Usuario ${name} (${assignedRole}) creado correctamente`,
        userId: userId
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || 'Error inesperado del servidor' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})
