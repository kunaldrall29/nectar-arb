---
title: Quote escrow
---

`QuoteEscrow` holds maker cash and is the EIP-712 verifying contract (`NectarQuoteEscrow`, version 1).

- Deposit credits the beneficiary for the amount received. A fee-on-transfer token is rejected. A raw token transfer does not credit anyone.
- Registration reserves the full `cashOut` or reverts.
- EOA signatures and ERC-1271 signatures are accepted.
- Default lifetime is 30 seconds. Maximum is 120 seconds.
- A fill at `timestamp >= validUntil` reverts.
- Anyone can release an expired quote. There is no earlier cancel.
- Reserved cash is less than or equal to liabilities, and the token balance covers liabilities.
- Withdrawal of unreserved cash ignores the execution pause.
