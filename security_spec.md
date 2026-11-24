# EsportBos Firestore Security Specification

## 1. Data Invariants
1. **Profiles (`/profiles/{userId}`)**: Document ID must match `request.auth.uid`; PII (`email`) is only readable by the profile owner. Initial balances (`diamonds`, `gold`, `currency`) must start at `0` on creation and **cannot be modified by clients** on update (authoritative balances live on the backend).
2. **Teams (`/teams/{teamId}`)**: Every team must belong to an existing authenticated user (`user_id == request.auth.uid`).
3. **Players (`/players/{playerId}`)**: Players in a team belong to a valid `team_id`; free-agent players (`team_id == null`) can be queried in the transfer market by signed-in users and claimed by a team owner.
4. **Matches (`/matches/{matchId}`)**: Match logs reference `user_id == request.auth.uid` on creation; finished matches are immutable.
5. **Team Tactics (`/team_tactics/{teamId}`)**: Only the owner of `teamId` can read/write tactics.
6. **Predictions (`/predictions/{predictionId}`)**: Only the prediction creator (`user_id == request.auth.uid`) can create/update their prediction.
7. **Transactions (`/transactions/{transactionId}`)**: Only `user_id == request.auth.uid` can read/create their transactions; completed transactions cannot be reverted.
8. **Transfers (`/transfers/{transferId}`)**: Readable by signed-in users for dashboard transfer feed; writable only with `user_id == request.auth.uid`.
9. **Ledger (`/ledger/{ledgerId}`)**: Append-only server financial ledger (`waktu`, `akun`, `jenis_transaksi`, `jumlah`, `saldo_sebelum`, `saldo_sesudah`). Strictly immutable: `create`, `update`, and `delete` are forbidden for all client SDK calls (`allow write: if false`).

## 2. Dirty Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read on `/profiles/{uid}`
2. Cross-user write on `/profiles/{otherUid}`
3. Profile creation with mismatched `id != request.auth.uid` or non-zero starter balances (`diamonds: 9999`)
4. Client-side balance tampering on `/profiles/{uid}` (`updateDoc` modifying `diamonds`, `gold`, or `currency`)
5. Shadow field injection on `/profiles/{uid}` (`isAdmin: true`)
6. Oversized string (> 1KB) on `/profiles/{uid}.username` or document ID
7. Cross-user team creation with `user_id != request.auth.uid`
8. Modifying `user_id` on an existing `/teams/{teamId}`
9. Modifying another user's `/team_tactics/{otherTeamId}`
10. Creating a transaction with another user's `user_id` or re-opening a `completed` transaction back to `pending`
11. Reading another user's private `/transactions/{txId}` or `/ledger/{ledgerId}`
12. Creating, updating, or deleting any `/ledger/{ledgerId}` document from a client SDK
