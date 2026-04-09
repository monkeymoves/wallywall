const {setGlobalOptions} = require("firebase-functions");

// No Cloud Functions are deployed right now; this file keeps the Firebase
// functions package lint-clean until backend work is added.
setGlobalOptions({maxInstances: 10});
