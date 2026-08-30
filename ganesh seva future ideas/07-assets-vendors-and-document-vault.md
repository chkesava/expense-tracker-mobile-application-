# Ganesh Seva — Feature Specification 07
## Pandal Assets, Vendors & Document Vault

**Document:** 07-assets-vendors-and-document-vault.md  
**Status:** Product / Implementation Specification  
**Stack:** Expo React Native + Firebase Auth + Firestore + Supabase Storage

---

# 1. Purpose

This feature introduces three related but separate concepts:

```text
Pandal Assets
Vendors
Document Vault
```

The goal is to prevent the Pandal from repeatedly buying or searching for the same things every year and to keep important Festival documents organized.

Examples:

### Assets

- Chairs
- Tables
- Speakers
- Lights
- Fans
- Extension boards
- Tents
- Utensils
- Storage boxes
- Decoration materials

### Vendors

- Decoration supplier
- Sound supplier
- Electrical supplier
- Caterer
- Tent supplier
- Printing shop
- Transport provider

### Documents

- Expense receipts
- Bills
- Vendor quotations
- Agreements
- Sponsorship documents
- Important Festival documents
- Asset photos

---

# 2. Core Principle

An Asset is something the Pandal owns or retains beyond a single transaction/Festival.

An Expense is a financial transaction.

A Vendor is a reusable supplier identity.

A Document is a file attached to a relevant business record.

Do not mix these concepts.

---

# 3. Asset vs Expense

This distinction is extremely important.

Example:

```text
Purchase:
20 Chairs

Cost:
₹15,000
```

Financially:

```text
Expense:
₹15,000
```

Operationally:

```text
Asset:
20 Chairs
```

The expense belongs to the Festival in which the chairs were purchased.

The chairs belong to the Pandal and can be reused next year.

---

# 4. Asset Ownership

Assets should normally be Pandal-level:

```text
pandals/{pandalId}/assets/{assetId}
```

This allows:

```text
2026:
20 Chairs purchased

2027:
20 Chairs reused

2028:
20 Chairs reused
```

The asset should not be duplicated every year.

---

# 5. Asset Data Model

Suggested fields:

```text
assetId
pandalId
name
categoryId
quantity
unit
acquisitionType
acquiredFestivalId
purchaseExpenseId
estimatedValue
condition
location
status
notes
photoPath
createdBy
createdAt
updatedBy
updatedAt
```

Adapt to the existing codebase rather than blindly introducing duplicate models.

---

# 6. Asset Acquisition Type

Recommended:

```text
PURCHASED
DONATED
TRANSFERRED
OTHER
```

Example:

```text
20 Chairs
Acquisition:
PURCHASED

Festival:
2026
```

or:

```text
20 Chairs
Acquisition:
DONATED

Contributor:
Ravi
```

---

# 7. Asset Status

Recommended:

```text
ACTIVE
DAMAGED
LOST
DISPOSED
ARCHIVED
```

Use status rather than deleting historical assets.

---

# 8. Asset Condition

Recommended:

```text
NEW
GOOD
FAIR
DAMAGED
UNUSABLE
```

This helps the committee decide whether something needs replacement before the next Festival.

---

# 9. Asset Quantity

Assets may have quantities.

Example:

```text
Plastic Chairs
Quantity:
20
```

Another:

```text
Speaker
Quantity:
2
```

The application should support updating quantities where appropriate.

---

# 10. Asset Unit

Optional unit:

```text
pieces
sets
boxes
kg
litres
units
```

Use a flexible value rather than forcing every asset into one unit.

---

# 11. Asset Location

Optional:

```text
Stored at:
Community Hall
```

or:

```text
Stored at:
Ravi's House
```

or:

```text
Location:
Pandal Storage Room
```

This is operational information, not financial information.

---

# 12. Asset Photo

Allow an optional photo.

Example:

```text
20 Chairs
📷 photo
```

This helps identify assets during inventory checks.

Use Supabase Storage.

Recommended logical path:

```text
pandals/{pandalId}/assets/{assetId}/photo.jpg
```

Do not expose the Supabase service-role key in the Expo application.

---

# 13. Asset Purchase Link

If an asset was purchased:

```text
Asset
20 Chairs

Purchased through:
Expense #EXP-123
```

The expense remains the financial source of truth.

The Asset is the operational inventory record.

