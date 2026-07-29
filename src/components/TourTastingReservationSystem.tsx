import { useState } from 'react';
import { Calendar, Users, Clock, Plus, CheckCircle2, Phone, Mail, Award } from 'lucide-react';

type TourReservation = {
  id: string;
  tourDate: string;
  tourTime: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  partySize: number;
  tastingPackage: 'standard' | 'premium' | 'sladek_degustace';
  depositPaid: boolean;
  status: 'confirmed' | 'pending' | 'completed';
  assignedGuide: string;
};

const DEFAULT_RESERVATIONS: TourReservation[] = [
  {
    id: 'res_1',
    tourDate: '2026-08-01',
    tourTime: '14:00',
    guestName: 'Klub přátel piva Brno (Ing. Tomáš Kučera)',
    guestPhone: '+420 608 987 654',
    guestEmail: 'kucera@pivni-klub.cz',
    partySize: 12,
    tastingPackage: 'sladek_degustace',
    depositPaid: true,
    status: 'confirmed',
    assignedGuide: 'Vasil (Hlavní Sládek)',
  },
  {
    id: 'res_2',
    tourDate: '2026-08-05',
    tourTime: '16:30',
    guestName: 'Firemní teambuilding (Skupina 8 osob)',
    guestPhone: '+420 777 555 444',
    guestEmail: 'teambuilding@firma.cz',
    partySize: 8,
    tastingPackage: 'premium',
    depositPaid: false,
    status: 'pending',
    assignedGuide: 'Martin (Podsládek)',
  },
];

export function TourTastingReservationSystem() {
  const [reservations, setReservations] = useState<TourReservation[]>(DEFAULT_RESERVATIONS);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form
  const [tourDate, setTourDate] = useState('2026-08-10');
  const [tourTime, setTourTime] = useState('15:00');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [partySize, setPartySize] = useState('6');
  const [tastingPackage, setTastingPackage] = useState<TourReservation['tastingPackage']>('premium');
  const [assignedGuide, setAssignedGuide] = useState('Vasil (Sládek)');

  function addReservation() {
    if (!guestName.trim()) return;
    const newRes: TourReservation = {
      id: `res_${Date.now()}`,
      tourDate,
      tourTime,
      guestName,
      guestPhone,
      guestEmail,
      partySize: Number(partySize) || 2,
      tastingPackage,
      depositPaid: true,
      status: 'confirmed',
      assignedGuide,
    };
    setReservations((prev) => [newRes, ...prev]);
    setShowAddModal(false);
    setGuestName('');
    setGuestPhone('');
  }

  function toggleDeposit(id: string) {
    setReservations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, depositPaid: !r.depositPaid } : r))
    );
  }

  return (
    <div className="space-y-6">
      <div className="card p-6 bg-gradient-to-r from-neutral-900 via-neutral-950 to-neutral-900 text-white rounded-3xl space-y-4 shadow-xl border border-neutral-800">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-neutral-950 flex items-center justify-center font-black text-2xl shadow-lg">
              🍻
            </div>
            <div>
              <h3 className="font-display font-black text-xl text-amber-400">
                Rezervační systém pro exkurze a pivní ochutnávky
              </h3>
              <p className="text-xs text-neutral-300 font-medium">
                Přehled a správa termínů prohlídek varny, degustací s průměrem kapacity a průvodcovstvím sládka.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="btn-amber text-xs font-black px-4 py-2.5 shadow-md flex items-center gap-2"
          >
            <Plus size={16} />
            <span>+ Nová rezervace exkurze</span>
          </button>
        </div>
      </div>

      {/* Reservation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reservations.map((res) => (
          <div key={res.id} className="card p-5 bg-white border border-neutral-200 rounded-3xl space-y-3 shadow-xs hover:shadow-md transition flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2 border-b border-neutral-100 pb-3">
                <div>
                  <div className="flex items-center gap-2 font-mono text-xs font-bold text-amber-700">
                    <Calendar size={14} />
                    <span>{res.tourDate} v {res.tourTime} hod.</span>
                  </div>
                  <h4 className="font-display font-black text-base text-neutral-900 mt-1">{res.guestName}</h4>
                </div>

                <span
                  className={`chip shrink-0 ${
                    res.status === 'confirmed'
                      ? 'bg-emerald-100 text-emerald-950 font-extrabold border border-emerald-300'
                      : 'bg-amber-100 text-amber-950 font-extrabold border border-amber-300'
                  }`}
                >
                  {res.status === 'confirmed' ? '✅ Potvrzeno' : '⏳ Čeká na zálohu'}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200 mt-3 space-y-1.5 text-xs text-neutral-800 font-medium">
                <div>👥 Počet návštěvníků: <strong className="text-neutral-900 font-bold">{res.partySize} osob</strong></div>
                <div>🍺 Balíček: <strong className="text-amber-800 font-bold">
                  {res.tastingPackage === 'sladek_degustace' ? '👑 Exkurze se Sládkem + Degustace tankového piva' : res.tastingPackage === 'premium' ? '⭐ Premium degustace (6 vzorků + občerstvení)' : 'Standardní prohlídka'}
                </strong></div>
                <div>📞 Kontakt: <strong>{res.guestPhone}</strong> ({res.guestEmail})</div>
                <div>👤 Průvodce: <strong>{res.assignedGuide}</strong></div>
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-100 flex justify-between items-center">
              <button
                onClick={() => toggleDeposit(res.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black border transition ${
                  res.depositPaid
                    ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                    : 'bg-amber-100 text-amber-950 border-amber-300'
                }`}
              >
                {res.depositPaid ? '💰 Záloha zaplacena' : '⚠️ Zaplatit zálohu'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-neutral-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-[999]">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in duration-150">
            <div className="border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900">+ Rezervace exkurze pivovaru</h3>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Datum exkurze</label>
                  <input type="date" className="input font-bold text-sm" value={tourDate} onChange={(e) => setTourDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Čas</label>
                  <input type="time" className="input font-bold text-sm" value={tourTime} onChange={(e) => setTourTime(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Jméno zákazníka / Skupiny</label>
                <input type="text" className="input font-bold text-sm" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Ing. Tomáš Kučera" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Telefon</label>
                  <input type="text" className="input font-bold text-sm" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="+420 608 123 456" />
                </div>
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Počet osob</label>
                  <input type="number" className="input font-bold text-sm" value={partySize} onChange={(e) => setPartySize(e.target.value)} placeholder="8" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Balíček zážitku</label>
                <select className="input font-bold text-sm" value={tastingPackage} onChange={(e) => setTastingPackage(e.target.value as any)}>
                  <option value="sladek_degustace">👑 Exkurze se Sládkem + Tankové pivo přímo z CCT</option>
                  <option value="premium">⭐ Premium Degustace (6 vzorků + Pivní prkénko)</option>
                  <option value="standard">🍺 Standardní prohlídka varny</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Průvodce pivovarem</label>
                <input type="text" className="input font-bold text-sm" value={assignedGuide} onChange={(e) => setAssignedGuide(e.target.value)} placeholder="Vasil (Hlavní Sládek)" />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
              <button onClick={() => setShowAddModal(false)} className="btn-ghost text-xs font-bold">Zrušit</button>
              <button onClick={addReservation} disabled={!guestName.trim()} className="btn-amber text-xs font-black px-5 py-2.5">
                Uložit rezervaci
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
