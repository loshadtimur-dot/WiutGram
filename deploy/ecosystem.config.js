// PM2 process file: pm2 start deploy/ecosystem.config.js --env production
module.exports = {
  apps: [
    {
      name: 'uni-lovers',
      script: 'server.js',
      cwd: __dirname + '/..',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      kill_timeout: 15000,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        TRUST_PROXY: 1
      },
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      merge_logs: true,
      time: true
    }
  ]
};
