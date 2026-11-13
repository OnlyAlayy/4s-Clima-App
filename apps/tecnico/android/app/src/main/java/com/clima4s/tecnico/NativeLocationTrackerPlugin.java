package com.clima4s.tecnico;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Puente Capacitor para gestionar el servicio de geolocalización persistente en segundo plano
 * y solicitar la exención de optimización de batería (Doze mode) en fabricantes agresivos.
 */
@CapacitorPlugin(name = "NativeLocationTracker")
public class NativeLocationTrackerPlugin extends Plugin {
    private static final String TAG = "NativeLocationTracker";

    @PluginMethod
    public void startTracking(PluginCall call) {
        String supabaseUrl = call.getString("supabaseUrl");
        String supabaseAnonKey = call.getString("supabaseAnonKey");
        String accessToken = call.getString("accessToken");
        String technicianId = call.getString("technicianId");
        String workOrderId = call.getString("workOrderId", null);
        Double distanceFilterD = call.getDouble("distanceFilter", 15.0);
        float distanceFilter = distanceFilterD != null ? distanceFilterD.floatValue() : 15f;
        String backgroundTitle = call.getString("backgroundTitle", "4S Clima — Jornada Activa");
        String backgroundMessage = call.getString("backgroundMessage", "Transmitiendo ubicación operativa en ruta");

        if (supabaseUrl == null || supabaseAnonKey == null || technicianId == null) {
            call.reject("Faltan parámetros requeridos: supabaseUrl, supabaseAnonKey, technicianId");
            return;
        }

        Context context = getContext();
        NativeLocationPrefs.saveConfig(
            context,
            supabaseUrl,
            supabaseAnonKey,
            accessToken,
            technicianId,
            workOrderId,
            distanceFilter,
            backgroundTitle,
            backgroundMessage
        );

        Intent serviceIntent = new Intent(context, NativeLocationService.class);
        serviceIntent.setAction(NativeLocationService.ACTION_START_TRACKING);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }

        Log.i(TAG, "NativeLocationService lanzado con éxito para técnico: " + technicianId);
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        Context context = getContext();
        NativeLocationPrefs.clearTracking(context);

        Intent serviceIntent = new Intent(context, NativeLocationService.class);
        serviceIntent.setAction(NativeLocationService.ACTION_STOP_TRACKING);
        context.startService(serviceIntent);

        Log.i(TAG, "NativeLocationService detenido y credenciales de rastreo purgadas");
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void setWorkOrderId(PluginCall call) {
        String workOrderId = call.getString("workOrderId", null);
        NativeLocationPrefs.setWorkOrderId(getContext(), workOrderId);
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void updateAccessToken(PluginCall call) {
        String accessToken = call.getString("accessToken");
        if (accessToken != null) {
            NativeLocationPrefs.setAccessToken(getContext(), accessToken);
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        Context context = getContext();
        JSObject ret = new JSObject();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            String packageName = context.getPackageName();
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(packageName)) {
                try {
                    Intent intent = new Intent();
                    intent.setAction(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + packageName));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(intent);
                    ret.put("requested", true);
                    ret.put("alreadyIgnoring", false);
                } catch (Exception e) {
                    Log.w(TAG, "No se pudo lanzar ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS: " + e.getMessage());
                    ret.put("requested", false);
                    ret.put("error", e.getMessage());
                }
            } else {
                ret.put("requested", false);
                ret.put("alreadyIgnoring", true);
            }
        } else {
            ret.put("requested", false);
            ret.put("alreadyIgnoring", true);
        }

        call.resolve(ret);
    }

    @PluginMethod
    public void isTrackingActive(PluginCall call) {
        boolean active = NativeLocationPrefs.isTrackingActive(getContext());
        JSObject ret = new JSObject();
        ret.put("active", active);
        call.resolve(ret);
    }
}

