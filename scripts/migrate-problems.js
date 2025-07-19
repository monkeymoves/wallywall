/**
 * Migration script: Move top-level "problems" into nested "/boards/{boardId}/problems/{problemId}".
 * Usage: Ensure FIRESTORE_EMULATOR_HOST is set (via `firebase emulators:start`), then run:
 *   node scripts/migrate-problems.js
 */

const admin = require('firebase-admin');

// Initialize the Admin SDK (will connect to emulator if FIRESTORE_EMULATOR_HOST is set)
admin.initializeApp({
  projectId: 'wallywall-18303'
});

const db = admin.firestore();

async function migrate() {
  console.log('Fetching all top-level problems...');
  const oldProblemsSnap = await db.collection('problems').get();
  console.log(`Found ${oldProblemsSnap.size} problems. Beginning migration...`);

  let count = 0;
  for (const doc of oldProblemsSnap.docs) {
    const data = doc.data();
    if (!data.boardId) {
      console.warn(`Skipping problem ${doc.id}: no boardId field`);
      continue;
    }
    const targetRef = db
      .collection('boards')
      .doc(data.boardId)
      .collection('problems')
      .doc(doc.id);
    await targetRef.set({
      ...data,
      migratedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    count++;
  }

  console.log(`Migration complete: ${count} problems moved.`);
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});