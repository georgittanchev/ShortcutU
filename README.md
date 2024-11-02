# ShortcutU - Text Expansion Chrome Extension

ShortcutU is a powerful text expansion Chrome extension that allows you to create and use custom shortcuts to expand into longer text snippets. This tool is perfect for increasing productivity by automating repetitive typing tasks.

## Features

- Create custom text shortcuts
- Expand shortcuts into longer text snippets
- Works across various text input fields in Chrome
- Secure user authentication
- Private server setup for data privacy

## Installation

### Chrome Extension

1. Clone this repository or download the source code.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable "Developer mode" in the top right corner.
4. Click "Load unpacked" and select the directory containing the extension files.

### Server Setup

The server is built with Node.js and uses MySQL for data storage. Follow these steps to set up your private server:

1. Ensure you have Node.js and MySQL installed on your server.

2. Clone the repository on your server:
   ```
   git clone https://github.com/yourusername/shortcutu-app.git
   cd shortcutu-app
   ```

3. Install the required dependencies:
   ```
   npm install
   ```

4. Set up your MySQL database:
   - Create a new database named `advokati_shortcuts`
   - Create a user with access to this database
   - Update the database connection details in `server.js`:
     ```javascript
     const pool = mysql.createPool({
       host: 'localhost',
       user: 'your_mysql_username',
       password: 'your_mysql_password',
       database: 'advokati_shortcuts',
       connectionLimit: 10
     });
     ```

5. Set up SSL/TLS for HTTPS:
   - Obtain SSL/TLS certificates for your domain
   - Update the paths in `server.js` to point to your certificate files:
     ```javascript
     const options = {
       key: fs.readFileSync('path/to/your/key.key'),
       cert: fs.readFileSync('path/to/your/crt.crt'),
       ca: fs.readFileSync('path/to/your/ca.pem')
     };
     ```

6. Update the `JWT_SECRET` in `server.js` with a secure, randomly generated key:
   ```javascript
   const JWT_SECRET = 'your_secure_random_key';
   ```

7. Start the server:
   ```
   node server.js
   ```

8. The server should now be running on port 3222 (or the port you specified).

## Usage

1. After installing the Chrome extension and setting up the server, click on the ShortcutU icon in your Chrome toolbar.

2. Log in using your credentials.

3. Create new shortcuts by specifying a shortcut text and its expansion.

4. Use your shortcuts in any text input field in Chrome. When you type a shortcut followed by a space or newline, it will automatically expand to the specified text.

## Privacy and Security

By hosting your own server, you ensure that all your shortcut data remains private and under your control. The server uses HTTPS for secure communication and JWT for user authentication.

## Customization

You can customize the server port by modifying the `PORT` variable in `server.js`:

```javascript
const PORT = process.env.PORT || 3222;
```

## Troubleshooting

If you encounter any issues:

1. Check the browser console for any error messages from the extension.
2. Check the server logs for any backend errors.
3. Ensure your database connection details are correct.
4. Verify that your SSL/TLS certificates are valid and properly configured.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.

---

For more information or support, please open an issue on the GitHub repository.