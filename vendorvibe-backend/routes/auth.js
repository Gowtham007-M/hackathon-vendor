const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const upload = require('../middleware/fileUpload');

// Export a function that accepts 'io'
module.exports = (io) => {
  // Pass 'io' to the controller functions
  router.post('/register', upload.single('aadhaarDocument'), (req, res) => authController.register(req, res, io));
  router.post('/login', (req, res) => authController.login(req, res, io));

  return router;
};
