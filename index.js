const express = require('express');
const mongoose = require('mongoose');
const cookieSession = require('cookie-session');
const passport = require('passport');

require('dotenv').config();
require('./models/Users');
require('./services/passport');

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((err) => {
    console.error('Error connecting to MongoDB', err);
  });

const app = express();
app.use(
  cookieSession({
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    keys: [process.env.COOKIE_KEY],
  }),
);
app.use(passport.initialize({}));
app.use(passport.session({}));

require('./routes/authRoutes')(app);

const PORT = process.env.PORT || 4000;

app.listen(PORT);
