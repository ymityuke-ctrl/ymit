// server.js

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------
// Middleware
// ---------------------
app.use(cors());
app.use(bodyParser.json());

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ---------------------
// In‑memory jobs store
// ---------------------
let jobs = [];

/**
 * Helper to build a normalized job object.
 * If a jobId/serverId is supplied, that becomes the primary id.
 */
function createJobFromBody(body = {}) {
  const now = Date.now();

  // Prefer explicit IDs sent by client
  const incomingId =
    body.id ||
    body.serverId ||
    body.jobId ||
    `JOB-${now}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  return {
    // Identifiers (server uses `id` as the single source of truth)
    id: incomingId,
    jobId: incomingId,

    // Basic fields
    title: body.title || body.serviceName || "Service Request",
    serviceType: body.serviceType || "electronics",
    serviceName: body.serviceName || "General Service",
    customerName: body.customerName || "Customer",
    contact: body.contact || "",
    description: body.description || body.problemDetails || "",
    amount: body.amount || "₹500 - ₹1500",

    // Location
    location: body.location || {
      address: body.address || "Unknown address",
      lat: body.lat || 0,
      lng: body.lng || 0
    },
    locationCoords: body.locationCoords || {
      lat: body.lat || 0,
      lng: body.lng || 0
    },

    // Status & assignment
    status: body.status || "available", // default so jobs can be accepted
    assignedTo: body.assignedTo || null,

    // Timestamps
    createdAt: body.createdAt || now,
    timestamp: body.timestamp || new Date(now).toLocaleString(),

    // Optional worker/completion fields
    workerId: body.workerId || null,
    completionPhotoURL: body.completionPhotoURL || null,
    earnings: body.earnings || 0,
    timeSpent: body.timeSpent || 0,
    acceptedAt: body.acceptedAt || null,
    completedAt: body.completedAt || null
  };
}

// -----------------------------
// GET /api/jobs – list jobs
// -----------------------------
app.get("/api/jobs", (req, res) => {
  console.log(`📋 Fetching ${jobs.length} jobs`);
  res.json({
    success: true,
    data: jobs
  });
});

// -----------------------------
// POST /api/jobs – create job
// -----------------------------
app.post("/api/jobs", (req, res) => {
  try {
    const job = createJobFromBody(req.body);
    jobs.push(job);
    console.log(`✅ Created job: ${job.id}`);
    res.status(201).json({
      success: true,
      job
    });
  } catch (err) {
    console.error("❌ Error creating job:", err);
    res.status(500).json({
      success: false,
      message: "Failed to create job",
      error: err.message
    });
  }
});

// -----------------------------
// PUT /api/jobs/:id – update job
// -----------------------------
app.put("/api/jobs/:id", (req, res) => {
  try {
    const pathId = req.params.id;
    const { status, workerId, earnings, timeSpent, completionPhotoURL } =
      req.body || {};

    console.log(`\n🔄 Update request for job: ${pathId}`);
    console.log(`   Status: ${status}`);
    console.log(`   WorkerId: ${workerId}`);

    // Find by primary id or by legacy fields if any
    const index = jobs.findIndex(
      (j) => j.id === pathId || j.jobId === pathId || j._id === pathId
    );

    if (index === -1) {
      console.log(`❌ Job not found: ${pathId}`);
      console.log(`   Available jobs: ${jobs.map(j => j.id).join(', ')}`);
      return res.status(404).json({
        success: false,
        message: `Job not found: ${pathId}`
      });
    }

    const job = jobs[index];
    console.log(`📦 Found job: ${job.id} (current status: ${job.status})`);

    // -----------------
    // Status transitions
    // -----------------

    // Accepting a job
    if (status === "accepted") {
      console.log(`   Attempting to accept job...`);
      
      // Only allow accept when job is currently available/pending
      if (job.status !== "available" && job.status !== "pending") {
        console.log(`   ❌ Job already taken (status: ${job.status})`);
        return res.status(400).json({
          success: false,
          message: `Job already taken (current status: ${job.status})`
        });
      }

      if (!workerId) {
        console.log(`   ❌ Missing workerId`);
        return res.status(400).json({
          success: false,
          message: "workerId is required to accept a job"
        });
      }

      job.status = "accepted";
      job.assignedTo = workerId;
      job.workerId = workerId;
      job.acceptedAt = Date.now();
      console.log(`   ✅ Job accepted by worker: ${workerId}`);
    }

    // Rejecting a job (put it back to available)
    else if (status === "rejected") {
      console.log(`   ℹ️ Job rejected, setting back to available`);
      job.status = "available";
      job.assignedTo = null;
      job.workerId = null;
    }

    // Marking job as completed
    else if (status === "completed") {
      console.log(`   Attempting to complete job...`);
      
      // Only the assigned worker can complete it
      if (!workerId || job.assignedTo !== workerId) {
        console.log(`   ❌ Wrong worker or not assigned (assigned: ${job.assignedTo}, requesting: ${workerId})`);
        return res.status(400).json({
          success: false,
          message: "Only assigned worker can complete this job"
        });
      }

      job.status = "completed";
      if (typeof earnings === "number") job.earnings = earnings;
      if (typeof timeSpent === "number") job.timeSpent = timeSpent;
      if (completionPhotoURL) job.completionPhotoURL = completionPhotoURL;
      job.completedAt = Date.now();
      console.log(`   ✅ Job completed`);
    }

    // Generic status change (admin or other flows)
    else if (status) {
      console.log(`   ℹ️ Generic status change to: ${status}`);
      job.status = status;
    }

    // Persist back into array
    jobs[index] = job;

    console.log(`✅ Job updated successfully: ${job.id}`);
    console.log(`   Final status: ${job.status}`);
    console.log(`   Assigned to: ${job.assignedTo}\n`);

    res.json({
      success: true,
      job
    });
  } catch (err) {
    console.error("❌ Error updating job:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update job",
      error: err.message
    });
  }
});

// -----------------------------
// DELETE /api/jobs/:id – delete job (optional)
// -----------------------------
app.delete("/api/jobs/:id", (req, res) => {
  try {
    const pathId = req.params.id;
    const index = jobs.findIndex(
      (j) => j.id === pathId || j.jobId === pathId || j._id === pathId
    );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: "Job not found"
      });
    }

    jobs.splice(index, 1);
    console.log(`🗑️ Deleted job: ${pathId}`);
    
    res.json({
      success: true,
      message: "Job deleted successfully"
    });
  } catch (err) {
    console.error("❌ Error deleting job:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete job",
      error: err.message
    });
  }
});

// -----------------------------
// Root
// -----------------------------
app.get("/", (req, res) => {
  res.json({
    message: "YMIT backend running",
    status: "online",
    jobs: jobs.length,
    endpoints: {
      "GET /api/jobs": "List all jobs",
      "POST /api/jobs": "Create a new job",
      "PUT /api/jobs/:id": "Update a job",
      "DELETE /api/jobs/:id": "Delete a job"
    }
  });
});

// -----------------------------
// 404 handler
// -----------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.path}`
  });
});

// -----------------------------
// Error handler
// -----------------------------
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: err.message
  });
});

// -----------------------------
// Start server
// -----------------------------
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║   🚀 YMIT BACKEND SERVER RUNNING     ║
╠═══════════════════════════════════════╣
║   📡 Port: ${PORT.toString().padEnd(27)}║
║   🌐 URL: http://localhost:${PORT}/api    ║
║   ✅ Ready to receive requests        ║
╚═══════════════════════════════════════╝
  `);
});
