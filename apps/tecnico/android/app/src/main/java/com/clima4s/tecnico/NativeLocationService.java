package com.clima4s.tecnico;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Foreground Service Nativo Android con START_STICKY y stopWithTask="false".
 * Garantiza la emisión continua de coordenadas GPS hacia Supabase REST API
 * incluso cuando la MainActivity es destruida o cerrada desde las Apps Recientes (Swipe Away).
 */
public class NativeLocationService extends Service {
    private static final String TAG = "NativeLocationService";

    public static final String ACTION_START_TRACKING = "com.clima4s.tecnico.action.START_TRACKING";
    public static final String ACTION_STOP_TRACKING = "com.clima4s.tecnico.action.STOP_TRACKING";

    private static final String CHANNEL_ID = "4s_clima_location_service_channel";
    private static final int NOTIFICATION_ID = 40401;
    private static final long DB_PERSIST_THROTTLE_MS = 4000L;

    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private LocationManager systemLocationManager;
    private LocationListener systemLocationListener;

    private PowerManager.WakeLock wakeLock;
    private final ExecutorService httpExecutor = Executors.newSingleThreadExecutor();
    private long lastPersistTime = 0;
    private boolean isRunning = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        systemLocationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;

        if (ACTION_STOP_TRACKING.equals(action)) {
            Log.i(TAG, "Recibida acción ACTION_STOP_TRACKING: deteniendo servicio...");
            stopTrackingService();
            return START_NOT_STICKY;
        }

        // Si es START_TRACKING o si el sistema relanzó el servicio por START_STICKY
        SharedPreferences prefs = NativeLocationPrefs.getPrefs(this);
        boolean shouldBeTracking = prefs.getBoolean(NativeLocationPrefs.KEY_IS_TRACKING, false);

        if (shouldBeTracking || ACTION_START_TRACKING.equals(action)) {
            startTrackingService();
            return START_STICKY;
        } else {
            stopTrackingService();
            return START_NOT_STICKY;
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /**
     * Inicia la notificación persistente de Foreground y registra los listeners de GPS.
     */
    private synchronized void startTrackingService() {
        if (isRunning) {
            Log.d(TAG, "El servicio de rastreo ya se encuentra en ejecución.");
            return;
        }
        isRunning = true;

        SharedPreferences prefs = NativeLocationPrefs.getPrefs(this);
        String title = prefs.getString(NativeLocationPrefs.KEY_BG_TITLE, "4S Clima — Jornada Activa");
        String message = prefs.getString(NativeLocationPrefs.KEY_BG_MESSAGE, "Transmitiendo ubicación operativa en ruta");
        float distanceFilter = prefs.getFloat(NativeLocationPrefs.KEY_DISTANCE_FILTER, 15f);

        Notification notification = buildNotification(title, message);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error iniciando Foreground Service con notificación: " + e.getMessage(), e);
        }

        acquireWakeLock();
        startLocationUpdates(distanceFilter);

        Log.i(TAG, "ForegroundService activo con notificación y rastreo de GPS iniciado.");
    }

