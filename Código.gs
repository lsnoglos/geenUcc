//CONFIGURACIÓN
const SPREADSHEET_ID = '1TIKaqnmTsKKvNSHja2xxgv2Q87UB2Eh2l6DvTgMkUzE';
const FOLDER_ID = '1LzHgraT5VU9uLWcp3RczHcYEPXs-2W0a';
const PLANTS_DATA_SHEET_NAME = 'plantas';
const APP_NAME = 'UNIVERSIDADES VERDES UCC';
const DEFAULT_LOGO_ID = '1gahFroR2tOmSjlIzRy_qxXMbQdIpH79C';
// Gemini is deliberately configured through Script Properties, never client-side.
// Set GEMINI_API_KEY in Project Settings > Script properties before using these features.
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

const HEADERS = {
  ID: 'id_planta',
  NOMBRE_COMUN: 'nombre_comun',
  NOMBRE_CIENTIFICO: 'nombre_cientifico',
  FAMILIA: 'familia',
  UBICACION: 'ubicacion',
  LATITUD: 'latitud',
  LONGITUD: 'longitud',
  USO: 'uso',
  URLS_IMAGENES: 'urls_imagenes',
  FECHA: 'fecha_registro',
  REGISTRADO_POR: 'registrado_por',
  COLABORADOR: 'colaborador',
  URL_QR: 'url_qr'
};

