type Recognition = {
  lang: string;
  processLocally: boolean;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        results: { [key: number]: { [key: number]: { transcript: string } } };
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type Constructor = {
  new (): Recognition;
  available?: (options: {
    langs: string[];
    processLocally: boolean;
  }) => Promise<string>;
};
export async function listenLocal(): Promise<string> {
  const API = (window as unknown as { SpeechRecognition?: Constructor })
    .SpeechRecognition;
  if (!API?.available)
    throw Error("Reconhecimento local não suportado. Use o campo de texto.");
  const status = await API.available({
    langs: ["pt-BR"],
    processLocally: true,
  });
  if (status !== "available")
    throw Error(
      "Pacote local PT-BR não instalado. O áudio não foi enviado à nuvem.",
    );
  return new Promise((resolve, reject) => {
    const rec = new API();
    if (!("processLocally" in rec)) {
      reject(Error("Modo local indisponível"));
      return;
    }
    rec.lang = "pt-BR";
    rec.processLocally = true;
    rec.continuous = false;
    rec.interimResults = false;
    let settled = false;
    const timer = setTimeout(() => {
      rec.stop();
      if (!settled) {
        settled = true;
        reject(Error("Tempo de escuta encerrado"));
      }
    }, 12000);
    rec.onresult = (e) => {
      settled = true;
      clearTimeout(timer);
      rec.stop();
      resolve(e.results[0][0].transcript);
    };
    rec.onerror = (e) => {
      settled = true;
      clearTimeout(timer);
      reject(Error(e.error));
    };
    rec.onend = () => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(Error("Nenhuma fala reconhecida"));
      }
    };
    rec.start();
  });
}
export function speakLocal(text: string) {
  const voice = window.speechSynthesis
    ?.getVoices()
    .find((v) => v.localService && v.lang.toLowerCase().startsWith("pt"));
  if (!voice) throw Error("Nenhuma voz PT local disponível no sistema.");
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = "pt-BR";
  speechSynthesis.speak(utterance);
}
