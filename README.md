# ShortcutU

A self-hosted text expander for Chrome. Type a shortcut such as `:thanks` in any text field, press Space or Enter, and it turns into the full text you saved for it. Your snippets live on your own server (Node.js + MySQL) and sync to every browser where you log in.

I built it for support work, where the same answers get typed dozens of times a day, and I didn't want those answers stored in someone else's cloud.

## How it works

- **Chrome extension** (Manifest V3). `content.js` watches `<input>`, `<textarea>` and contenteditable fields and replaces a shortcut with its expansion when you press Space or Enter. Snippets are cached in `chrome.storage.local`, so expansion is instant.
- **Options page** (`options.html`). Log in or register (if the server allows it), then add, edit and delete your shortcuts.
- **API server** (`server.js`). Express + MySQL with JWT login. Each user only sees and edits their own shortcuts.

## Server setup

Requirements: Node.js 18+, MySQL 5.7+ or MariaDB 10.3+.

```bash
git clone https://github.com/georgittanchev/ShortcutU.git
cd ShortcutU
npm install

# Database
mysql -e "CREATE DATABASE shortcutu CHARACTER SET utf8mb4;"
mysql -e "CREATE USER 'shortcutu'@'localhost' IDENTIFIED BY 'a-strong-password';"
mysql -e "GRANT ALL ON shortcutu.* TO 'shortcutu'@'localhost';"
mysql shortcutu < schema.sql

# Configuration
cp .env.example .env
# Set JWT_SECRET (e.g. `openssl rand -hex 32`) and the DB_* values
```

Then create your user, either through the extension's registration form (set `ALLOW_REGISTRATION=true` in `.env`, and switch it off again if the server is just for you), or by hand:

```bash
node hash.js 'your-password'
mysql shortcutu -e "INSERT INTO users (username, password, email) VALUES ('you', '<hash from above>', 'you@example.com');"
```

Start it:

```bash
npm start
# or with PM2
pm2 start ecosystem.config.js
```

Keep it to one instance: the snippet cache is held in process memory, so with several cluster workers an edit would only reach one of them.

### HTTPS

The extension talks to the API over HTTPS. Two ways to do that:

1. **Behind a reverse proxy (recommended).** Leave `TLS_KEY`/`TLS_CERT` empty. The server listens on plain HTTP at `127.0.0.1:3222` and your web server terminates TLS. The included `.htaccess` does this for Apache/LiteSpeed (needs proxy support). With Nginx: `location / { proxy_pass http://127.0.0.1:3222; }`.
2. **Directly.** Set `TLS_KEY`, `TLS_CERT` (and optionally `TLS_CA`) in `.env` to your certificate files.

### Configuration (`.env`)

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `JWT_SECRET` | yes | | Random string, 32+ characters. The server won't start without it. |
| `DB_HOST` | | `localhost` | MySQL host |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | yes | | MySQL credentials |
| `PORT` | | `3222` | Listening port |
| `HOST` | | `127.0.0.1` | Interface for plain-HTTP mode |
| `TLS_KEY`, `TLS_CERT`, `TLS_CA` | | | Serve HTTPS directly |
| `ALLOW_REGISTRATION` | | off | `true` enables `POST /register` |
| `CORS_ORIGIN` | | `*` | Limit which origins may call the API |

## Extension setup

1. In `background.js`, set `API_URL` to your server, and put the same origin in `host_permissions` in `manifest.json`.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select this folder.
3. Open the extension's options, log in, and add shortcuts.

## API

All shortcut routes need `Authorization: Bearer <token>` from `/login` and act on the logged-in user only.

| Method | Path | Body |
|---|---|---|
| `POST` | `/login` | `{ username, password }` → `{ token, user_id }` |
| `POST` | `/register` | `{ username, email, password }` (only with `ALLOW_REGISTRATION=true`) |
| `GET` | `/getShortcuts/:user_id` | returns your shortcuts (`:user_id` is kept for compatibility and ignored) |
| `POST` | `/addShortcut` | `{ shortcut, expansion }` |
| `POST` or `PUT` | `/updateShortcut` | `{ id, shortcut, expansion }` |
| `POST` or `DELETE` | `/deleteShortcut/:id` | |

The extension uses the `POST` forms: the OWASP ModSecurity Core Rule Set, enabled by default on CyberPanel and cPanel servers, blocks `PUT` and `DELETE` with a 403.
| `POST` | `/verifyToken` | 200 if the token is valid |
| `POST` | `/deleteAccount` | `{ password }`: deletes the account and all its shortcuts |

Tokens expire after 24 hours.

## Privacy

The hosted server's privacy policy is at <https://tanchev.net/shortcutu/privacy/>. In short: the server stores your account and your shortcuts; what you type on websites is matched in the browser and never sent anywhere. Users can delete their account and all shortcuts from the options page (Account → Delete account). If you run your own server for other people, you need your own policy.

## Security notes

- Snippets are stored as plain text in MySQL. Don't keep passwords or API keys in them.
- The content script runs on all pages so it can expand text anywhere. It only reads the field you're typing in, and only talks to your own server.
- Never commit `.env`, certificates or database dumps. The `.gitignore` covers them.

## Limits

Built for a server that accepts public sign-ups:

- Logins: 20 failed attempts per IP and 10 per username in 15 minutes (successful logins don't count).
- Sign-ups: 5 per IP and 50 for the whole server per hour.
- Everything else: 300 requests per minute per IP.
- A shortcut trigger is at most 100 characters, an expansion at most 20,000, and an account holds at most 2,000 shortcuts.
- Passwords are 8 characters to 72 bytes (bcrypt ignores anything after 72 bytes).

The username and server-wide limits exist because client IPs come from a proxy header. A proxy can be tricked into passing through a value the client made up, so no limit relies on the IP alone. Limits are kept in memory and reset when the server restarts.

## Third-party code

`lib/` contains, unmodified: [Muuri](https://muuri.dev/) 0.9.5 (MIT), [Hammer.js](https://hammerjs.github.io/) 2.0.7 (MIT) and [web-animations-js](https://github.com/web-animations/web-animations-js) (Apache 2.0). Their licence headers are kept in the files.

## License

MIT. See [LICENSE](LICENSE).

## Author

Georgi Tanchev — https://tanchev.net
