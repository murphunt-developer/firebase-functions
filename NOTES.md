# Development Notes:
- Needed to create a default database after seeing this error when running `firebase deploy --only functions`

```
There was an error retrieving the Firestore database. Currently, the database id is set to (default), make sure it exists.

Error: Request to https://firestore.googleapis.com/v1/projects/murphunt-cloud-function/databases/(default) had HTTP Error: 404, Project 'murphunt-cloud-function' or database '(default)' does not exist.
```

- Then ran `firebase deploy --only functions` again and saw a generic error message: `Error: There was an error deploying functions`. So I looked at `firebase-debug.log` file and noticed this error message `Compute Engine API has not been used in project 18194152414 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/compute.googleapis.com/overview?project=18194152414 then retry.`
  - Gemini said this means one of the underlying services needed for Cloud Function deployment, specifically Google Compute Engine (GCE) is not enabled. 
  - Solution would be to enable the Compute Engine API
  1. Go to google cloud console: https://console.developers.google.com/apis/api/compute.googleapis.com/overview?project=18194152414
  2. search for the api: 'compute engine api'
  3. enable api
  4. wait and retry: 30-60 seconds for propagation
  5. run deployment again

- Successfully deployed, now reading through https://firebase.google.com/docs/functions/manage-functions

## Deploy functions
- You can deploy specific functions like this `firebase deploy --only functions:addMessage,functions:makeUppercase`
  - There are deployment quotas that can cause your deployments to fail bc of too many functions, (HTTP 429 or 500). 
  - Guidance is to deploy in groups of 10 or fewer.
  - Firebase CLI looks in the functions/ for the source code. You can organize your codebase: https://firebase.google.com/docs/functions/organize-functions

### Clean up deployment artifacts
- container images are generated and stored in Artifact Registry
  - they are not required for deployed functions to run
  - cloud functions fetches and retains a copy of the image on initial deployment, but the store artifacts are not necessary for the function to work at runtime
- the images are often small, but can accumulate over time and contribute to storage costs
- you can configure cleanup policy `firebase functions:artifacts:setpolicy`
  - by default, it sets it to delete container images older than 1 day
  - Example: `firebase functions:artifacts:setpolicy --days 7  # Delete images older than 7 days` 
- if your function is deployed to multiple regions, you can set up a policy on a per region basis:
  - `$ firebase functions:artifacts:setpolicy --location europe-west1`

#### Opt out of cleanup
- If you want to cleanup manually `$ firebase functions:artifacts:setpolicy --none` will remove any existing cleanup policy firebase cli has set up and prevents firebase from setting a cleanup policy after function deployments

## Delete functions
- You can delete functions previously deployed in 3 ways:
  1. explicitly in the Firebase CLI with `functions:delete`
  2. explicitly in the Google Cloud console
  3. implicitly by remove the function from source prior to deployment

- All deletion operations prompt you to confirm before removing the function from production
- Firebase CLI deletion supports multiple arguments as well


```
# Delete all functions that match the specified name in all regions.
firebase functions:delete myFunction

# Delete a specified function running in a specific region.
firebase functions:delete myFunction --region us-east-1

# Delete more than one function
firebase functions:delete myFunction myOtherFunction

# Delete a specified functions group.
firebase functions:delete groupA

# Bypass the confirmation prompt.
firebase functions:delete myFunction --force
```

- implicity function deletion, `firebase deploy` parses your source and removes from production any functions that have been removed from the file


## Modify a function's name, region, or trigger
- Make sure your function is idempotent, since both the new and older version will be running at the same time during the change

### Renaming a function
1. create new renamed version
```
// before
const {onRequest}  = require('firebase-functions/v2/https');

exports.webhook = onRequest((req, res) => {
    res.send("Hello");
});

// after
const {onRequest}  = require('firebase-functions/v2/https');

exports.webhookNew = onRequest((req, res) => {
    res.send("Hello");
});
```

2. run two separate deployment commands
   - the first deploys the newly named function
   - the second removes the previously deployed version

```
# Deploy new function
firebase deploy --only functions:webhookNew

# Wait until deployment is done; now both functions are running

# Delete webhook
firebase functions:delete webhook
```

### Change a function's region(s)
1. rename the function, and change its region or regions as desired

```
// before
exports.firestoreTrigger = onDocumentCreated(
  "my-collection/{docId}",
  (event) => {},
);

// after
exports.firestoreTriggerAsia = onDocumentCreated(
  {
    document: "my-collection/{docId}",
    region: "asia-northeast1",
  },
  (event) => {},
);
```

2. deploy the renamed function, which results in temporarily running the same code in both sets of regions

```
firebase deploy --only functions:firestoreTriggerAsia
```

3. delete the previous function

### Change a function's trigger type
- It is not possible to change a function's event type just by changing the source code and running `firebase deploy`, to avoid errors follow thes steps:

1. modify the source code to include a NEW function with the desired trigger type

```
// before
const {onObjectDeleted} = require("firebase-functions/v2/storage");

exports.objectDeleted = onObjectDeleted((event) => {
    // ...
});

// after
const {onObjectArchived} = require("firebase-functions/v2/storage");

exports.objectArchived = onObjectArchived((event) => {
    // ...
});
```

2. deploy the function, which results in temporarily running both old and new functions

```
# Create new function objectArchived
firebase deploy --only functions:objectArchived
```
3. explicitly delete the old function from production using the Firebas CLI

```
# Wait until deployment is done; now both objectDeleted and objectArchived are running

# Delete objectDeleted
firebase functions:delete objectDeleted
```

