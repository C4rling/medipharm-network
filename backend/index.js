import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import inventoryRoutes from './routes/inventory.js';

const app = express();
app.use(cors({ origin: 'http://localhost:5173' })); // the Vite dev server
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));
app.use(inventoryRoutes);

app.listen(process.env.PORT || 3000, () => console.log('API running'));