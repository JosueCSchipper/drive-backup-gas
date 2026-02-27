/**
 * Drive-BackUp v0.94
 * Motor de Respaldo Estructural y Preservación de Lógica para Google Drive.
 * Desarrollado por Josué C. Schipper.
 */

/**
 * ==============================================================================
 * 1. CONFIGURACIÓN Y CONSTANTES GLOBALES
 * ==============================================================================
 */

const LOG_BATCH_SIZE = 20; 
const TIME_LIMIT_SECONDS = 330; 

const MIME_TYPE_MAP = {
  'Documentos': [
    'application/vnd.google-apps.document', 'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'
  ],
  'Hojas de calculo': [
    'application/vnd.google-apps.spreadsheet', 'application/vnd.ms-excel', 
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'
  ],
  'Presentaciones': [
    'application/vnd.google-apps.presentation', 'application/vnd.ms-powerpoint', 
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ],
  'Imagenes': [
    'image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'
  ],
  'Videos': [
    'video/mp4', 'video/x-matroska', 'video/quicktime', 'video/x-msvideo'
  ],
  'Accesos directos': [
    'application/vnd.google-apps.shortcut'
  ],
  'Otros': [] 
};

/**
 * ==============================================================================
 * 2. MOTOR PRINCIPAL (ORQUESTACIÓN)
 * ==============================================================================
 */

function backupDriveFolder() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName("Drive-BackUp");
  if (!configSheet) return console.error('Error: Hoja "Drive-BackUp" no encontrada.');

  const logSheet = getLogSheet(ss);
  const startTime = new Date();
  
  // NUEVA MEMORIA: Cargamos los IDs desde la Columna F de Logs
  const memoriaHistorica = cargarIdsDesdeLogs(logSheet);
  const logBuffer = [];

  try {
    logSheet.appendRow([formatearFecha(startTime), "Inicio de ciclo de ejecución...", "SISTEMA", "INICIO", "", "", ""]);
    SpreadsheetApp.flush();

    const config = leerConfiguracionDelPanel(configSheet);
    const destinationFolder = DriveApp.getFolderById(config.destinoId);

    const runtimeState = {
      startTime,
      config,
      logSheet,
      logBuffer,
      processedGlobal: memoriaHistorica, // El script "recuerda" todo lo que está en Logs
      nombresEnDestino: new Set() 
    };

    for (const origenId of config.origenIds) {
      const originFolder = DriveApp.getFolderById(origenId);
      ejecutarCopiaRecursiva(originFolder, destinationFolder, runtimeState);
    }

    logBuffer.push([formatearFecha(new Date()), "Backup completado", "SISTEMA", "FINALIZADO", "No quedan archivos pendientes", "", ""]);

  } catch (error) {
    if (error.message === "TIME_LIMIT_REACHED") {
      logBuffer.push([formatearFecha(new Date()), "Ejecución pausada", "SISTEMA", "PAUSADO", `Límite de ${TIME_LIMIT_SECONDS}s alcanzado`, "", ""]);
    } else {
      console.error(`Error crítico: ${error.toString()}`);
    }
  } finally {
    if (logBuffer.length > 0) flushLogs(logSheet, logBuffer);
    console.log(`Ejecución terminada en ${((new Date() - startTime) / 1000).toFixed(2)}s.`);
  }
}

