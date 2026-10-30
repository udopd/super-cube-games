#!/usr/bin/env sh
set -eu

# Run on the production Nginx host after installing or changing the shared routes.
nginx -t
if command -v systemctl >/dev/null 2>&1; then
  systemctl reload nginx
else
  nginx -s reload
fi