//Rutas y vistas
function doGet(e) {
  const webAppUrl = ScriptApp.getService().getUrl();

  if (e && e.parameter && e.parameter.logout === 'true') {
    const template = HtmlService.createTemplateFromFile('login');
    template.errorMessage = 'Has cerrado sesión exitosamente.';
    const authUrl = `https://accounts.google.com/AccountChooser?continue=${encodeURIComponent(webAppUrl)}`;
    template.loginUrl = authUrl;
    return template.evaluate().setTitle(`Bienvenido a ${APP_NAME}`).addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (e && e.parameter && e.parameter.page == 'view') {
    let template = HtmlService.createTemplateFromFile('view');
    template.plantId = e.parameter.plantId || "";
    return template.evaluate()
      .setTitle(APP_NAME)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  const userAccess = checkUserAccess();

  if (userAccess.isAllowed) {
    const userEmail = Session.getActiveUser().getEmail();
    const logoutUrl = `${webAppUrl}?logout=true`;
    const changeAccountUrl = `https://accounts.google.com/AccountChooser?continue=${encodeURIComponent(webAppUrl)}`;

    if (e && e.parameter && e.parameter.page == 'register') {
      let template = HtmlService.createTemplateFromFile('register');
      template.userEmail = userEmail;
      template.dashboardUrl = webAppUrl;
      template.logoutUrl = logoutUrl;
      template.changeAccountUrl = changeAccountUrl;
      return template.evaluate().setTitle(`Registrar Planta - ${APP_NAME}`).addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    let template = HtmlService.createTemplateFromFile('dashboard');
    template.userEmail = userEmail;
    template.registerUrl = `${webAppUrl}?page=register`;
    template.logoutUrl = logoutUrl;
    template.changeAccountUrl = changeAccountUrl;
    return template.evaluate().setTitle(`Dashboard - ${APP_NAME}`).addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  const template = HtmlService.createTemplateFromFile('login');

  if (userAccess.reason === 'INVALID_DOMAIN') {
    template.errorMessage = 'Acceso denegado. Tu correo no tiene acceso';
  }

  const authUrl = `https://accounts.google.com/AccountChooser?continue=${encodeURIComponent(webAppUrl)}`;
  template.loginUrl = authUrl;

  return template.evaluate().setTitle(`Bienvenido a ${APP_NAME}`).addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

//cerrar sesión
function softLogout() {
  const webAppUrl = ScriptApp.getService().getUrl();
  CacheService.getUserCache().put('isLoggedIn', 'false', 21600);

  return `${webAppUrl}?logout=true`;
}

//iniciar sesión
function softLogin() {
  CacheService.getUserCache().put('isLoggedIn', 'true', 21600);
  return ScriptApp.getService().getUrl();
}

//verificar acceso
function checkUserAccess() {
  try {
    const email = Session.getActiveUser().getEmail();
    if (!email) {
      return { isAllowed: false, reason: 'NO_SESSION' };
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const emailSheet = ss.getSheetByName('emails');
    if (!emailSheet) {
      return { isAllowed: false, reason: 'NO_EMAILS_SHEET' };
    }

    const data = emailSheet.getDataRange().getValues();
    const headers = data.shift().map(h => String(h).trim().toLowerCase());
    const adminIdx = headers.indexOf('correo_admin');
    const collabIdx = headers.indexOf('colaborador');

    if (adminIdx === -1 || collabIdx === -1) {
      return { isAllowed: false, reason: 'INVALID_HEADERS' };
    }

    const target = email.trim().toLowerCase();

    // si es admin
    const isAdmin = data.some(r => String(r[adminIdx] || '').trim().toLowerCase() === target);

    // si es colaborador
    const matchRow = data.find(r => String(r[collabIdx] || '').trim().toLowerCase() === target);

    if (!isAdmin && !matchRow) {
      return { isAllowed: false, reason: 'NOT_IN_WHITELIST' };
    }

    Logger.log("Buscando correo: " + target);
    Logger.log("Fila encontrada: " + JSON.stringify(matchRow));

    const cache = CacheService.getUserCache();
    cache.put('isLoggedIn', 'true', 21600);
    cache.put('currentUser', target, 21600);
    cache.put('isAdmin', isAdmin ? 'true' : 'false', 21600);

    if (isAdmin) {
      cache.put('currentAdmin', target, 21600); //admin
      return { isAllowed: true, isAdmin: true, adminEmail: target };
    } else {
      const adminEmail = String(matchRow[adminIdx] || '').trim().toLowerCase();
      cache.put('currentAdmin', adminEmail, 21600);
      return { isAllowed: true, isAdmin: false, adminEmail: adminEmail, collaborator: target };
    }

  } catch (e) {
    Logger.log("Error en checkUserAccess: " + e.message);
    return { isAllowed: false, reason: 'ERROR', message: e.message };
  }
}

//obtener tus plantas
function getMyPlants() {
  try {
    const email = Session.getActiveUser().getEmail();
    if (!email) {
      return { success: false, error: "No se pudo identificar al usuario." };
    }
    return getPlantsForUser(email);
  } catch (e) {
    return { success: false, error: "No se pudo obtener la sesión del usuario." };
  }
}

function getPlantsForUser(userEmail) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const plantSheet = ss.getSheetByName(PLANTS_DATA_SHEET_NAME);
    if (!plantSheet) {
      return { success: false, error: `La hoja "${PLANTS_DATA_SHEET_NAME}" no fue encontrada.` };
    }

    const targetEmail = userEmail.trim().toLowerCase();
    const allData = plantSheet.getDataRange().getValues();

    if (allData.length < 2) {
      return { success: true, data: [] };
    }

    const headerRow = allData.shift();
    const headers = headerRow.map(h => String(h || '').trim().toLowerCase());
    const emailIdx = headers.indexOf('registrado_por');

    if (emailIdx === -1) {
      return { success: false, error: "No se encontró la columna 'registrado_por'." };
    }

    const userPlantRows = allData.filter(row => {
      const sheetEmail = (row[emailIdx] || '').toString().trim().toLowerCase();
      return sheetEmail === targetEmail;
    });

    const plantObjects = userPlantRows.map(row => {
      try {
        const plantObject = {};
        headers.forEach((key, index) => {
          const value = row[index];
          if (key === 'urls_imagenes') {
            try {
              plantObject[key] = JSON.parse(value);
            } catch (e) {
              plantObject[key] = value ? [String(value)] : [];
            }
          } else if (key === 'fecha_registro') {
            plantObject[key] = (value instanceof Date)
              ? Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss")
              : String(value);
          } else {
            plantObject[key] = value;
          }
        });

        plantObject.thumbnailBase64 = null;
        if (Array.isArray(plantObject.urls_imagenes) && plantObject.urls_imagenes.length > 0) {
          const firstImageUrl = plantObject.urls_imagenes[0];
          try {
            const match = firstImageUrl.match(/[-\w]{25,}/);
            if (match) {
              const fileId = match[0];
              const file = DriveApp.getFileById(fileId);
              const blob = file.getBlob();
              plantObject.thumbnailBase64 = null;
            }
          } catch (e) {
            Logger.log(`No se pudo generar la miniatura para la imagen ${firstImageUrl}: ${e.message}`);
          }
        }

        return plantObject;
      } catch (e) {
        Logger.log(`Error procesando la fila: [${row.join(', ')}]. Error: ${e.message}`);
        return null;
      }
    }).filter(plant => plant !== null);

    return { success: true, data: plantObjects.reverse() };

  } catch (e) {
    Logger.log(`ERROR GRAVE en getPlantsForUser: ${e.message} ${e.stack}`);
    return { success: false, error: `Ocurrió un error en el servidor: ${e.message}` };
  }
}

function getPlantThumbnail(plantId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(PLANTS_DATA_SHEET_NAME);
    const allData = sheet.getDataRange().getValues();
    const headers = allData.shift().map(h => String(h).trim().toLowerCase());

    const idIndex = headers.indexOf('id_planta');
    const imgIndex = headers.indexOf('urls_imagenes');

    const row = allData.find(r => String(r[idIndex]).trim() === String(plantId).trim());
    if (!row) return null;

    let urls = [];
    try {
      urls = JSON.parse(row[imgIndex]);
    } catch (e) {
      if (row[imgIndex]) urls = [row[imgIndex]];
    }

    if (urls.length === 0) return null;

    const match = urls[0].match(/[-\w]{25,}/);
    if (!match) return null;

    const fileId = match[0];
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    return `data:${blob.getContentType()};base64,${Utilities.base64Encode(blob.getBytes())}`;

  } catch (e) {
    Logger.log("Error en getPlantThumbnail: " + e.message);
    return null;
  }
}

function deletePlantLogically(plantId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(PLANTS_DATA_SHEET_NAME);
    const data = sheet.getDataRange().getValues();

    if (data.length < 2) {
      return { success: false, error: "No hay datos en la hoja." };
    }

    const headers = data.shift().map(h => String(h).trim().toLowerCase());
    const idIndex = headers.indexOf('id_planta');
    const emailIndex = headers.indexOf('registrado_por');

    if (idIndex === -1 || emailIndex === -1) {
      return { success: false, error: "Columnas necesarias no encontradas." };
    }

    // Buscar fila
    const rowIdx = data.findIndex(r => String(r[idIndex]).trim() === String(plantId).trim());
    if (rowIdx === -1) return { success: false, error: "Planta no encontrada." };

    // No se borra físicamente
    const originalEmail = data[rowIdx][emailIndex];
    if (!originalEmail.toString().endsWith('_borrado')) {
      sheet.getRange(rowIdx + 2, emailIndex + 1).setValue(originalEmail + '_borrado');
    }

    return { success: true };

  } catch (e) {
    return { success: false, error: e.message };
  }
}


/****************************************************************
 * LÓGICA DE PLANTAS Y ARCHIVOS
 ****************************************************************/
function getOrCreateFolder(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(folderName);
}

function generatePlantId(name) {
  if (!name) return '';
  let id = name.toLowerCase();
  id = id.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  id = id.replace(/[^a-z0-9]+/g, "_");
  id = id.replace(/^_+|_+$/g, "");
  id += "_" + new Date().getTime();
  return id;
}

function registerPlantData(formObject) {
  try {
    const cache = CacheService.getUserCache();
    const userEmail = cache.get('currentUser');   // quien registró
    const adminEmail = cache.get('currentAdmin'); // dueño real

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const plantSheet = ss.getSheetByName(PLANTS_DATA_SHEET_NAME);
    const plantName = formObject.nombre_cientifico;

    const plantId = generatePlantId(plantName);

    let ubicacionTexto = formObject.ubicacion?.trim();
    let lat = formObject.latitud?.trim() || '';
    let lon = formObject.longitud?.trim() || '';

    if (!ubicacionTexto) {

      if (lat && lon) {
        ubicacionTexto = `Coordenadas: ${lat}, ${lon}`;
      } else {
        ubicacionTexto = '';
        lat = '';
        lon = '';
      }
    }

    const newRow = [
      plantId,
      formObject.nombre_comun,
      plantName,
      formObject.familia,
      ubicacionTexto,
      lat,
      lon,
      formObject.uso,
      "[]",
      new Date(),
      adminEmail,
      userEmail,
      ""
    ];

    plantSheet.appendRow(newRow);

    const plantViewUrl = `${ScriptApp.getService().getUrl()}?page=view&plantId=${plantId}`;
    return { success: true, plantId: plantId, plantViewUrl: plantViewUrl };

  } catch (error) {
    Logger.log(error);
    return { success: false, message: 'Error al registrar datos: ' + error.toString() };
  }
}

function getDefaultLogoBase64() {
  try {
    if (!DEFAULT_LOGO_ID) return { success: false, error: "ID del logo no definido." };
    const file = DriveApp.getFileById(DEFAULT_LOGO_ID);
    const blob = file.getBlob();
    const base64 = `data:${blob.getContentType()};base64,${Utilities.base64Encode(blob.getBytes())}`;
    return { success: true, base64: base64 };
  } catch (e) {
    Logger.log("Error al obtener logo: " + e.message);
    return { success: false, error: e.message };
  }
}

function savePlantFiles(plantId, qrBase64, imagesData) {
  const createdFiles = [];
  let sheetUpdate = null;
  try {
    if (!isNonEmptyString_(plantId)) throw new Error('No se recibió un ID de planta válido.');
    if (!Array.isArray(imagesData)) throw new Error('Las fotografías deben enviarse como una lista.');

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const plantSheet = ss.getSheetByName(PLANTS_DATA_SHEET_NAME);
    if (!plantSheet) throw new Error('No se encontró la hoja de plantas.');
    const data = plantSheet.getDataRange().getValues();
    if (data.length < 2) throw new Error('No hay registros de plantas para actualizar.');
    const headers = data.shift().map(function(header) { return String(header).trim().toLowerCase(); });
    const idColIdx = headers.indexOf(HEADERS.ID);
    const imagesColIdx = headers.indexOf(HEADERS.URLS_IMAGENES);
    const qrColIdx = headers.indexOf(HEADERS.URL_QR);
    if (idColIdx === -1 || imagesColIdx === -1 || qrColIdx === -1) throw new Error('Faltan columnas necesarias para guardar archivos.');

    const rowIdx = data.findIndex(function(row) { return String(row[idColIdx]).trim() === String(plantId).trim(); });
    if (rowIdx === -1) throw new Error("No se encontró la planta con ID: " + plantId);

    const plantRow = data[rowIdx];
    const userEmail = plantRow[headers.indexOf(HEADERS.REGISTRADO_POR)];
    const plantName = plantRow[headers.indexOf(HEADERS.NOMBRE_CIENTIFICO)];
    const comunPlantName = plantRow[headers.indexOf(HEADERS.NOMBRE_COMUN)];
    if (!isNonEmptyString_(userEmail) || !isNonEmptyString_(plantName)) throw new Error('El registro no tiene coordinador o nombre científico válidos.');

    // Validate and decode every payload before Drive is changed. registrado_por is the
    // coordinator/owner selected by registerPlantData; colaborador is intentionally not used.
    const imageBlobs = imagesData.map(function(fileData, index) {
      return dataUrlToBlob_(fileData, 'fotografía ' + (index + 1), false);
    });
    const qrBlob = dataUrlToBlob_(qrBase64, 'código QR', true);
    Logger.log('savePlantFiles: plantId=%s, images=%s, qrExists=%s, qrMime=%s, qrBytes=%s', plantId, imageBlobs.length, !!qrBase64, qrBlob.getContentType(), qrBlob.getBytes().length);

    const rootFolder = DriveApp.getFolderById(FOLDER_ID);
    const userFolder = getOrCreateFolder(rootFolder, userEmail);
    const plantFolder = getOrCreateFolder(userFolder, plantName);

    // All inputs are valid before the first file is created. If a later Drive/Sheets
    // operation fails, files created by this invocation are removed below.
    let imageURLs = [];
    imageBlobs.forEach(function(blob) {
      const newFile = plantFolder.createFile(blob).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      createdFiles.push(newFile);
      const imageUrl = 'https://drive.google.com/uc?export=view&id=' + newFile.getId();
      if (!isHttpUrl_(imageUrl)) throw new Error('Drive devolvió una URL de imagen inválida.');
      imageURLs.push(imageUrl);
    });

    qrBlob.setName('qr_' + plantId + '.png');
    const qrFile = plantFolder.createFile(qrBlob).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    createdFiles.push(qrFile);
    const qrUrl = qrFile.getUrl();
    if (!isHttpUrl_(qrUrl)) throw new Error('Drive devolvió una URL de QR inválida.');
    Logger.log('savePlantFiles: plantId=%s, createdFiles=%s, qrId=%s, qrUrl=%s', plantId, createdFiles.length, qrFile.getId(), qrUrl);

    // Actualizar hoja de cálculo
    const sheetRowIndex = rowIdx + 2;
    sheetUpdate = {
      sheet: plantSheet, row: sheetRowIndex, qrColumn: qrColIdx + 1, imagesColumn: imagesColIdx + 1,
      previousQr: plantRow[qrColIdx], previousImages: plantRow[imagesColIdx]
    };
    plantSheet.getRange(sheetRowIndex, qrColIdx + 1).setValue(qrUrl);
    plantSheet.getRange(sheetRowIndex, imagesColIdx + 1).setValue(JSON.stringify(imageURLs));

    // A mail quota failure must not undo a complete Drive/Sheets operation.
    let emailWarning = '';
    try {
      MailApp.sendEmail({
        to: userEmail,
        subject: `Código QR para la planta: ${comunPlantName}`,
        htmlBody: `Hola,<br><br>Se ha generado un nuevo código QR para tu planta <b>${comunPlantName}</b>.<br><br>Saludos.`,
        attachments: [qrBlob]
      });
    } catch (mailError) {
      emailWarning = 'Los archivos se guardaron, pero no fue posible enviar el correo.';
      Logger.log('savePlantFiles: no se pudo enviar correo para plantId=%s: %s', plantId, mailError);
    }

    return { success: true, imageCount: imageURLs.length, qrUrl: qrUrl, warning: emailWarning };
  } catch (error) {
    Logger.log('savePlantFiles failed for plantId=%s: %s', plantId, error && error.stack || error);
    if (sheetUpdate) {
      try {
        sheetUpdate.sheet.getRange(sheetUpdate.row, sheetUpdate.qrColumn).setValue(sheetUpdate.previousQr);
        sheetUpdate.sheet.getRange(sheetUpdate.row, sheetUpdate.imagesColumn).setValue(sheetUpdate.previousImages);
      } catch (rollbackSheetError) {
        Logger.log('No se pudo revertir Sheets para plantId=%s: %s', plantId, rollbackSheetError);
      }
    }
    createdFiles.forEach(function(file) {
      try { file.setTrashed(true); } catch (cleanupError) { Logger.log('No se pudo revertir archivo %s: %s', file.getId(), cleanupError); }
    });
    return { success: false, message: 'Error al guardar archivos: ' + error.toString() };
  }
}

/****************************************************************
 * MODO DIAGNÓSTICO TEMPORAL
 * Estas funciones no sustituyen savePlantFiles(). Nunca envían correo y
 * escriben exclusivamente sobre un registro/una carpeta TEST_DIAGNOSTICO.
 ****************************************************************/
function diagnosticRegisterPlantData() {
  const stamp = new Date().getTime();
  // Se reutiliza intencionalmente el registro normal para comprobar ese paso
  // sin Gemini, con valores inequívocamente temporales.
  return registerPlantData({
    nombre_comun: 'TEST_DIAGNOSTICO',
    nombre_cientifico: 'TEST_DIAGNOSTICO_' + stamp,
    familia: 'TEST_DIAGNOSTICO', uso: 'Prueba temporal de diagnóstico',
    ubicacion: 'TEST_DIAGNOSTICO', latitud: '', longitud: ''
  });
}

function diagnosticSavePlantFiles(plantId, qrBase64, imagesData) {
  return diagnosticSavePlantFiles_(plantId, qrBase64, imagesData, true);
}

/**
 * Prueba aislada de archivos privados. Solo acepta registros TEST_DIAGNOSTICO,
 * no envía correo y no cambia savePlantFiles().
 */
function diagnosticSavePlantFilesPrivate(plantId, qrBase64, imagesData) {
  return diagnosticSavePlantFiles_(plantId, qrBase64, imagesData, false);
}

function diagnosticSavePlantFiles_(plantId, qrBase64, imagesData, testSetSharing) {
  const result = {
    success: false, failedStep: '', message: '', steps: [], plantId: plantId || '', plantViewUrl: '',
    imageFileId: '', imageUrl: '', qrFileId: '', qrUrl: '', imageBase64Length: 0,
    qrBase64Length: typeof qrBase64 === 'string' ? qrBase64.length : 0, imageMimeType: '',
    qrMimeType: '', imageBlobBytes: 0, qrBlobBytes: 0, coordinatorEmail: '', folderName: '',
    plantName: '', sheetRow: 0, error: {}
  };
  const names = {
    9: 'QR Base64 recibido por Apps Script', 10: 'Fotografía convertida correctamente a Blob',
    11: 'QR convertido correctamente a Blob', 12: 'Spreadsheet localizado',
    13: 'Registro de planta localizado', 14: 'FOLDER_ID localizado',
    15: 'Carpeta del coordinador localizada/creada', 16: 'Carpeta de la planta localizada/creada',
    '17A': 'DriveApp.createFile(imageBlob)', '17B': 'imageFile.setSharing(...)', 18: 'ID de la fotografía obtenido',
    19: 'QR guardado en Drive', 20: 'ID del QR obtenido',
    21: 'URL de la fotografía generada', 22: 'URL del QR generada',
    23: 'urls_imagenes actualizado en Sheets', 24: 'url_qr actualizado en Sheets'
  };
  let currentStep = 9;
  function log(step, details) { Logger.log('[DIAGNOSTICO][%s] %s', ('0' + step).slice(-2), details); }
  function pass(step, details) { result.steps.push({ step: step, name: names[step], status: 'success', details: details }); log(step, 'OK: ' + details); }
  function fail(step, error) {
    const text = error && error.message || String(error);
    result.steps.push({ step: step, name: names[step], status: 'error', details: text });
    result.failedStep = step + '. ' + names[step]; result.message = text;
    result.error = { message: text, stack: error && error.stack || '', toString: error && error.toString ? error.toString() : String(error) };
    log(step, 'ERROR: ' + result.error.toString + ' ' + result.error.stack);
  }
  try {
    if (!Array.isArray(imagesData) || imagesData.length !== 1) throw new Error('El diagnóstico requiere exactamente una fotografía.');
    const image = imagesData[0] || {};
    result.imageBase64Length = typeof image.base64 === 'string' ? image.base64.length : 0;
    result.imageMimeType = image.mimeType || '';
    log(9, 'Recibido: plantId=' + plantId + ', qrLength=' + result.qrBase64Length + ', images=1, imageName=' + (image.name || '') + ', imageMime=' + result.imageMimeType + ', imageLength=' + result.imageBase64Length);
    if (typeof qrBase64 !== 'string' || !/^data:image\/png;base64,/i.test(qrBase64)) throw new Error('qrBase64 no existe o no comienza con data:image/png;base64,.');
    result.qrMimeType = 'image/png'; pass(9, 'QR recibido; longitud=' + result.qrBase64Length + ', MIME=image/png');

    currentStep = 10; const imageBlob = dataUrlToBlob_(image, 'fotografía de diagnóstico', false);
    result.imageBlobBytes = imageBlob.getBytes().length; pass(10, 'Blob de foto: MIME=' + imageBlob.getContentType() + ', bytes=' + result.imageBlobBytes);
    currentStep = 11; const qrBlob = dataUrlToBlob_(qrBase64, 'QR de diagnóstico', true);
    result.qrBlobBytes = qrBlob.getBytes().length; result.qrMimeType = qrBlob.getContentType(); pass(11, 'Blob QR: MIME=' + result.qrMimeType + ', bytes=' + result.qrBlobBytes);

    currentStep = 12; const ss = SpreadsheetApp.openById(SPREADSHEET_ID); const sheet = ss.getSheetByName(PLANTS_DATA_SHEET_NAME);
    if (!sheet) throw new Error('No existe la hoja ' + PLANTS_DATA_SHEET_NAME + '.'); pass(12, 'Spreadsheet=' + SPREADSHEET_ID + ', hoja=' + PLANTS_DATA_SHEET_NAME);
    currentStep = 13; const values = sheet.getDataRange().getValues(); const headers = values.shift().map(function(h) { return String(h).trim().toLowerCase(); });
    const idCol = headers.indexOf(HEADERS.ID), imagesCol = headers.indexOf(HEADERS.URLS_IMAGENES), qrCol = headers.indexOf(HEADERS.URL_QR);
    if (idCol < 0 || imagesCol < 0 || qrCol < 0) throw new Error('No se localizaron las columnas requeridas: id_planta, urls_imagenes, url_qr.');
    const rowIndex = values.findIndex(function(row) { return String(row[idCol]).trim() === String(plantId).trim(); }); if (rowIndex < 0) throw new Error('No se localizó el registro temporal con ID ' + plantId + '.');
    const row = values[rowIndex]; result.sheetRow = rowIndex + 2; result.coordinatorEmail = String(row[headers.indexOf(HEADERS.REGISTRADO_POR)] || ''); result.plantName = String(row[headers.indexOf(HEADERS.NOMBRE_CIENTIFICO)] || '');
    if (!/^TEST_DIAGNOSTICO_/i.test(result.plantName)) throw new Error('Por seguridad, el diagnóstico solo acepta registros TEST_DIAGNOSTICO.');
    pass(13, 'Fila=' + result.sheetRow + ', planta=' + result.plantName + ', coordinador=' + result.coordinatorEmail);
    currentStep = 14; const root = DriveApp.getFolderById(FOLDER_ID); pass(14, 'FOLDER_ID localizado: ' + root.getId());
    currentStep = 15; const coordinatorFolder = getOrCreateFolder(root, result.coordinatorEmail); pass(15, 'Carpeta coordinador=' + coordinatorFolder.getName() + ', id=' + coordinatorFolder.getId());
    currentStep = 16; const folder = getOrCreateFolder(coordinatorFolder, result.plantName); result.folderName = folder.getName(); pass(16, 'Carpeta temporal=' + result.folderName + ', id=' + folder.getId());
    imageBlob.setName('DIAGNOSTICO_TEST_FOTO_' + new Date().getTime() + '_' + (image.name || 'foto'));
    currentStep = '17A'; log('17A', 'createFile iniciado'); const imageFile = folder.createFile(imageBlob);
    if (!imageFile) throw new Error('DriveApp.createFile() devolvió un archivo de fotografía nulo.');
    result.imageFileId = imageFile.getId(); result.imageUrl = imageFile.getUrl();
    pass('17A', 'createFile completado; fileId=' + result.imageFileId + ', nombre=' + imageFile.getName() + ', MIME=' + imageFile.getMimeType() + ', tamaño=' + imageFile.getSize() + ', URL=' + result.imageUrl);
    if (testSetSharing) {
      currentStep = '17B'; log('17B', 'setSharing iniciado');
      try {
        imageFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        pass('17B', 'setSharing completado');
      } catch (sharingError) {
        fail('17B', sharingError);
        result.message = 'CREATEFILE OK — SETSHARING FALLÓ: ' + (sharingError.message || sharingError);
        return result;
      }
    } else {
      pass('17B', 'No ejecutado por diseño: archivo privado.');
    }
    currentStep = 18; result.imageFileId = imageFile.getId(); const reloadedImageFile = result.imageFileId && DriveApp.getFileById(result.imageFileId); if (!reloadedImageFile) throw new Error('No se pudo volver a localizar el archivo de fotografía en Drive.'); const reloadedImageBlob = reloadedImageFile.getBlob(); if (!reloadedImageBlob) throw new Error('No se pudo leer el Blob de la fotografía privada mediante DriveApp.getFileById().'); pass(18, 'ID foto=' + result.imageFileId + '; DriveApp.getFileById().getBlob() OK, bytes=' + reloadedImageBlob.getBytes().length);
    currentStep = 21; result.imageUrl = imageFile.getUrl(); if (!isHttpUrl_(result.imageUrl)) throw new Error('Drive devolvió una URL de fotografía inválida: ' + result.imageUrl); pass(21, 'URL foto=' + result.imageUrl);
    currentStep = 19; qrBlob.setName('DIAGNOSTICO_TEST_QR_' + new Date().getTime() + '.png'); const qrFile = folder.createFile(qrBlob);
    if (!qrFile) throw new Error('DriveApp.createFile() devolvió un archivo QR nulo.');
    if (testSetSharing) qrFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    pass(19, 'Archivo QR creado' + (testSetSharing ? ' y setSharing completado' : ' privado (setSharing no ejecutado)') + ': name=' + qrFile.getName() + ', mime=' + qrFile.getMimeType() + ', size=' + qrFile.getSize());
    currentStep = 20; result.qrFileId = qrFile.getId(); const reloadedQrFile = result.qrFileId && DriveApp.getFileById(result.qrFileId); if (!reloadedQrFile) throw new Error('No se pudo volver a localizar el archivo QR en Drive.'); pass(20, 'ID QR=' + result.qrFileId + '; DriveApp.getFileById() OK');
    currentStep = 22; result.qrUrl = qrFile.getUrl(); if (!isHttpUrl_(result.qrUrl)) throw new Error('Drive devolvió una URL de QR inválida: ' + result.qrUrl); pass(22, 'URL QR=' + result.qrUrl);
    currentStep = 23; const imageCell = sheet.getRange(result.sheetRow, imagesCol + 1); const imageValue = JSON.stringify([result.imageUrl]); imageCell.setValue(imageValue); SpreadsheetApp.flush(); const imageRead = imageCell.getValue(); if (imageRead !== imageValue) throw new Error('Verificación Sheets foto falló. Escrito=' + imageValue + ', leído=' + imageRead); pass(23, 'Fila=' + result.sheetRow + ', columna=' + (imagesCol + 1) + ', escrito/leído=' + imageRead);
    currentStep = 24; const qrCell = sheet.getRange(result.sheetRow, qrCol + 1); qrCell.setValue(result.qrUrl); SpreadsheetApp.flush(); const qrRead = qrCell.getValue(); if (qrRead !== result.qrUrl) throw new Error('Verificación Sheets QR falló. Escrito=' + result.qrUrl + ', leído=' + qrRead); pass(24, 'Fila=' + result.sheetRow + ', columna=' + (qrCol + 1) + ', escrito/leído=' + qrRead);
    result.success = true; result.message = (testSetSharing ? 'PRUEBA DE AISLAMIENTO COMPLETADA' : 'PRUEBA PRIVADA COMPLETADA') + ' SIN ENVIAR CORREO'; Logger.log('[DIAGNOSTICO] COMPLETADO: sin MailApp.sendEmail().'); return result;
  } catch (error) { fail(currentStep, error); return result; }
}

function testDriveAndSheetsConnection() {
  const report = { success: false, checks: [], message: '' };
  function check(name, fn) { try { const detail = fn(); report.checks.push({ name: name, success: true, details: detail }); Logger.log('[DIAGNOSTICO][CONEXION] OK %s: %s', name, detail); return detail; } catch (e) { report.checks.push({ name: name, success: false, details: e.message, stack: e.stack || '' }); throw e; } }
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    report.checks.push({ name: 'Sheets / SPREADSHEET_ID', success: true, details: ss.getName() });
    Logger.log('[DIAGNOSTICO][CONEXION] OK Sheets / SPREADSHEET_ID: %s', ss.getName());
    const sheet = ss.getSheetByName(PLANTS_DATA_SHEET_NAME); if (!sheet) throw new Error('Hoja plantas no encontrada.');
    report.checks.push({ name: 'Hoja plantas', success: true, details: sheet.getName() });
    const root = DriveApp.getFolderById(FOLDER_ID);
    report.checks.push({ name: 'Drive / FOLDER_ID', success: true, details: root.getName() + ' (' + root.getId() + ')' });
    const folder = root.createFolder('DIAGNOSTICO_TEST_CONEXION_' + new Date().getTime());
    report.checks.push({ name: 'Carpeta temporal', success: true, details: folder.getName() + ' (' + folder.getId() + ')' });
    const file = folder.createFile('DIAGNOSTICO_TEST.txt', 'Prueba de conexión temporal.', MimeType.PLAIN_TEXT);
    report.checks.push({ name: 'Archivo temporal', success: true, details: file.getName() + ' (' + file.getId() + ')' });
    check('Lectura de archivo temporal', function() { return DriveApp.getFileById(file.getId()).getName(); });
    check('Encabezados y columnas', function() { const h = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(x) { return String(x).trim().toLowerCase(); }); ['id_planta', 'urls_imagenes', 'url_qr'].forEach(function(x) { if (h.indexOf(x) < 0) throw new Error('Falta encabezado ' + x); }); return h.join(', '); });
    report.success = true; report.message = '✓ Drive OK; ✓ Sheets OK; ✓ Folder OK'; return report;
  } catch (error) { report.message = error.message; report.error = { message: error.message, stack: error.stack || '', toString: error.toString() }; Logger.log('[DIAGNOSTICO][CONEXION] ERROR: %s', report.error.stack || report.error.toString); return report; }
}

