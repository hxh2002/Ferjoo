#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  HEIGHT_ALERT_TARGETS, alertStorageKey, enableSystemNotification, heightAlertMessage, markHeightAlertNotified,
  notificationPermission, pendingHeightAlerts, readHeightAlerts, sendSystemNotification, toggleHeightTarget, writeHeightAlerts
} from '../src/services/height-alert.service.js';

function memoryStorage() {
  const store = new Map();
  return { getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)) };
}

// 浏览器里 Notification 是构造函数，permission 与 requestPermission 是静态成员，这里按同样形状模拟。
function notificationStub(permission, request, received = []) {
  function Notification(title, options) { received.push({ title, options }); }
  Notification.permission = permission;
  if (request) Notification.requestPermission = request;
  return Notification;
}

assert.deepEqual(HEIGHT_ALERT_TARGETS, [2, 2.5, 3]);

const storage = memoryStorage();
assert.deepEqual(readHeightAlerts('acct', storage), { targets: [], notified: {} }, 'no reservation by default');
let picked = toggleHeightTarget(readHeightAlerts('acct', storage), 2.5);
picked = toggleHeightTarget(picked, 3);
assert.deepEqual(picked.targets, [2.5, 3], 'thresholds keep ascending order');
picked = writeHeightAlerts('acct', picked, storage);
assert.deepEqual(readHeightAlerts('acct', storage).targets, [2.5, 3], 'reservation persists for the account');
assert.deepEqual(readHeightAlerts('other', storage).targets, [], 'another account keeps its own reservation');
assert.deepEqual(toggleHeightTarget(picked, 9).targets, [2.5, 3], 'unknown threshold is ignored');
assert.deepEqual(toggleHeightTarget(picked, 2.5).targets, [3], 'toggling an active threshold removes it');
assert.match(alertStorageKey('acct'), /:acct$/);
storage.setItem(alertStorageKey('broken'), 'not json');
assert.deepEqual(readHeightAlerts('broken', storage), { targets: [], notified: {} }, 'corrupted storage falls back to empty');

const chosen = { targets: [2, 2.5, 3], notified: {} };
assert.deepEqual(pendingHeightAlerts({ state: picked, feedingId: 'f1', baselineHeightMm: 20, currentHeightMm: 60 }).map((item) => item.target), [2.5, 3], 'only selected thresholds are evaluated');
assert.deepEqual(pendingHeightAlerts({ state: chosen, feedingId: '', baselineHeightMm: 20, currentHeightMm: 60 }), [], 'without a feeding round nothing alerts');
assert.deepEqual(pendingHeightAlerts({ state: chosen, feedingId: 'f1', baselineHeightMm: null, currentHeightMm: 60 }), [], 'missing baseline never alerts');
assert.deepEqual(pendingHeightAlerts({ state: chosen, feedingId: 'f1', baselineHeightMm: 20, currentHeightMm: null }), [], 'stale or missing height never alerts');
assert.deepEqual(pendingHeightAlerts({ state: chosen, feedingId: 'f1', baselineHeightMm: 20, currentHeightMm: 39 }).map((item) => item.target), [], 'below 2x does not alert');
assert.deepEqual(pendingHeightAlerts({ state: chosen, feedingId: 'f1', baselineHeightMm: 20, currentHeightMm: 40 }).map((item) => item.target), [2], '2x triggers on the exact ratio');
assert.deepEqual(pendingHeightAlerts({ state: chosen, feedingId: 'f1', baselineHeightMm: 20, currentHeightMm: 51 }).map((item) => item.target), [2, 2.5], 'multiple thresholds reached at once');
assert.deepEqual(pendingHeightAlerts({ state: chosen, feedingId: 'f1', baselineHeightMm: 20, currentHeightMm: 70 }).map((item) => item.target), [2, 2.5, 3], '3x triggers the full set');

let notified = markHeightAlertNotified(chosen, 2, 'f1', '2026-01-01T00:00:00.000Z');
notified = markHeightAlertNotified(notified, 2.5, 'f1', '2026-01-01T00:00:00.000Z');
assert.deepEqual(pendingHeightAlerts({ state: notified, feedingId: 'f1', baselineHeightMm: 20, currentHeightMm: 70 }).map((item) => item.target), [3], 'a notified threshold is skipped within the same round');
assert.deepEqual(pendingHeightAlerts({ state: notified, feedingId: 'f2', baselineHeightMm: 20, currentHeightMm: 70 }).map((item) => item.target), [2, 2.5, 3], 'the next feeding round alerts again');
assert.deepEqual(markHeightAlertNotified(notified, 9, 'f1').notified, notified.notified, 'unselected threshold is never marked');
assert.equal(markHeightAlertNotified(chosen, 2, '').notified['2'], undefined, 'missing feeding id is never marked');
assert.deepEqual(writeHeightAlerts('acct', { targets: [9] }, storage).targets, [], 'invalid stored targets are dropped');

assert.match(heightAlertMessage(2.5, 2.6).title, /2\.5 倍/);
assert.match(heightAlertMessage(2.5, 2.6).body, /2\.60 倍/);

const unsupported = { Notification: undefined, navigator: {} };
assert.equal(notificationPermission(unsupported), 'unsupported');
assert.equal(await enableSystemNotification(unsupported), 'unsupported');
assert.equal(await sendSystemNotification({ title: 't', body: 'b' }, unsupported), false, 'unsupported browsers never receive alerts');

const denied = { Notification: notificationStub('denied'), navigator: {} };
assert.equal(notificationPermission(denied), 'denied');
assert.equal(await enableSystemNotification(denied), 'denied');
assert.equal(await sendSystemNotification({ title: 't', body: 'b' }, denied), false, 'denied permission never sends');

const asked = { Notification: notificationStub('default', async () => 'granted'), navigator: {} };
assert.equal(await enableSystemNotification(asked), 'granted');
assert.equal(await enableSystemNotification(denied), 'denied', 'a denied permission is never re-requested');

const delivered = [];
const withWorker = {
  Notification: notificationStub('granted'),
  navigator: { serviceWorker: { register: async () => ({ showNotification: async (title, options) => delivered.push({ title, options }) }) } }
};
assert.equal(await sendSystemNotification({ title: '高度已达基线的 2 倍', body: 'b', tag: 'tag-1' }, withWorker), true);
assert.equal(delivered.length, 1, 'service worker notification is preferred');
assert.equal(delivered[0].options.tag, 'tag-1', 'tag keeps per-threshold notifications distinct');

const pageAlerts = [];
const withoutWorker = { Notification: notificationStub('granted', null, pageAlerts), navigator: {} };
assert.equal(await sendSystemNotification({ title: 't', body: 'b' }, withoutWorker), true);
assert.equal(pageAlerts.length, 1, 'falls back to page notification without a service worker');

const workerFallbackAlerts = [];
const failingWorker = {
  Notification: notificationStub('granted', null, workerFallbackAlerts),
  navigator: { serviceWorker: { register: async () => { throw new Error('registration blocked'); } } }
};
assert.equal(await sendSystemNotification({ title: 't', body: 'b' }, failingWorker), true, 'worker failure falls back to page notification');
assert.equal(workerFallbackAlerts.length, 1);

console.log('height alerts: threshold selection, once-per-round, permission and delivery fallbacks OK');
