// gym_backend/src/server.js
const app = require('./app');
// Trigger restart

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
