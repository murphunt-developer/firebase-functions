const {setGlobalOptions} = require('firebase-functions');
const logger = require('firebase-functions/logger');
const {onRequest} = require('firebase-functions/https');
const {onDocumentWritten, onDocumentCreated} = require('firebase-functions/v2/firestore');

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
  const original = req.query.text;
  const writeResult = await getFirestore()
    .collection('messages')
    .add({original: original});
  res.json({result:`Message with ID: ${writeResult.id} added.`});
});

/**
 * Listends for new messages added to /messages/:documentId/original and saves
 * an uppercased version of the message to /messages/:documentId/uppercase
 */
exports.makeuppercase = onDocumentCreated('/messages/{documentId}', (event) => {
  const original = event.data.data().original;
  logger.log('Uppercasing', event.params.documentId, original);
  const uppercase = original.toUpperCase();
  return event.data.ref.set({uppercase}, {merge: true});
});
