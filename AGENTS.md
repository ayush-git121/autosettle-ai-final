<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules

- All claim data flows through the server functions in `src/claims.functions.ts` using the service-role client (`client.server.ts`); the app has no end-user logins, so every `public` table is RLS-enabled with no policies and grants only `service_role`. Why: customer access is claim-reference based and privacy-sensitive; keeping the Data API locked prevents direct browser reads.
- The AI vision/negotiation calls in `src/server/ai.server.ts` use `anthropic/claude-sonnet-5` via the AI Gateway native `/v1/messages` endpoint. Why: vision-capable and on the workspace retention allowlist.
