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
   git clone https://github.com/yourusername/ShortcutU.git
   cd ShortcutU
   ```

3. Install the required dependencies:
   ```
   npm install
   ```

4. Set up your MySQL database:
   - Create a new database for the application
   - Create a user with access to this database
   - Update the database connection details in `server.js`:
     ```javascript
     const pool = mysql.createPool({
       host: 'localhost',
       user: 'your_mysql_username',
       password: 'your_mysql_password',
       database: 'your_database_name',
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

7. Create the necessary database tables using the following SQL queries:
   ```sql
   CREATE TABLE users (
     id INT AUTO_INCREMENT PRIMARY KEY,
     username VARCHAR(255) NOT NULL UNIQUE,
     password VARCHAR(255) NOT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );

   CREATE TABLE shortcuts (
     id INT AUTO_INCREMENT PRIMARY KEY,
     user_id INT NOT NULL,
     shortcut VARCHAR(255) NOT NULL,
     expansion TEXT NOT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
   );
   ```

8. Create an initial user account:
   ```sql
   -- Generate a password hash using bcrypt (DO NOT use this example in production)
   -- Example shows password hash for 'yourpassword'
   INSERT INTO users (username, password) 
   VALUES ('yourusername', '$2b$10$ExampleHashThatShouldBeGeneratedWithBcrypt');
   ```

9. Start the server:
   ```
   node server.js
   ```

10. The server should now be running on port 3222 (or the port you specified).

## Usage

1. After installing the Chrome extension and setting up the server, click on the ShortcutU icon in your Chrome toolbar.

2. Log in with the username and password you created in the database setup.

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

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Attribution

Please include the appropriate attribution to this GitHub repo when using or distributing this software.

---

Please open an issue on the GitHub repository for more information or support.

# Shortcuts Backend

This is the backend server for the Shortcuts Chrome extension, allowing you to run it locally without needing a specific domain.

## Setup Instructions

### Prerequisites
- Node.js (v12 or higher)
- MySQL database

### Database Setup
1. Create a MySQL database for the application:
```sql
-- Replace with your own database name, username and password
CREATE DATABASE your_database_name;
CREATE USER 'your_username'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON your_database_name.* TO 'your_username'@'localhost';
FLUSH PRIVILEGES;
```

2. Import the database schema:
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shortcuts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  shortcut VARCHAR(100) NOT NULL,
  expansion TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

3. Create a test user:
```sql
-- Password must be hashed using bcrypt
-- This is just a placeholder. Generate your own hash in production
INSERT INTO users (username, password) 
VALUES ('yourusername', '$2b$10$GenerateAProperHashUsingBcrypt');
```

### Backend Setup
1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
# Development mode (runs HTTP server on localhost)
npm start

# Production mode (runs HTTPS server with certificates)
NODE_ENV=production npm start
```

The server will run at:
- Development: http://localhost:3222
- Production: https://your-domain.com:3222

### Environment Configuration
You can customize the configuration by setting environment variables:

```bash
PORT=3222                    # Server port
NODE_ENV=development         # 'development' or 'production'
JWT_SECRET=your_secret_key   # Secret key for JWT (use a strong random value)
DB_HOST=localhost            # Database host
DB_USER=your_username        # Database user
DB_PASSWORD=your_password    # Database password
DB_NAME=your_database_name   # Database name
```

## Chrome Extension Configuration

The Chrome extension is configured to work with both local development and production environments.

To switch environments, edit the `manifest.json` file to update the host permissions:
```json
"host_permissions": [
    "https://your-domain.com:3222/*"
]
```

And update all URLs in background.js to point to your domain.

## API Endpoints

- `POST /login` - Authenticate user
- `GET /getShortcuts/:user_id` - Get user's shortcuts
- `POST /addShortcut` - Add a new shortcut
- `PUT /updateShortcut` - Update an existing shortcut
- `DELETE /deleteShortcut/:id` - Delete a shortcut
- `POST /verifyToken` - Verify JWT token

## Security Notes

- Always use a strong, randomly generated JWT secret
- HTTPS is required for production use
- Store passwords using bcrypt hashing
- Keep your server updated with security patches