function ejecutarCopiaRecursiva(origen, destino, estado) {
  if ((new Date() - estado.startTime) / 1000 > TIME_LIMIT_SECONDS) throw new Error("TIME_LIMIT_REACHED");

  const nombresExistentes = new Set();
  const archivosDestino = destino.getFiles();
  while (archivosDestino.hasNext()) nombresExistentes.add(archivosDestino.next().getName());
  estado.nombresEnDestino = nombresExistentes;

  const archivos = origen.getFiles();
  while (archivos.hasNext()) {
    const file = archivos.next();
    const fileId = file.getId();
    
    // Si el ID ya está en la memoria de Logs, lo saltamos
    if (estado.processedGlobal.has(fileId)) continue;

    const evaluation = evaluarCopia(file, estado);
    let idCopia = "";

    if (evaluation.shouldCopy) {
      const copy = evaluation.targetFile.makeCopy(evaluation.targetFile.getName(), destino);
      idCopia = copy.getId();
    }
    
    estado.logBuffer.push([
      formatearFecha(new Date()),
      evaluation.targetFile.getName(),
      obtenerCategoria(evaluation.targetFile),
      evaluation.status,
      evaluation.reason,
      evaluation.targetFile.getId(), // Columna F: ID Original
      idCopia
    ]);

    estado.processedGlobal.add(fileId);
    if (estado.logBuffer.length >= LOG_BATCH_SIZE) flushLogs(estado.logSheet, estado.logBuffer);
  }

  const subFolders = origen.getFolders();
  while (subFolders.hasNext()) {
    const subFolder = subFolders.next();
    const subDestFolder = obtenerOCrearCarpeta(destino, subFolder.getName());
    ejecutarCopiaRecursiva(subFolder, subDestFolder, estado);
  }
}

/**
 * ==============================================================================
 * 3. CAPA DE LÓGICA Y EVALUACIÓN
 * ==============================================================================
 */

function evaluarCopia(file, estado) {
  let targetFile = file;

  if (estado.config.filtros.copiarOriginal && file.getMimeType() === 'application/vnd.google-apps.shortcut') {
    try {
      const targetId = file.getTargetId();
      if (!targetId) return { shouldCopy: false, status: "Excluido", reason: "Acceso roto", targetFile: file };
      targetFile = DriveApp.getFileById(targetId);
      if (estado.processedGlobal.has(targetFile.getId())) {
        return { shouldCopy: false, status: "Omitido", reason: "Original ya procesado", targetFile };
      }
    } catch (e) {
      return { shouldCopy: false, status: "Excluido", reason: "Acceso denegado", targetFile: file };
    }
  }

  const finalId = targetFile.getId();
  const finalName = targetFile.getName();

  // Verificación contra nombres físicos ya existentes en la carpeta destino
  if (estado.nombresEnDestino.has(finalName)) return { shouldCopy: false, status: "Omitido", reason: "Ya existe (Nombre)", targetFile };

  if (estado.config.filtros.soloPropios && targetFile.getOwner().getEmail() !== estado.config.filtros.usuario) {
    return { shouldCopy: false, status: "Excluido", reason: "No es propio", targetFile };
  }
  
  if (!verificarFiltrosCategoria(targetFile, estado.config.filtros)) {
    return { shouldCopy: false, status: "Excluido", reason: "Filtrado por categoría", targetFile: targetFile };
  }

  return { shouldCopy: true, status: "Copiado", reason: "", targetFile };
}

function verificarFiltrosCategoria(archivo, { incluir, excluir }) {
  const cat = obtenerCategoria(archivo);
  if (incluir.size > 0) return incluir.has(cat);
  return !excluir.has(cat);
}

/**
 * ==============================================================================
 * 4. UTILIDADES DE SISTEMA Y UI
 * ==============================================================================
 */

function leerConfiguracionDelPanel(sheet) {
  const config = {
    destinoId: sheet.getRange('B4').getValue(),
    origenIds: sheet.getRange('B8:B14').getValues().flat().filter(String),
    filtros: {
      soloPropios: sheet.getRange('G4').isChecked(),
      copiarOriginal: sheet.getRange('G5').isChecked(),
      usuario: Session.getActiveUser().getEmail()
    }
  };

  const categorias = sheet.getRange('E8:E14').getValues().flat();
  const soloBoxes = sheet.getRange('F8:F14').getValues(); 
  const sinBoxes = sheet.getRange('G8:G14').getValues();  

  const { incluir, excluir } = categorias.reduce((acc, cat, idx) => {
    const nombreLimpio = cat.toString().trim();
    // CAMBIO CLAVE: Guardamos el NOMBRE de la categoría, no los MIME types
    if (soloBoxes[idx][0]) acc.incluir.add(nombreLimpio);
    if (sinBoxes[idx][0]) acc.excluir.add(nombreLimpio);
    return acc;
  }, { incluir: new Set(), excluir: new Set() });

  config.filtros.incluir = incluir;
  config.filtros.excluir = excluir;
  return config;
}