function dataUrlToBlob_(input, label, requirePng) {
  let base64;
  let mimeType;
  let name;
  if (typeof input === 'string') {
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(input);
    if (!match) throw new Error('El ' + label + ' no tiene un Data URL Base64 válido.');
    mimeType = match[1].toLowerCase();
    base64 = match[2].replace(/\s/g, '');
    name = label;
  } else {
    input = input || {};
    if (!isNonEmptyString_(input.base64) || !isNonEmptyString_(input.mimeType)) throw new Error('La ' + label + ' requiere base64 y mimeType.');
    mimeType = String(input.mimeType).toLowerCase();
    base64 = String(input.base64).replace(/\s/g, '');
    name = isNonEmptyString_(input.name) ? input.name : label;
    if (!/^[A-Za-z0-9+/=]+$/.test(base64)) throw new Error('La ' + label + ' contiene Base64 inválido.');
  }
  if (requirePng ? mimeType !== 'image/png' : !/^image\/(jpeg|png|webp|gif)$/i.test(mimeType)) throw new Error('El formato de ' + label + ' no es válido.');
  if (!base64 || base64.length % 4 === 1) throw new Error('El contenido Base64 de ' + label + ' no es válido.');
  let bytes;
  try { bytes = Utilities.base64Decode(base64); } catch (e) { throw new Error('No se pudo decodificar ' + label + '.'); }
  if (!bytes || !bytes.length) throw new Error('El ' + label + ' no contiene bytes válidos.');
  return Utilities.newBlob(bytes, mimeType, name);
}