## Set runtime options
- Best practice is to set these options on a configuration object inside the function code 
- `RuntimeOptions` object is the source of truth and will override options set via any other method (such as the Google Cloud console or the gcloud CLI)
- However, if your workflow involves manually setting runtime options, set the `preserveExternalChanges` option to `true`. 
  - Firebase merges the runtime options set in your code with the settings of the currently deployed version of your function with the following priority
    1. Option is set in functions code: override external changes
    2. Option is set to `RESET_VALUE` in functions code: override external changes with default value
    3. Option is not set in functions code, but is set in currently deployed function: use this option specified in the deployed function
  - it is not recommended to use `preserveExternalChanges` in most scenarios bc your source code will no longer be the full source of truth

## Set Node.js version
- `"engines": {"node": "20"}` in your `package.json` is how to set version


### Upgrade your Node.js runtime
1. make sure your project is on Blaze pricing plan
2. make sure you are using firebase CLI v11.18.0 or later
3. change `engines` value 
4. test changes using emulator suite
5. redeploy all functions

## Choose a Node.js module system
- Default is CommonJS (CJS) but Cloud Functions support both ECMAScript Modules (ESM) and CJS
- If you want to change the default CJS to ESM:
  1. update `"type"` in `package.json` to `"module"`
  2. update imports

## Control scaling behavior
- By default, Cloud Functions for Firebase scales the number of running instances based on incoming requests, potentially scaling down to 0 in times of reduced traffic.
  - specify a minimum number of container instances to be kept warm and ready to combat low traffic descaling
  - specify a maximum number of container instances to limit skyrocketting costs due to unforseen traffic spikes

### Allow concurrent requests
- 1st gen firebase cloud functions can handle one request at a time, so scaling behavior was st only with minimum and maximum settings
- 2nd gen firebase cloud functions can control the number of requests each instance can serve at the same time with `concurrency` option
  - the default is `80` but you can set it anywhere betwwen `1-1000`
- functions with higher concurrency can absorb traffic spikes w/out cold starting because each insance is likely to have some headroom
- concurrency in cloud functions firebase 2nd gen is powered by Cloud Run 
- Higher concurrency settings may require higher CPU and RAM for optimal performance

### Keep minimum number of instances warm
- You can set a min number of instances to reduce cold start like so 

```
const { onCall } = require("firebase-functions/v2/https");

exports.getAutocompleteResponse = onCall(
  {
    // Keep 5 instances warm for this latency-critical function
    minInstances: 5,
  },
  (event) => {
    // Autocomplete user’s search term
  }
);
```

- you'll experience a cold start for every instance above the min threshold
- avoid min instances in non-prod environments
```
const { onRequest } = require('firebase-functions/https');
const { defineInt, defineString } = require('firebase-functions/params');

// Define some parameters
const minInstancesConfig = defineInt('HELLO_WORLD_MININSTANCES');
const welcomeMessage = defineString('WELCOME_MESSAGE');

// To use configured parameters inside the config for a function, provide them 
// directly. To use them at runtime, call .value() on them.
export const helloWorld = onRequest(
  { minInstances: minInstancesConfig },
(req, res) => {
    res.send(`${welcomeMessage.value()}! I am a function.`);
  }
);
```

### Limit max instances for a function
- If an http function is scaled up to max instances limit, new requests are queued for 30 seconds and then rejected wth a response code of `429 Too Many Requests` if no instance available by then

```
const { onMessagePublished } = require("firebase-functions/v2/pubsub");

exports.mirrorevents = onMessagePublished(
  { topic: "topic-name", maxInstances: 100 },
  (event) => {
    // Connect to legacy database
  }
);
```

## Set a service account
- The default service accounts for functinos have a broad set of permissions to allow you to interact with other Firebase and Google Cloud services:
  - 2nd gen functions: `PROJECT_NUMBER-compute@developer.gserviceaccount.com` (named Compute Engine default service account)
  - 1st gen functions: `PROJECT_ID@appspot.gserviceaccount.com` (named App Engine default service account)
- You can override the default service account and limit a function to the exact resources needed

```
const { onRequest } = require("firebase-functions/https");

exports.helloWorld = onRequest(
    {
        // This function doesn't access other Firebase project resources, so it uses a limited service account.
        serviceAccount:
            "my-limited-access-sa@", // or prefer the full form: "my-limited-access-sa@my-project.iam.gserviceaccount.com"
    },
    (request, response) => {
        response.send("Hello from Firebase!");
    },
);
```

- you can alternatively use `setGlobalOptions` functions if you want all functions to have the same service account

## Set timeout and memory allocation
- You can set these via the Google Cloud console or in function code (firebase only)

```
exports.convertLargeFile = onObjectFinalized({
  timeoutSeconds: 300,
  memory: "1GiB",
}, (event) => {
  // Do some complicated things that take a lot of memory and time
});
```
- `590` is the maximum timeout
- To set memory allocation or timeout in Google Cloud console:
  1. In the Google Cloud console select Cloud Functions for Firebase from the left menu.
  2. Select a function
  3. click `Edit`
  4. select a memory allocation 
  5. click `More` to display the advanced options and enter value in the `Timeout` text box
  6. click `Save`

## Override CPU defaults

- 1st gen behavior for 2nd gen functions
```
// Turn off Firebase defaults
setGlobalOptions({ cpu: 'gcf_gen1' });
```
- CPU-intensive functions, 2nd gen provides flexibility to configure additional CPU

```
// Boost CPU in a function:
export const analyzeImage = onObjectFinalized({ cpu: 2 }, (event) => {
  // computer vision goes here
});
```

