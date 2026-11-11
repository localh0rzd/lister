import axios from 'axios';

// Runs before each e2e file: point axios at the API under test.
const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ?? '3000';
axios.defaults.baseURL = `http://${host}:${port}`;