    /**
     * Construye la notificación persistente oficial que previene que Doze Mode mate el proceso.
     */
    private Notification buildNotification(String title, String message) {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pendingIntent = null;
        if (launchIntent != null) {
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            pendingIntent = PendingIntent.getActivity(this, 0, launchIntent, flags);
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(message)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setAutoCancel(false)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE);

        if (pendingIntent != null) {
            builder.setContentIntent(pendingIntent);
        }

        return builder.build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "4S Clima — Rastreo Operativo",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Servicio de transmisión continua de GPS durante la jornada laboral activa");
            channel.enableVibration(false);
            channel.setShowBadge(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void acquireWakeLock() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "4sclima:NativeLocationWakeLock");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(24 * 60 * 60 * 1000L); // 24 horas máximo de salvaguarda
                Log.d(TAG, "WakeLock parcial adquirido.");
            }
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
                Log.d(TAG, "WakeLock liberado.");
            } catch (Exception ignored) {}
            wakeLock = null;
        }
    }

    /**
     * Registra listeners de GPS de alta precisión con FusedLocationProviderClient
     * y respaldo nativo con LocationManager.
     */
    private void startLocationUpdates(float distanceFilter) {
        // 1. FusedLocationProviderClient (Google Play Services)
        try {
            LocationRequest locationRequest;
            try {
                locationRequest = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 8000L)
                        .setMinUpdateIntervalMillis(4000L)
                        .setMinUpdateDistanceMeters(distanceFilter)
                        .build();
            } catch (Throwable t) {
                locationRequest = LocationRequest.create();
                locationRequest.setInterval(8000L);
                locationRequest.setFastestInterval(4000L);
                locationRequest.setSmallestDisplacement(distanceFilter);
                locationRequest.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY);
            }

            locationCallback = new LocationCallback() {
                @Override
                public void onLocationResult(LocationResult locationResult) {
                    if (locationResult == null) return;
                    Location loc = locationResult.getLastLocation();
                    if (loc != null) {
                        handleNewLocation(loc);
                    }
                }
            };

            fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, getMainLooper());
            Log.d(TAG, "FusedLocationProviderClient registrado con distanceFilter: " + distanceFilter + "m");
        } catch (SecurityException se) {
            Log.w(TAG, "Permiso de ubicación no concedido para FusedLocationProviderClient: " + se.getMessage());
        } catch (Exception e) {
            Log.w(TAG, "Error configurando FusedLocationProviderClient: " + e.getMessage());
        }

        // 2. Respaldo secundario mediante LocationManager estándar del sistema Android
        if (systemLocationManager != null) {
            try {
                systemLocationListener = new LocationListener() {
                    @Override
                    public void onLocationChanged(Location location) {
                        if (location != null) {
                            handleNewLocation(location);
                        }
                    }
                    @Override
                    public void onStatusChanged(String provider, int status, Bundle extras) {}
                    @Override
                    public void onProviderEnabled(String provider) {}
                    @Override
                    public void onProviderDisabled(String provider) {}
                };

                if (systemLocationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    systemLocationManager.requestLocationUpdates(
                            LocationManager.GPS_PROVIDER,
                            8000L,
                            distanceFilter,
                            systemLocationListener,
                            getMainLooper()
                    );
                    Log.d(TAG, "LocationManager GPS_PROVIDER registrado como respaldo.");
                }
            } catch (SecurityException se) {
                Log.w(TAG, "Permiso de ubicación no concedido para LocationManager: " + se.getMessage());
            } catch (Exception e) {
                Log.w(TAG, "Error registrando LocationManager: " + e.getMessage());
            }
        }
    }

    /**
     * Procesa la coordenada recibida y dispara la transmisión HTTP directa a Supabase.
     */
    private void handleNewLocation(Location loc) {
        long now = System.currentTimeMillis();
        if (now - lastPersistTime < DB_PERSIST_THROTTLE_MS) {
            return;
        }
        lastPersistTime = now;

        SharedPreferences prefs = NativeLocationPrefs.getPrefs(this);
        String supabaseUrl = prefs.getString(NativeLocationPrefs.KEY_SUPABASE_URL, null);
        String supabaseAnonKey = prefs.getString(NativeLocationPrefs.KEY_SUPABASE_ANON_KEY, null);
        String accessToken = prefs.getString(NativeLocationPrefs.KEY_ACCESS_TOKEN, null);
        String technicianId = prefs.getString(NativeLocationPrefs.KEY_TECHNICIAN_ID, null);
        String workOrderId = prefs.getString(NativeLocationPrefs.KEY_WORK_ORDER_ID, null);

        if (supabaseUrl == null || supabaseAnonKey == null || technicianId == null) {
            return;
        }

        // Ejecutar transmisión HTTP en hilo de fondo
        httpExecutor.execute(() -> {
            sendLocationToSupabase(supabaseUrl, supabaseAnonKey, accessToken, technicianId, workOrderId, loc);
        });
    }

    /**
     * Realiza el POST HTTP nativo directo a Supabase REST API (${SUPABASE_URL}/rest/v1/technician_locations)
     * sin depender de ningún WebView ni hilo de JavaScript.
     */
    private void sendLocationToSupabase(
            String supabaseUrl,
            String supabaseAnonKey,
            String accessToken,
            String technicianId,
            String workOrderId,
            Location loc
    ) {
        HttpURLConnection conn = null;
        try {
            String baseUrl = supabaseUrl.replaceAll("/+$", "");
            URL url = new URL(baseUrl + "/rest/v1/technician_locations");

            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("apikey", supabaseAnonKey);

            String bearerToken = (accessToken != null && !accessToken.trim().isEmpty()) ? accessToken : supabaseAnonKey;
            conn.setRequestProperty("Authorization", "Bearer " + bearerToken);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=minimal");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoOutput(true);

            JSONObject payload = new JSONObject();
            payload.put("technician_id", technicianId);
            if (workOrderId != null && !workOrderId.trim().isEmpty()) {
                payload.put("work_order_id", workOrderId);
            } else {
                payload.put("work_order_id", JSONObject.NULL);
            }
            payload.put("latitude", loc.getLatitude());
            payload.put("longitude", loc.getLongitude());
            payload.put("accuracy", Math.round(loc.getAccuracy()));
            payload.put("speed", Math.round(loc.getSpeed() * 3.6f)); // km/h
            payload.put("heading", loc.hasBearing() ? Math.round(loc.getBearing()) : JSONObject.NULL);
            payload.put("altitude", loc.hasAltitude() ? loc.getAltitude() : JSONObject.NULL);
            payload.put("platform", "android");

            // Telemetría de batería nativa
            Intent batteryStatus = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (batteryStatus != null) {
                int level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                if (level >= 0 && scale > 0) {
                    payload.put("battery_level", Math.round((level / (float) scale) * 100));
                }
                int status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                boolean isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL;
                payload.put("is_charging", isCharging);
            }

            // Timestamp ISO 8601 UTC
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
            payload.put("recorded_at", sdf.format(new Date(loc.getTime() > 0 ? loc.getTime() : System.currentTimeMillis())));

            byte[] jsonBytes = payload.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(jsonBytes, 0, jsonBytes.length);
                os.flush();
            }

            int responseCode = conn.getResponseCode();
            if (responseCode >= 200 && responseCode < 300) {
                Log.d(TAG, "Telemetría GPS enviada a Supabase exitosamente (HTTP " + responseCode + ") [" + loc.getLatitude() + ", " + loc.getLongitude() + "]");
            } else {
                Log.w(TAG, "Respuesta HTTP inesperada de Supabase: " + responseCode);
            }
        } catch (Exception e) {
            Log.w(TAG, "Nota: no se pudo transmitir coordenada GPS a Supabase (offline/red): " + e.getMessage());
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    /**
     * Invocado cuando el usuario cierra la app deslizándola desde las Apps Recientes (Swipe Away).
     * Gracias a android:stopWithTask="false", el servicio sobrevive y continúa emitiendo.
     */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        Log.i(TAG, "onTaskRemoved: Activity principal cerrada por Swipe-Away en Recientes. NativeLocationService permanece activo.");

        // Salvaguarda: programar relanzamiento automático mediante AlarmManager si el OS llega a forzar la detención
        try {
            Intent restartIntent = new Intent(getApplicationContext(), NativeLocationService.class);
            restartIntent.setAction(ACTION_START_TRACKING);
            int flags = PendingIntent.FLAG_ONE_SHOT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getService(getApplicationContext(), 101, restartIntent, flags);
            AlarmManager alarmManager = (AlarmManager) getApplicationContext().getSystemService(Context.ALARM_SERVICE);
            if (alarmManager != null) {
                alarmManager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + 1500, pendingIntent);
            }
        } catch (Exception e) {
            Log.w(TAG, "No se pudo configurar alarma de respaldo de relanzamiento: " + e.getMessage());
        }
    }

    private synchronized void stopTrackingService() {
        isRunning = false;

        if (fusedLocationClient != null && locationCallback != null) {
            try {
                fusedLocationClient.removeLocationUpdates(locationCallback);
            } catch (Exception ignored) {}
            locationCallback = null;
        }

        if (systemLocationManager != null && systemLocationListener != null) {
            try {
                systemLocationManager.removeUpdates(systemLocationListener);
            } catch (Exception ignored) {}
            systemLocationListener = null;
        }

        releaseWakeLock();

        stopForeground(true);
        stopSelf();
        Log.i(TAG, "NativeLocationService detenido y liberado.");
    }

    @Override
    public void onDestroy() {
        stopTrackingService();
        super.onDestroy();
    }
}
