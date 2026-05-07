#!/bin/sh
DIR="/Users/chowpeijun/Library/CloudStorage/Dropbox/Claude/portfolio"
cd "$DIR"
git pull --rebase origin main 2>&1
npm install --silent 2>&1
pkill -f "node server.js" 2>/dev/null; sleep 1
open "http://localhost:3333/admin.html"
exec node server.js