Do not create a second expense from the Asset.

---

# 14. Asset Donation Link

If an asset was donated:

```text
Asset:
20 Chairs

Acquisition:
DONATED

Contribution:
CON-123

Estimated Value:
₹15,000
```

This connects the Asset to the In-Kind Contribution without treating it as cash.

---

# 15. Asset Value

Optional:

```text
Estimated Value:
₹15,000
```

This is informational.

It must not increase:

```text
Festival Cash
God Fund
Bank
UPI
Cash
```

unless an actual monetary transaction exists.

---

# 16. Asset Lifecycle

Recommended lifecycle:

```text
Created
   ↓
Active
   ↓
Damaged / Lost
   ↓
Disposed / Archived
```

The history should remain available.

---

# 17. Asset Disposal

If an asset is no longer usable:

```text
20 Chairs

Status:
DISPOSED

Reason:
Damaged beyond repair
```

Do not delete the record.

Record:

```text
disposedBy
disposedAt
disposalReason
```

---

# 18. Asset Quantity Changes

Example:

```text
Chairs:
20
```

Later:

```text
2 damaged
```

New active quantity:

```text
18
```

Keep enough history to understand the change.

Do not silently overwrite important inventory history.

---

# 19. Asset Inventory Check

Provide an optional inventory-check workflow.

Example:

```text
Inventory Check — 2026

Chairs
Expected: 20
Found: 20
Condition: Good

Speakers
Expected: 2
Found: 1
Condition: Good

Fans
Expected: 4
Found: 3
```

This helps identify missing assets before the next Festival.

---

# 20. Asset Categories

Suggested categories:

```text
Furniture
Lighting
Sound
Electrical
Decoration
Kitchen
Pooja
Tent
Storage
Tools
Other
```

Categories should remain simple.

---

# 21. Reusable vs Consumable

Not every purchase should become an Asset.

### Reusable

```text
Chairs
Tables
Speakers
Fans
Lights
```

Potential Assets.

### Consumable

```text
Laddu
Flowers
Water
Food
Incense
Pooja consumables
```

Normally not Assets.

Do not automatically create an Asset for every expense.

---

# 22. Asset Dashboard

Suggested:

```text
Pandal Assets

Total Items
42

Active
38

Damaged
2

Missing
1

Archived
1
```

Then:

```text
Needs Attention

2 damaged assets
1 missing asset
```

---

# 23. Asset List

Example:

```text
Assets

20 Chairs
Good
Stored: Community Hall

2 Speakers
Good
Stored: Pandal Storage

4 LED Lights
Fair
Stored: Ravi's House
```

Keep the list compact.

---

# 24. Asset Detail

Example:

```text
20 Plastic Chairs

Quantity:
20

Condition:
Good

Status:
Active

Acquired:
2026

Acquisition:
Purchased

Estimated Value:
₹15,000

Location:
Community Hall

Purchase:
EXP-123
```

Actions:

```text
Edit
Update Condition
Update Quantity
Move Location
View Purchase
View Photo
```

Permission-check each action.

---

# 25. Asset Search

Search by:

```text
Name
Category
Location
Status
```

Example:

```text
Search:
Speaker
```

returns:

```text
2 Speakers
```

---

# 26. Asset Filters

Useful:

```text
Category
Condition
Status
Acquisition Type
Festival Acquired
Location
```

---

# 27. Asset Permissions

Suggested:

```text
assets.view
assets.create
assets.update
assets.archive
assets.dispose
assets.inventoryCheck
```

Use the existing dynamic RBAC system.

---

# 28. Vendor Concept

A Vendor is a reusable business/person who provides goods or services to the Pandal.

Examples:

```text
Sri Decorations
ABC Electricals
Ganesh Sound Systems
Ravi Tent House
```

Vendor identity is Pandal-level.

Vendor transactions are Festival-specific.

---

# 29. Vendor Data Model

Conceptually:

```text
pandals/{pandalId}/vendors/{vendorId}
```

Suggested:

```text
vendorId
pandalId
name
contactPerson
mobile
email
address
category
notes
status
createdAt
updatedAt
```

Only collect necessary information.

---

# 30. Vendor Status

Recommended:

```text
ACTIVE
INACTIVE
ARCHIVED
```

Do not delete a vendor that has historical transactions.

---

# 31. Vendor Categories

Suggested:

