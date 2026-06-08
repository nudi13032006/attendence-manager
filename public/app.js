// App State Management
let currentSession = null;
let sessionPollingInterval = null;
let feedPollingInterval = null;
let attendanceChart = null;
let currentUser = null;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  lucide.createIcons();

  // Show the portal first
  showPortal('home');

  // Load classes and statistics for the teacher view
  loadClasses();
  loadStats();

  // Set up event listeners
  document.getElementById('session-btn').addEventListener('click', toggleSession);
  document.getElementById('stop-session-btn').addEventListener('click', stopSession);
  document.getElementById('attendance-form').addEventListener('submit', handleAttendanceSubmit);
  document.getElementById('register-form').addEventListener('submit', handleRegisterSubmit);
  document.getElementById('teacher-login-form').addEventListener('submit', handleTeacherLogin);
  document.getElementById('teacher-register-form').addEventListener('submit', handleTeacherRegister);
  document.getElementById('student-login-form').addEventListener('submit', handleStudentLogin);
  document.getElementById('student-register-portal-form').addEventListener('submit', handleStudentRegisterFromPortal);
  document.getElementById('teacher-logout-btn').addEventListener('click', () => showPortal('home'));
  document.getElementById('student-logout-btn').addEventListener('click', () => showPortal('home'));

  // Tab buttons click listeners
  const tabSignin = document.getElementById('tab-signin-btn');
  const tabRegister = document.getElementById('tab-register-btn');
  const formSignin = document.getElementById('attendance-form');
  const formRegister = document.getElementById('register-form');
  const phoneTitle = document.getElementById('phone-title');
  const phoneSubtitle = document.getElementById('phone-subtitle');
  const resultCard = document.getElementById('attendance-result');

  tabSignin.addEventListener('click', () => {
    tabSignin.classList.add('active');
    tabRegister.classList.remove('active');
    formSignin.classList.remove('hidden');
    formRegister.classList.add('hidden');
    phoneTitle.textContent = 'Student Sign-In';
    phoneSubtitle.textContent = 'Mark presence for active classroom session';
    resultCard.classList.add('hidden');
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabSignin.classList.remove('active');
    formRegister.classList.remove('hidden');
    formSignin.classList.add('hidden');
    phoneTitle.textContent = 'Register Student';
    phoneSubtitle.textContent = 'Join the course student database';
    resultCard.classList.add('hidden');
  });

  // Check if there is an active session running on startup
  checkActiveSession();

  // Start polling active session and stats periodically
  sessionPollingInterval = setInterval(checkActiveSession, 1000);

  // Initialize anti-screenshot protection hooks
  setupScreenshotProtection();
});

function showPortal(mode) {
  const portalPanel = document.getElementById('portal-access-panel');
  const teacherPanel = document.getElementById('teacher-dashboard-panel');
  const studentPanel = document.getElementById('student-dashboard-panel');
  const statusText = document.getElementById('auth-status');

  portalPanel.classList.remove('hidden');
  teacherPanel.classList.add('hidden');
  studentPanel.classList.add('hidden');

  if (mode === 'teacher') {
    portalPanel.classList.add('hidden');
    teacherPanel.classList.remove('hidden');
    if (statusText) statusText.textContent = `Signed in as teacher: ${currentUser?.full_name || 'Teacher'}`;
  } else if (mode === 'student') {
    portalPanel.classList.add('hidden');
    studentPanel.classList.remove('hidden');
    if (statusText) statusText.textContent = `Signed in as student: ${currentUser?.name || 'Student'}`;
  } else {
    if (statusText) statusText.textContent = 'Choose a role to continue. Teacher login opens the control center; student login opens the attendance portal.';
    currentUser = null;
  }
}

