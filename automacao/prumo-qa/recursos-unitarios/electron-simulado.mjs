// Electron simulado para os testes que rodam em Node puro (sem janela). Só existe porque módulos consolidados do produto
// juntam funções puras e funções do Electron no mesmo arquivo. Carregar o módulo funciona; usar uma API que tocaria o
// sistema (caminhos, janelas, diálogos, cofre, abrir links) falha com LAB_ELECTRON_SIMULADO, sem efeito nenhum.
// Dentro do Electron real (testes de janela) o hook não usa este arquivo.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const indisponivel = (api) => () => { throw new Error('LAB_ELECTRON_SIMULADO: ' + api + ' não existe fora do Electron'); };
const versaoDoProduto = () => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).version;

export const app = {
  isPackaged: false,
  getVersion: versaoDoProduto,
  getPath: indisponivel('app.getPath'),
  setPath: indisponivel('app.setPath'),
  on() { return app; },
  whenReady: () => new Promise(() => {}),
  requestSingleInstanceLock: () => false,
  setLoginItemSettings: indisponivel('app.setLoginItemSettings'),
  quit: indisponivel('app.quit')
};
export const safeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: indisponivel('safeStorage.encryptString'),
  decryptString: indisponivel('safeStorage.decryptString')
};
export class Notification { static isSupported() { return false; } constructor() { indisponivel('Notification')(); } }
export class BrowserWindow { static getAllWindows() { return []; } constructor() { indisponivel('BrowserWindow')(); } }
export class WebContentsView { constructor() { indisponivel('WebContentsView')(); } }
export class Tray { constructor() { indisponivel('Tray')(); } }
export const dialog = { showMessageBox: indisponivel('dialog.showMessageBox'), showOpenDialog: indisponivel('dialog.showOpenDialog'), showSaveDialog: indisponivel('dialog.showSaveDialog') };
export const shell = { openExternal: indisponivel('shell.openExternal'), showItemInFolder: indisponivel('shell.showItemInFolder') };
export const Menu = { buildFromTemplate: indisponivel('Menu.buildFromTemplate'), setApplicationMenu: indisponivel('Menu.setApplicationMenu') };
export const nativeImage = { createFromPath: indisponivel('nativeImage.createFromPath') };
// Em Node, `import electron from 'electron'` é o caminho do executável (as janelas de teste abrem o Electron por ele).
// 'electron/index.js' não passa pelo hook, que só desvia o especificador 'electron'.
export default createRequire(path.join(process.cwd(), 'package.json'))('electron/index.js');
