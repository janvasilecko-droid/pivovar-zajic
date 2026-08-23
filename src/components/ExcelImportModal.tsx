import { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { Modal, Spinner } from './ui';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';

export type TargetTable = 'places' | 'beers' | 'pricelist';

interface ColumnMapping {
  dbColumn: string;
  label: string;
  excelColumn: string;
  required?: boolean;
}

const TABLE_SCHEMAS: Record<TargetTable, { name: string; mappings: ColumnMapping[] }> = {
  places: {
    name: 'Odběratelé / Hospody',
    mappings: [
      { dbColumn: 'name', label: 'Název podniku / Odběratele', excelColumn: '', required: true },
      { dbColumn: 'address', label: 'Adresa', excelColumn: '' },
      { dbColumn: 'phone', label: 'Telefon', excelColumn: '' },
      { dbColumn: 'email', label: 'E-mail', excelColumn: '' },
      { dbColumn: 'note', label: 'Poznámka', excelColumn: '' },
    ],
  },
  beers: {
    name: 'Katalog piv',
    mappings: [
      { dbColumn: 'name', label: 'Název piva', excelColumn: '', required: true },
      { dbColumn: 'degree', label: 'Stupňovitost (EPM)', excelColumn: '' },
      { dbColumn: 'color', label: 'Barva / Typ (Světlý ležák...)', excelColumn: '' },
      { dbColumn: 'is_active', label: 'Aktivní (true/false)', excelColumn: '' },
    ],
  },
  pricelist: {
    name: 'Ceník',
    mappings: [
      { dbColumn: 'beer_name', label: 'Pivo', excelColumn: '', required: true },
      { dbColumn: 'package_label', label: 'Obal (KEG 50l, Lahve...)', excelColumn: '', required: true },
      { dbColumn: 'price_czk', label: 'Cena v Kč', excelColumn: '', required: true },
    ],
  },
};

export default function ExcelImportModal({
  open,
  onClose,
  targetTable,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  targetTable: TargetTable;
  onSuccess: () => void;
}) {
  const schema = TABLE_SCHEMAS[targetTable];
  const [file, setFile] = useState<File | null>(null);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<any[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>(schema.mappings);
  const [loading, setLoading] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setResultMsg(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const json = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });

        if (json.length > 0) {
          const headers = (json[0] as string[]).map((h) => String(h).trim());
          setExcelHeaders(headers);
          
          const rows = XLSX.utils.sheet_to_json<any>(ws);
          setRawData(rows);

          // Auto-match headers by similarity
          const updatedMappings = schema.mappings.map((m) => {
            const matched = headers.find(
              (h) => h.toLowerCase().includes(m.label.toLowerCase()) || h.toLowerCase().includes(m.dbColumn.toLowerCase())
            );
            return { ...m, excelColumn: matched ?? (headers[0] || '') };
          });
          setMappings(updatedMappings);
        }
      } catch (err) {
        setResultMsg({ type: 'error', text: 'Nepodařilo se přečíst Excel soubor.' });
      }
    };
    reader.readAsBinaryString(uploadedFile);
  };

  const handleMappingChange = (dbColumn: string, excelHeader: string) => {
    setMappings((prev) =>
      prev.map((m) => (m.dbColumn === dbColumn ? { ...m, excelColumn: excelHeader } : m))
    );
  };

  const handleImport = async () => {
    if (rawData.length === 0) return;
    setLoading(true);
    setResultMsg(null);

    try {
      const recordsToInsert = rawData.map((row) => {
        const obj: any = {};
        mappings.forEach((m) => {
          if (m.excelColumn && row[m.excelColumn] !== undefined) {
            let val = row[m.excelColumn];
            if (m.dbColumn === 'price_czk') val = Number(val) || 0;
            if (m.dbColumn === 'is_active') val = String(val).toLowerCase() === 'true' || val === 1 || val === '1';
            obj[m.dbColumn] = val;
          }
        });
        return obj;
      }).filter((r) => {
        // filter rows missing required fields
        const req = mappings.filter((m) => m.required);
        return req.every((m) => r[m.dbColumn] !== undefined && r[m.dbColumn] !== '');
      });

      if (recordsToInsert.length === 0) {
        setResultMsg({ type: 'error', text: 'Nenalezeny žádné platné řádky ke vložení.' });
        setLoading(false);
        return;
      }

      const { error } = await supabase.from(targetTable).insert(recordsToInsert);

      if (error) {
        setResultMsg({ type: 'error', text: `Chyba při ukládání: ${error.message}` });
      } else {
        setResultMsg({ type: 'success', text: `Úspěšně naimportováno ${recordsToInsert.length} řádků!` });
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      setResultMsg({ type: 'error', text: err.message || 'Chyba při importu.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Importovat ${schema.name} z Excelu`} wide>
      <div className="space-y-5">
        {/* Upload box */}
        <div className="border-2 border-dashed border-neutral-300 rounded p-6 text-center hover:border-primary-500 transition bg-neutral-50/50">
          <FileSpreadsheet className="w-12 h-12 text-primary-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-neutral-800">Vyberte soubor Excel (.xlsx, .csv)</p>
          <p className="text-xs text-neutral-500 mt-1 mb-3">Nahrajte tabulku s daty pro {schema.name}</p>
          <label className="btn-amber !rounded cursor-pointer">
            <Upload size={16} />
            <span>Vybrat Excel soubor</span>
            <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="hidden" />
          </label>
          {file && <div className="mt-3 text-xs font-bold text-emerald-700">Soubor: {file.name} ({rawData.length} řádků)</div>}
        </div>

        {/* Column Mapping Section */}
        {excelHeaders.length > 0 && (
          <div className="space-y-3 bg-white p-4 rounded border border-neutral-200 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-600">Párování sloupců z Excelu</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {mappings.map((m) => (
                <div key={m.dbColumn} className="space-y-1">
                  <label className="text-xs font-semibold text-neutral-700 flex items-center gap-1">
                    {m.label} {m.required && <span className="text-rose-500">*</span>}
                  </label>
                  <select
                    value={m.excelColumn}
                    onChange={(e) => handleMappingChange(m.dbColumn, e.target.value)}
                    className="input !py-1.5 text-xs"
                  >
                    <option value="">-- Nevybírat --</option>
                    {excelHeaders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status result */}
        {resultMsg && (
          <div className={`p-3 rounded text-xs font-bold flex items-center gap-2 ${resultMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
            {resultMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{resultMsg.text}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
          <button className="btn-ghost !rounded" onClick={onClose}>Zrušit</button>
          <button
            className="btn-primary !rounded"
            onClick={handleImport}
            disabled={loading || rawData.length === 0}
          >
            {loading ? <Spinner className="!py-0" /> : `Uložit ${rawData.length} řádků do databáze`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