async function handleTeacherLogin(e) {
  e.preventDefault();
  const username = document.getElementById('teacher-username').value.trim();
  const password = document.getElementById('teacher-password').value;
  const statusText = document.getElementById('auth-status');

  try {
    const response = await fetch('/api/teacher-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();

    if (!response.ok) {
      statusText.textContent = data.error || 'Teacher login failed.';
      return;
    }

    currentUser = data.user;
    showPortal('teacher');
    loadClasses();
    loadStats();
  } catch (error) {
    console.error(error);
    statusText.textContent = 'Unable to reach the server.';
  }
}

async function handleTeacherRegister(e) {
  e.preventDefault();
  const statusText = document.getElementById('auth-status');
  const payload = {
    fullName: document.getElementById('teacher-full-name').value.trim(),
    username: document.getElementById('teacher-reg-username').value.trim(),
    email: document.getElementById('teacher-email').value.trim(),
    password: document.getElementById('teacher-reg-password').value
  };

  try {
    const response = await fetch('/api/register-teacher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    statusText.textContent = data.success ? 'Teacher account created. You can now log in.' : (data.error || 'Teacher registration failed.');
  } catch (error) {
    console.error(error);
    statusText.textContent = 'Unable to create teacher account.';
  }
}

async function handleStudentRegisterFromPortal(e) {
  e.preventDefault();
  const statusText = document.getElementById('auth-status');
  const payload = {
    name: document.getElementById('student-reg-name').value.trim(),
    rollNumber: document.getElementById('student-reg-roll').value.trim().toUpperCase(),
    email: document.getElementById('student-reg-email').value.trim()
  };

  try {
    const response = await fetch('/api/register-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    statusText.textContent = response.ok
      ? `Student registered successfully: ${payload.name} (${payload.rollNumber}).`
      : (data.error || 'Student registration failed.');

    if (response.ok) {
      document.getElementById('student-reg-name').value = '';
      document.getElementById('student-reg-roll').value = '';
      document.getElementById('student-reg-email').value = '';
      document.getElementById('student-login-roll').value = payload.rollNumber;
      document.getElementById('student-login-email').value = payload.email;
    }
  } catch (error) {
    console.error(error);
    statusText.textContent = 'Unable to register student.';
  }
}

async function handleStudentLogin(e) {
  e.preventDefault();
  const rollNumber = document.getElementById('student-login-roll').value.trim().toUpperCase();
  const email = document.getElementById('student-login-email').value.trim();
  const statusText = document.getElementById('auth-status');

  try {
    const response = await fetch('/api/student-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rollNumber, email })
    });
    const data = await response.json();

    if (!response.ok) {
      statusText.textContent = data.error || 'Student login failed.';
      return;
    }

    currentUser = data.user;
    document.getElementById('student-roll').value = data.user.roll_number;
    document.getElementById('phone-title').textContent = `Welcome ${data.user.name}`;
    document.getElementById('phone-subtitle').textContent = 'You can now mark your attendance from this portal.';
    showPortal('student');
  } catch (error) {
    console.error(error);
    statusText.textContent = 'Unable to reach the server.';
  }
}

// Load available classes from the backend
async function loadClasses() {
  try {
    const response = await fetch('/api/classes');
    const classes = await response.json();
    const select = document.getElementById('class-select');
    select.innerHTML = '';
    
    classes.forEach(cls => {
      const option = document.createElement('option');
      option.value = cls.id;
      option.textContent = `${cls.code} - ${cls.name} (${cls.room})`;
      // Add data attributes for coords
      option.dataset.lat = cls.latitude;
      option.dataset.lon = cls.longitude;
      option.dataset.room = cls.room;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading classes:', error);
    addSecurityLog('Failed to load classes from server.', 'error');
  }
}

// Check if a session is currently active
async function checkActiveSession() {
  try {
    const response = await fetch('/api/active-session');
    const data = await response.json();
    
    if (data.session) {
      const isNewSession = !currentSession || currentSession.id !== data.session.id;
      currentSession = data.session;
      
      updateSessionUI(data.session);
      
      if (isNewSession) {
        addSecurityLog(`Active session detected for ${data.session.class_code}`, 'info');
        // Start polling the attendance list feed
        startFeedPolling(data.session.id);
      }
    } else {
      if (currentSession) {
        addSecurityLog('Current session was closed.', 'info');
        stopFeedPolling();
        currentSession = null;
      }
      resetSessionUI();
    }
  } catch (error) {
    console.error('Error checking active session:', error);
  }
}

// Start/Stop Session handler
async function toggleSession() {
  if (currentSession) return; // session active already

  const classSelect = document.getElementById('class-select');
  const classId = classSelect.value;
  
  if (!classId) return;

  try {
    const response = await fetch('/api/start-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId })
    });
    
    const data = await response.json();
    if (response.ok && data.success) {
      currentSession = data.session;
      updateSessionUI(data.session);
      startFeedPolling(data.session.id);
      addSecurityLog(`Started attendance session for ${data.session.class_code}`, 'success');
      loadStats(); // refresh statistics chart
    } else {
      alert(data.error || 'Failed to start session');
    }
  } catch (error) {
    console.error('Error starting session:', error);
  }
}

// End current session
async function stopSession() {
  if (!currentSession) return;

  try {
    const response = await fetch('/api/stop-session', {
      method: 'POST'
    });
    const data = await response.json();
    if (response.ok && data.success) {
      addSecurityLog(`Stopped active session.`, 'info');
      currentSession = null;
      resetSessionUI();
      stopFeedPolling();
      loadStats();
    } else {
      alert(data.error || 'Failed to stop session');
    }
  } catch (error) {
    console.error('Error stopping session:', error);
  }
}

// Update Dashboard UI with active session variables
function updateSessionUI(session) {
  // Show monitor
  const monitor = document.getElementById('live-session-monitor');
  monitor.classList.remove('inactive');

  // Disable class selection
  document.getElementById('class-select').disabled = true;
  document.getElementById('session-btn').disabled = true;
  document.getElementById('session-btn').innerHTML = '<i data-lucide="loader-2" class="spin"></i> Monitoring...';
  lucide.createIcons();

  // Set texts
  document.getElementById('active-class-name').textContent = `${session.class_code} - ${session.class_name}`;
  document.getElementById('classroom-coords').textContent = `${session.latitude.toFixed(4)}, ${session.longitude.toFixed(4)}`;
  document.getElementById('classroom-room').textContent = session.room;

  // Set OTP security code
  document.getElementById('active-otp').textContent = session.otp;

  // Handle timer bar progress
  const now = new Date();
  const expiry = new Date(session.otp_expiry);
  const remainingMs = Math.max(0, expiry - now);
  const percent = (remainingMs / 10000) * 100;
  
  const timerBar = document.getElementById('timer-bar');
  timerBar.style.width = `${percent}%`;
  document.getElementById('timer-seconds').textContent = Math.ceil(remainingMs / 1000);

  // Red/Orange alert color when time is low
  if (remainingMs < 3000) {
    timerBar.style.background = 'var(--danger)';
  } else {
    timerBar.style.background = 'linear-gradient(to right, var(--primary), var(--secondary))';
  }

  // Draw simulated high-tech QR Code
  drawQRCode(session.otp);
}

// Reset Dashboard UI to idle state
function resetSessionUI() {
  const monitor = document.getElementById('live-session-monitor');
  monitor.classList.add('inactive');

  document.getElementById('class-select').disabled = false;
  const sessionBtn = document.getElementById('session-btn');
  sessionBtn.disabled = false;
  sessionBtn.innerHTML = '<i data-lucide="play"></i> Start Session';
  lucide.createIcons();

  document.getElementById('active-otp').textContent = '------';
  document.getElementById('timer-bar').style.width = '100%';
  document.getElementById('timer-seconds').textContent = '10';
  document.getElementById('classroom-coords').textContent = 'Checking...';
  document.getElementById('classroom-room').textContent = '-';
}

// Draw a stylized dynamic QR code matrix on canvas based on current security code
function drawQRCode(code) {
  const canvas = document.getElementById('qr-canvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const size = canvas.width = 120;
  canvas.height = size;

  // Clear canvas
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Deterministic random matrix generation based on code string
  let seed = parseInt(code) || 123456;
  function random() {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }

  const gridSize = 15; // 15x15 blocks
  const blockSize = Math.floor(size / gridSize);
  const padding = (size - (gridSize * blockSize)) / 2;

  ctx.fillStyle = '#0f172a'; // QR blocks color

  // Draw QR finder patterns (corners)
  drawFinderPattern(ctx, padding, padding, blockSize);
  drawFinderPattern(ctx, padding + (gridSize - 5) * blockSize, padding, blockSize);
  drawFinderPattern(ctx, padding, padding + (gridSize - 5) * blockSize, blockSize);

  // Draw random matrix
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      // Skip corner finder patterns
      if (
        (r < 5 && c < 5) || 
        (r < 5 && c >= gridSize - 5) || 
        (r >= gridSize - 5 && c < 5)
      ) {
        continue;
      }
      
      if (random() > 0.45) {
        ctx.fillRect(
          padding + c * blockSize,
          padding + r * blockSize,
          blockSize,
          blockSize
        );
      }
    }
  }

  // Draw lock/key in center to emphasize security
  ctx.fillStyle = 'hsla(185, 100%, 48%, 0.1)';
  ctx.fillRect(size/2 - 12, size/2 - 12, 24, 24);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#06b6d4';
  ctx.strokeRect(size/2 - 12, size/2 - 12, 24, 24);
  
  // Hide placeholder
  document.getElementById('qr-placeholder').style.display = 'none';
}

function drawFinderPattern(ctx, x, y, blockSize) {
  ctx.fillStyle = '#0f172a';
  // Outer 5x5 block
  ctx.fillRect(x, y, blockSize * 5, blockSize * 5);
  // Inner white spacer
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + blockSize, y + blockSize, blockSize * 3, blockSize * 3);
  // Inner solid 3x3 block
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x + blockSize * 1.5, y + blockSize * 1.5, blockSize * 2, blockSize * 2);
}

