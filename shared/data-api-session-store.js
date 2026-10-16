import session from 'express-session';

export class DataApiSessionStore extends session.Store {
  constructor(client, options = {}) {
    super();
    this.client = client;
    this.defaultTtl = Number(options.ttl || 1000 * 60 * 60 * 24 * 14);
  }
  maxAge(sess) {
    const cookieAge = Number(sess?.cookie?.maxAge);
    return Number.isFinite(cookieAge) && cookieAge > 0 ? cookieAge : this.defaultTtl;
  }
  async api(route, payload) {
    return this.client.request(`/internal/v1/sessions/${route}`, payload, 5000);
  }
  get(sid, callback) {
    this.api('get', { sid }).then(({ session: value }) => callback(null, value || null)).catch((error) => callback(error));
  }
  set(sid, sess, callback = () => {}) {
    this.api('set', { sid, session: sess, maxAge: this.maxAge(sess) }).then(() => callback(null)).catch(callback);
  }
  destroy(sid, callback = () => {}) {
    this.api('destroy', { sid }).then(() => callback(null)).catch(callback);
  }
  touch(sid, sess, callback = () => {}) {
    this.api('touch', { sid, maxAge: this.maxAge(sess) }).then(() => callback(null)).catch(callback);
  }
}
