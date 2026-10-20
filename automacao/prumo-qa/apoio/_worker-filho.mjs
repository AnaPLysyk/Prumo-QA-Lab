// Auxiliar de teste: tenta iniciar um worker sobre a mesma pasta de dados em OUTRO processo.
import { Worker } from '../../dist/agendamentos/worker/Worker.js';
const w = new Worker({ base: process.argv[2], semTemporizador: true });
try { w.iniciar(); console.log('INICIOU'); await w.parar(); } catch (e) { console.log('RECUSADO:' + e.message); }
