import { useState } from 'react';
import { api } from './api.js';
import './RestockForm.css';

// Props:
//   branchId    number, the branch being restocked
//   medicines   array of { medicineId, name } to choose from
//   onRestocked optional function, called after a successful restock (use it to reload the stock table)
export default function RestockForm({ branchId, medicines = [], onRestocked }) {
  const [medicineId, setMedicineId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setDone('');

    const medId = Number(medicineId);
    const qty = Number(quantity);
    if (medicineId === '') {
      setError('Choose a medicine.');
      return;
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      setError('Quantity must be a whole number greater than 0.');
      return;
    }

    setBusy(true);
    try {
      const out = await api(`/branches/${branchId}/restock`, {
        method: 'POST',
        body: JSON.stringify({ medicineId: medId, quantity: qty }),
      });
      const name = medicines.find((m) => m.medicineId === medId)?.name ?? 'Medicine';
      setDone(`${name} restocked. New quantity: ${out.quantity}`);
      setQuantity('');
      if (onRestocked) onRestocked(out);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="restock" onSubmit={handleSubmit}>
      <h2>Restock</h2>
      <div className="restock__row">
        <div className="restock__field">
          <label htmlFor="restock-medicine">Medicine</label>
          <select
            id="restock-medicine"
            value={medicineId}
            onChange={(e) => setMedicineId(e.target.value)}
          >
            <option value="">Choose a medicine</option>
            {medicines.map((m) => (
              <option key={m.medicineId} value={m.medicineId}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="restock__field restock__field--qty">
          <label htmlFor="restock-qty">Quantity to add</label>
          <input
            id="restock-qty"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>

        <button className="restock__btn" type="submit" disabled={busy}>
          {busy ? 'Restocking…' : 'Restock'}
        </button>
      </div>

      <p className="restock__msg restock__msg--error" role="alert">{error}</p>
      <p className="restock__msg restock__msg--ok" role="status">{done}</p>
    </form>
  );
}
