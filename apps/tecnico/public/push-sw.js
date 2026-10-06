// custom-sw.js
self.addEventListener('push', function (event) {
  let title = 'Nueva Notificación';
  let options = {
    body: 'Tienes una actualización en 4S Clima.',
    vibrate: [200, 100, 200, 100, 200],
  };

  if (event.data) {
    try {
      const data = event.data.json();
      title = data.title || title;
      options.body = data.body || options.body;
      options.data = data.url;
    } catch (e) {
      options.body = 'Recibimos una actualización de fondo.';
    }
  } else {
    options.body = 'El servidor envió una alerta vacía.';
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  
  // Si la notificación tiene una URL, intentamos abrirla
  if (event.notification.data) {
    const urlToOpen = new URL(event.notification.data, self.location.origin).href;

    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        // Si hay una ventana abierta apuntando a nuestra app, la enfocamos
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // Si no hay ventana abierta, abrimos una nueva
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
    );
  }
});
