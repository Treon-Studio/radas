# @treon-studio/radas-sdk

Typed client untuk RADAS `/api/v2` control-plane — types di-generate dari
OpenAPI snapshot (`contracts/radas-api-v2.openapi.json`, di-sanitasi dari
29 broken refs), transport memakai `openapi-fetch`, envelope error
mengikuti `@treon-studio/contracts`.

```ts
import { createRadasClient } from "@treon-studio/radas-sdk";

const client = createRadasClient({ baseUrl: "https://radas.example.com", token });
const approvals = await client.call("GET", "/api/v2/approvals");
```

Setiap request membawa `X-Request-Id` (caller-supplied atau auto UUID) dan
`Authorization: Bearer <token>`. Kegagalan melempar `RadasApiError` dengan
payload `ApiFailure` dari contracts.

Catatan: 29 broken `$ref` pada snapshot ditandai `x-broken-ref` oleh
sanitizer — perbaikan spec milik server (lihat violation baseline).
