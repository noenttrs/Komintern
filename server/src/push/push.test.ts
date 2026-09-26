import assert from "node:assert/strict";
import test from "node:test";

import { PushService, notificationText, parsePushSubscription } from "./push";

const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };

test("only subscriptions to the browsers' push services are accepted", () => {
  for (const endpoint of ["https://fcm.googleapis.com/fcm/send/abc", "https://web.push.apple.com/QGx", "https://updates.push.services.mozilla.com/wpush/v2/x"]) {
    assert.equal(parsePushSubscription({ endpoint, keys }).endpoint, endpoint);
  }
  for (const endpoint of ["http://fcm.googleapis.com/x", "https://evil.example/x", "https://fcm.googleapis.com.evil.example/x", "https://fcm.googleapis.com:8443/x", "https://127.0.0.1/x"]) {
    assert.throws(() => parsePushSubscription({ endpoint, keys }), /push/);
  }
  assert.throws(() => parsePushSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "<script>", auth: "x" } }), /invalid/);
  assert.equal(parsePushSubscription({ endpoint: "https://fcm.googleapis.com/x", keys, lang: "en" }).lang, "en");
  assert.equal(parsePushSubscription({ endpoint: "https://fcm.googleapis.com/x", keys, lang: "de" }).lang, "fr");
});

test("notifications never reveal a role and follow the player's language", () => {
  assert.match(notificationText({ kind: "absence_warning" }, "fr"), /voter/);
  assert.match(notificationText({ kind: "absence_warning_others", name: "Rosa" }, "en"), /Rosa/);
  for (const kind of ["proposal", "vote", "mission"] as const) {
    assert.doesNotMatch(notificationText({ kind }, "fr"), /nazi|communiste/i);
  }
});

test("a gone subscription is reported so it can be forgotten", async () => {
  const sent: string[] = [];
  const service = new PushService(undefined, async (_subscription, payload) => {
    sent.push(payload);
    if (sent.length === 2) throw Object.assign(new Error("gone"), { statusCode: 410 });
  });
  const subscription = { endpoint: "https://fcm.googleapis.com/x", keys, lang: "fr" as const };
  assert.equal(await service.send(subscription, "ABC123", { kind: "vote" }), true);
  assert.deepEqual(JSON.parse(sent[0] as string), { title: "Nazi Communiste", body: "Vote de confiance : à toi de voter.", tag: "room-ABC123", url: "/r/ABC123" });
  assert.equal(await service.send(subscription, "ABC123", { kind: "vote" }), false);
});