```text
Decoration
Sound
Lighting
Electrical
Food
Printing
Transport
Tent
Pooja
Cleaning
Other
```

---

# 32. Vendor vs Sponsor

Keep them separate.

### Vendor

```text
Pandal pays vendor.
```

Example:

```text
Decoration
Expense:
₹10,000
Vendor:
Sri Decorations
```

### Sponsor

```text
Sponsor supports the Pandal.
```

Example:

```text
ABC Electricals
Sponsorship:
₹10,000
```

A business can theoretically be both, but the transactions must remain distinct.

---

# 33. Vendor Expense Link

An expense can reference a vendor:

```text
Expense:
₹10,000

Vendor:
Sri Decorations
```

This enables:

```text
Vendor spending history
```

without duplicating the expense.

---

# 34. Vendor History

Vendor detail:

```text
Sri Decorations

2026
₹18,000
Decoration

2025
₹15,000
Decoration

Total Historical Spend
₹33,000
```

Use actual expenses only.

Voided expenses should be excluded from active totals.

---

# 35. Vendor Payment Tracking

Do not introduce a separate vendor balance unless the product actually requires accounts payable.

For MVP:

```text
Expense
+
Payment Method
+
Vendor
```

is enough.

A future version can support:

```text
Vendor Invoice
Amount Due
Paid
Pending
```

if required.

---

# 36. Vendor Document Support

Allow documents to be attached to vendor-related records:

```text
Quotation
Invoice
Bill
Agreement
```

Use Supabase Storage.

---

# 37. Vendor Search

Search:

```text
Vendor Name
Contact Person
Mobile
Category
```

Avoid loading every vendor unnecessarily.

---

# 38. Vendor Permissions

Suggested:

```text
vendors.view
vendors.create
vendors.update
vendors.archive
```

Financial permissions remain separate.

Creating a Vendor must not automatically grant permission to create Expenses.

---

# 39. Document Vault

The Document Vault provides a centralized way to access important files.

It should not become an uncontrolled file dump.

Documents should ideally be attached to a relevant entity:

```text
Expense
Contribution
Sponsor
Vendor
Asset
Festival
Pandal
```

---

# 40. Supported Document Types

Recommended:

```text
JPEG
PNG
WEBP
PDF
```

Avoid supporting unnecessary formats in the MVP.

---

# 41. Document Categories

Suggested:

```text
Expense Receipt
Invoice
Quotation
Sponsorship Document
Asset Photo
Festival Document
Vendor Document
Other
```

---

# 42. Document Data Model

Conceptually:

```text
documents/{documentId}
```

or within the relevant entity.

Suggested metadata:

```text
documentId
pandalId
festivalId (optional)
entityType
entityId
fileName
fileType
fileSize
storagePath
uploadedBy
uploadedAt
description
category
status
```

Do not store large file contents inside Firestore.

Store metadata in Firestore and the actual file in Supabase Storage.

---

# 43. Storage Architecture

Recommended logical paths:

```text
ganesh-files/

  pandals/
    {pandalId}/

      festivals/
        {festivalId}/

          expenses/
            {expenseId}/

          contributions/
            {contributionId}/

          sponsors/
            {sponsorshipId}/

          documents/

      assets/
        {assetId}/

      vendors/
        {vendorId}/
```

The exact bucket/path should follow the existing StorageService abstraction.

---

# 44. Supabase Storage Security

Important:

```text
Firebase Auth
+
Firestore RBAC
+
Supabase Storage
```

Supabase does not automatically understand Firebase authentication.

For the current POC, use the previously selected simple storage approach, but keep storage operations behind a single application-level service.

Do NOT put:

```text
SUPABASE_SERVICE_ROLE_KEY
```

inside the Expo app.

Do not expose privileged Supabase credentials in the client.

---

# 45. File Size Limits

Recommended:

```text
Images:
Maximum 5 MB

PDF:
Maximum 10 MB
```

These can be adjusted later.

Compress camera images before upload.

For images:

```text
Camera/Gallery
      ↓
Resize
      ↓
Compress
      ↓
Upload
```

Aim for approximately:

```text
300 KB – 1.5 MB
```

when readability is maintained.

---

# 46. Receipt Image Optimization

Expense receipts generally do not require original camera resolution.

Prefer:

```text
Readable
+
Compressed
+
Fast upload
```

