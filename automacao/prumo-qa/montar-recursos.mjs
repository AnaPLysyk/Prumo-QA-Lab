/** Recursos falsos para testes unitarios, mantidos no Lab e montados so durante a execucao. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const origem = path.join(path.dirname(fileURLToPath(import.meta.url)), 'recursos-unitarios');
const arquivos = [
  'bloquear-efeitos.cjs', 'caixa-de-email.mjs', 'conhecimento-falso.mjs',
  'conhecimento-hook.cjs', 'conhecimento-memoria.mjs', 'conhecimento-substitutos.cjs',
  'contas-por-email.mjs', 'fixtures.mjs', 'repositorio-de-suporte-falso.mjs'
];

export function montarRecursosUnitarios(raizQa) {
  const raiz = path.resolve(raizQa);
  const unitarios = path.join(raiz, 'testes', 'unitario');
  const destino = path.join(unitarios, 'infra');
  if (!fs.statSync(unitarios).isDirectory() || fs.existsSync(destino))
    throw new Error('LAB_INFRA_OCUPADA: confira e preserve os arquivos locais antes de executar');
  fs.mkdirSync(destino);
  const criados = [];
  let limpo = false;
  const limpar = () => {
    if (limpo) return;
    limpo = true;
    for (const f of criados.reverse()) fs.rmSync(f, { force: true });
    if (fs.existsSync(destino) && fs.readdirSync(destino).length === 0) fs.rmdirSync(destino);
  };
  try {
    for (const nome of arquivos) {
      const fonte = path.join(origem, nome), alvo = path.join(destino, nome);
      if (!fs.statSync(fonte).isFile()) throw new Error('LAB_RECURSO_AUSENTE: ' + nome);
      fs.copyFileSync(fonte, alvo, fs.constants.COPYFILE_EXCL);
      criados.push(alvo);
    }
    return limpar;
  } catch (erro) { limpar(); throw erro; }
}
