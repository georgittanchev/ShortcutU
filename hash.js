// Print a bcrypt hash for a password, to insert a user into the `users` table:
//
//   node hash.js 'the-password'
//   INSERT INTO users (username, password, email) VALUES ('me', '<hash>', 'me@example.com');
const bcrypt = require('bcrypt');

const password = process.argv[2];
if (!password) {
  console.error("Usage: node hash.js '<password>'");
  process.exit(1);
}

bcrypt.hash(password, 12).then((hash) => console.log(hash));
