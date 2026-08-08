import React, { useState } from 'react';

interface TaskerTutorialProps {
  isOpen: boolean;
  onClose: () => void;
}

const TaskerTutorial: React.FC<TaskerTutorialProps> = ({ isOpen, onClose }) => {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      title: "1. Instalace aplikací",
      content: (
        <div className="space-y-2">
          <p className="font-medium">Nainstalujte:</p>
          <p>📱 <strong>AutoNotification</strong> (Play Store)</p>
          <p>⚡ <strong>Tasker</strong> (Play Store)</p>
          <p>📋 <strong>Naší aplikaci</strong></p>
        </div>
      ),
    },
    {
      title: "2. AutoNotification",
      content: (
        <div className="space-y-2">
          <p>Povolte přístup k notifikacím</p>
          <p>Vyberte WhatsApp</p>
          <p>Přidejte textové filtry</p>
        </div>
      ),
    },
    {
      title: "3. Tasker profil",
      content: (
        <div className="space-y-2">
          <p><strong>Událost:</strong></p>
          <p>Plugin → AutoNotification → Intercepted</p>
          <p><strong>App:</strong> WhatsApp</p>
          <p><strong>Text:</strong> %antext</p>
        </div>
      ),
    },
    {
      title: "4. Send Intent",
      content: (
        <div className="space-y-2">
          <p><strong>Akce:</strong> Send Intent</p>
          <div className="bg-gray-900 text-gray-100 p-3 rounded text-sm">
            <p>Action: android.intent.action.SEND</p>
            <p>Mime: text/plain</p>
            <p>Extra: android.intent.extra.TEXT:%antext</p>
            <p>Package: com.minipivovar.zajic</p>
          </div>
        </div>
      ),
    },
    {
      title: "5. Testování",
      content: (
        <div className="space-y-2">
          <p>Pošlete zprávu v WhatsApp</p>
          <p>Zkontrolujte aplikaci</p>
          <p>Zpráva by se měla objevit</p>
        </div>
      ),
    },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        <div className="bg-amber-500 text-white p-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold">Nastavení Taskeru</h2>
            <button onClick={onClose} className="text-xl">&times;</button>
          </div>
        </div>

        <div className="p-4">
          <div className="flex gap-2 mb-4">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveStep(i)}
                className={`flex-1 py-2 text-sm ${activeStep === i ? 'bg-amber-500 text-white' : 'bg-gray-100'}`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <h3 className="font-bold mb-2">{steps[activeStep].title}</h3>
          <div className="mb-4">{steps[activeStep].content}</div>

          <div className="flex justify-between">
            <button
              onClick={() => setActiveStep(Math.max(0, activeStep - 1))}
              disabled={activeStep === 0}
              className="px-4 py-2 bg-gray-200 disabled:opacity-50"
            >
              ← Zpět
            </button>
            {activeStep < steps.length - 1 ? (
              <button
                onClick={() => setActiveStep(activeStep + 1)}
                className="px-4 py-2 bg-amber-500 text-white"
              >
                Další →
              </button>
            ) : (
              <button onClick={onClose} className="px-4 py-2 bg-green-600 text-white">
                Hotovo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskerTutorial;