import fs from 'node:fs';
import { resumir } from './comparacao.mjs';
const origem='avaliacoes/resultados/2026-10-10-comparacao-prumo-2.6.0.json';
const original=JSON.parse(fs.readFileSync(origem,'utf8'));
const registros=original.registros.map(r=>({...r,...(r.braco==='C'?{prumoUtilizado:r.chamadasMcp.some(c=>c.tool==='contexto_projeto'&&c.status==='completed')&&r.chamadasMcp.some(c=>c.tool==='revisar_cobertura'&&c.status==='completed')}: {})}));
const resultado={origem,errata:'O avaliador registrou chamadas reais do braço C, mas omitiu prumoUtilizado. A errata deriva o campo das chamadas já registradas; não altera respostas, critérios ou o arquivo original.',registros,resumo:resumir(registros)};
fs.writeFileSync('avaliacoes/resultados/2026-10-10-comparacao-prumo-2.6.0-errata.json',JSON.stringify(resultado,null,2));
console.log(JSON.stringify(resultado.resumo));
