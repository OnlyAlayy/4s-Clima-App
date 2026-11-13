package com.clima4s.tecnico;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Almacenamiento persistente de credenciales y configuración operativa para el
 * servicio nativo de geolocalización en Android. Permite que el ForegroundService
 * continúe transmitiendo a Supabase incluso si el WebView y la Activity son destruidos.
 */
public class NativeLocationPrefs {
    private static final String PREF_NAME = "4s_clima_native_location_prefs";

    public static final String KEY_IS_TRACKING = "is_tracking";
    public static final String KEY_SUPABASE_URL = "supabase_url";
    public static final String KEY_SUPABASE_ANON_KEY = "supabase_anon_key";
    public static final String KEY_ACCESS_TOKEN = "access_token";
    public static final String KEY_TECHNICIAN_ID = "technician_id";
    public static final String KEY_WORK_ORDER_ID = "work_order_id";
    public static final String KEY_DISTANCE_FILTER = "distance_filter";
    public static final String KEY_BG_TITLE = "bg_title";
    public static final String KEY_BG_MESSAGE = "bg_message";

    public static SharedPreferences getPrefs(Context context) {
        return context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    public static void saveConfig(
        Context context,
        String supabaseUrl,
        String supabaseAnonKey,
        String accessToken,
        String technicianId,
        String workOrderId,
        float distanceFilter,
        String bgTitle,
        String bgMessage
    ) {
        getPrefs(context).edit()
            .putBoolean(KEY_IS_TRACKING, true)
            .putString(KEY_SUPABASE_URL, supabaseUrl)
            .putString(KEY_SUPABASE_ANON_KEY, supabaseAnonKey)
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_TECHNICIAN_ID, technicianId)
            .putString(KEY_WORK_ORDER_ID, workOrderId)
            .putFloat(KEY_DISTANCE_FILTER, distanceFilter > 0 ? distanceFilter : 15f)
            .putString(KEY_BG_TITLE, bgTitle != null && !bgTitle.isEmpty() ? bgTitle : "4S Clima — Jornada Activa")
            .putString(KEY_BG_MESSAGE, bgMessage != null && !bgMessage.isEmpty() ? bgMessage : "Transmitiendo ubicación operativa en ruta")
            .apply();
    }

    public static void setWorkOrderId(Context context, String workOrderId) {
        getPrefs(context).edit().putString(KEY_WORK_ORDER_ID, workOrderId).apply();
    }

    public static void setAccessToken(Context context, String token) {
        getPrefs(context).edit().putString(KEY_ACCESS_TOKEN, token).apply();
    }

    public static void clearTracking(Context context) {
        getPrefs(context).edit()
            .putBoolean(KEY_IS_TRACKING, false)
            .remove(KEY_WORK_ORDER_ID)
            .apply();
    }

    public static boolean isTrackingActive(Context context) {
        return getPrefs(context).getBoolean(KEY_IS_TRACKING, false);
    }
}

