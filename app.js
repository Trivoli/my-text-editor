const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const User = require('./models/User');
const Document = require('./models/Document'); // New: Document model
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');

const app = express();

// Connect to MongoDB (ensure MongoDB is running)
mongoose.connect('mongodb://localhost/texteditor', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.log('MongoDB connection error: ', err));

// Middleware
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: false }));
// To parse JSON bodies for autosave AJAX calls:
app.use(express.json());
app.use(express.static('public'));

app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// Updated Passport local strategy using async/await
passport.use(new LocalStrategy(
  async (username, password, done) => {
    try {
      const user = await User.findOne({ username });
      if (!user) {
        return done(null, false, { message: 'Incorrect username.' });
      }
      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return done(null, false, { message: 'Incorrect password.' });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Updated deserializeUser using promise-based approach
passport.deserializeUser((id, done) => {
  User.findById(id)
    .then(user => done(null, user))
    .catch(err => done(err));
});

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

// Routes
app.get('/', (req, res) => {
  res.redirect('/documents');
});

// GET login route
app.get('/login', (req, res) => {
  res.render('login');
});

// POST login route (Authenticate the user)
app.post('/login', passport.authenticate('local', {
  failureRedirect: '/login',
  successRedirect: '/documents'
}));

// Register Routes
app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('register', { error: 'Username and password are required.' });
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.render('register', { error: 'Username is already taken.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.redirect('/login');
  } catch (err) {
    console.error('Error during registration:', err);
    res.render('register', { error: 'Something went wrong during registration.' });
  }
});

// List Documents for the Authenticated User
app.get('/documents', isAuthenticated, async (req, res) => {
  try {
    const documents = await Document.find({ owner: req.user._id });
    res.render('documents', { user: req.user, documents });
  } catch(err) {
    console.error(err);
    res.send('Error retrieving documents.');
  }
});

// Create a New Document
app.get('/documents/new', isAuthenticated, async (req, res) => {
  try {
    const newDoc = new Document({
      title: 'Untitled Document',
      content: '',
      owner: req.user._id
    });
    await newDoc.save();
    res.redirect(`/editor/${newDoc._id}`);
  } catch(err) {
    console.error(err);
    res.send('Error creating document.');
  }
});

// Editor Route (Protected) for a Specific Document
app.get('/editor/:docId', isAuthenticated, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.docId, owner: req.user._id });
    if (!doc) return res.send('Document not found.');
    res.render('editor', { user: req.user, document: doc });
  } catch(err) {
    console.error(err);
    res.send('Error loading document.');
  }
});

// Autosave Route for Document Updates (via AJAX)
app.post('/editor/:docId', isAuthenticated, async (req, res) => {
  try {
    const { content } = req.body;
    const doc = await Document.findOneAndUpdate(
      { _id: req.params.docId, owner: req.user._id },
      { content },
      { new: true }
    );
    res.json({ success: true, document: doc });
  } catch(err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Error saving document.' });
  }
});

// Logout Route
app.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.redirect('/documents');
    }
    res.redirect('/login');
  });
});
// Rename Document Route
app.post('/documents/:docId/rename', isAuthenticated, async (req, res) => {
  try {
    const { newTitle } = req.body;
    await Document.findOneAndUpdate(
      { _id: req.params.docId, owner: req.user._id },
      { title: newTitle }
    );
    res.redirect('/documents');
  } catch (err) {
    console.error(err);
    res.send('Error renaming document.');
  }
});

// Delete Document Route
app.post('/documents/:docId/delete', isAuthenticated, async (req, res) => {
  try {
    await Document.deleteOne({ _id: req.params.docId, owner: req.user._id });
    res.redirect('/documents');
  } catch (err) {
    console.error(err);
    res.send('Error deleting document.');
  }
});

// Start the server
app.listen(3000, () => {
  console.log('Server started on http://localhost:3000');
});