function isHttpUrl_(value) {
  return typeof value === 'string' && /^https?:\/\/[^\s]+$/i.test(value);
}

function identificarPlanta(imageInput) {
  const image = getGeminiImageInput_(imageInput);
  if (!image.success) return image;

  const payload = {
    contents: [{ parts: [
      { text: 'Analiza esta fotografía botánica. Identifica una especie SOLO si los rasgos visibles permiten una identificación razonable. Si no hay suficiente confianza, devuelve identificado:false. No adivines especies, usos medicinales ni toxicidad. El uso debe ser una descripción breve y prudente.' },
      { inline_data: { mime_type: image.mimeType, data: image.base64 } }
    ] }],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: plantIdentificationSchema_() }
  };
  const result = callGemini_(payload, 'identificación');
  if (!result.success) return result;

  const data = parseGeminiJson_(result.response);
  if (!data || data.identificado !== true || !isNonEmptyString_(data.nombreComun) ||
      !isNonEmptyString_(data.nombreCientifico) || !isNonEmptyString_(data.familia)) {
    return { success: false, message: 'No fue posible identificar la planta con suficiente confianza.' };
  }
  return { success: true, data: {
    nombreComun: data.nombreComun.trim(), nombreCientifico: data.nombreCientifico.trim(),
    familia: data.familia.trim(), uso: isNonEmptyString_(data.uso) ? data.uso.trim() : '',
    confidence: typeof data.confidence === 'number' ? data.confidence : undefined
  } };
}

