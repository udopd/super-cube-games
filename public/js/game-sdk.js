(() => {
  'use strict';
  const params = new URL(document.currentScript?.src || location.href).searchParams;
  // Server injects the immutable platform slug. Do not derive a save key from the
  // player's page query string (for example ?src=catalog).
  const slug = params.get('slug') || '';
  const pending = new Map();
  let sequence = 0;
  function request(action, payload = {}) {
    if (window.parent === window) return Promise.reject(new Error('Game SDK must run inside the SUPER CUBE game player.'));
    const id = `sc-${Date.now().toString(36)}-${++sequence}-${Math.random().toString(36).slice(2,8)}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Platform request timed out.')); }, 12000);
      pending.set(id, { resolve, reject, timeout });
      window.parent.postMessage({ channel: 'SC_PLATFORM', id, slug, action, payload }, '*');
    });
  }
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || !event.data || event.data.channel !== 'SC_PLATFORM_RESPONSE') return;
    const item = pending.get(event.data.id);
    if (!item) return;
    clearTimeout(item.timeout);
    pending.delete(event.data.id);
    if (event.data.ok) item.resolve(event.data.result);
    else item.reject(new Error(event.data.error || 'Platform request failed.'));
  });
  const sdk = {
    version: '1.1.0',
    getUser: () => request('getUser'),
    save: (data) => request('save', { data }),
    loadSave: () => request('loadSave'),
    rate: (rating) => request('rate', { rating }),
    review: (body) => request('review', { body }),
    favorite: () => request('favorite'),
    share: () => request('share'),
    recordClick: (label = '') => request('recordClick', { label }),
    track: (eventName, metadata = {}) => request('track', { eventName, metadata })
  };
  Object.defineProperty(window, 'SuperCubePlatform', { value: Object.freeze(sdk), writable: false, configurable: false });
  window.parent.postMessage({ channel: 'SC_PLATFORM_READY', slug, version: sdk.version }, '*');
})();
