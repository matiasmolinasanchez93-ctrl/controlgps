import { useEffect, useState } from "react";
import { Download } from "lucide-react";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null),
    [instructions, setInstructions] = useState(false),
    [installed, setInstalled] = useState(false),
    [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const standalone = () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    const network = () => setOnline(navigator.onLine);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
    };
  }, []);
  return (
    <>
      {!online && (
        <div className="offline-banner" role="alert">
          Sin conexión. No se pueden confirmar entradas, salidas ni cambios.
          Reconecta y actualiza antes de reintentar.
        </div>
      )}
      {!installed && (
        <div className="install-app">
          <button
            onClick={async () => {
              if (prompt) {
                await prompt.prompt();
                const choice = await prompt.userChoice;
                if (choice.outcome === "accepted") setInstalled(true);
                setPrompt(null);
              } else setInstructions((value) => !value);
            }}
          >
            <Download size={15} />
            Instalar webapp
          </button>
          {instructions && (
            <div className="card install-instructions">
              <strong>Agregar ControlGPS al dispositivo</strong>
              <p>
                En Android: abre el menú de Chrome y elige «Instalar aplicación»
                o «Agregar a pantalla de inicio». En iPhone/iPad: abre Safari,
                pulsa Compartir y «Agregar a pantalla de inicio». En escritorio:
                usa la opción de instalación del navegador.
              </p>
              <p>
                El acceso y la asistencia requieren conexión. Instalarla no
                habilita GPS con el teléfono bloqueado.
              </p>
              <button onClick={() => setInstructions(false)}>
                Cerrar instrucciones
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
