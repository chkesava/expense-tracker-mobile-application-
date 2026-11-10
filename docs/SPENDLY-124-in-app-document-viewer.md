# SPENDLY-124: In-App Document Viewer

**Epic:** SPENDLY-78 (Accounts Intelligence & Statement Suite)  
**Branch:** `feature/SPENDLY-124-in-app-document-viewer`  

---

## 1. Overview & Problem

Previously, when a user opened an account document (statement, passbook photo, sanction letter), a transaction attachment, or a tax document (Form 16, AIS), the application invoked `WebBrowser.openBrowserAsync(signedUrl)`.

This had multiple major UX and architectural drawbacks:
1. **Broken App Experience:** Tapping a document launched an external browser tab (Web) or Chrome Custom Tab (Android), kicking the user out of Spendly and losing their scroll position and context.
2. **Exposed Storage Internals:** The raw Supabase Storage signed URL was visibly exposed in the browser's address bar.
3. **Inconsistent Behavior:** Web opened a new tab while mobile opened a system browser session, with neither preserving the native Spendly visual feel.

---

## 2. Solution & Architecture

SPENDLY-124 introduces a unified, reusable in-app document viewer (`DocumentViewerModal`) supporting both images and PDFs on Android and Web, respecting all privacy and security boundaries.

### Storage & Security Architecture
- **Bearer Tokens / Signed URLs:** Continues using short-lived (5-minute TTL) signed download URLs minted on-demand via the `spendly-files` Supabase Edge Function in the read-model project (`spmsgncjbnbkxvsbpqlu`).
- **No Leaked URLs:** Signed URLs are never persisted in Firestore or Supabase tables, and never printed to application logs or Sentry.
- **Cache Clean-up:** Downloaded temporary preview binaries in `Paths.cache/document-previews/` are cleaned up when the viewer closes.

### Image Viewer (`DocumentImageViewer.tsx`)
- High-performance rendering with `expo-image`.
- Interactive gesture controls using `react-native-gesture-handler` and `react-native-reanimated`:
  - **Pinch-to-zoom:** Smooth zoom between 1x and 5x with spring-back bounding.
  - **Pan:** Drag to inspect fine print and numbers when zoomed.
  - **Double-tap:** Quickly toggles between 1x and 2.5x zoom.
  - **Desktop / Web:** Dedicated zoom in, zoom out, and reset buttons in the viewer toolbar.

### PDF Viewer (`DocumentPdfViewer.tsx`)
- **Web App:** Embedded `<iframe>` leverages the browser's native PDF viewing engine with full zoom, page scrolling, and printing support without opening external tabs.
- **Android App (`modules/pdf-renderer`):** A lightweight custom Expo module utilizing Android's built-in `android.graphics.pdf.PdfRenderer` (backed by Android OS's native PDFium engine). Renders pages into high-DPI bitmaps on device, providing an in-app scrollable view with pinch-to-zoom.
- **Encrypted / Fallback:** If a PDF is password-protected or opened in a build without the native module, a clean "Open with system app" button launches the Android system share/viewer sheet (`expo-sharing`).

### Universal Document Actions
- **Close:** Dismisses the modal and restores user context seamlessly. Android hardware and gesture back buttons close the viewer cleanly via `onRequestClose`.
- **Share:** Exports the document via `expo-sharing` (mobile) or Web Share / download (web).
- **Download:** Directly downloads the file on web with its original filename.

---

## 3. Changes Made

| File / Component | Purpose |
|---|---|
| `modules/pdf-renderer/` | Custom Expo native module for Android SDK `PdfRenderer`. |
| `services/documents/documentViewerHelpers.ts` | Pure helpers for signed URL resolution, cache downloading, sharing, and error sanitization. |
| `services/documents/documentViewerHelpers.test.ts` | Vitest test suite covering resolution, MIME routing, error sanitization, and cache downloading. |
| `components/documents/DocumentImageViewer.tsx` | Full-screen zoomable image viewer with pinch, pan, and double-tap gestures. |
| `components/documents/DocumentPdfViewer.tsx` | Embedded web iframe & native multi-page PDF viewer with fallback sheet. |
| `components/documents/DocumentViewerModal.tsx` | Reusable modal container with safe areas, header, and action buttons. |
| `app/(app)/accounts/[id].tsx` | Replaced `WebBrowser.openBrowserAsync` with `DocumentViewerModal` for Account Detail documents. |
| `app/(app)/transactions/[id].tsx` | Replaced `WebBrowser.openBrowserAsync` with `DocumentViewerModal` for linked transaction statements. |
| `app/(app)/tax/[fy]/documents.tsx` | Replaced browser opening with `DocumentViewerModal` for Tax & ITR documents. |
| `hooks/useTaxDocumentActions.ts` | Replaced `WebBrowser` with `shareDocumentFile` safe fallback. |

---

## 4. Verification

- `npx vitest run services/documents/documentViewerHelpers.test.ts`: Passed (11/11 tests).
- `npm run typecheck:shared`: Passed with 0 errors.
- Scope check (`git diff --stat origin/main`): Confirmed all changes are isolated strictly to SPENDLY-124 document viewer components and call sites.
