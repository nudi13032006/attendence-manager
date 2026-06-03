const http = require('http');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

// Helper to make HTTP requests
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n--- STARTING AUTOMATED ENDPOINT VERIFICATION TESTS ---\n');

  try {
    // 1. Fetch classes
    console.log('Test 1: Fetching available classes...');
    const classesRes = await request('GET', '/api/classes');
    console.log('Result status:', classesRes.status);
    console.log('Classes found:', classesRes.body.length);
    const targetClass = classesRes.body[0];
    console.log(`Target class for session: ${targetClass.code} (${targetClass.name})`);

    // 2. Start attendance session
    console.log('\nTest 2: Starting attendance session for class:', targetClass.id);
    const startRes = await request('POST', '/api/start-session', { classId: targetClass.id });
    console.log('Result status:', startRes.status);
    console.log('Session active:', startRes.body.success);
    const session = startRes.body.session;
    console.log('Initial OTP Security Tag:', session.otp);
    console.log('Classroom Coordinates:', session.latitude, ',', session.longitude);

    // 3. Mark attendance: SUCCESS case (Inside classroom, correct OTP, unique device)
    console.log('\nTest 3: Mark attendance for Alex (S101) - Success Case...');
    const successRes = await request('POST', '/api/mark-attendance', {
      rollNumber: 'S101',
      securityCode: session.otp,
      latitude: session.latitude,
      longitude: session.longitude,
      deviceFingerprint: 'device_test_alex'
    });
    console.log('Result status:', successRes.status);
    console.log('Response body:', successRes.body);

    // 4. Mark attendance: FAIL case (Proxy Check - Duplicate Device Fingerprint)
    console.log('\nTest 4: Mark attendance for Brittany (S102) from SAME device as S101 (Proxy Block Check)...');
    const proxyRes = await request('POST', '/api/mark-attendance', {
      rollNumber: 'S102',
      securityCode: session.otp,
      latitude: session.latitude,
      longitude: session.longitude,
      deviceFingerprint: 'device_test_alex' // SAME device
    });
    console.log('Result status:', proxyRes.status);
    console.log('Response error (Expected Block):', proxyRes.body.error);

    // 5. Mark attendance: FAIL case (Geofencing Block)
    console.log('\nTest 5: Mark attendance for Brittany (S102) from OUTSIDE classroom coords (Geofence Block Check)...');
    const geofenceRes = await request('POST', '/api/mark-attendance', {
      rollNumber: 'S102',
      securityCode: session.otp,
      latitude: session.latitude + 0.003, // ~300 meters away
      longitude: session.longitude - 0.003,
      deviceFingerprint: 'device_test_brittany' // Unique device
    });
    console.log('Result status:', geofenceRes.status);
    console.log('Response error (Expected Block):', geofenceRes.body.error);

    // 6. Mark attendance: FAIL case (Invalid OTP)
    console.log('\nTest 6: Mark attendance for Brittany (S102) with WRONG security code...');
    const wrongCodeRes = await request('POST', '/api/mark-attendance', {
      rollNumber: 'S102',
      securityCode: '999999', // Incorrect OTP code
      latitude: session.latitude,
      longitude: session.longitude,
      deviceFingerprint: 'device_test_brittany'
    });
    console.log('Result status:', wrongCodeRes.status);
    console.log('Response error (Expected Block):', wrongCodeRes.body.error);

    // 7. Check attendance feed
    console.log('\nTest 7: Fetching active session attendance list...');
    const feedRes = await request('GET', `/api/session-attendance/${session.id}`);
    console.log('Result status:', feedRes.status);
    console.log('Checked-in students list:');
    feedRes.body.forEach(record => {
      console.log(`- Roll No: ${record.roll_number}, Name: ${record.student_name}, Dist: ${Math.round(record.distance_meters)}m, Device: ${record.device_fingerprint}`);
    });

    // 8. End the session
    console.log('\nTest 8: Closing the attendance session...');
    const stopRes = await request('POST', '/api/stop-session');
    console.log('Result status:', stopRes.status);
    console.log('Response body:', stopRes.body);

    console.log('\n--- VERIFICATION TESTS COMPLETED SUCCESSFULLY ---');

  } catch (error) {
    console.error('Error during test execution:', error);
  }
}

runTests();
