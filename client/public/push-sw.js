// Chargé par le service worker (workbox importScripts) : affiche les notifications de partie.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Nazi Communiste";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || "komintern",
      renotify: true,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // Une fenêtre du jeu est déjà ouverte : on la ramène au premier plan (elle garde sa partie).
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