function getMorePlantInfo(plantInfo) {
  plantInfo = plantInfo || {};
  const prompt = `Investiga con Google Search la siguiente planta y responde en español con precisión.
Nombre común: ${safePromptValue_(plantInfo.nombre_comun)}
Nombre científico: ${safePromptValue_(plantInfo.nombre_cientifico)}
Familia: ${safePromptValue_(plantInfo.familia)}
Ubicación registrada: ${safePromptValue_(plantInfo.ubicacion)}

Usa la búsqueda para sustentar las afirmaciones. En presenciaNicaragua indica solamente presencia documentada, nombres locales, hábitat o regiones que tengan evidencia encontrada. Si la evidencia no es suficiente, dilo expresamente. No presentes usos medicinales, toxicidad, distribución ni especies similares como hechos sin respaldo.`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: plantMoreInfoSchema_() }
  };
  const result = callGemini_(payload, 'búsqueda de información');
  if (!result.success) return result;

  const data = parseGeminiJson_(result.response);
  if (!data) return { success: false, message: 'No fue posible procesar la información de la planta. Inténtalo nuevamente.' };
  return { success: true, data: {
    resumenGeneral: stringOrDefault_(data.resumenGeneral, 'No disponible.'),
    presenciaNicaragua: stringOrDefault_(data.presenciaNicaragua, 'No se encontró evidencia suficiente sobre su presencia en Nicaragua.'),
    plantasSimilares: sanitizeSimilarPlants_(data.plantasSimilares),
    fuentes: extractGroundingSources_(result.response)
  } };
}

