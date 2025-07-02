const bcrypt = require('bcrypt');

async function hashPassword(password) {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

async function comparePasswords(plainTextPassword, hashedPassword) {
  return bcrypt.compare(plainTextPassword, hashedPassword);
}

// Usage
const plainTextPassword = '940221';
const storedHashedPassword = '$2b$10$EiBj7FYz87Du1EfV6XL7i.9/59idD0gaZnFrvR2Ouf9xaw9vB.lJy'; // Paste the hashed password from your database here

hashPassword(plainTextPassword).then(newHash => {
  console.log('Newly generated hash:', newHash);
  
  comparePasswords(plainTextPassword, storedHashedPassword).then(isMatch => {
    console.log('Password match:', isMatch);
  });
});
