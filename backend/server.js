const express = require('express');
require('dotenv').config();
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require("mongoose");

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
  registeredAt: String
});

const User = mongoose.model("User", userSchema);

const attendanceSchema = new mongoose.Schema({
  name: String,
  date: String,
  time: String,
  matchType: String,
  timestamp: String
});

const Attendance = mongoose.model("Attendance", attendanceSchema);

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
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

const { name } = req.body;

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

const newUser = {

id: Date.now().toString(),

name: name.trim(),

image: `/uploads/${req.file.filename}`,

registeredAt: new Date().toLocaleString('en-IN', {
timeZone: 'Asia/Kolkata'
})

};

await User.create({
  name: name.trim(),
  image: `/uploads/${req.file.filename}`,
  registeredAt: new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata'
  })
});
console.log("User saved to MongoDB");

res.json({
  success: true,
  user: newUser
});
} catch (e) {

console.error(e);

res.status(500).json({
error: 'Registration failed'
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

    const alreadyMarked = await Attendance.findOne({
      name,
      date: today
    });

    if (alreadyMarked) {

      return res.json({
        success: false,
        message: 'Already marked today',
        duplicate: true
      });

    }

    const record = await Attendance.create({

      name,
      date: today,
      time,
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
      weekStats,
      recentAttendance: attendance.slice(-10).reverse()
    });
  } catch (err) {
    res.status(500).json({ error: 'Dashboard failed' });
  }
});

// Export attendance as CSV
app.get('/api/export', async (req, res) => {
  try {
const attendance = await Attendance.find();
    let csv = 'Name,Date,Time,Match Type\n';
    attendance.forEach(a => {
      csv += `"${a.name}","${a.date}","${a.time}","${a.matchType}"\n`;
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

app.listen(PORT, () => {
  console.log(`🚀 Sanz SecureFace AI running at http://localhost:${PORT}`);
});