function callGemini_(payload, operation) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    Logger.log('Gemini ' + operation + ': falta la propiedad GEMINI_API_KEY.');
    return { success: false, message: 'El servicio de inteligencia artificial no está configurado.' };
  }
  try {
    const response = UrlFetchApp.fetch(GEMINI_API_BASE_URL + GEMINI_MODEL + ':generateContent', {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(payload),
      headers: { 'x-goog-api-key': apiKey }, muteHttpExceptions: true
    });
    const status = response.getResponseCode();
    const body = response.getContentText();
    if (status < 200 || status >= 300) return geminiHttpError_(status, body, operation);
    let parsed;
    try { parsed = JSON.parse(body); } catch (e) {
      Logger.log('Gemini ' + operation + ': respuesta no JSON.');
      return { success: false, message: 'El servicio devolvió una respuesta inválida. Inténtalo nuevamente.' };
    }
    return { success: true, response: parsed };
  } catch (e) {
    Logger.log('Gemini ' + operation + ': ' + e);
    return { success: false, message: 'No fue posible consultar la información de la planta en este momento. Inténtalo nuevamente.' };
  }
}

function geminiHttpError_(status, body, operation) {
  let apiMessage = '';
  try { apiMessage = JSON.parse(body).error.message || ''; } catch (e) { apiMessage = body.substring(0, 300); }
  Logger.log('Gemini ' + operation + ' HTTP ' + status + ': ' + apiMessage);
  if (status === 401 || status === 403) return { success: false, message: 'No fue posible autenticar el servicio de inteligencia artificial.' };
  if (status === 404) return { success: false, message: 'El modelo de inteligencia artificial no está disponible en este momento.' };
  if (status === 429 || /RESOURCE_EXHAUSTED/i.test(apiMessage)) return { success: false, message: 'El servicio de inteligencia artificial alcanzó temporalmente su límite de uso. Inténtalo nuevamente más tarde.' };
  return { success: false, message: 'No fue posible consultar la información de la planta en este momento. Inténtalo nuevamente.' };
}

