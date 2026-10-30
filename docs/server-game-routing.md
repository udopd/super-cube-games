# Server game routing

Server games are served through the platform URL, for example:

- `https://games.example.com/server-games/<slug>/`
- `https://games.example.com/server-games-test/<slug>/`

Nginx has one shared route for all games. Uploading or updating a game does not change Nginx configuration and does not require an Nginx reload. Game containers are isolated and do not publish ports on the host. The runtime manager exposes the declared game port only inside that game's private Docker network and proxies HTTP and WebSocket traffic to it.

## Game archive port

For a server game, include `runtime.txt` with `server`, plus `server/index.js`. By default the game receives `PORT=3000`. If it listens on another port, include `server/port.txt` with one port number from `1024` to `65535`, for example:

```text
8080
```

The server must listen on `0.0.0.0` and use the `PORT` environment variable. The port is declared when the runtime manager creates that game's container; it is not added to the platform API Dockerfile and is never published as a public host port.

## One-time Nginx setup

The production Nginx host is managed separately from this repository. Install the files from `deploy/nginx/` there:

1. Copy `super-cube-games-map.conf` into the Nginx `http {}` include directory (commonly `/etc/nginx/conf.d/`).
2. Copy `snippets/super-cube-games-locations.conf` into the Nginx snippets directory.
3. Add this inside the existing HTTPS `server {}` block for the platform domain:

   ```nginx
   include /etc/nginx/snippets/super-cube-games-locations.conf;
   ```

4. Confirm that the platform container is reachable from the Nginx host at `127.0.0.1:3000`. If its host port differs, replace `127.0.0.1:3000` in the snippet with the actual platform host/port.
5. Run `scripts/reload-nginx.sh` on the Nginx host. It validates the full configuration with `nginx -t` and only then reloads Nginx.

Do not add per-game `listen` ports, port exceptions, or per-game Nginx locations. Keep the platform's existing routes and security headers; this snippet only adds the two server-game URL prefixes and WebSocket forwarding.
