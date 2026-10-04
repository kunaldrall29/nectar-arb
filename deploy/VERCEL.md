# Vercel

Anonymous preview (claim to keep):

- App: https://temporary-brisk-nova-2pe8v44.vercel.app
- Claim: https://vercel.com/claim-deployment?code=b921ee65-528f-4f61-905a-a72c01fd6bdd
- Expires unless claimed (temporary deploy)

Read APIs already hit live Stellar testnet from this URL. For faucet / rehearsal on Vercel, set `ADMIN_SECRET` after claiming.

```
cd frontend
npx vercel --yes
npx vercel env add ADMIN_SECRET
```
