import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abrir, novoDados, ir } from '../../../apoio/janela.mjs';

// Um caminho longo e sem ponto de quebra (como o do runner do CI) não pode alargar a página nem em janela pequena nem com zoom.
const estoura = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

test('Projetos com pasta de caminho longo não gera rolagem horizontal em 1024×768, zoom 2 e zoom 4', { timeout: 120000 }, async (t) => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'prumo-' + 'x'.repeat(70)));
  fs.writeFileSync(path.join(pasta, 'package.json'), '{"name":"longo","scripts":{"test":"node --test"}}'); t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  const a = await abrir(t, novoDados(t)); const p = a.page;
  await a.app.evaluate(({ dialog }, d) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] }); }, pasta);
  const e = (await p.evaluate(() => window.prumo.espacoCriar({ nome: 'Longo', descricao: 'caminho longo' }))).data; await p.evaluate((id) => window.prumo.espacoPasta(id), e.id);
  await ir(p, 'projetos');
  for (const [w, h, zoom] of [[1024, 768, 1], [1280, 900, 2], [1280, 900, 4]]) {
    await a.app.evaluate(({ BrowserWindow }, [largura, altura, z]) => { const j = BrowserWindow.getAllWindows()[0]; j.setSize(largura, altura); j.webContents.setZoomFactor(z); }, [w, h, zoom]);
    await p.waitForFunction((z) => window.innerWidth <= 1280 / z + 16, zoom); await p.waitForTimeout(300);
    assert.equal(await estoura(p), false, `${w}x${h} zoom ${zoom}`);
  }
});
