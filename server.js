const express = require('express');
const path = require('path');
const { getDbConnection, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON parsing
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// In-memory store for previous OTPs to allow a 5-second grace period
let previousOTPs = new Map(); // sessionId -> { otp, expiry }

// Helper to calculate distance in meters between two geocoordinates (Haversine Formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}

// Helper to generate a 6-digit numeric OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Endpoint to fetch all available classes
app.get('/api/classes', async (req, res) => {
  try {
    const db = await getDbConnection();
    const classes = await db.all('SELECT * FROM classes');
    await db.close();
    res.json(classes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to retrieve classes' });
  }
});

// Endpoint to get the currently active attendance session
app.get('/api/active-session', async (req, res) => {
  try {
    const db = await getDbConnection();
    const activeSession = await db.get(
      `SELECT s.*, c.name as class_name, c.code as class_code, c.room, c.latitude, c.longitude 
       FROM sessions s 
       JOIN classes c ON s.class_id = c.id 
       WHERE s.is_active = 1`
    );

    if (!activeSession) {
      await db.close();
      return res.json({ session: null });
    }

    // Dynamic OTP Rotation Check
    const now = new Date();
    const expiryTime = new Date(activeSession.otp_expiry);

    if (now > expiryTime) {
      // Rotate the OTP
      const newOtp = generateOTP();
      const newExpiry = new Date(now.getTime() + 10000).toISOString(); // 10 seconds validity

      // Save old OTP to previousOTPs store for a 5-second grace period
      previousOTPs.set(activeSession.id, {
        otp: activeSession.otp,
        expiry: now.getTime() + 5000 // valid for 5 more seconds
      });

      await db.run(
        'UPDATE sessions SET otp = ?, otp_expiry = ? WHERE id = ?',
        [newOtp, newExpiry, activeSession.id]
      );

      activeSession.otp = newOtp;
      activeSession.otp_expiry = newExpiry;
      console.log(`Rotated OTP for session ${activeSession.id} to: ${newOtp}`);
    }

    await db.close();
    res.json({ session: activeSession });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to retrieve active session' });
  }
});

// Endpoint for teacher to start an attendance session
app.post('/api/start-session', async (req, res) => {
  const { classId } = req.body;
  if (!classId) {
    return res.status(400).json({ error: 'Class ID is required' });
  }

  try {
    const db = await getDbConnection();

    // Check if there is already an active session
    const activeSession = await db.get('SELECT id FROM sessions WHERE is_active = 1');
    if (activeSession) {
      await db.close();
      return res.status(400).json({ error: 'An attendance session is already active' });
    }

    const sessionId = 'sess_' + Date.now();
    const startTime = new Date().toISOString();
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10000).toISOString(); // 10 seconds from now

    await db.run(
      `INSERT INTO sessions (id, class_id, start_time, otp, otp_expiry, is_active) 
       VALUES (?, ?, ?, ?, ?, 1)`,
      [sessionId, classId, startTime, otp, otpExpiry]
    );

    // Get session info with class details
    const sessionDetails = await db.get(
      `SELECT s.*, c.name as class_name, c.code as class_code, c.room, c.latitude, c.longitude 
       FROM sessions s 
       JOIN classes c ON s.class_id = c.id 
       WHERE s.id = ?`,
      [sessionId]
    );

    await db.close();
    console.log(`Started attendance session for class ${classId}. First OTP: ${otp}`);
    res.json({ success: true, session: sessionDetails });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// Endpoint for teacher to stop/close the session
app.post('/api/stop-session', async (req, res) => {
  try {
    const db = await getDbConnection();
    const activeSession = await db.get('SELECT id FROM sessions WHERE is_active = 1');

    if (!activeSession) {
      await db.close();
      return res.status(400).json({ error: 'No active session found' });
    }

    const endTime = new Date().toISOString();
    await db.run(
      'UPDATE sessions SET is_active = 0, end_time = ? WHERE id = ?',
      [endTime, activeSession.id]
    );

    previousOTPs.delete(activeSession.id);

    await db.close();
    console.log(`Stopped session: ${activeSession.id}`);
    res.json({ success: true, message: 'Session closed successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to stop session' });
  }
});

// Endpoint to fetch real-time student checkins for a specific session
app.get('/api/session-attendance/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const db = await getDbConnection();
    const checkins = await db.all(
      `SELECT a.*, s.name as student_name, s.email as student_email 
       FROM attendance a 
       JOIN students s ON a.roll_number = s.roll_number 
       WHERE a.session_id = ? 
       ORDER BY a.timestamp DESC`,
      [sessionId]
    );
    await db.close();
    res.json(checkins);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to retrieve session check-ins' });
  }
});

// Endpoint to mark student attendance with security validations
app.post('/api/mark-attendance', async (req, res) => {
  const { rollNumber, securityCode, latitude, longitude, deviceFingerprint } = req.body;

  if (!rollNumber || !securityCode || !deviceFingerprint) {
    return res.status(400).json({ error: 'Missing required parameters: rollNumber, securityCode, or deviceFingerprint' });
  }

  try {
    const db = await getDbConnection();

    // 1. Verify Active Session
    const activeSession = await db.get(
      `SELECT s.*, c.latitude as class_lat, c.longitude as class_lon, c.name as class_name 
       FROM sessions s 
       JOIN classes c ON s.class_id = c.id 
       WHERE s.is_active = 1`
    );

    if (!activeSession) {
      await db.close();
      return res.status(400).json({ error: 'No active attendance session for this class.' });
    }

    // 2. Verify Student Exists
    const student = await db.get('SELECT * FROM students WHERE roll_number = ?', [rollNumber.toUpperCase()]);
    if (!student) {
      await db.close();
      return res.status(400).json({ error: `Roll number '${rollNumber}' is not registered.` });
    }

    // 3. Verify securityCode (OTP) with 5s grace period for rotation sync
    const submittedCode = securityCode.trim();
    const currentOtp = activeSession.otp;
    const now = Date.now();
    const isCurrentValid = (submittedCode === currentOtp) && (now <= new Date(activeSession.otp_expiry).getTime());

    // Check grace period list
    const graceInfo = previousOTPs.get(activeSession.id);
    const isGraceValid = graceInfo && (submittedCode === graceInfo.otp) && (now <= graceInfo.expiry);

    if (!isCurrentValid && !isGraceValid) {
      await db.close();
      return res.status(400).json({ error: 'Invalid or expired Security Tag. Please use the current rotating code shown on the screen.' });
    }

    // 4. Verify Student hasn't already marked attendance for this session
    const existingCheckin = await db.get(
      'SELECT roll_number FROM attendance WHERE session_id = ? AND roll_number = ?',
      [activeSession.id, student.roll_number]
    );
    if (existingCheckin) {
      await db.close();
      return res.status(400).json({ error: `Attendance already submitted for Roll Number ${student.roll_number}.` });
    }

    // 5. Anti-Proxy: Verify Device Fingerprint
    // Ensure that no other student has used this device to check in for this active session
    const duplicateDevice = await db.get(
      'SELECT roll_number FROM attendance WHERE session_id = ? AND device_fingerprint = ?',
      [activeSession.id, deviceFingerprint]
    );
    if (duplicateDevice) {
      await db.close();
      return res.status(400).json({
        error: `Anti-Proxy Block: This device has already been used to mark attendance for another student (${duplicateDevice.roll_number}) in this session.`
      });
    }

    // 6. Geofencing: Verify Geolocation (GPS coords)
    // Classroom location parameters
    const classLat = activeSession.class_lat;
    const classLon = activeSession.class_lon;
    let distance = null;

    if (latitude !== undefined && longitude !== undefined) {
      distance = calculateDistance(latitude, longitude, classLat, classLon);
      const MAX_DISTANCE_METERS = 50; // Classroom radius limit

      if (distance > MAX_DISTANCE_METERS) {
        await db.close();
        return res.status(400).json({
          error: `Geofencing Block: You are outside the classroom boundary. Distance to classroom: ${Math.round(distance)} meters (Allowed: ≤${MAX_DISTANCE_METERS}m).`
        });
      }
    } else {
      // If coordinates are missing, block attendance (unless it is explicitly bypassed by configuration, but here we require it)
      await db.close();
      return res.status(400).json({ error: 'Location services must be enabled to verify that you are present in the classroom.' });
    }

    // 7. Save Attendance Record
    const timestamp = new Date().toISOString();
    await db.run(
      `INSERT INTO attendance (session_id, roll_number, timestamp, device_fingerprint, location_lat, location_lon, distance_meters, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PRESENT')`,
      [activeSession.id, student.roll_number, timestamp, deviceFingerprint, latitude, longitude, distance]
    );

    await db.close();
    console.log(`Success: Attendance marked for ${student.name} (${student.roll_number})`);
    res.json({
      success: true,
      studentName: student.name,
      rollNumber: student.roll_number,
      distance: distance !== null ? Math.round(distance) : null
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint for teacher registration
app.post('/api/register-teacher', async (req, res) => {
  const { fullName, username, email, password } = req.body;

  if (!fullName || !username || !email || !password) {
    return res.status(400).json({ error: 'Full name, username, email, and password are required.' });
  }

  try {
    const db = await getDbConnection();
    const existing = await db.get('SELECT id FROM teachers WHERE username = ? OR email = ?', [username.trim(), email.trim()]);
    if (existing) {
      await db.close();
      return res.status(400).json({ error: 'Teacher username or email already exists.' });
    }

    await db.run(
      'INSERT INTO teachers (full_name, username, email, password) VALUES (?, ?, ?, ?)',
      [fullName.trim(), username.trim(), email.trim(), password.trim()]
    );

    await db.close();
    res.json({ success: true, message: 'Teacher account created successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create teacher account.' });
  }
});

// Endpoint for teacher login
app.post('/api/teacher-login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const db = await getDbConnection();
    const teacher = await db.get(
      'SELECT id, full_name, username, email FROM teachers WHERE username = ? AND password = ?',
      [username.trim(), password.trim()]
    );
    await db.close();

    if (!teacher) {
      return res.status(401).json({ error: 'Invalid teacher username or password.' });
    }

    res.json({ success: true, user: { role: 'teacher', ...teacher } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Teacher login failed.' });
  }
});

// Endpoint for student login
app.post('/api/student-login', async (req, res) => {
  const { rollNumber, email } = req.body;

  if (!rollNumber || !email) {
    return res.status(400).json({ error: 'Roll number and email are required.' });
  }

  try {
    const db = await getDbConnection();
    const student = await db.get(
      'SELECT roll_number, name, email FROM students WHERE roll_number = ? AND email = ?',
      [rollNumber.trim().toUpperCase(), email.trim()]
    );
    await db.close();

    if (!student) {
      return res.status(401).json({ error: 'Student not found. Register first or check your details.' });
    }

    res.json({ success: true, user: { role: 'student', ...student } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Student login failed.' });
  }
});

// Endpoint to register a new student
app.post('/api/register-student', async (req, res) => {
  const { rollNumber, name, email } = req.body;

  if (!rollNumber || !name || !email) {
    return res.status(400).json({ error: 'Missing required parameters: rollNumber, name, and email' });
  }

  const cleanRoll = rollNumber.trim().toUpperCase();

  try {
    const db = await getDbConnection();

    // Check if roll number already exists
    const existing = await db.get('SELECT roll_number FROM students WHERE roll_number = ?', [cleanRoll]);
    if (existing) {
      await db.close();
      return res.status(400).json({ error: `Roll number '${cleanRoll}' is already registered.` });
    }

    // Insert student
    await db.run(
      'INSERT INTO students (roll_number, name, email) VALUES (?, ?, ?)',
      [cleanRoll, name.trim(), email.trim()]
    );

    await db.close();
    console.log(`Registered new student: ${name} (${cleanRoll})`);
    res.json({ success: true, message: `Student '${name}' registered successfully!` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to register student' });
  }
});

// Endpoint for Dashboard Statistics (Trends and summaries)
app.get('/api/dashboard-stats', async (req, res) => {
  try {
    const db = await getDbConnection();

    // 1. Total registered students
    const totalStudentsObj = await db.get('SELECT COUNT(*) as count FROM students');
    const totalStudents = totalStudentsObj.count;

    // 2. Total classes
    const totalClassesObj = await db.get('SELECT COUNT(*) as count FROM classes');
    const totalClasses = totalClassesObj.count;

    // 3. Historical Session attendance averages
    const sessionsList = await db.all(
      `SELECT s.id, s.start_time, c.code as class_code,
       (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) as present_count
       FROM sessions s
       JOIN classes c ON s.class_id = c.id
       ORDER BY s.start_time DESC
       LIMIT 5`
    );

    // 4. Map students with total presence
    const topAttendees = await db.all(
      `SELECT s.roll_number, s.name, COUNT(a.session_id) as attendance_count,
       (SELECT COUNT(*) FROM sessions) as total_sessions
       FROM students s
       LEFT JOIN attendance a ON s.roll_number = a.roll_number
       GROUP BY s.roll_number
       ORDER BY attendance_count DESC`
    );

    await db.close();
    res.json({
      stats: {
        totalStudents,
        totalClasses,
        recentSessions: sessionsList.reverse(),
        topAttendees
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});

// Start server and initialize DB
app.listen(PORT, async () => {
  console.log(`==================================================`);
  console.log(` Attendance Manager running at: http://localhost:${PORT}`);
  console.log(`==================================================`);
  try {
    await initDatabase();
  } catch (err) {
    console.error('Failed to auto-init SQLite database:', err);
  }
});
