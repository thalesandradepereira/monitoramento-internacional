module.exports = {
  apps: [
    {
      name: 'monitoramento-internacional',
      script: 'npm',
      args: 'run start',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      time: true,
      out_file: './state/pm2-out.log',
      error_file: './state/pm2-err.log',
    },
  ],
}
