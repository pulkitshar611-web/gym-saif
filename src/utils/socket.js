// gym_backend/src/utils/socket.js
const { Server } = require('socket.io');

let io;

const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: ['http://localhost:5173', 'https://gym-management-001.netlify.app', 'https://gym-newss.kiaantechnology.com'],
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    console.log('Socket.io initialized');

    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);

        socket.on('join', (userId) => {
            socket.join(userId.toString());
            console.log(`User ${userId} joined room`);
        });

        socket.on('disconnect', () => {
            console.log('User disconnected');
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
};

module.exports = { initSocket, getIO };
