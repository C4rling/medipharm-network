// Turns a database error into an HTTP response, using the messages the
// stored procedures raise (see docs/api-endpoints.md).
export function sendDbError(res, e) {
  const msg = String(e.message);
  const send = (status, error) => res.status(status).json({ error });

  if (msg.includes('permission denied')) return send(403, 'Permission denied');

  const user = msg.match(/User \d+ does not exist or is inactive/);
  if (user) return send(401, user[0]);
  if (/user id is required/.test(msg)) return send(401, 'Not logged in');

  if (/not allowed to dispense/.test(msg)) {
    return send(403, "Only a pharmacist of this prescription's branch may dispense it");
  }
  if (/can only book their own/.test(msg)) {
    return send(403, 'A patient can only book their own appointments');
  }

  const rx = msg.match(/Prescription \d+ (?:not found|is already \w+|has no items)/);
  if (rx) {
    const status = rx[0].includes('not found') ? 404 : rx[0].includes('already') ? 409 : 400;
    return send(status, rx[0]);
  }

  if (/is already booked/.test(msg)) return send(409, 'That doctor is already booked at that time');
  if (/already has an appointment/.test(msg)) {
    return send(409, 'The patient already has an appointment at that time');
  }
  if (/is not assigned to clinic/.test(msg) || msg.includes('fk_appt_doctor_clinic')) {
    return send(409, 'That doctor is not assigned to that clinic');
  }
  if (/in the past/.test(msg)) return send(400, 'That appointment time is in the past');
  if (/Date and time are required/.test(msg)) return send(400, 'Date and time are required');
  const missing = msg.match(/(?:Patient|Clinic|Doctor) \d+ does not exist/);
  if (missing) return send(404, missing[0]);

  if (msg.includes('foreign key')) return send(404, 'Branch or medicine not found');
  if (msg.includes('duplicate key')) return send(409, 'That record already exists');
  if (msg.includes('not-null')) return send(400, 'Some required details are missing');

  console.error(e);
  return send(500, 'Server error');
}