const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');
const upload = require('../middleware/fileUpload');

router.post('/register', upload.single('aadhaarDocument'), register);
router.post('/login', login);

module.exports = router;