/// <reference types="nativewind/types" />
// expo/types declares `*.css` (for the globals.css import in app/_layout.tsx).
// expo-env.d.ts also references it, but that file is generated and gitignored,
// so CI never has it.
/// <reference types="expo/types" />
