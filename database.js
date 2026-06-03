const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const dbPath = path.join(__dirname, 'attendance.db');

async function getDbConnection() {
  return open({
    filename: dbPath,
    driver: sqlite3.Database
  });
}

async function initDatabase() {
  const db = await getDbConnection();
  console.log('Connected to SQLite database at:', dbPath);

  // Enable foreign keys
  await db.run('PRAGMA foreign_keys = ON;');

  // Create Students Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      roll_number TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL
    );
  `);

  // Create Classes Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      room TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL
    );
  `);

  // Create Sessions Table (for active attendance sessions started by teacher)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      otp TEXT,
      otp_expiry TEXT,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    );
  `);

  // Create Attendance Records Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS attendance (
      session_id TEXT NOT NULL,
      roll_number TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      device_fingerprint TEXT NOT NULL,
      location_lat REAL,
      location_lon REAL,
      distance_meters REAL,
      status TEXT DEFAULT 'PRESENT',
      PRIMARY KEY (session_id, roll_number),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (roll_number) REFERENCES students(roll_number) ON DELETE CASCADE
    );
  `);

  // Seed Data if tables are empty
  const studentCount = await db.get('SELECT COUNT(*) as count FROM students');
  if (studentCount.count === 0) {
    console.log('Seeding student data...');
    const students = [
      { roll_number: 'S101', name: 'Alex Johnson', email: 'alex.j@college.edu' },
      { roll_number: 'S102', name: 'Brittany Smith', email: 'brittany.s@college.edu' },
      { roll_number: 'S103', name: 'Carlos Mendez', email: 'carlos.m@college.edu' },
      { roll_number: 'S104', name: 'Diana Prince', email: 'diana.p@college.edu' },
      { roll_number: 'S105', name: 'Ethan Hunt', email: 'ethan.h@college.edu' },
      { roll_number: 'S106', name: 'Fiona Gallagher', email: 'fiona.g@college.edu' }
    ];

    for (const student of students) {
      await db.run(
        'INSERT INTO students (roll_number, name, email) VALUES (?, ?, ?)',
        [student.roll_number, student.name, student.email]
      );
    }
  }

  const classCount = await db.get('SELECT COUNT(*) as count FROM classes');
  if (classCount.count === 0) {
    console.log('Seeding class data...');
    // Seed standard classes with fixed geo-coordinates (defaulting to standard center coordinates)
    const classes = [
      {
        id: 'c1',
        name: 'Introduction to Computer Science',
        code: 'CS101',
        room: 'Lab-302 (Floor 3)',
        latitude: 37.7749, // San Francisco reference coords (can be set by client dynamically)
        longitude: -122.4194
      },
      {
        id: 'c2',
        name: 'Database Management Systems',
        code: 'CS302',
        room: 'Seminar Hall B',
        latitude: 37.7752,
        longitude: -122.4188
      },
      {
        id: 'c3',
        name: 'Advanced Web Engineering',
        code: 'CS420',
        room: 'Smart Class-101',
        latitude: 37.7742,
        longitude: -122.4205
      }
    ];

    for (const cls of classes) {
      await db.run(
        'INSERT INTO classes (id, name, code, room, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)',
        [cls.id, cls.name, cls.code, cls.room, cls.latitude, cls.longitude]
      );
    }
  }

  console.log('Database initialization complete!');
  await db.close();
}

// Run the script directly if invoked from command line
if (require.main === module) {
  initDatabase().catch(err => {
    console.error('Error initializing database:', err);
  });
}

module.exports = {
  getDbConnection,
  initDatabase
};