rather than:

```text
Maximum camera resolution
```

This is especially important for volunteers with unstable mobile internet.

---

# 47. Document Upload UX

Example:

```text
Attach Receipt

[ Take Photo ]
[ Choose From Gallery ]
[ Choose File ]

Selected:
receipt.jpg

Size:
820 KB

[ Upload ]
```

Show progress:

```text
Uploading...
65%
```

Then:

```text
✓ Uploaded
```

---

# 48. Upload Failure

If upload fails:

```text
Upload failed.

[ Retry ]
[ Cancel ]
```

Do not create a database record pointing to a nonexistent file.

If metadata is created first, use a safe pending-upload state and clean it up if upload permanently fails.

---

# 49. Document Preview

Images:

```text
Tap → Preview
```

PDF:

```text
Tap → Open PDF
```

The exact preview mechanism can use Expo-compatible libraries already present in the project.

Do not add a heavy dependency unless needed.

---

# 50. Document Download

If supported, allow:

```text
Open
Share
Save
```

The implementation must respect Pandal authorization.

Do not expose public URLs for sensitive financial documents unless intentionally designed.

---

# 51. Document Deletion

Avoid immediate hard deletion.

For important financial documents, prefer:

```text
ARCHIVED
```

or controlled deletion with permission.

If deleting:

```text
deletedBy
deletedAt
reason
```

should be retained in audit metadata where appropriate.

---

# 52. Document Replacement

If a receipt is replaced:

```text
receipt-v1.jpg
receipt-v2.jpg
```

consider retaining audit history.

Do not silently replace evidence for an important financial transaction without recording the change.

---

# 53. Expense Receipt Relationship

Example:

```text
Expense
EXP-123

₹5,000
Decoration

Receipt:
receipt.jpg
```

The Expense remains the source of financial truth.

The file is supporting evidence.

---

# 54. Contribution Document Relationship

Example:

```text
In-Kind Contribution

Ganesh Idol
₹15,000 estimated

Document:
donation-note.pdf
```

Again:

```text
Contribution = business record
Document = evidence/supporting file
```

---

# 55. Asset Photo Relationship

Example:

```text
Asset:
20 Chairs

Photo:
chairs.jpg
```

The photo is not a financial record.

---

# 56. Festival Documents

Festival-level documents may include:

```text
Permission documents
Event schedules
Important notices
Vendor agreements
Other Festival paperwork
```

Use:

```text
festivalId
```

for correct year-level scoping.

---

# 57. Pandal-Level Documents

Some documents are permanent:

```text
Pandal registration
Permanent agreements
Storage information
General committee documents
```

These should not be attached to one Festival unnecessarily.

---

# 58. Document Search

Search by:

```text
File Name
Category
Entity
Festival
Uploaded By
```

Example:

```text
Search:
decoration
```

returns relevant receipts/documents.

---

# 59. Document Filters

Useful:

```text
Festival
Category
Entity Type
File Type
Uploaded By
Date
```

---

# 60. Document List UI

Example:

```text
Documents

receipt-decoration.jpg
Expense Receipt
2026
820 KB

ganesh-idol-note.pdf
Contribution
2026
1.2 MB

chairs.jpg
Asset Photo
Pandal
650 KB
```

Keep metadata readable without making each item huge.

---

# 61. Vendor Detail UI

Example:

```text
Sri Decorations

Decoration
98765xxxxx

2026 Spending
₹18,000

Documents
3

Recent Expenses
₹10,000
₹8,000
```

---

# 62. Asset Detail UI

Example:

```text
20 Plastic Chairs

20 Units
Good
Active

Location:
Community Hall

Acquired:
2026

Estimated Value:
₹15,000

[ View Photo ]
[ View Purchase ]
[ Inventory Check ]
```

---

# 63. Asset-to-Expense Linking

When creating an expense for an asset:

```text
Add Expense
```

allow:

```text
Creates Asset:
Yes
```

or after saving:

```text
Convert/Link to Asset
```

Do not force users to create assets for every expense.

---

# 64. Asset-to-Contribution Linking

For donated reusable items:

```text
In-Kind Contribution
        ↓
Create Asset
```

Example:

```text
20 Chairs
Donated
₹15,000 estimated
```

Result:

```text
Contribution
+
Pandal Asset
```

No cash transaction is created.

---

