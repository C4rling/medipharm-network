// Turns a database error into an HTTP response, using the messages the
// stored procedures raise (see docs/api-endpoints.md).
export function sendDbError(res, e) {
  const msg = String(e.message);

  if (msg.includes('permission denied')) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  const user = msg.match(/User \d+ does not exist or is inactive/);
  if (user) return res.status(401).json({ error: user[0] });

  const rx = msg.match(/Prescription \d+ (?:not found|is already \w+|has no items)/);
  if (rx) {
    const status = rx[0].includes('not found') ? 404 : rx[0].includes('already') ? 409 : 400;
    return res.status(status).json({ error: rx[0] });
  }
  if (msg.includes('foreign key')) {
    return res.status(404).json({ error: 'Branch or medicine not found' });
  }
  console.error(e);
  return res.status(500).json({ error: 'Server error' });
}