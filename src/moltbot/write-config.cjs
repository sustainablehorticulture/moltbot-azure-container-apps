const fs = require('fs');
const path = require('path');

const configDir = '/home/node/.openclaw';
const configFile = path.join(configDir, 'openclaw.json');

const config = {
  gateway: {
    mode: 'local',
    controlUi: { enabled: true, allowInsecureAuth: true },
    auth: {
      mode: 'token',
      token: process.env.OPENCLAW_GATEWAY_TOKEN || process.env.CLAWDBOT_GATEWAY_TOKEN || 'red-dog-a1b2c3d4e5f6'
    },
    trustedProxies: ['100.100.0.0/16', '172.17.0.0/16', '1.144.107.0/24']
  },
  channels: {
    discord: {
      enabled: true,
      token: process.env.DISCORD_BOT_TOKEN,
      dm: {
        enabled: true,
        policy: 'allowlist',
        allowFrom: ['1466940509753966652']
      },
      guilds: {
        '1467058803508908055': {
          users: ['1466940509753966652'],
          requireMention: true
        }
      }
    }
  },
  agents: {
    defaults: {
      model: {
        primary: 'openrouter/anthropic/claude-sonnet-4'
      }
    }
  },
  plugins: {
    entries: {
      discord: {
        enabled: true
      }
    }
  }
};

fs.mkdirSync(configDir, { recursive: true });
fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
console.log('Config written to', configFile);
console.log(fs.readFileSync(configFile, 'utf8'));
