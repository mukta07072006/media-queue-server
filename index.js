require('dotenv').config();
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

app.use(cors())
app.use(express.json()); 

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
const JWKS = createRemoteJWKSet(
  new URL("http://localhost:3000/api/auth/jwks")
)
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: "No token provided" });
  const token = authHeader.split(' ')[1];
  console.log("Token received for verification:", token);
  if (!token) return res.status(401).json({ error: "Invalid token format" });

  const { payload } = await jwtVerify(token, JWKS)
    // console.log(payload)
      // .catch(err => {
      //   console.error("Token verification failed:", err);
      //   return res.status(401).json({ error: "Invalid token" });
      // });
  next();
};


async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB!");

    const db = client.db('mediqueue');
    const tutorsCollection = db.collection("tutors");
    const bookingsCollection = db.collection("bookings");
    const usersCollection = db.collection("Profile");


    app.get('/api/tutors/mine', async (req, res) => {
      console.log("Route hit! Query params received:", req.query);
      try {
        const { userId } = req.query; 
        const result = await tutorsCollection.find({ authorId: userId }).toArray();
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });


    app.post('/api/auth/user', async (req, res)=>{
      try{
        const userData = req.body;
        const result = await usersCollection.insertOne(userData);
        res.status(201).json(result);
      }
      catch(err){
        res.status(500).json({ error: err.message });
      }
    })

    app.get('/api/auth/user/:email', async (req,res)=>{
      try{
        const {email} =req.params
        const result = await usersCollection.find({ email: email }).toArray();
        res.json(result);
      }
      catch(err){
        res.status(500).json({ error: err.message });
      }

    })

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

    app.get('/api/tutors/:id',  async (req, res) => {
      try {
        const { id } = req.params;
        const result = await tutorsCollection.findOne({ _id: new ObjectId(id) });
        if (!result) return res.status(404).json({ error: "Tutor not found" });
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/tutors',verifyToken, async (req, res) => {
      try {
        const tutor = req.body;
        const result = await tutorsCollection.insertOne(tutor);
        res.status(201).json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // app.put('/api/tutors/:id', async (req, res) => {
    //   try {
    //     const { id } = req.params;
    //     const updatedData = req.body;
    //     const result = await tutorsCollection.updateOne(
    //       { _id: new ObjectId(id) },
    //       { $set: updatedData }
    //     );
    //     res.json(result);
    //   } catch (err) {
    //     res.status(500).json({ error: err.message });
    //   }
    // });

    app.delete('/api/tutors/:id', async (req, res) => {
      try {
        const { tutorId } = req.query;
        const result = await tutorsCollection.deleteOne({ _id: new ObjectId(tutorId) });
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    
    app.post('/api/bookings',verifyToken, async (req, res) => {
      try {
        const {tutorId, userId} = req.query;
        const booking = req.body;
        const checker = await bookingsCollection.findOne({ tutorId: tutorId, studentId: userId });

        if(checker) {
          return res.status(400).json({ error: "You already have a booking for this tutor" });
        }
        
        await tutorsCollection.updateOne(
          { _id: new ObjectId(booking.tutorId) },
          { $inc: { totalSlots: -1 } }
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

     app.delete('/api/tutors/mine', async (req, res) => {
      console.log("Route hit! Query params received from delete function:", req.query);
      try {
        const { tutorId } = req.query; 
        const result = await tutorsCollection.deleteOne({ _id: new ObjectId(tutorId) });
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });


    app.put('/api/bookings/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const updatedData = req.body;
        const result = await bookingsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

   app.put('/api/tutors/mine',verifyToken, async (req, res) => {
    console.log("hit updated")
  try {
    const { tutorId } = req.query;
    const updatedData = req.body;
    delete updatedData._id;


    if (!tutorId || tutorId === 'undefined' || tutorId.length !== 24) {
      return res.status(400).json({ 
        error: `Invalid or missing tutorId. Received: "${tutorId}". It must be a 24-character hex string.` 
      });
    }

  
    delete updatedData._id;
   
    const result = await tutorsCollection.findOneAndUpdate(
      { _id: new ObjectId(tutorId) },
      { $set: updatedData },
      { returnDocument: 'after' } 
    );

    const freshTutor = result;

    if (!freshTutor) {
      return res.status(404).json({ error: "Tutor listing not found" });
    }

    res.json(freshTutor);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

  } catch (err) {
    console.error(err);
    
  }
}

run().catch(console.dir);


 module.exports = app;


app.get('/', (req, res) => {
  res.send("Server is running!");
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(4500, () => console.log('Running on 4500'));
}