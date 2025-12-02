const {setGlobalOptions} = require('firebase-functions');
const logger = require('firebase-functions/logger');
const {onRequest} = require('firebase-functions/https');
const {onDocumentWritten} = require('firebase-functions/v2/firestore');

// firebase Admin SDK to access firestore
const {initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');

// per-function limit
setGlobalOptions({ maxInstances: 10 });

initializeApp();

/**
 * Take text parameter passed to this http endpoint and insert it into firestore
 * under the path /messages/:documentId/original
 */
exports.addmessage = onRequest(async (req, res) => {
  // grab text param
  const original = req.query.text;
  // push new message to firestore
  const writeResult = await getFirestore().collection('messages').add({original: original});
  // send back success message
  res.json({result:`Message with ID: ${writeResult.id} added.`});
})
