import 'dotenv/config';
import express from 'express';

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(process.env.PORT || 3000, () => console.log('API running'));