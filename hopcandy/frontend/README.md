# HopCandy Frontend

The formal HopCandy v0.1 React workbench. It renders only version-checked Step 2 publication data and consumes the `hopcandy-api-v1` contract.

```powershell
python scripts/199.prepare_hopcandy_step4_frontend.py
cd hopcandy/frontend
npm install
npm run test
npm run build
npm run dev
```

Replay is always available. Live mode is disabled by default and calls the same-origin `/api/v1` proxy only when `VITE_HOPCANDY_LIVE_ENABLED=true` and health reports a ready backend.
