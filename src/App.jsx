import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  Copy, 
  Check, 
  Loader2, 
  Image as ImageIcon, 
  Wand2, 
  Eraser, 
  X, 
  Plus, 
  ClipboardPaste, 
  Clock, 
  ShieldCheck,
  Info 
} from 'lucide-react';

/**
 * OSP Scanner Pro - Versão Final (Com Radar de Modelos)
 */
const App = () => {
  const [images, setImages] = useState([]);
  const [template, setTemplate] = useState(`Máscara de acionamento OSP campo 

TTK: [TTK]
ID de Serviço: [ID_SERVICO]
Causa Raiz: 
ARD: [ARD]
SP: [SP]
CTO: [CTO]
Rua: [RUA]
Data/hora inicial: [DATA_INICIAL]
Data/hora fim: 
SLA: [SLA]
OBS: [OBS]

Material gasto: 
SIM:() Não alterar escrita, apenas coloque o X sem espaço se gasto material FiBrasil 
NÃO:() Não alterar escrita, apenas coloque o X sem espaço se não gasto material FiBrasil 

Endereço complementar da atividade realizada : 
Metragem do cabo aplicado: 
Metragem do cabo retirado: 

DESCREVA SUA ATIVIDADE : 

Equipe: `);

  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // 🛑🛑🛑 PASSO FINAL: COLOQUE A SUA CHAVE AQUI E DEPOIS FAÇA CTRL+S 🛑🛑🛑
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ""; 

  const processFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImages(prev => [...prev, {
        id: crypto.randomUUID(),
        url: URL.createObjectURL(file),
        base64: reader.result.split(',')[1],
        mimeType: file.type
      }]);
    };
    reader.readAsDataURL(file);
    setError(null);
  };

  useEffect(() => {
    const handlePaste = (event) => {
      const items = event.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
            const file = items[i].getAsFile();
            if (file) processFile(file);
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(processFile);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (id) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const clearAll = () => {
    setImages([]);
    setResult("");
    setError(null);
  };

  const copyToClipboard = () => {
    const textArea = document.createElement("textarea");
    textArea.value = result;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Erro ao copiar', err);
    }
    document.body.removeChild(textArea);
  };

  const analyzeImages = async () => {
    if (images.length === 0) {
      setError("Por favor, carregue ou cole pelo menos um print.");
      return;
    }

    setLoading(true);
    setError(null);

    const fullPrompt = `Você é um assistente técnico de OSP especializado em extração de dados de rede.
    Analise os prints fornecidos e preencha a máscara de acionamento rigorosamente.

    MAPEAMENTO DE DADOS:
    - TTK: Procure códigos que comecem com "TT" (ex: TT123456).
    - ID de Serviço: Extraia o valor do campo "DESIGNADOR".
    - CTO: Extraia de "CAIXA / SPLITTER" (ex: I03G0017).
    - SP: Extraia de "CAIXA / SPLITTER" (ex: SP3).
    - ARD: Deve ser SEMPRE os 3 primeiros caracteres da CTO (ex: se CTO é I03G0017, ARD é I03).
    - Rua: Extraia de "END CTO ATENUADA" ou similar.
    - Data/hora inicial: Extraia de "Data Início" (Data e Hora).
    - SLA: Extraia de "SLA".
    - OBS: Concatene as seguintes informações em uma única linha ou parágrafo:
        1. O conteúdo do campo "Descrição" (ex: FALHA IDENTIFICADA – PORTA CTO COM DEFEITO).
        2. O conteúdo de "DADOS DO TÉCNICO" ou "DADOS TECNICO" (Nome e Telefone).
        3. O conteúdo de "PORTA COM DEFEITO" (ex: 3, 4).
        Exemplo de formato para OBS: "DESCRIÇÃO: [TEXTO] / TÉCNICO: [NOME - TEL] / PORTAS: [NÚMEROS]"

    REGRAS DE FORMATAÇÃO (MUITO IMPORTANTE):
    1. Deixe os seguintes campos TOTALMENTE VAZIOS: Causa Raiz, Data/hora fim, Endereço complementar, Metragens, Descrição e Equipe.
    2. NUNCA preencha os campos de "Material gasto" (SIM e NÃO). Deixe os parênteses vazios como no original: SIM:() e NÃO:(). O técnico fará isso manualmente.
    3. O campo "Data/hora fim" deve ficar sempre em branco após os dois pontos.
    4. Mantenha a quebra de linha exata do template.
    5. Use "Não informado" apenas para os campos mapeados (TTK, ID, etc) caso a informação não exista nos prints.

    TEMPLATE:
    ${template}`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: fullPrompt },
            ...images.map(img => ({
              inlineData: { mimeType: img.mimeType, data: img.base64 }
            }))
          ]
        }
      ]
    };

    const cleanApiKey = apiKey ? apiKey.trim() : "";

    const discoverAndFetch = async () => {
      try {
        let selectedModel = "gemini-2.5-flash-preview-09-2025"; // Padrão interno para testes
        
        if (cleanApiKey !== "") {
          // PASSO 1: Perguntar à Google quais modelos ESTA CHAVE pode usar
          const listResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanApiKey}`);
          
          if (!listResponse.ok) {
            const errData = await listResponse.json().catch(() => ({}));
            throw new Error(`A sua Chave de API foi rejeitada pelos servidores. Certifique-se de que a gerou no Google AI Studio (e não no Google Cloud). Detalhe da Google: ${errData.error?.message || listResponse.status}`);
          }
          
          const listData = await listResponse.json();
          
          // Filtrar os modelos que a conta tem acesso e que suportam gerar conteúdo
          const availableModels = listData.models
            .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
            .map(m => m.name.replace('models/', ''));

          if (availableModels.length === 0) {
             throw new Error("A sua chave não tem permissão para usar nenhum modelo de Inteligência Artificial da Google. Crie uma nova chave num novo projeto no Google AI Studio.");
          }

          // Priorizar o 1.5 Flash (ideal para prints e muito rápido), ou pegar o primeiro disponível
          selectedModel = availableModels.find(m => m.includes('1.5-flash')) || 
                          availableModels.find(m => m.includes('1.5-pro')) || 
                          availableModels.find(m => m.includes('gemini-1.')) ||
                          availableModels[0];
                          
          console.log("Modelos permitidos para esta chave:", availableModels);
          console.log("Modelo que será utilizado:", selectedModel);
        }

        // PASSO 2: Fazer o pedido de IA usando o modelo que a Google acabou de confirmar que existe
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${cleanApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );

        if (!response.ok) {
           const errData = await response.json().catch(() => ({}));
           throw new Error(`Erro ao gerar a resposta com o modelo ${selectedModel}. A Google diz: ${errData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (text) {
          setResult(text);
          setLoading(false);
        } else {
          throw new Error("A IA processou as imagens, mas não devolveu texto.");
        }
      } catch (err) {
        setError(`⚠️ ${err.message}`);
        setLoading(false);
      }
    };

    discoverAndFetch();
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-8 font-sans text-slate-800">
      <div className="max-w-6xl mx-auto">
        
        {/* Header Estilo Padtec/COPE */}
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-[#1a365d] p-6 rounded-2xl shadow-lg border-b-4 border-[#38bdf8]">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-xl">
              <ShieldCheck className="w-8 h-8 text-[#38bdf8]" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight uppercase">
                COPE - Gestão de Acionamentos
              </h1>
              <div className="flex items-center gap-2 text-[#38bdf8] text-xs font-bold uppercase tracking-widest mt-0.5">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                Scanner Inteligente Ativo
              </div>
            </div>
          </div>
          
          <div className="flex gap-3">
            {images.length > 0 && (
              <button 
                onClick={clearAll} 
                className="px-4 py-2 text-xs font-bold text-white/70 hover:text-white flex items-center gap-2 bg-white/5 rounded-lg border border-white/10 transition-all hover:bg-white/10"
              >
                <Eraser className="w-4 h-4" /> Limpar Painel
              </button>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          <div className="space-y-6">
            <section className="bg-white p-7 rounded-2xl shadow-md border border-slate-200">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-[#1a365d]" /> Repositório de Prints
                </h2>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-[#1a365d] text-white text-xs font-bold rounded-lg flex items-center gap-2 hover:bg-[#2c5282] transition-colors"
                >
                  <Plus className="w-4 h-4" /> Adicionar
                </button>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                {images.map((img) => (
                  <div key={img.id} className="relative aspect-video bg-slate-100 rounded-xl overflow-hidden border border-slate-200 group">
                    <img src={img.url} className="w-full h-full object-cover" alt="Print" />
                    <div className="absolute inset-0 bg-[#1a365d]/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button 
                        onClick={() => removeImage(img.id)}
                        className="p-2 bg-red-500 text-white rounded-full shadow-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-video border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-[#38bdf8] hover:bg-[#f0f9ff] transition-all text-slate-400"
                >
                  <Upload className="w-5 h-5" />
                  <span className="text-[10px] font-bold uppercase">Procurar Arquivo</span>
                </button>
              </div>

              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                multiple
                onChange={handleImageUpload} 
              />

              <button
                onClick={analyzeImages}
                disabled={loading || images.length === 0}
                className={`w-full py-4 rounded-xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all ${
                  loading || images.length === 0 
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' 
                    : 'bg-[#38bdf8] text-white hover:bg-[#0ea5e9] shadow-lg shadow-sky-100 active:scale-95'
                }`}
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Processando {images.length} prints...</>
                ) : (
                  <><Wand2 className="w-5 h-5" /> Iniciar Extração IA</>
                )}
              </button>

              {error && (
                <div className="mt-4 p-4 bg-red-50 text-red-700 text-sm font-bold rounded-xl border border-red-100 flex items-start gap-2 shadow-sm">
                  <span className="break-words">{error}</span>
                </div>
              )}
              
              <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-4">
                <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
                  <ClipboardPaste className="w-5 h-5 text-[#38bdf8]" />
                </div>
                <div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Atalho Rápido</div>
                  <div className="text-xs text-slate-600 font-bold">
                    Cole prints com <kbd className="bg-white px-1 py-0.5 rounded border border-slate-300 mx-1">CTRL + V</kbd> ou <kbd className="bg-white px-1 py-0.5 rounded border border-slate-300 mx-1">Win + V</kbd>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="flex flex-col">
            <section className="bg-white p-7 rounded-2xl shadow-md border border-slate-200 flex-grow flex flex-col min-h-[600px]">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#38bdf8]" /> Máscara Processada
                </h2>
                {result && (
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1a365d] text-white hover:bg-[#2c5282] transition-all font-bold text-[10px] uppercase tracking-widest"
                  >
                    {copied ? <><Check className="w-3 h-3" /> Copiado!</> : <><Copy className="w-3 h-3" /> Copiar para Chat</>}
                  </button>
                )}
              </div>

              <div className="flex-grow bg-[#1e293b] rounded-xl p-6 shadow-inner border border-slate-800 flex flex-col overflow-hidden">
                {result ? (
                  <textarea
                    value={result}
                    onChange={(e) => setResult(e.target.value)}
                    className="w-full h-full bg-transparent text-[#38bdf8] font-mono text-xs leading-relaxed whitespace-pre-wrap outline-none resize-none border-none custom-scrollbar"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-4 opacity-50">
                    <Clock className="w-12 h-12 stroke-[1px]" />
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-center">
                      Aguardando Input de Dados
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

        </div>
      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #1e293b; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; border: 2px solid #1e293b; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #38bdf8; }
      `}</style>
    </div>
  );
};

export default App;
