# 🏗️ 4S Clima — Ecosistema Digital

> Plataforma integral para la gestión de servicios de climatización.  
> PWA para técnicos de campo + Panel administrativo para la oficina.

## Arquitectura

```
📱 PWA Técnico (Mobile)          🖥️ Panel Admin (Desktop)
      ↓                                ↓
      └──────── Supabase ───────────────┘
              (Auth + DB + Storage + Realtime)
```

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Monorepo | Turborepo + npm workspaces |
| Frontend | React 18 + Vite |
| Estilos | TailwindCSS v3 |
| Estado | Zustand |
| Backend | Supabase (PostgreSQL + Auth + Storage) |
| Offline | Service Worker + IndexedDB (Dexie.js) |
| Firma | react-signature-canvas |
| PDF | jsPDF + html2canvas |

## Estructura del Proyecto

```
├── apps/
│   ├── tecnico/     → PWA del técnico (puerto 5173)
│   └── admin/       → Panel administrativo (puerto 5174)
├── packages/
│   └── shared/      → Código compartido (Supabase, constantes, utils)
├── supabase/
│   ├── migrations/  → Schema SQL
│   └── seed.sql     → Datos de prueba
└── package.json     → Workspace root
```

## Primeros Pasos

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar Supabase

1. Crear un proyecto en [supabase.com](https://supabase.com)
2. Copiar `.env.example` como `.env` y completar las credenciales:
   ```
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-key
   ```
3. Ejecutar la migración en el SQL Editor de Supabase:
   - Copiar el contenido de `supabase/migrations/001_initial_schema.sql`
   - Pegarlo en el SQL Editor y ejecutar
4. (Opcional) Ejecutar el seed de datos de prueba:
   - Copiar `supabase/seed.sql` y ejecutar

### 3. Crear usuarios de prueba

En Supabase > Authentication > Users, crear:
- **Admin**: email `admin@4sclima.com` / contraseña a elección
- **Técnico**: email `tecnico@4sclima.com` / contraseña a elección

Después, en el SQL Editor, agregar los perfiles:
```sql
INSERT INTO public.users (id, name, email, role) VALUES
  ('<UUID-del-admin>', 'Walter Admin', 'admin@4sclima.com', 'admin'),
  ('<UUID-del-tecnico>', 'Juan Técnico', 'tecnico@4sclima.com', 'tecnico');
```

### 4. Levantar el entorno de desarrollo

```bash
# Ambas apps simultáneamente
npm run dev

# Solo la PWA del técnico
npm run dev:tecnico

# Solo el panel admin
npm run dev:admin
```

### 5. Probar en el celular

La PWA se puede probar en el celular si están en la misma red WiFi:
1. Fijarse la IP del equipo (`ipconfig` en Windows)
2. En el celular: `http://192.168.x.x:5173`

## Fases del Proyecto

- [x] **Fase 1 (MVP):** Checklist digital + firma + panel básico
- [ ] **Fase 2:** Fotos antes/después + extras/repuestos + PDF corporativo
- [ ] **Fase 3:** Asignación de OTs + hoja de ruta + notificaciones push

---

Desarrollado con 💙 para **4S Clima**
