#!/bin/bash
# Utterlog deploy script — one command, no errors
set -e

SERVER="hz-utterlog"
REMOTE_DIR="/www/wwwroot/utterlog.com"

echo "→ Syncing frontend..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env.local' \
  /Users/gentpan/projects/utterlog/utterlog-admin/ \
  $SERVER:$REMOTE_DIR/utterlog-admin/

echo "→ Syncing backend..."
rsync -avz --delete \
  --exclude 'vendor' \
  --exclude '.env' \
  --exclude 'storage/database.sqlite' \
  --exclude 'storage/cache' \
  --exclude 'storage/logs' \
  /Users/gentpan/projects/utterlog/utterlog-api/ \
  $SERVER:$REMOTE_DIR/utterlog-api/

echo "→ Building frontend..."
ssh $SERVER "cd $REMOTE_DIR/utterlog-admin && rm -rf .next && npm run build"

echo "→ Restarting..."
ssh $SERVER "pm2 restart utterlog-web"

echo "✅ Deploy complete"
