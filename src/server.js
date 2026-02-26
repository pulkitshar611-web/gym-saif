// gym_backend/src/server.js
const app = require('./app');
require('./utils/cronJobs');
const http = require('http');
const { initSocket } = require('./utils/socket');
const server = http.createServer(app);

initSocket(server);

const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
