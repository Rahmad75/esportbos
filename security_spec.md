# EsportBos Firestore Security Specification

## 1. Data Invariants
1. **Profiles (`/profiles/{userId}`)**: Document ID must match `request.auth.uid`; PII (`email`) is only readable by the profile owner. Public leaderboard queries are restricted to authenticated users with explicit schema bounds.
2. **Teams (`/teams/{teamId}`)**: Every team must belong to an existing authenticated user (`user_id == request.auth.uid`).
3. **Players (`/players/{playerId}`)**: Players in a team belong to a valid `team_id`; free-agent players (`team_id == null`) can be queried in the transfer market by signed-in users and claimed by a team owner.
4. **Matches (`/matches/{matchId}`)**: Match logs reference `user_id == request.auth.uid` on creation; finished matches are immutable.
5. **Team Tactics (`/team_tactics/{teamId}`)**: Only the owner of `teamId` can read/write tactics.
6. **Predictions (`/predictions/{predictionId}`)**: Only the prediction creator (`user_id == request.auth.uid`) can create/update their prediction.
7. **Transactions (`/transactions/{transactionId}`)**: Only `user_id == request.auth.uid` can read/create their transactions; completed transactions cannot be reverted.
8. **Transfers (`/transfers/{transferId}`)**: Readable by signed-in users for dashboard transfer feed; writable only with `user_id == request.auth.uid`.

## 2. Dirty Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read on `/profiles/{uid}`
2. Cross-user write on `/profiles/{otherUid}`
3. Profile creation with mismatched `id != request.auth.uid`
4. Shadow field injection on `/profiles/{uid}` (`isAdmin: true`)
5. Oversized string (> 1KB) on `/profiles/{uid}.username` or document ID
6. Cross-user team creation with `user_id != request.auth.uid`
7. Modifying `user_id` on an existing `/teams/{teamId}`
8. Modifying another user's `/team_tactics/{otherTeamId}`
9. Creating a transaction with another user's `user_id`
10. Re-opening a `completed` transaction back to `pending`
11. Reading another user's private `/transactions/{txId}`
12. Modifying a `finished` match record
