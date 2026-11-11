module.exports = {
  apps: [
    {
      name: 'minutes-web',
      script: '/usr/bin/serve',
      args: '-s -p 3000 /Minutes_maker/Minutes_maker/mobile_app/build/web',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'minutes-processor',
      cwd: '/Minutes_maker/Minutes_maker/laptop_processor',
      script: '/Minutes_maker/Minutes_maker/laptop_processor/venv/bin/python',
      args: 'main.py',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        PYTHONUNBUFFERED: '1'
      }
    }
  ]
};
