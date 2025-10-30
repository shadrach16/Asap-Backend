const express = require('express');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');

const connectDB = require('./config/database');
const { helmet, cors, limiter } = require('./middleware/securityMiddleware');
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger'); // 👈 ADD THIS LINE

// Route Files... (imports remain the same)
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const complianceRoutes = require('./routes/complianceRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const jobRoutes = require('./routes/jobRoutes');
const proposalRoutes = require('./routes/proposalRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentsRoutes = require('./routes/paymentsRoutes');
const chatRoutes = require('./routes/chatRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const disputesRoutes = require('./routes/disputesRoutes');
const proRoutes = require('./routes/proRoutes');
const aiRoutes = require('./routes/aiRoutes');
const adminRoutes = require('./routes/adminRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes'); // <-- Import
const categoryRoutes = require('./routes/categoryRoutes'); // <-- Import
const skillRoutes = require('./routes/skillRoutes');       // <-- Impor
const analyticsRoutes = require('./routes/analyticsRoutes'); // <-- IMPORT THIS


dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173', methods: ['GET', 'POST'] } });

// --- User Socket Mapping (In-memory, use Redis in production for scalability) ---
const userSockets = new Map(); // Map<userId: string, socketId: string>

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) { return next(new Error('Authentication error: No token provided')); }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) { return next(new Error('Authentication error: User not found')); }
    socket.user = user;
    next();
  } catch (err) { return next(new Error('Authentication error: Invalid token')); }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id} (${socket.user.email})`);
  // Store the mapping
  userSockets.set(socket.user._id.toString(), socket.id);

  socket.on('joinRoom', (bookingId) => { socket.join(bookingId); console.log(`User ${socket.user.email} joined room: ${bookingId}`); });
  socket.on('leaveRoom', (bookingId) => { socket.leave(bookingId); console.log(`User ${socket.user.email} left room: ${bookingId}`); });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id} (${socket.user.email})`);
    // Remove the mapping on disconnect
    if (userSockets.get(socket.user._id.toString()) === socket.id) {
        userSockets.delete(socket.user._id.toString());
    }
  });
});

app.set('socketio', io);
app.set('userSockets', userSockets); // Make map accessible
app.use(requestLogger);

// --- Core Middleware & Routes ---
app.use(helmet);  
app.use(cors);
app.use(limiter);
app.use(
  '/api/webhooks',
  express.raw({ type: 'application/json' }), // Tell express to get the raw body
  webhookRoutes
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/proposals', proposalRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/disputes', disputesRoutes);
app.use('/api/pro', proRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/categories', categoryRoutes); // <-- Mount Category routes
app.use('/api/skills', skillRoutes);
app.use('/api/analytics', analyticsRoutes)


app.get('/', (req, res) => { res.send('ASAP Backend is running...'); });

// --- Error Handling ---
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`));