# PostgreSQL schema migrations

The Data API always applies the initial `data-service/schema.sql` as version `001_initial` on a fresh database, then runs SQL files in this directory in lexical order. A filename must follow `NNN_short_name.sql`, for example `002_add_game_visibility.sql`.

The `schema_migrations` table stores SHA-256 checksums. An already applied migration whose contents change causes startup to fail rather than silently drift. **Never edit an applied migration or `schema.sql` after it has been applied to a persistent database.** Add a new migration for every schema change, test it on a backup, and take a PostgreSQL backup before production updates.
