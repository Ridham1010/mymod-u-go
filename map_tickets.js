const fs = require('fs');
const path = require('path');

const implPath = path.join(__dirname, '_Progression Tracker-Mod-U-go - Implementation.csv');
const testCasesPath = path.join(__dirname, '_Progression Tracker-Mod-U-go - testcase.csv');

function parseCSVLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(cur);
            cur = '';
        } else {
            cur += char;
        }
    }
    result.push(cur);
    return result;
}

function escapeCSV(str) {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

const implLines = fs.readFileSync(implPath, 'utf8').split('\n').filter(l => l.trim().length > 0);
const testLines = fs.readFileSync(testCasesPath, 'utf8').split('\n').filter(l => l.trim().length > 0);

// We want to map TC IDs to implementation rows. We'll do a simple heuristic mapping based on keywords.
// Test row config:
// 0: Test cases, 1: Team Member, 2: Status, 3: Ticket_ids, ... 6: module tested

const mapModuleToRows = {
    'Exam Route Component': ['POST /exams', 'GET /exams', 'PUT /exams/:id', 'DELETE /exams/:id'],
    'Face Detection': ['POST /proctoring/face-detection', 'trustScore', 'faceDetectionResults'],
    'Proctoring Model': ['ProctoringSessionSchema', 'totalEvents', 'highSeverityEvents', 'totalTabSwitches', 'totalFullscreenExits'],
    'Submission Model': ['submissions.js', 'submissionSchema', 'POST /submissions'],
    'CameraFeed Component': ['startWebcam()', 'TakeExam — StreamManager'],
    'Middleware (Auth)': ['requireAdmin', 'Backend RBAC checks'],
    'Middleware (Rate Limiter)': ['rateLimiter.js'],
    'User Model': ['Firebase Auth SDK'],
    'Supporting Models (Notification)': ['Notification Service', 'exam_graded'],
    'Supporting Models (Report)': ['GET /reports/stats/dashboard'],
};

// Also we need to append missing Camera Calibration features.
const missingFeatures = [
    [
        '', 'REQ - 18', 'Web Client (Proctor Module)', 'CalibrationScreen', 'calculateLightingLevel()', 
        'Feb 25, 2026', 'Mar 18, 2026', 'Mar 18, 2026', 'Implemented', 
        'Calculates real-time ambient lighting levels directly from the video stream to ensure adequate testing environments.', 
        'Ridham Shah', '', 'TC-036, TC-037'
    ],
    [
        '', 'REQ - 18', 'Web Client (Proctor Module)', 'CalibrationScreen', 'calculateFaceDistance()', 
        'Feb 25, 2026', 'Mar 18, 2026', 'Mar 18, 2026', 'Implemented', 
        'Computes relative face distance approximation for detecting anomalies and leaning.', 
        'Shrey Shah', '', 'TC-038, TC-039'
    ],
    [
        '', 'REQ - 18', 'Web Client (Proctor Module)', 'CalibrationScreen', 'buildCalibrationThresholds()', 
        'Feb 25, 2026', 'Mar 18, 2026', 'Mar 18, 2026', 'Implemented', 
        'Generates bounding boxes for permitted movement and illumination based on baseline metrics measured during setup.', 
        'Pranav Nair', '', 'TC-040'
    ]
];

// Gather tests by their modules
const testMap = {}; // key: keyword/module -> array of TC ids
for (let i = 1; i < testLines.length; i++) {
    const parts = parseCSVLine(testLines[i]);
    const tcId = parts[3];
    const moduleName = parts[6];
    if (!testMap[moduleName]) testMap[moduleName] = [];
    testMap[moduleName].push(tcId);
}

const updatedImpl = [];

for (let i = 0; i < implLines.length; i++) {
    const row = parseCSVLine(implLines[i]);
    // row[12] is Ticket_ids raised
    // ensure row has 13 cols
    while(row.length < 13) row.push('');

    if (i < 2) {
        updatedImpl.push(row);
        continue;
    }

    const comp = (row[2] || '').toLowerCase();
    const cls = (row[3] || '').toLowerCase();
    const func = (row[4] || '').toLowerCase();
    const fullText = (comp + " " + cls + " " + func).toLowerCase();

    // Map based on simple logic
    let added = new Set();
    let currentTickets = row[12] ? row[12].split(',').map(s=>s.trim()).filter(Boolean) : [];
    const addTickets = (tcs) => {
        if (!tcs) return;
        tcs.forEach(t => { if (!added.has(t)) { currentTickets.push(t); added.add(t); } });
    }

    // Heuristics
    if (func.includes('post /exams') || func.includes('get /exams')) addTickets(testMap['Exam Route Component']);
    if (func.includes('post /proctoring/face-detection') || cls.includes('faceDetectionResults')) addTickets(testMap['Face Detection']);
    if (func.includes('totalEvents') || func.includes('highSeverityEvents')) addTickets(testMap['Proctoring Model']);
    if (cls.includes('submissionSchema') || func.includes('post /submissions')) addTickets(testMap['Submission Model']);
    if (func.includes('startwebcam()')) addTickets(testMap['CameraFeed Component']);
    if (func.includes('rbac') || func.includes('requireadmin')) addTickets(testMap['Middleware (Auth)']);
    if (func.includes('ratelimiter')) addTickets(testMap['Middleware (Rate Limiter)']);
    if (comp.includes('firebase auth')) addTickets(testMap['User Model']);
    if (func.includes('get /reports/stats')) addTickets(testMap['Supporting Models (Report)']);
    if (func.includes('exam_graded')) addTickets(testMap['Supporting Models (Notification)']);

    if (currentTickets.length > 0) {
        row[12] = currentTickets.join(', ');
    }

    updatedImpl.push(row);
}

// Add missing features
missingFeatures.forEach(feat => {
    updatedImpl.push(feat);
});

// Format CSV
const outputLines = updatedImpl.map(row => row.map(escapeCSV).join(','));
fs.writeFileSync(implPath, outputLines.join('\n'));
console.log('Successfully mapped tickets and appended missing features.');
