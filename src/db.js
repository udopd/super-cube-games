// The platform process intentionally has no database driver. All persisted data operations
// are sent to the private PostgreSQL-backed Data API through this allowlisted client.
export { DataApiClient, DataApiError, createDatabase } from '../shared/data-client.js';