function getGeminiImageInput_(input) {
  const raw = typeof input === 'string' ? { base64: input } : (input || {});
  let base64 = raw.base64 || raw.data || '';
  let mimeType = raw.mimeType || raw.type || '';
  const dataUrl = /^data:([^;,]+);base64,(.+)$/i.exec(base64);
  if (dataUrl) { mimeType = mimeType || dataUrl[1]; base64 = dataUrl[2]; }
  mimeType = String(mimeType).toLowerCase();
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(mimeType) || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) {
    return { success: false, message: 'La imagen no tiene un formato compatible. Usa JPEG, PNG, WEBP o GIF.' };
  }
  base64 = base64.replace(/\s/g, '');
  try {
    if (!Utilities.base64Decode(base64).length) throw new Error('empty');
  } catch (e) {
    return { success: false, message: 'La imagen no contiene datos válidos.' };
  }
  return { success: true, mimeType: mimeType, base64: base64 };
}

function parseGeminiJson_(response) {
  const candidates = response && response.candidates;
  const parts = candidates && candidates[0] && candidates[0].content && candidates[0].content.parts;
  const text = parts && parts.map(function(part) { return part && part.text || ''; }).join('');
  if (!text) { Logger.log('Gemini: respuesta vacía o sin contenido utilizable.'); return null; }
  try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); }
  catch (e) { Logger.log('Gemini: JSON de modelo inválido.'); return null; }
}

