#!/usr/bin/env bash
# Ships the committed live server (HEAD) to the Hetzner server and rebuilds it there.
# Usage: live/deploy.sh [ssh-target]   (default root@65.21.51.249)
set -euo pipefail
target="${1:-root@65.21.51.249}"
dir=/opt/dolumu/live-web
cd "$(git rev-parse --show-toplevel)"
rev=$(git rev-parse --short HEAD)
ssh "$target" "mkdir -p $dir && rm -rf $dir/src.new && mkdir $dir/src.new"
git archive HEAD live frontend/src/lib/live | ssh "$target" "tar -x -C $dir/src.new"
ssh "$target" "set -e; cd $dir; cp src.new/live/docker-compose.yml .; rm -rf src && mv src.new src
  cp src/live/Dockerfile src/Dockerfile; echo $rev > src/REVISION
  docker compose -p dolumu-live-web build && docker compose -p dolumu-live-web up -d
  for i in \$(seq 1 20); do [ \"\$(docker inspect -f '{{.State.Health.Status}}' dolumu-live-web-live-1)\" = healthy ] && break; sleep 2; done
  docker inspect -f '{{.State.Health.Status}}' dolumu-live-web-live-1"
echo "deployed live server $rev"
