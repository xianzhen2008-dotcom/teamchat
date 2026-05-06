# Release Guide

1. Verify the working tree contains only source files:

   ```bash
   npm run check:clean
   git status --short
   ```

2. Verify the app builds and starts:

   ```bash
   npm ci
   npm run build
   npm start
   ```

3. Verify the Android project syncs:

   ```bash
   npm run apk:prepare
   ```

4. Push to GitHub:

   ```bash
   git push public HEAD:main
   ```

5. Confirm the `Build Android APK` workflow completes on GitHub Actions.
