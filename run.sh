#!/bin/bash
# Minutes Maker Runner Script

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

case "$1" in
  start)
    pm2 start ecosystem.config.cjs
    pm2 save
    pm2 status
    ;;
  stop)
    pm2 stop ecosystem.config.cjs
    pm2 status
    ;;
  restart)
    pm2 restart ecosystem.config.cjs
    pm2 status
    ;;
  status)
    pm2 status
    ;;
  logs)
    pm2 logs ${2:-}
    ;;
  dev-dashboard)
    cd "$DIR/web_dashboard" && npm run dev
    ;;
  dev-processor)
    cd "$DIR/laptop_processor" && ./venv/bin/python main.py
    ;;
  *)
    pm2 start ecosystem.config.cjs
    pm2 save
    pm2 status
    ;;
esac