// Start polling for active attendance list
function startFeedPolling(sessionId) {
  stopFeedPolling();
  updateAttendanceFeed(sessionId);
  feedPollingInterval = setInterval(() => updateAttendanceFeed(sessionId), 2000);
}

function stopFeedPolling() {
  if (feedPollingInterval) {
    clearInterval(feedPollingInterval);
    feedPollingInterval = null;
  }
}

// Fetch live attendance and update table
async function updateAttendanceFeed(sessionId) {
  try {
    const response = await fetch(`/api/session-attendance/${sessionId}`);
    const checkins = await response.json();
    
    const feedBody = document.getElementById('attendance-feed-body');
    const presentCountText = document.getElementById('live-present-count');
    
    presentCountText.textContent = checkins.length;

    if (checkins.length === 0) {
      feedBody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-feed">Awaiting student submissions... Code is rotating.</td>
        </tr>
      `;
      return;
    }

    feedBody.innerHTML = '';
    checkins.forEach(record => {
      const row = document.createElement('tr');
      const timeStr = new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      const distanceDisplay = record.distance_meters !== null 
        ? `${Math.round(record.distance_meters)}m` 
        : 'N/A';
      
      const distClass = record.distance_meters !== null && record.distance_meters <= 15 ? 'near' : '';

      row.innerHTML = `
        <td>
          <span class="feed-student-name">${record.student_name}</span>
          <span class="feed-student-email">${record.student_email}</span>
        </td>
        <td><strong>${record.roll_number}</strong></td>
        <td>${timeStr}</td>
        <td class="feed-dist ${distClass}">${distanceDisplay}</td>
        <td><span class="feed-device">${record.device_fingerprint.substring(0, 12)}...</span></td>
      `;
      feedBody.appendChild(row);
    });
  } catch (error) {
    console.error('Error loading attendance feed:', error);
  }
}

// Handle attendance submit from student phone mockup
async function handleAttendanceSubmit(e) {
  e.preventDefault();
  
  const rollNumberInput = document.getElementById('student-roll');
  const otpInput = document.getElementById('student-otp');
  const deviceSimSelect = document.getElementById('student-device-sim');
  const locSimRadio = document.querySelector('input[name="student-loc-sim"]:checked');
  const submitBtn = document.getElementById('submit-attendance-btn');

  const rollNumber = rollNumberInput.value.trim().toUpperCase();
  const securityCode = otpInput.value.trim();
  const deviceFingerprint = deviceSimSelect.value;
  
  if (!rollNumber || !securityCode) return;

  // Visual button feedback
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Submitting...';
  lucide.createIcons();

  // Mock student coordinates based on Simulator Setting
  let latitude = undefined;
  let longitude = undefined;

  if (locSimRadio.value === 'inside') {
    // Exact classroom coordinates matching teacher's class coords
    if (currentSession) {
      latitude = currentSession.latitude;
      longitude = currentSession.longitude;
    } else {
      // Default fallback
      latitude = 37.7749;
      longitude = -122.4194;
    }
  } else if (locSimRadio.value === 'outside') {
    // 300 meters offset coordinates
    if (currentSession) {
      latitude = currentSession.latitude + 0.0028;
      longitude = currentSession.longitude - 0.0028;
    } else {
      latitude = 37.779;
      longitude = -122.425;
    }
  }

  // Construct request body
  const payload = {
    rollNumber,
    securityCode,
    deviceFingerprint,
    latitude,
    longitude
  };

  try {
    const response = await fetch('/api/mark-attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    showStudentFeedback(response.ok, data);

    if (response.ok) {
      otpInput.value = ''; // clear OTP input on success
      // Instantly refresh feed if session matches
      if (currentSession) {
        updateAttendanceFeed(currentSession.id);
      }
      addSecurityLog(`Check-in SUCCESS: ${rollNumber} verified.`, 'success');
    } else {
      addSecurityLog(`Check-in BLOCKED: ${rollNumber} failed verification.`, 'error');
    }
  } catch (error) {
    console.error('Error submitting attendance:', error);
    showStudentFeedback(false, { error: 'Network Connection Failure. Cannot connect to server.' });
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Submit Attendance';
    lucide.createIcons();
  }
}

// Handle new student registration submit from phone mockup
async function handleRegisterSubmit(e) {
  e.preventDefault();

  const nameInput = document.getElementById('reg-name');
  const rollInput = document.getElementById('reg-roll');
  const emailInput = document.getElementById('reg-email');
  const submitBtn = document.getElementById('submit-register-btn');
  const resultCard = document.getElementById('attendance-result');
  const resIcon = document.getElementById('res-icon');
  const resTitle = document.getElementById('res-title');
  const resMsg = document.getElementById('res-message');

  const name = nameInput.value.trim();
  const rollNumber = rollInput.value.trim().toUpperCase();
  const email = emailInput.value.trim();

  if (!name || !rollNumber || !email) return;

  // Visual button feedback
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Registering...';
  lucide.createIcons();

  try {
    const response = await fetch('/api/register-student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, rollNumber, email })
    });

    const data = await response.json();

    resultCard.className = 'result-card'; // Reset classes
    resultCard.classList.remove('hidden');

    if (response.ok) {
      resultCard.classList.add('success');
      resIcon.setAttribute('data-lucide', 'check-circle-2');
      resTitle.textContent = 'Registration Complete';
      resMsg.innerHTML = `Welcome <strong>${name}</strong> (${rollNumber})! You can now switch to the <strong>Sign In</strong> tab to mark your attendance.`;
      
      // Clear inputs
      nameInput.value = '';
      rollInput.value = '';
      emailInput.value = '';
      
      // Refresh stats on dashboard to update student count
      loadStats();
      addSecurityLog(`Database: Registered new student ${name} (${rollNumber})`, 'success');
    } else {
      resultCard.classList.add('error');
      resIcon.setAttribute('data-lucide', 'shield-alert');
      resTitle.textContent = 'Registration Failed';
      resMsg.textContent = data.error || 'Failed to register student. Try again.';
      addSecurityLog(`Register BLOCKED: ${rollNumber} already exists.`, 'error');
    }
  } catch (error) {
    console.error('Error registering student:', error);
    resultCard.className = 'result-card error';
    resultCard.classList.remove('hidden');
    resIcon.setAttribute('data-lucide', 'shield-alert');
    resTitle.textContent = 'Network Error';
    resMsg.textContent = 'Failed to connect to backend server.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Register Student';
    lucide.createIcons();
    
    // Scroll mobile frame to show the notification card
    const contentScroller = document.querySelector('.phone-content-scroller');
    setTimeout(() => {
      contentScroller.scrollTop = contentScroller.scrollHeight;
    }, 100);
  }
}

// Display alert notification card on phone mockup
function showStudentFeedback(isSuccess, data) {
  const resultCard = document.getElementById('attendance-result');
  const resIcon = document.getElementById('res-icon');
  const resTitle = document.getElementById('res-title');
  const resMsg = document.getElementById('res-message');

  resultCard.className = 'result-card'; // Reset classes
  resultCard.classList.remove('hidden');

  if (isSuccess) {
    resultCard.classList.add('success');
    resIcon.setAttribute('data-lucide', 'check-circle-2');
    resTitle.textContent = 'Presence Verified!';
    resMsg.innerHTML = `Welcome, <strong>${data.studentName}</strong> (${data.rollNumber})! Attendance successfully logged.<br><span style="font-size:0.6rem; opacity:0.8;">Distance verified: ${data.distance} meters.</span>`;
  } else {
    resultCard.classList.add('error');
    resIcon.setAttribute('data-lucide', 'shield-alert');
    resTitle.textContent = 'Verification Failed';
    resMsg.textContent = data.error || 'Unable to log attendance. Please retry.';
  }

  lucide.createIcons();

  // Scroll mobile frame to show the notification card
  const contentScroller = document.querySelector('.phone-content-scroller');
  setTimeout(() => {
    contentScroller.scrollTop = contentScroller.scrollHeight;
  }, 100);
}

// Log security check events in the teacher panel
function addSecurityLog(message, type = 'info') {
  const alertsContainer = document.getElementById('security-alerts');
  const emptyLog = alertsContainer.querySelector('.empty-log');
  if (emptyLog) {
    emptyLog.remove();
  }

  const log = document.createElement('div');
  log.className = `log-entry log-${type}`;
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  log.innerHTML = `[${timestamp}] ${message}`;
  
  alertsContainer.appendChild(log);
  alertsContainer.scrollTop = alertsContainer.scrollHeight;
}

// Load statistics from database and draw chart
async function loadStats() {
  try {
    const response = await fetch('/api/dashboard-stats');
    const data = await response.json();
    
    // Set text totals
    document.getElementById('stat-total-classes').textContent = data.stats.totalClasses;
    document.getElementById('stat-total-students').textContent = data.stats.totalStudents;

    // Render / Update Chart
    renderChart(data.stats.recentSessions);
  } catch (error) {
    console.error('Error loading dashboard stats:', error);
  }
}

// Render statistical trends chart with Chart.js
function renderChart(recentSessions) {
  const ctx = document.getElementById('attendanceChart');
  if (!ctx) return;

  const labels = recentSessions.map(s => s.class_code);
  const counts = recentSessions.map(s => s.present_count);

  if (attendanceChart) {
    attendanceChart.destroy();
  }

  attendanceChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length > 0 ? labels : ['No Data'],
      datasets: [{
        label: 'Checked-in Students',
        data: counts.length > 0 ? counts : [0],
        backgroundColor: 'rgba(6, 182, 212, 0.4)',
        borderColor: 'rgba(6, 182, 212, 1)',
        borderWidth: 1.5,
        borderRadius: 6,
        barThickness: 24,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            color: '#9ca3af',
            font: {
              family: 'Outfit'
            }
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.05)'
          }
        },
        x: {
          ticks: {
            color: '#9ca3af',
            font: {
              family: 'Outfit'
            }
          },
          grid: {
            display: false
          }
        }
      }
    }
  });
}

// Screenshot Protection Systems
function setupScreenshotProtection() {
  // 1. Blur the QR code and OTP when page loses focus (e.g. Snipping tool opened, or tab changed)
  const securityBox = document.querySelector('.security-tag-box');

  window.addEventListener('blur', () => {
    if (securityBox) {
      securityBox.classList.add('screenshot-blurred');
      addSecurityLog('Anti-Screenshot: Console window lost focus. Code blurred.', 'info');
    }
  });

  window.addEventListener('focus', () => {
    if (securityBox) {
      securityBox.classList.remove('screenshot-blurred');
    }
  });

  // 2. Block PrintScreen key and display locks, prevent copying / page saving
  document.addEventListener('keydown', (e) => {
    // PrintScreen detection
    if (e.key === 'PrintScreen' || e.keyCode === 44) {
      e.preventDefault();
      triggerScreenshotLockout();
    }
    
    // Prevent Ctrl+P (Print Page)
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault();
      addSecurityLog('Anti-Screenshot: Page print request blocked.', 'error');
    }

    // Prevent Ctrl+S (Save Webpage Source)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      addSecurityLog('Anti-Screenshot: Page save attempt blocked.', 'error');
    }

    // Block Ctrl+C on the OTP element
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      const selectedText = window.getSelection().toString();
      if (selectedText.includes(document.getElementById('active-otp').textContent)) {
        e.preventDefault();
        addSecurityLog('Anti-Screenshot: Copying security tag text blocked.', 'error');
      }
    }
  });

  // 3. Disable right-click context menu on security codes
  if (securityBox) {
    securityBox.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // 4. Tab switching/invisibility listener
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (securityBox) securityBox.classList.add('screenshot-blurred');
    } else {
      if (securityBox) securityBox.classList.remove('screenshot-blurred');
    }
  });
}

// Temporary lockout: Blank out codes and show warning
function triggerScreenshotLockout() {
  const otpText = document.getElementById('active-otp');
  const securityBox = document.querySelector('.security-tag-box');
  
  if (securityBox) {
    securityBox.classList.add('screenshot-blurred');
  }
  
  otpText.textContent = '[LOCKED]';
  addSecurityLog('⚠️ SECURITY TRIGGER: Screen capture detected! Lockout active.', 'error');
  
  // Re-enable after 4 seconds
  setTimeout(() => {
    if (securityBox) {
      securityBox.classList.remove('screenshot-blurred');
    }
    if (currentSession && otpText.textContent === '[LOCKED]') {
      otpText.textContent = currentSession.otp;
    }
  }, 4000);
}

