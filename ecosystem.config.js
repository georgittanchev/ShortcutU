// PM2 config. One instance on purpose: the shortcut cache lives in process
// memory, so with several cluster workers an edit would only clear the cache
// of the worker that handled it.
module.exports = {
  apps: [{
    name: 'shortcut-server',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
