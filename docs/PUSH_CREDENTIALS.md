# Push credentials and transport (Spendly)

**Ticket:** [SPENDLY-223](https://kesavach.atlassian.net/browse/SPENDLY-223). **Epic:** [SPENDLY-222](SPENDLY-222-push-notifications.md).
**Scope:** the Spendly (Expense) Android app, `com.example.expensetracker`. Ganesh and Nutrition are out of scope. iOS is deferred until there is an Apple developer account and APNs key (decision D4).

## Transport decision

**Expo Push Service** (`https://exp.host/--/api/v2/push/send`).

| | |
|---|---|
| Why | The app already uses `expo-notifications` and has an EAS project (`extra.eas.projectId` in `app.json`, inherited by the Expense build). One API covers Android now and iOS later. It is free, and the server side is a plain HTTPS call, so the sender (SPENDLY-227) has no native SDK to carry. |
| Token | The device gets an `ExponentPushToken[…]` from `getExpoPushTokenAsync({ projectId })` (SPENDLY-224). |
| Limits | 100 messages per request. Roughly 600 notifications per second per project. Receipts are read in a second call and expire after about a day, so the sender must read them promptly (SPENDLY-227). |
| Fallback | Direct FCM HTTP v1 through `firebase-admin` messaging, using `getDevicePushTokenAsync()` tokens. Only needed if Expo's service is unavailable or limits us. The sender keeps the transport behind one interface so switching is local. |
| Not used | Web push (out of scope), and third-party push vendors. |

Releases are built by GitHub Actions with gradle (`release.yml` / `release-expense.yml`), not by EAS Build. Expo push still works for those builds: the device asks Expo for a token using the projectId, and Expo delivers through FCM with the key stored in the Expo project.

## Where the credentials live (never in this repo)

| Credential | Lives in | Used by |
|---|---|---|
| FCM v1 service-account key (JSON) | **Expo project** credentials, for app id `com.example.expensetracker`. Delete the local copy after uploading. | Expo, to deliver to Android |
| `google-services.json` | Repo (it holds public client config only; it is not a secret) | The Android build, which links the app to Firebase project `expenseapp-27f94` |
| Expo access token, for sending (optional "enhanced push security") | Server secret store, to be decided in SPENDLY-227 | The server sender |
| APNs key (`.p8`) | Expo project credentials, once iOS is in scope | Expo, to deliver to iOS |

`.gitignore` already blocks `*service-account*.json`, `*-firebase-adminsdk-*.json` and `*-sa.json`. `lib/pushConfig.contract.test.ts` checks that this stays true.

## One-time setup (owner action)

1. **Create a narrow service account.** Don't use the default `firebase-adminsdk` account; it has broad admin rights.
   - In Google Cloud Console for project `expenseapp-27f94`, go to IAM & Admin → Service Accounts → Create.
   - Name it e.g. `expo-push-fcm`.
   - Give it only the role **Firebase Cloud Messaging API Admin**.
2. **Check the FCM v1 API.** In Firebase console → Project settings → Cloud Messaging, check that "Firebase Cloud Messaging API (V1)" is **Enabled**.
3. **Create a JSON key** for that service account (Keys → Add key → JSON). Save it **outside the repo**.
4. **Upload the key to the Expo project.** Either way works:
   - **Website:** expo.dev → the Spendly project (`1a9206a6-87aa-44f7-ac4f-95ec8455efa7`) → Credentials → Android → `com.example.expensetracker` → *FCM V1 service account key* → upload.
   - **CLI:** `npx eas-cli credentials -p android` → select the build profile → *Google Service Account* → *Manage your Google Service Account Key for Push Notifications (FCM V1)* → upload.
5. **Delete the local JSON key.**
6. **Record it in Jira** (SPENDLY-223): the upload date and the service account's email. Don't post the key.

## Verifying (test push)

A real push needs a device token, and devices register only once SPENDLY-224 ships. So the end-to-end check happens there:

1. Install a **signed Expense release build**. The local test build (`.localtest`) has no FCM by design.
2. Sign in, grant notifications, and read your own token from your `users/{uid}/devices/*` doc.
3. Send a push to **only that token** with the Expo push tool (https://expo.dev/notifications). Dev and prod share one Firebase project, so never send to anyone else's token.

## Rotating or revoking

- **Rotate:** create a new key for the same service account, upload it to Expo (it replaces the old one), then delete the old key in Google Cloud.
- **Emergency stop:** use the sender's kill switch (SPENDLY-227), or remove the key from the Expo project. Pushes then fail with `InvalidCredentials`.