function plantIdentificationSchema_() { return { type: 'object', properties: { identificado: { type: 'boolean' }, nombreComun: { type: 'string' }, nombreCientifico: { type: 'string' }, familia: { type: 'string' }, uso: { type: 'string' }, confidence: { type: 'number' } }, required: ['identificado'] }; }
function plantMoreInfoSchema_() { return { type: 'object', properties: { resumenGeneral: { type: 'string' }, presenciaNicaragua: { type: 'string' }, plantasSimilares: { type: 'array', items: { type: 'object', properties: { nombreComun: { type: 'string' }, nombreCientifico: { type: 'string' }, descripcion: { type: 'string' } } } } } }; }
function extractGroundingSources_(response) { const chunks = response && response.candidates && response.candidates[0] && response.candidates[0].groundingMetadata && response.candidates[0].groundingMetadata.groundingChunks || []; const seen = {}; return chunks.reduce(function(sources, chunk) { const web = chunk && chunk.web; if (web && /^https?:\/\//i.test(web.uri || '') && !seen[web.uri]) { seen[web.uri] = true; sources.push({ titulo: web.title || web.uri, url: web.uri }); } return sources; }, []); }
function sanitizeSimilarPlants_(plants) { return Array.isArray(plants) ? plants.slice(0, 5).map(function(plant) { plant = plant || {}; return { nombreComun: stringOrDefault_(plant.nombreComun, 'Sin nombre común'), nombreCientifico: stringOrDefault_(plant.nombreCientifico, 'No disponible'), descripcion: stringOrDefault_(plant.descripcion, 'Sin descripción.') }; }) : []; }
function isNonEmptyString_(value) { return typeof value === 'string' && value.trim().length > 0; }
function stringOrDefault_(value, fallback) { return isNonEmptyString_(value) ? value.trim() : fallback; }
function safePromptValue_(value) { return isNonEmptyString_(value) ? value.trim().substring(0, 300) : 'No disponible'; }


//////////////////////////////////////////////////////////////////////////////

function getPlantInfoById(plantId) {

  if (!plantId) {
    return { success: false, error: 'No se proporcionó un ID de planta.' };
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(PLANTS_DATA_SHEET_NAME);
    if (!sheet) {
      return { success: false, error: 'La hoja de datos no fue encontrada.' };
    }

    const allData = sheet.getDataRange().getValues();
    if (allData.length < 2) {
      return { success: false, error: 'No hay datos en la hoja.' };
    }

    const headers = allData.shift().map(h => String(h || '').trim().toLowerCase());
    const idColumnIndex = headers.indexOf('id_planta');

    if (idColumnIndex === -1) {
      return { success: false, error: "No se encontró la columna 'id_planta'." };
    }

    const targetId = String(plantId).trim();
    const plantRow = allData.find(row => String(row[idColumnIndex] || '').trim() === targetId);

    if (!plantRow) {
      return null;
    }

    const plantObject = {};
    headers.forEach((key, index) => {
      const value = plantRow[index];
      if (key === 'urls_imagenes') {
        try {
          plantObject[key] = JSON.parse(value);
        } catch (e) {
          plantObject[key] = value ? [String(value)] : [];
        }
      } else if (key === 'fecha_registro') {
        plantObject[key] = (value instanceof Date)
          ? Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss")
          : String(value);
      } else {
        plantObject[key] = value;
      }
    });

    return plantObject;

  } catch (e) {
    Logger.log("ERROR GRAVE en getPlantInfoById: " + e.message);
    return { success: false, error: `Error del servidor: ${e.message}` };
  }
}

function incrementPlantViewCount(plantId) {
  try {
    if (!plantId) {
      throw new Error("No se proporcionó un ID de planta.");
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(PLANTS_DATA_SHEET_NAME);
    if (!sheet) throw new Error("La hoja de datos no fue encontrada.");

    const data = sheet.getDataRange().getValues();
    const headers = data.shift().map(h => String(h).trim().toLowerCase());
    const idIndex = headers.indexOf('id_planta');
    const visitsIndex = headers.indexOf('visitas');

    if (idIndex === -1 || visitsIndex === -1) {
      throw new Error("No se encontraron las columnas 'id_planta' o 'visitas'.");
    }

    // Encontrar la fila de la planta
    const rowIndex = data.findIndex(row => String(row[idIndex]).trim() === String(plantId).trim());

    if (rowIndex !== -1) {
      const sheetRow = rowIndex + 2; // +1 porque data no tiene headers, +1 porque las filas de la hoja empiezan en 1
      const currentVisits = Number(sheet.getRange(sheetRow, visitsIndex + 1).getValue()) || 1;
      sheet.getRange(sheetRow, visitsIndex + 1).setValue(currentVisits + 1);

      return { success: true, newCount: currentVisits + 1 };
    } else {
      throw new Error("No se encontró la planta con el ID especificado.");
    }
  } catch (e) {
    Logger.log("Error en incrementPlantViewCount: " + e.message);
    return { success: false, error: e.message };
  }
}

function addLikeToPlant(plantId) {
  try {
    if (!plantId) throw new Error("No se proporcionó un ID de planta.");

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(PLANTS_DATA_SHEET_NAME);
    if (!sheet) throw new Error("La hoja de datos no fue encontrada.");

    const data = sheet.getDataRange().getValues();
    const headers = data.shift().map(h => String(h).trim().toLowerCase());
    const idIndex = headers.indexOf('id_planta');
    const likesIndex = headers.indexOf('likes');

    if (idIndex === -1 || likesIndex === -1) {
      throw new Error("Asegúrate de tener las columnas 'id_planta' y 'likes' en tu hoja.");
    }

    const rowIndex = data.findIndex(row => String(row[idIndex]).trim() === String(plantId).trim());

    if (rowIndex !== -1) {
      const sheetRow = rowIndex + 2;
      const range = sheet.getRange(sheetRow, likesIndex + 1);
      const currentLikes = Number(range.getValue()) || 0;
      range.setValue(currentLikes + 1);

      return { success: true, newCount: currentLikes + 1 };
    } else {
      throw new Error("No se encontró la planta con el ID especificado.");
    }
  } catch (e) {
    Logger.log("Error en addLikeToPlant: " + e.message);
    return { success: false, error: e.message };
  }
}

function submitSuggestion(userEmail, plantId, suggestion) {
  const plantInfo = getPlantInfoById(plantId);
  if (!plantInfo) return;

  const ownerEmail = plantInfo.registrado_por;
  if (!ownerEmail) return;

  const imageUrl = (plantInfo.urls_imagenes && plantInfo.urls_imagenes.length > 0) ? plantInfo.urls_imagenes[0] : '';

  const subject = `Nuevo comentario para la planta: ${plantInfo.nombre_comun}`;
  const body = `
    Hola,<br><br>
    Se ha recibido un nuevo comentario sobre tu planta <b>${plantInfo.nombre_comun}</b>.<br><br>
    <b>Comentario de:</b> ${userEmail || 'Correo no especificado'}<br>
    <b>Planta:</b> ${plantInfo.nombre_comun} (${plantInfo.nombre_cientifico})<br>
    <b>Texto del comentario:</b><br>
    <p style="padding: 10px; border-left: 3px solid #ccc; font-style: italic;">${suggestion}</p>
    <br>
    <img src="${imageUrl}" style="max-width: 150px;" alt="Foto de la planta">
    <br><br>
    Atentamente,<br>
    El equipo de UNIVERSIDADES VERDES UCC.
  `;

  MailApp.sendEmail(ownerEmail, subject, "", { htmlBody: body });

  const userSubject = `Hemos recibido tu sugerencia`;
  const userBody = `
    Hola ${userEmail},<br><br>
    Gracias por tu contribución. Hemos recibido tu sugerencia sobre la planta <b>${plantInfo.nombre_comun}</b>.<br><br>
    <img src="${imageUrl}" style="max-width: 150px;" alt="Foto de la planta">
    <br><br>
    Atentamente,<br>
    El equipo de UNIVERSIDADES VERDES UCC.
  `;
  MailApp.sendEmail(userEmail, userSubject, "", { htmlBody: userBody });
}

function getPlantImagesBase64(plantId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(PLANTS_DATA_SHEET_NAME);
  if (!sheet) return [];

  const allData = sheet.getDataRange().getValues();
  const headers = allData.shift().map(h => String(h || '').trim().toLowerCase());
  const idIndex = headers.indexOf('id_planta');
  const imagesIndex = headers.indexOf('urls_imagenes');

  if (idIndex === -1 || imagesIndex === -1) return [];

  const row = allData.find(r => String(r[idIndex]).trim() === String(plantId).trim());
  if (!row) return [];

  let urls = [];
  try {
    urls = JSON.parse(row[imagesIndex]);
  } catch (e) {
    if (row[imagesIndex]) urls = [row[imagesIndex]];
  }

  const imagesBase64 = urls.map(url => {
    try {
      const match = url.match(/[-\w]{25,}/); // extrae fileId del link
      if (!match) return null;
      const fileId = match[0];
      const file = DriveApp.getFileById(fileId);
      const blob = file.getBlob();
      return `data:${blob.getContentType()};base64,${Utilities.base64Encode(blob.getBytes())}`;
    } catch (e) {
      return null;
    }
  }).filter(x => x);

  return imagesBase64;
}

function sendPlantInfoToUser(userEmail, plantId) {
  const plantInfo = getPlantInfoById(plantId);
  if (!plantInfo) return;

  const imageUrl = (plantInfo.urls_imagenes && plantInfo.urls_imagenes.length > 0) ? plantInfo.urls_imagenes[0] : '';

  const subject = `Información de la planta: ${plantInfo.nombre_comun}`;
  const body = `
    Hola,<br><br>
    Gracias por tu interés en nuestras plantas. Aquí tienes la información que solicitaste:<br><br>
    <hr>
    <img src="${imageUrl}" style="max-width: 250px; border-radius: 8px;" alt="Foto de la planta"><br>
    <h3>${plantInfo.nombre_comun}</h3>
    <p><b>Nombre Científico:</b> ${plantInfo.nombre_cientifico}</p>
    <p><b>Familia:</b> ${plantInfo.familia}</p>
    <p><b>Ubicación en el Campus:</b> ${plantInfo.ubicacion}</p>
    <p><b>Uso Principal:</b> ${plantInfo.uso}</p>
    <hr>
    <br>
    Atentamente,<br>
    El equipo de UNIVERSIDADES VERDES UCC.
  `;

  MailApp.sendEmail(userEmail, subject, "", { htmlBody: body });
}

function getAdminEmails() {
  try {
    if (!adminSheet) return [];
    const data = adminSheet.getDataRange().getValues();
    return data.map(row => row[0]).filter(email => email && email.includes('@'));
  } catch (e) {
    Logger.log("Error al obtener emails de admin: " + e.toString());
    return [];
  }
}
