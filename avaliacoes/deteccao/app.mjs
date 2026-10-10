// Carrega a aplicação a testar: a original ou uma cópia mutada, indicada por LAB_APP_DIR (usado por avaliacoes/deteccao.mjs).
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const padrao = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'aplicacao');
const base = path.resolve(process.env.LAB_APP_DIR ?? padrao);
export const carregar = (arquivo) => import(pathToFileURL(path.join(base, 'src', arquivo)).href);
