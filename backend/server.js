const express = require('express');
require('dotenv').config();
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require("mongoose");

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
const app = express();
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));
// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Ensure data files and folders exist
const UPLOADS_DIR = path.join(__dirname, '../public/uploads');

const userSchema = new mongoose.Schema({
  name: String,
  image: String,
  descriptors: [[Number]],
  registeredAt: String
}, {
  versionKey: false
});
const User = mongoose.model("User", userSchema);

const attendanceSchema = new mongoose.Schema({

  name: String,

  date: String,

  entryTime: String,

  exitTime: String,

  duration: String,

  status: String,

  active: Boolean,

  matchType: String,

  timestamp: String,

  totalActiveMinutes: {
    type: Number,
    default: 0
  },

  outsideCount: {
    type: Number,
    default: 0
  }
  

});

const Attendance = mongoose.model(
  "Attendance",
  attendanceSchema
);
// Multer config

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'uploads',
    allowed_formats: ['jpg', 'png', 'jpeg']
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {

    if (
      file.mimetype === 'image/jpeg' ||
      file.mimetype === 'image/png' ||
      file.mimetype === 'image/jpg'
    ) {

      cb(null, true);

    } else {

      cb(new Error('Only image files allowed'));

    }

  }
});

// Helper functions


// ─── ROUTES ───────────────────────────────────────────────

// Register user
app.post('/api/register', async (req, res) => {

upload.single('image')(req, res, async function(err) {

if (err) {

console.error(err);
return res.status(500).json({
error: err.message || 'Image upload failed'
});

}

try {

  console.log(req.body);
console.log(req.file);

const { name, descriptor } = req.body;

if (!name || !req.file) {

return res.status(400).json({
error: 'Name and image required'
});

}
const users = await User.find();
const existing = users.find(
u => u.name.toLowerCase() === name.toLowerCase()
);

if (existing) {

return res.status(409).json({
error: 'User already registered'
});

}

const savedUser = await User.create({
  name: name.trim(),
  image: req.file.secure_url || req.file.path,
  descriptors: descriptor ? [JSON.parse(descriptor)] : [],
  registeredAt: new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata'
  })
});

console.log("User saved to MongoDB");

res.json({
  success: true,
  user: savedUser
});

} catch (e) {

console.error("REGISTER ERROR:", e);

res.status(500).json({
error: e.message
});

}

});

});

// Delete user
app.get('/api/users', async (req, res) => {

try {

const users = await User.find();

res.json(users);

} catch (err) {

console.error(err);

res.status(500).json({
error: 'Failed to fetch users'
});

}

});
app.delete('/api/users/:id', async (req, res) => {

  try {

    const user = await User.findById(req.params.id);

    if (!user) {

      return res.status(404).json({
        error: 'User not found'
      });

    }

    // delete image
    const imgPath = path.join(
      __dirname,
      '../public',
      user.image
    );

    if (fs.existsSync(imgPath)) {
      fs.unlinkSync(imgPath);
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: 'Delete failed'
    });

  }

});

// Mark attendance
// Mark attendance
app.post('/api/attendance', async (req, res) => {

  try {

    const { name, matchType } = req.body;

    if (!name) {
      return res.status(400).json({
        error: 'Name required'
      });
    }

    const now = new Date();

    const today = now.toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata'
    });

    const time = now.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour12: false
    });

const existing = await Attendance.findOne({
  name,
  date: today,
  active: true
});

if (existing) {

  const entry = new Date(`${today}T${existing.entryTime}`);

  const diffMs = now - entry;

  const hours = Math.floor(diffMs / (1000 * 60 * 60));

  const minutes = Math.floor(
    (diffMs % (1000 * 60 * 60)) / (1000 * 60)
  );

  existing.exitTime = time;

  existing.duration = `${hours}h ${minutes}m`;

  existing.totalActiveMinutes =
(hours * 60) + minutes;

existing.outsideCount += 1;

  existing.status = "OUT";

  existing.active = false;

  await existing.save();

  return res.json({
    success: true,
    exit: true,
    record: existing
  });

}