# 65. Vendor-to-Expense Linking

When selecting a vendor in an Expense:

```text
Vendor:
Sri Decorations
```

the expense should appear automatically in the vendor history.

Do not duplicate the expense into a separate vendor transaction.

---

# 66. Financial Integration Rules

### Purchased Asset

```text
Expense → Festival financial record
Asset → Pandal inventory
```

### Donated Asset

```text
In-Kind Contribution → Contribution record
Asset → Pandal inventory
Cash → unchanged
```

### Vendor

```text
Vendor → Supplier identity
Expense → Financial transaction
```

### Document

```text
Document → Supporting file
```

---

# 67. Offline Considerations

Asset creation and vendor profile creation can use normal Firestore offline support where safe.

File uploads require connectivity unless the application explicitly implements an upload queue.

For the MVP:

```text
No network
+
Photo selected
```

show:

```text
Waiting for connection to upload
```

Do not claim that a file has been uploaded until Supabase confirms it.

---

# 68. Real-Time Collaboration

If one volunteer adds:

```text
20 Chairs
```

another authorized user should see the updated asset list where real-time updates are enabled.

Avoid unnecessary listeners.

Do not subscribe to every document in the entire Pandal simultaneously.

---

# 69. Concurrency

For quantity changes:

```text
20 Chairs
```

Two users simultaneously update inventory.

Avoid unsafe:

```text
read quantity
modify
overwrite
```

when an atomic operation is appropriate.

For critical inventory operations use Firestore transactions/atomic updates.

---

# 70. Security

Firestore Security Rules must enforce:

```text
Authenticated
+
Active Pandal Membership
+
Required Permission
+
Correct Pandal
+
Correct Festival where applicable
```

The client must never be able to change:

```text
pandalId
festivalId
ownership
```

to access another Pandal.

Storage access must also be constrained by the application's authorization architecture.

---

# 71. Audit Events

Recommended:

```text
Asset Created
Asset Updated
Asset Quantity Changed
Asset Condition Changed
Asset Location Changed
Asset Disposed
Asset Archived

Vendor Created
Vendor Updated
Vendor Archived

Document Uploaded
Document Replaced
Document Archived
Document Deleted
```

Include:

```text
performedBy
performedAt
pandalId
festivalId where applicable
```

---

# 72. Permissions

Suggested permissions:

```text
assets.view
assets.create
assets.update
assets.dispose
assets.inventoryCheck

vendors.view
vendors.create
vendors.update
vendors.archive

documents.view
documents.upload
documents.update
documents.archive
documents.delete
```

Use the existing dynamic RBAC implementation.

---

# 73. Privacy

Documents may contain sensitive information.

Examples:

```text
Phone numbers
Invoices
Addresses
Financial details
Agreements
```

Only authorized Pandal members should access them.

Do not make the bucket publicly accessible just to simplify the Expo app.

---

# 74. Performance

Avoid:

```text
Load every asset
+
every vendor
+
every document
+
every expense
```

on one dashboard.

Use:

- Pagination
- Limits
- Firestore indexes
- Cached data
- Lazy loading
- Targeted queries

Only subscribe to real-time updates where useful.

---

# 75. Acceptance Criteria

## Assets

- [ ] Assets are Pandal-level.
- [ ] Assets survive across Festivals.
- [ ] Assets can be purchased or donated.
- [ ] Purchase can link to an Expense.
- [ ] Donation can link to an In-Kind Contribution.
- [ ] Quantity is supported.
- [ ] Condition is supported.
- [ ] Location is supported.
- [ ] Status is supported.
- [ ] Asset photo can be uploaded.
- [ ] Asset history is preserved.
- [ ] Disposed assets are not hard-deleted.
- [ ] Inventory checks are supported.

## Vendors

- [ ] Vendor profile is Pandal-level.
- [ ] Vendor transactions are Festival-specific.
- [ ] Vendor can link to Expenses.
- [ ] Vendor history works across years.
- [ ] Vendor can be archived.
- [ ] Vendor is separate from Sponsor.

## Documents

- [ ] Documents can be attached to relevant records.
- [ ] Firestore stores metadata, not large file contents.
- [ ] Supabase Storage stores files.
- [ ] Service-role key is never exposed in Expo.
- [ ] Images are compressed.
- [ ] File size limits are enforced.
- [ ] Upload progress is visible.
- [ ] Upload failures can be retried.
- [ ] Documents are permission-controlled.
- [ ] Important document changes are auditable.

