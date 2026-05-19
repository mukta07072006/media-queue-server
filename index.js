require('dotenv').config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 4500;
const uri = process.env.MONGODB_URI || "";

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000",
     methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization']
 }));
app.use(express.json()); 

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB!");

    const db = client.db('mediqueue');
    const tutorsCollection = db.collection("tutors");
    const bookingsCollection = db.collection("bookings");


    app.get('/api/tutors/mine', async (req, res) => {
      try {
        const { userId } = req.query; 
        const result = await tutorsCollection.find({ userId }).toArray();
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });


    app.get('/api/tutors/home', async (req, res) => {
    try {
        const result = await tutorsCollection
            .find()
            .limit(6) 
            .toArray()
        res.json(result)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

    app.get('/api/tutors', async (req, res) => {
      try {
        const { search, startDate, endDate } = req.query;
        let query = {};

        if (search) {
          query.tutorName = { $regex: search, $options: 'i' };
        }
        if (startDate && endDate) {
          query.sessionStartDate = { $gte: startDate, $lte: endDate };
        }

        const result = await tutorsCollection.find(query).toArray();
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/api/tutors/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const result = await tutorsCollection.findOne({ _id: new ObjectId(id) });
        if (!result) return res.status(404).json({ error: "Tutor not found" });
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/tutors', async (req, res) => {
      try {
        const tutor = req.body;
        const result = await tutorsCollection.insertOne(tutor);
        res.status(201).json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.put('/api/tutors/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const updatedData = req.body;
        const result = await tutorsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.delete('/api/tutors/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const result = await tutorsCollection.deleteOne({ _id: new ObjectId(id) });
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    
    app.post('/api/bookings', async (req, res) => {
      try {
        const booking = req.body;
        
        await tutorsCollection.updateOne(
          { _id: new ObjectId(booking.tutorId) },
          { $inc: { totalSlot: -1 } }
        );
        const result = await bookingsCollection.insertOne(booking);
        res.status(201).json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/api/bookings/mine', async (req, res) => {
      try {
        const { email } = req.query;
        const result = await bookingsCollection.find({ studentEmail: email }).toArray();
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.patch('/api/bookings/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const result = await bookingsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "cancelled" } }
        );
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

  } catch (err) {
    console.error(err);
    
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send("Server is running!");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});