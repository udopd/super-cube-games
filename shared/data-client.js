import crypto from 'node:crypto';
const normalizeSql = (sql) => String(sql).trim().replace(/\s+/g, ' ');
export const queryIdFor = (sql) => crypto.createHash('sha256').update(normalizeSql(sql)).digest('hex');

export class DataApiError extends Error {
  constructor(message, status = 502, code = 'DATA_API_ERROR') {
    super(message);
    this.name = 'DataApiError';
    this.status = status;
    this.code = code;
  }
}

export class DataApiClient {
  constructor({ baseUrl = process.env.DATA_API_URL || 'http://127.0.0.1:4001', token = process.env.DATA_API_TOKEN, timeoutMs = 8000 } = {}) {
    if (!token || token.length < 32) throw new Error('DATA_API_TOKEN must be configured with at least 32 characters.');
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  async request(route, payload, timeoutMs = this.timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${route}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      let result;
      try { result = await response.json(); } catch { result = {}; }
      if (!response.ok) throw new DataApiError(result.error || `Data API request failed (${response.status}).`, response.status, result.code || 'DATA_API_ERROR');
      return result;
    } catch (error) {
      if (error instanceof DataApiError) throw error;
      throw new DataApiError(error.name === 'AbortError' ? 'Data API request timed out.' : `Data API unavailable: ${error.message}`);
    } finally { clearTimeout(timer); }
  }

  prepare(sql) {
    const statement = String(sql);
    const queryId = queryIdFor(statement);
    return {
      get: async (...params) => {
        const result = await this.request('/internal/v1/query', { queryId, mode: 'get', params });
        return result.rows?.[0];
      },
      all: async (...params) => {
        const result = await this.request('/internal/v1/query', { queryId, mode: 'all', params });
        return result.rows || [];
      },
      run: async (...params) => {
        const result = await this.request('/internal/v1/query', { queryId, mode: 'run', params });
        return { changes: Number(result.rowCount || 0), lastInsertRowid: result.insertId ?? undefined };
      }
    };
  }

  async batch(statements) {
    const result = await this.request('/internal/v1/batch', {
      statements: statements.map(({ sql, params = [], mode = 'run' }) => ({ queryId: queryIdFor(sql), params, mode }))
    });
    return result.results || [];
  }

  async health() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(`${this.baseUrl}/health`, { signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      return response.ok && data.status === 'ok';
    } catch { return false; }
    finally { clearTimeout(timer); }
  }

  close() {}
}

export function createDatabase() {
  return new DataApiClient();
}
