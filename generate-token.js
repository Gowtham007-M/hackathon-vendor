// generate-token.js
const jwt = require('jsonwebtoken');

const SECRET = 'your-secret-key';

// You can accept CLI args if needed
const username = process.argv[2] || 'john_doe';

// Payload
const payload = { username };

// Create token
const token = jwt.sign(payload, SECRET, { expiresIn: '1h' });

// Print to stdout (so it can be captured in PowerShell or CMD)
console.log(token);
