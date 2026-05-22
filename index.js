require('dotenv').config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');

const app = express();
const uri = process.env.MONGODB_URI || "";

// ✅ Single cors — no double app.use(cors())
app.use(cors({
  origin: [
    'http://localhost:3000',
    process.env.LIVE_SITE_URL
  ].filter(Boolean),
  credentials: true
}));
app.options('*', cors());
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// ✅ Fix: use env variable, not hardcoded localhost
const JWKS = createRemoteJWKSet(
  new URL(process.env.JWKS_URL || "http://localhost:3000/api/auth/jwks")
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: "No token provided" });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Invalid token format" });
  try {
    await jwtVerify(token, JWKS);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// ✅ Fix: connect once, reuse client — don't wrap routes inside run()
let isConnected = false;
const connectDB = async () => {
  if (!isConnected) {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    isConnected = true;
    console.log("Connected to MongoDB!");
  }
};

const db = () => client.db('mediqueue');


app.get('/', (req, res) => res.send("Server is running!"));

app.get('/api/tutors/home', async (req, res) => {
  try {
    await connectDB();
    const result = await db().collection("tutors").find().limit(6).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tutors/mine', async (req, res) => {
  try {
    await connectDB();
    const { userId } = req.query;
    const result = await db().collection("tutors").find({ authorId: userId }).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tutors', async (req, res) => {
  try {
    await connectDB();
    const { search, startDate, endDate } = req.query;
    let query = {};
    if (search) query.tutorName = { $regex: search, $options: 'i' };
    if (startDate && endDate) query.sessionStartDate = { $gte: startDate, $lte: endDate };
    const result = await db().collection("tutors").find(query).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tutors/:id', async (req, res) => {
  try {
    await connectDB();
    const { id } = req.params;
    const result = await db().collection("tutors").findOne({ _id: new ObjectId(id) });
    if (!result) return res.status(404).json({ error: "Tutor not found" });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tutors', verifyToken, async (req, res) => {
  try {
    await connectDB();
    const result = await db().collection("tutors").insertOne(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tutors/mine', verifyToken, async (req, res) => {
  try {
    await connectDB();
    const { tutorId } = req.query;
    const updatedData = req.body;
    delete updatedData._id;
    if (!tutorId || tutorId.length !== 24)
      return res.status(400).json({ error: `Invalid tutorId: "${tutorId}"` });
    const result = await db().collection("tutors").findOneAndUpdate(
      { _id: new ObjectId(tutorId) },
      { $set: updatedData },
      { returnDocument: 'after' }
    );
    if (!result) return res.status(404).json({ error: "Tutor not found" });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tutors/mine', async (req, res) => {
  try {
    await connectDB();
    const { tutorId } = req.query;
    const result = await db().collection("tutors").deleteOne({ _id: new ObjectId(tutorId) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tutors/:id', async (req, res) => {
  try {
    await connectDB();
    const { tutorId } = req.query;
    const result = await db().collection("tutors").deleteOne({ _id: new ObjectId(tutorId) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/user', async (req, res) => {
  try {
    await connectDB();
    const result = await db().collection("Profile").insertOne(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/user/:email', async (req, res) => {
  try {
    await connectDB();
    const result = await db().collection("Profile").find({ email: req.params.email }).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bookings', verifyToken, async (req, res) => {
  try {
    await connectDB();
    const { tutorId, userId } = req.query;
    const booking = req.body;
    const checker = await db().collection("bookings").findOne({ tutorId, studentId: userId });
    if (checker) return res.status(400).json({ error: "Already booked this tutor" });
    await db().collection("tutors").updateOne({ _id: new ObjectId(booking.tutorId) }, { $inc: { totalSlots: -1 } });
    const result = await db().collection("bookings").insertOne(booking);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bookings/mine', async (req, res) => {
  try {
    await connectDB();
    const result = await db().collection("bookings").find({ studentEmail: req.query.email }).toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/bookings/:id', async (req, res) => {
  try {
    await connectDB();
    const result = await db().collection("bookings").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: "cancelled" } }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/bookings/:id', async (req, res) => {
  try {
    await connectDB();
    const result = await db().collection("bookings").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body }
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Required for Vercel
module.exports = app;

if (process.env.NODE_ENV !== 'production') {
  app.listen(4500, () => console.log('Running on 4500'));
}