function flushLogs(hoja, buffer) {
  if (buffer.length === 0) return;
  hoja.getRange(hoja.getLastRow() + 1, 1, buffer.length, buffer[0].length).setValues(buffer);
  buffer.length = 0;
}

function cargarIdsDesdeLogs(logSheet) {
  const lastRow = logSheet.getLastRow();
  if (lastRow <= 1) return new Set();
  // Columna F (ID Original)
  const data = logSheet.getRange(2, 6, lastRow - 1, 1).getValues();
  return new Set(data.flat().filter(String)); 
}

function obtenerCategoria(file) {
  const mime = file.getMimeType();
  for (const [cat, mimes] of Object.entries(MIME_TYPE_MAP)) {
    if (mimes.some(m => mime.startsWith(m))) return cat;
  }
  return "Otros"; //
}

function getLogSheet(ss) {
  let sheet = ss.getSheetByName("Logs");
  if (!sheet) {
    sheet = ss.insertSheet("Logs");
    const headers = [["Timestamp", "Nombre Original", "Tipo", "Estado", "Motivo", "ID Original", "ID Copia"]];
    sheet.getRange("A1:G1").setValues(headers).setFontWeight("bold");
  }
  return sheet;
}

function formatearFecha(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
}

function obtenerOCrearCarpeta(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

/**
 * Función vinculada al botón "Resetear Cache" (ahora Resetear Sistema)
 */
function reset() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName("Drive-BackUp");
  const logSheet = ss.getSheetByName("Logs");
  const ui = SpreadsheetApp.getUi();

  const respuesta = ui.alert('⚠️ CUIDADO', '¿Estás seguro de que querés borrar los logs y resetear los filtros?', ui.ButtonSet.YES_NO);
  if (respuesta !== ui.Button.YES) return;

  if (logSheet && logSheet.getLastRow() > 1) {
    logSheet.getRange(2, 1, logSheet.getLastRow() - 1, logSheet.getLastColumn()).clearContent();
  }
  configSheet.getRange('F8:G14').uncheck(); //
  configSheet.getRange('G4:G5').uncheck();  //
  
  // Limpiamos PropertiesService por si quedó algo viejo
  PropertiesService.getScriptProperties().deleteProperty('archivosProcesados');

  ss.toast('Sistema reseteado: Logs limpios y filtros desmarcados.', 'Éxito');
}

/**
 * UTILERÍA: Limpieza y Estadísticas
 */
function limpiezaFinalOptimizada() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = ss.getSheetByName("Drive-BackUp");
  try {
    const destinoId = config.getRange('B4').getValue(); 
    const folder = DriveApp.getFolderById(destinoId);
    ss.toast('Iniciando auditoría de contenido...', 'Progreso');
    
    const stats = recursiveClean(folder);
    folder.setDescription(`Auditado: ${stats.count} archivos | ${(stats.size / 1e6).toFixed(2)} MB`);
    ss.toast('Limpieza y descripción completada.', 'Éxito');
  } catch (e) {
    ss.toast(e.message, 'Error');
  }
}

function recursiveClean(folder) {
  let count = 0, size = 0;
  const subs = folder.getFolders();
  while (subs.hasNext()) {
    const s = recursiveClean(subs.next());
    count += s.count; size += s.size;
  }
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    count++; size += f.getSize();
  }
  if (count === 0 && folder.getParents().hasNext()) folder.setTrashed(true);
  return { count, size };
}