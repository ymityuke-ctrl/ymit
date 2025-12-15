const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// In-memory database
let database = {
    workers: {},
    jobs: {},
    payments: {},
    config: {
        freeJobsLimit: 3,
        premiumPrice: 20,
        maxDistanceKm: 10
    }
};

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'YMIT Backend Server is running',
        timestamp: Date.now(),
        version: '1.0.0'
    });
});

// Get worker
app.get('/api/workers/:workerId', (req, res) => {
    try {
        const { workerId } = req.params;
        
        if (!database.workers[workerId]) {
            database.workers[workerId] = {
                id: workerId,
                name: `Worker ${workerId.slice(-4)}`,
                phone: workerId,
                field: 'electronics',
                isPremium: false,
                completedJobs: 0,
                totalEarnings: 0,
                rating: 4.5,
                createdAt: Date.now()
            };
        }
        
        res.json({
            success: true,
            data: database.workers[workerId]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Update worker field
app.patch('/api/workers/:workerId/field', (req, res) => {
    try {
        const { workerId } = req.params;
        const { field } = req.body;
        
        if (!database.workers[workerId]) {
            return res.status(404).json({
                success: false,
                error: 'Worker not found'
            });
        }
        
        database.workers[workerId].field = field;
        
        res.json({
            success: true,
            data: database.workers[workerId]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get jobs
app.get('/api/jobs', (req, res) => {
    try {
        const { status = 'available', workerId } = req.query;
        let jobs = Object.values(database.jobs);
        
        if (status !== 'all') {
            jobs = jobs.filter(job => job.status === status);
        }
        
        if (workerId) {
            jobs = jobs.filter(job => job.workerId === workerId);
        }
        
        jobs.sort((a, b) => b.createdAt - a.createdAt);
        
        res.json({
            success: true,
            data: jobs,
            count: jobs.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Create job
app.post('/api/jobs', (req, res) => {
    try {
        const jobData = req.body;
        const jobId = 'JOB' + Date.now();
        
        database.jobs[jobId] = {
            id: jobId,
            title: jobData.title || 'Service Request',
            serviceType: jobData.serviceType || 'general',
            serviceName: jobData.serviceName || 'Service',
            customerName: jobData.customerName || 'Customer',
            contact: jobData.contact || '',
            location: jobData.location || '',
            locationCoords: jobData.locationCoords || null,
            description: jobData.description || '',
            amount: jobData.amount || '₹500',
            status: 'available',
            workerId: null,
            createdAt: Date.now(),
            timestamp: new Date().toLocaleString()
        };
        
        res.json({
            success: true,
            data: database.jobs[jobId],
            message: 'Job created successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Accept job
app.post('/api/jobs/:jobId/accept', (req, res) => {
    try {
        const { jobId } = req.params;
        const { workerId } = req.body;
        
        if (!database.jobs[jobId]) {
            return res.status(404).json({
                success: false,
                error: 'Job not found'
            });
        }
        
        if (database.jobs[jobId].status !== 'available') {
            return res.status(400).json({
                success: false,
                error: 'Job is not available'
            });
        }
        
        database.jobs[jobId].status = 'accepted';
        database.jobs[jobId].workerId = workerId;
        database.jobs[jobId].acceptedAt = Date.now();
        
        res.json({
            success: true,
            data: database.jobs[jobId],
            message: 'Job accepted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Complete job
app.post('/api/jobs/:jobId/complete', (req, res) => {
    try {
        const { jobId } = req.params;
        const { workerId, timeSpent, location } = req.body;
        
        if (!database.jobs[jobId]) {
            return res.status(404).json({
                success: false,
                error: 'Job not found'
            });
        }
        
        const earnings = parseInt(database.jobs[jobId].amount.replace(/[^0-9]/g, '')) || 500;
        
        database.jobs[jobId].status = 'completed';
        database.jobs[jobId].completedAt = Date.now();
        database.jobs[jobId].completionData = {
            timeSpent,
            location
        };
        
        if (database.workers[workerId]) {
            database.workers[workerId].completedJobs++;
            database.workers[workerId].totalEarnings += earnings;
        }
        
        res.json({
            success: true,
            data: database.jobs[jobId],
            earnings,
            message: 'Job completed successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Verify payment
app.post('/api/payments/verify', (req, res) => {
    try {
        const { workerId, imageHash, screenshotTime } = req.body;
        
        if (!database.workers[workerId]) {
            return res.status(404).json({
                success: false,
                error: 'Worker not found'
            });
        }
        
        const paymentId = 'PAY' + Date.now();
        
        database.payments[paymentId] = {
            id: paymentId,
            workerId,
            imageHash,
            screenshotTime,
            amount: database.config.premiumPrice,
            status: 'verified',
            submittedAt: Date.now()
        };
        
        database.workers[workerId].isPremium = true;
        database.workers[workerId].premiumActivatedAt = Date.now();
        
        res.json({
            success: true,
            data: database.payments[paymentId],
            worker: database.workers[workerId],
            message: 'Payment verified successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get system config
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        data: database.config
    });
});

// Start server
app.listen(PORT, () => {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║   🚀 YMIT BACKEND SERVER RUNNING          ║');
    console.log('╠════════════════════════════════════════════╣');
    console.log(`║   📍 Port: ${PORT}                            ║`);
    console.log(`║   🌐 URL: http://localhost:${PORT}/api      ║`);
    console.log('║   ✅ Ready to receive requests             ║');
    console.log('╚════════════════════════════════════════════╝');
});