## Financial Integrity

- [ ] Asset value does not automatically create cash.
- [ ] Donated assets do not create fake expenses.
- [ ] Purchased assets have financial expenses where applicable.
- [ ] Vendor history does not duplicate financial transactions.
- [ ] Documents do not affect balances.

---

# 76. Recommended Implementation Order

```text
1. Asset model
2. Asset categories
3. Asset list/detail
4. Asset creation
5. Asset quantity/condition/location
6. Link assets to expenses
7. Link assets to in-kind contributions
8. Vendor model
9. Vendor CRUD
10. Link vendors to expenses
11. Vendor history
12. Document metadata model
13. Supabase Storage integration
14. Image compression
15. Receipt/document upload
16. Document preview
17. Document list/search
18. Permissions
19. Audit events
20. Inventory checks
```

---

# 77. Implementation Guidance for Cursor/Claude

Before changing code:

1. Inspect the existing Expense model.
2. Inspect the In-Kind Contribution model.
3. Inspect the existing RBAC implementation.
4. Inspect the existing Supabase Storage integration.
5. Inspect the existing receipt upload implementation.
6. Inspect existing Firestore Security Rules.
7. Inspect current Pandal/Festival data structure.
8. Reuse existing image compression utilities.
9. Reuse existing UI components from the Expense Tracker.
10. Avoid introducing a second storage service.
11. Avoid duplicating financial records.
12. Add tests for Asset/Expense and Asset/Contribution relationships.
13. Do not rewrite unrelated modules.

---

# 78. Critical Test Scenarios

### Scenario A — Purchased Chairs

```text
Expense:
₹15,000

Asset:
20 Chairs

Expected:
Festival expense +₹15,000
Asset created
Cash/God Fund reduced according to expense funding
```

### Scenario B — Donated Chairs

```text
In-Kind:
20 Chairs
Estimated ₹15,000

Expected:
Cash unchanged
In-Kind Value +₹15,000
Asset created
```

### Scenario C — Consumable Donation

```text
500 Laddu
Estimated ₹5,000

Expected:
Cash unchanged
In-Kind Value +₹5,000
No reusable Asset
```

### Scenario D — Vendor Expense

```text
Vendor:
Sri Decorations

Expense:
₹10,000
```

Expected:

```text
One financial expense
Vendor history +₹10,000
No duplicate vendor transaction
```

### Scenario E — Receipt

```text
Expense:
₹5,000

Receipt:
receipt.jpg
```

Expected:

```text
Expense remains financial source of truth
File stored in Supabase
Metadata stored in Firestore
```

---

# 79. Golden Rules

### Rule 1

> An Asset is not an Expense.

### Rule 2

> A purchased Asset has an Expense; the Asset itself is inventory.

### Rule 3

> A donated Asset can come from an In-Kind Contribution without creating cash.

### Rule 4

> Consumables should not automatically become Assets.

### Rule 5

> Assets belong to the Pandal and survive Festival years.

### Rule 6

> Vendors belong to the Pandal; vendor transactions belong to Festivals.

### Rule 7

> Sponsors and Vendors are different concepts.

### Rule 8

> Documents support business records; they do not replace the records.

### Rule 9

> Financial documents must be protected by authorization.

### Rule 10

> Never expose the Supabase service-role key in the Expo application.

### Rule 11

> Important inventory/document changes must be auditable.

### Rule 12

> Do not duplicate a financial transaction merely to support inventory or vendor history.

---

# 80. Final Mental Model

```text
                         PANDAL
                           |
          +----------------+----------------+
          |                |                |
        ASSETS           VENDORS        DOCUMENTS
          |                |                |
     20 Chairs        Sri Decorations   Receipt
     2 Speakers       ABC Electricals   Invoice
     4 Lights                         Agreement
          |
          +----------------------+
          |
      FESTIVAL HISTORY
          |
     +----+------------------+
     |                       |
  PURCHASE                 DONATION
     |                       |
  EXPENSE              IN-KIND CONTRIBUTION
     |                       |
     +----------+------------+
                |
              ASSET
```

The system should always make it possible to answer:

> **What does our Pandal own, where is it, who supplies us, what did we spend on it, what was donated, and where is the supporting document?**