const record = await Attendance.create({

  name,

  date: today,

  entryTime: time,

  exitTime: "",

  duration: "",

  status: "IN",

  active: true,

  matchType: matchType || 'Exact Match',

  timestamp: now.toISOString()

});

    console.log(`📋 Attendance: ${name} at ${time}`);

    res.json({
      success: true,
      record
    });

  } catch (err) {

    console.error('Attendance error:', err);

    res.status(500).json({
      error: 'Attendance marking failed'
    });

  }

});

// Get attendance
app.get('/api/attendance', async (req, res) => {
    try {
const attendance = await Attendance.find();
    const { date, name } = req.query;

    let filtered = attendance;
    if (date) filtered = filtered.filter(a => a.date === date);
    if (name) filtered = filtered.filter(a => a.name.toLowerCase().includes(name.toLowerCase()));

    res.json(filtered.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// Clear attendance
app.delete('/api/attendance/clear', async (req, res) => {

  try {

    await Attendance.deleteMany({});

    res.json({
      success: true
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: 'Failed to clear attendance'
    });

  }

});

// Dashboard stats
app.get('/api/dashboard', async (req, res) => {
  try {
const users = await User.find();
const attendance = await Attendance.find();
    const today = new Date().toLocaleDateString('en-CA', {
  timeZone: 'Asia/Kolkata'
});
    const todayAttendance = attendance.filter(a => a.date === today);

    const activeNow = attendance.filter(
a => a.active === true
);

    // Weekly stats
    const weekStats = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-CA', {
  timeZone: 'Asia/Kolkata'
});
      const count = attendance.filter(a => a.date === dateStr).length;
      weekStats.push({ date: dateStr, count });
    }

res.json({
  totalUsers: users.length,
  todayCount: todayAttendance.length,
  totalRecords: attendance.length,
  activeNow: activeNow.length,
  weekStats,
  recentAttendance: attendance.slice(-10).reverse(),
  records: attendance
  
});
  } catch (err) {
    res.status(500).json({ error: 'Dashboard failed' });
  }
});

// Export attendance as CSV
app.get('/api/export', async (req, res) => {
  try {
const attendance = await Attendance.find();
let csv = 'Name,Date,Entry Time,Exit Time,Duration,Status\n';

attendance.forEach(a => {

  csv += `"${a.name}","${a.date}","${a.entryTime}","${a.exitTime}","${a.duration}","${a.status}"\n`;

});
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=attendance.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// LOGIN API

app.post("/login", (req, res) => {

const { username, password } = req.body;

if (
username === "Admin" &&
password === "sanz@2026"
) {

res.json({
success: true
});

} else {

res.json({
success: false
});

}

});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const axios = require("axios");

app.post("/api/ai-chat", async (req, res) => {

try {

const { message } = req.body;

const response = await axios.post(

"https://openrouter.ai/api/v1/chat/completions",

{
model: "openai/gpt-3.5-turbo",

messages: [

{
role: "system",

content: `
You are SANZ SecureFace AI assistant.

This website contains:

- Face recognition attendance
- Live scan
- Dashboard
- Activity analytics
- MongoDB storage
- PDF export
- Student tracking

Answer only about this website.
`
},

{
role: "user",
content: message
}

]

},

{
headers: {

  Authorization:
`Bearer ${process.env.OPENROUTER_API_KEY}`,


"Content-Type":
"application/json"

}
}

);

const reply =
response.data.choices[0].message.content;

res.json({
reply
});

}

catch(err){

console.log(err);

res.status(500).json({
reply:"AI server error"
});

}

});


app.listen(PORT, () => {
  console.log(`🚀 Sanz SecureFace AI running at http://localhost:${PORT}`);
});
