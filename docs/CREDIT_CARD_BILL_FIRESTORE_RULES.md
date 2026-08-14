# Credit Card Bills — Firebase Security Rules

Firestore rules are **not** shipped in this mobile repo. Apply (or merge) the following into the Firebase project rules used by Auth/Firestore.

## Required collections (user-scoped)

```
users/{userId}/creditCardBills/{billId}
users/{userId}/creditCardBillReminderLogs/{logId}
```

## Suggested rules

```
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;

  match /creditCardBills/{billId} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }

  match /creditCardBillReminderLogs/{logId} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }
}
```

## Privacy notes

- Push / local notification copy must never include full PAN, CVV, or banking credentials.
- Reminder logs store `billId`, `notificationType`, `sentAt`, `channel`, `status` — not notification body text with sensitive data.
- Bill `accountId` must reference a Credit Card account (enforced in client validators).

## Settings field

User doc field `creditCardBillReminders` is part of `users/{uid}` and covered by the parent user doc rule.
