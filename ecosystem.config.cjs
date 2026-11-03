// pm2 (VPS ke liye): pm2 start ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'aqdas-md',
    script: 'main.js',
    cwd: __dirname,
    autorestart: true,
    max_restarts: 50,
    restart_delay: 3000,
    max_memory_restart: '700M',
    env: { NODE_ENV: 'production', WEB: 'true', PORT: 3000 }
  }]
}
