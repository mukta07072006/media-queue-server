// require('dotenv').config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');

const app = express();
const port = process.env.PORT || 4500;
const uri = process.env.MONGODB_URI || "";

app.use(cors({
  origin: [
    'http://localhost:3000',
    process.env.LIVE_SITE_URL
  ].filter(Boolean),
  credentials: true
}));

app.use(express.json());

// 1. Establish the client globally outside the handler
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// 2. Create a global cache for database collections
let collections = null;

async function getCollections() {
  if (collections) return collections;

  // If there is no existing active connection, establish it dynamically
  await client.connect();
  const db = client.db('mediqueue');
  
  collections = {
    tutorsCollection: db.collection("tutors"),
    bookingsCollection: db.collection("bookings"),
    usersCollection: db.collection("Profile")
  };

  return collections;
}

// 3. Middleware to ensure DB is connected before handling any route
const ensureDb = async (req, res, next) => {
  try {
    req.db = await getCollections();
    next();
  } catch (err) {
    console.error("Database connection error:", err);
    res.status(500).json({ error: "Database connection failed" });
  }
};

const JWKS = createRemoteJWKSet(
  new URL("http://localhost:3000/api/auth/jwks") // ⚠️ Note: This localhost URL will fail on Vercel! It should use a production domain environment variable.
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: "No token provided" });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Invalid token format" });

  try {
    const { payload } = await jwtVerify(token, JWKS);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// --- BASE ROUTE ---
app.get('/', (req, res) => {
  res.send("Server is running!");
});

// --- API ROUTES (Using the ensureDb middleware) ---

app.get('/api/tutors/mine', ensureDb, async (req, res) => {
  try {
    const { userId } = req.query; 
    const result = await req.db.tutorsCollection.find({ authorId: userId }).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/user', ensureDb, async (req, res)=>{
  try{
    const userData = req.body;
    const result = await req.db.usersCollection.insertOne(userData);
    res.status(201).json(result);
  } catch(err){
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/user/:email', ensureDb, async (req,res)=>{
  try{
    const {email} = req.params;
    const result = await req.db.usersCollection.find({ email: email }).toArray();
    res.json(result);
  } catch(err){
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tutors/home', ensureDb, async (req, res) => {
  try {
    const result = await req.db.tutorsCollection.find().limit(6).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tutors', ensureDb, async (req, res) => {
  try {
    const { search, startDate, endDate } = req.query;
    let query = {};

    if (search) {
      query.tutorName = { $regex: search, $options: 'i' };
    }
    if (startDate && endDate) {
      query.sessionStartDate = { $gte: startDate, $lte: endDate };
    }

    const result = await req.db.tutorsCollection.find(query).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tutors/:id', ensureDb, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await req.db.tutorsCollection.findOne({ _id: new ObjectId(id) });
    if (!result) return res.status(404).json({ error: "Tutor not found" });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tutors', ensureDb, verifyToken, async (req, res) => {
  try {
    const tutor = req.body;
    const result = await req.db.tutorsCollection.insertOne(tutor);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tutors/:id', ensureDb, async (req, res) => {
  try {
    const { tutorId } = req.query;
    const result = await req.db.tutorsCollection.deleteOne({ _id: new ObjectId(tutorId) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bookings', ensureDb, verifyToken, async (req, res) => {
  try {
    const {tutorId, userId} = req.query;
    const booking = req.body;
    const checker = await req.db.bookingsCollection.findOne({ tutorId: tutorId, studentId: userId });

    if(checker) {
      return res.status(400).json({ error: "You already have a booking for this tutor" });
    }
    
    await req.db.tutorsCollection.updateOne(
      { _id: new ObjectId(booking.tutorId) },
      { $inc: { totalSlots: -1 } }
    );
    const result = await req.db.bookingsCollection.insertOne(booking);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bookings/mine', ensureDb, async (req, res) => {
  try {
    const { email } = req.query;
    const result = await req.db.bookingsCollection.find({ studentEmail: email }).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/bookings/:id', ensureDb, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await req.db.bookingsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "cancelled" } }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tutors/mine', ensureDb, async (req, res) => {
  try {
    const { tutorId } = req.query; 
    const result = await req.db.tutorsCollection.deleteOne({ _id: new ObjectId(tutorId) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/bookings/:id', ensureDb, async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    const result = await req.db.bookingsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { updatedData } }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tutors/mine', ensureDb, verifyToken, async (req, res) => {
  try {
    const { tutorId } = req.query;
    const updatedData = req.body;
    delete updatedData._id;

    if (!tutorId || tutorId === 'undefined' || tutorId.length !== 24) {
      return res.status(400).json({ 
        error: `Invalid or missing tutorId. Received: "${tutorId}". It must be a 24-character hex string.` 
      });
    }
   
    const result = await req.db.tutorsCollection.findOneAndUpdate(
      { _id: new ObjectId(tutorId) },
      { $set: { updatedData } },
      { returnDocument: 'after' } 
    );

    if (!result) {
      return res.status(404).json({ error: "Tutor listing not found" });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
  app.listen(4500, () => console.log('Running locally on 4500'));
}