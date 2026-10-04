#![no_std]

mod types;

pub use types::{Error, MakerAccount, Market, Preview, Quote, QuoteSpec, Receipt};
use types::*;

use soroban_sdk::{
    contract, contractimpl, token, vec, xdr::ToXdr, Address, BytesN, Env, IntoVal, Symbol,
};

#[contract]
pub struct NectarCore;

#[contractimpl]
impl NectarCore {
    pub fn initialize(
        env: Env,
        admin: Address,
        guardian: Address,
        fee_recipient: Address,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInit);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Guardian, &guardian);
        env.storage()
            .instance()
            .set(&DataKey::FeeRecipient, &fee_recipient);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().extend_ttl(535680, 535680);
        Ok(())
    }

    pub fn pause_scope(env: Env, guardian: Address) -> Result<(), Error> {
        guardian.require_auth();
        let stored: Address = env
            .storage()
            .instance()
            .get(&DataKey::Guardian)
            .ok_or(Error::NotInit)?;
        if stored != guardian {
            return Err(Error::Unauthorized);
        }
        env.storage().instance().set(&DataKey::Paused, &true);
        env.events()
            .publish((Symbol::new(&env, "ScopePaused"),), true);
        Ok(())
    }

    pub fn unpause_scope(env: Env, admin: Address) -> Result<(), Error> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage().instance().set(&DataKey::Paused, &false);
        Ok(())
    }

    pub fn admit_market(
        env: Env,
        admin: Address,
        market_key: BytesN<32>,
        chain_id: u32,
        protocol: Symbol,
        market_id: Symbol,
        debt_token: Address,
        collateral_token: Address,
        adapter: Address,
        policy_version: u32,
        max_quote_ttl: u64,
    ) -> Result<(), Error> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        if max_quote_ttl == 0 || max_quote_ttl > MAX_QUOTE_TTL {
            return Err(Error::InvalidExpiry);
        }
        let market = Market {
            market_key: market_key.clone(),
            chain_id,
            protocol,
            market_id,
            debt_token,
            collateral_token,
            adapter,
            policy_version,
            max_quote_ttl,
            admitted: true,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Market(market_key.clone()), &market);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Market(market_key.clone()), 535680, 535680);
        env.events()
            .publish((Symbol::new(&env, "PolicyActivated"), market_key), chain_id);
        Ok(())
    }

    pub fn get_market(env: Env, market_key: BytesN<32>) -> Result<Market, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Market(market_key))
            .ok_or(Error::MarketNotFound)
    }

    pub fn get_account(env: Env, maker: Address, token: Address) -> MakerAccount {
        env.storage()
            .persistent()
            .get(&DataKey::Account(maker, token))
            .unwrap_or(MakerAccount {
                cash: 0,
                reserved: 0,
            })
    }

    pub fn get_quote(env: Env, quote_id: BytesN<32>) -> Result<Quote, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Quote(quote_id))
            .ok_or(Error::QuoteNotFound)
    }

    pub fn get_receipt(env: Env, quote_id: BytesN<32>) -> Result<Receipt, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Receipt(quote_id))
            .ok_or(Error::QuoteNotFound)
    }

    pub fn next_nonce(env: Env, maker: Address) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::Nonce(maker))
            .unwrap_or(0)
    }

    pub fn deposit(
        env: Env,
        maker: Address,
        token: Address,
        amount: i128,
        beneficiary: Address,
    ) -> Result<i128, Error> {
        maker.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        token::Client::new(&env, &token).transfer(
            &maker,
            &env.current_contract_address(),
            &amount,
        );
        let key = DataKey::Account(beneficiary.clone(), token.clone());
        let mut acct = Self::load_account(&env, &beneficiary, &token);
        acct.cash += amount;
        env.storage().persistent().set(&key, &acct);
        env.storage().persistent().extend_ttl(&key, 535680, 535680);
        env.events().publish(
            (Symbol::new(&env, "CashDeposited"), beneficiary, token),
            amount,
        );
        Ok(acct.cash)
    }

    pub fn withdraw(
        env: Env,
        maker: Address,
        token: Address,
        amount: i128,
        recipient: Address,
    ) -> Result<i128, Error> {
        maker.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let key = DataKey::Account(maker.clone(), token.clone());
        let mut acct = Self::load_account(&env, &maker, &token);
        if acct.available() < amount {
            return Err(Error::ReservedFunds);
        }
        acct.cash -= amount;
        env.storage().persistent().set(&key, &acct);
        env.storage().persistent().extend_ttl(&key, 535680, 535680);
        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &recipient,
            &amount,
        );
        env.events()
            .publish((Symbol::new(&env, "CashWithdrawn"), maker, token), amount);
        Ok(acct.available())
    }

    pub fn register_quote(env: Env, maker: Address, spec: QuoteSpec) -> Result<BytesN<32>, Error> {
        maker.require_auth();
        Self::require_not_paused(&env)?;
        if spec.collateral_amount <= 0 || spec.cash_out <= 0 || spec.max_debt_repay <= 0 {
            return Err(Error::InvalidAmount);
        }
        if spec.keeper_compensation < 0 || spec.protocol_fee < 0 || spec.min_net_surplus < 0 {
            return Err(Error::InvalidAmount);
        }
        if spec.cash_out < spec.max_debt_repay {
            return Err(Error::InsufficientProceeds);
        }
        let now = env.ledger().timestamp();
        if spec.valid_until <= now + MIN_QUOTE_TTL || spec.valid_until > now + MAX_QUOTE_TTL {
            return Err(Error::InvalidExpiry);
        }
        let market = Self::require_market(&env, &spec.market_key)?;
        if spec.valid_until > now + market.max_quote_ttl {
            return Err(Error::InvalidExpiry);
        }

        let nonce_key = DataKey::Nonce(maker.clone());
        let nonce: u64 = env.storage().persistent().get(&nonce_key).unwrap_or(0);
        let quote_id = hash_id(
            &env,
            &maker,
            nonce,
            spec.cash_out,
            spec.valid_until,
            &spec.borrower,
        );
        if env
            .storage()
            .persistent()
            .has(&DataKey::Quote(quote_id.clone()))
        {
            return Err(Error::QuoteExists);
        }

        let acct_key = DataKey::Account(maker.clone(), market.debt_token.clone());
        let mut acct = Self::load_account(&env, &maker, &market.debt_token);
        if acct.available() < spec.cash_out {
            return Err(Error::InsufficientCash);
        }
        acct.reserved += spec.cash_out;
        env.storage().persistent().set(&acct_key, &acct);
        env.storage()
            .persistent()
            .extend_ttl(&acct_key, 535680, 535680);

        let reservation_id = hash_id(
            &env,
            &maker,
            nonce.wrapping_add(7),
            spec.cash_out,
            spec.valid_until,
            &spec.collateral_recipient,
        );
        let quote = Quote {
            schema_version: SCHEMA_VERSION,
            quote_id: quote_id.clone(),
            maker: maker.clone(),
            maker_nonce: nonce,
            market_key: spec.market_key.clone(),
            borrower: spec.borrower,
            collateral_token: market.collateral_token,
            collateral_amount: spec.collateral_amount,
            debt_token: market.debt_token,
            cash_out: spec.cash_out,
            max_debt_repay: spec.max_debt_repay,
            collateral_recipient: spec.collateral_recipient,
            keeper_compensation: spec.keeper_compensation,
            protocol_fee: spec.protocol_fee,
            min_net_surplus: spec.min_net_surplus,
            keeper_recipient: spec.keeper_recipient,
            surplus_recipient: spec.surplus_recipient,
            valid_until: spec.valid_until,
            reservation_id,
            consumed: false,
            released: false,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Quote(quote_id.clone()), &quote);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Quote(quote_id.clone()), 535680, 535680);
        env.storage().persistent().set(&nonce_key, &(nonce + 1));

        env.events().publish(
            (Symbol::new(&env, "QuoteReserved"), maker, quote_id.clone()),
            spec.cash_out,
        );
        Ok(quote_id)
    }

    pub fn release_expired(env: Env, quote_id: BytesN<32>) -> Result<(), Error> {
        let mut quote: Quote = env
            .storage()
            .persistent()
            .get(&DataKey::Quote(quote_id.clone()))
            .ok_or(Error::QuoteNotFound)?;
        if quote.consumed {
            return Err(Error::QuoteConsumed);
        }
        if quote.released {
            return Ok(());
        }
        if env.ledger().timestamp() < quote.valid_until {
            return Err(Error::QuoteNotExpired);
        }
        let acct_key = DataKey::Account(quote.maker.clone(), quote.debt_token.clone());
        let mut acct = Self::load_account(&env, &quote.maker, &quote.debt_token);
        if acct.reserved < quote.cash_out {
            return Err(Error::QuoteNotFunded);
        }
        acct.reserved -= quote.cash_out;
        env.storage().persistent().set(&acct_key, &acct);
        quote.released = true;
        env.storage()
            .persistent()
            .set(&DataKey::Quote(quote_id.clone()), &quote);
        env.events().publish(
            (
                Symbol::new(&env, "QuoteReleased"),
                quote.maker,
                quote_id,
            ),
            quote.cash_out,
        );
        Ok(())
    }

    pub fn preview_job(env: Env, quote_id: BytesN<32>) -> Preview {
        match Self::evaluate(&env, &quote_id) {
            Ok(p) => p,
            Err(code) => Preview {
                ok: false,
                reason: refusal(&env, code),
                debt_repay: 0,
                collateral_amount: 0,
                keeper_compensation: 0,
                protocol_fee: 0,
                surplus: 0,
            },
        }
    }

    pub fn execute_job(
        env: Env,
        keeper: Address,
        quote_id: BytesN<32>,
    ) -> Result<Receipt, Error> {
        keeper.require_auth();
        Self::require_not_paused(&env)?;
        let preview = Self::evaluate(&env, &quote_id)?;
        let mut quote: Quote = env
            .storage()
            .persistent()
            .get(&DataKey::Quote(quote_id.clone()))
            .ok_or(Error::QuoteNotFound)?;
        let market = Self::require_market(&env, &quote.market_key)?;

        let acct_key = DataKey::Account(quote.maker.clone(), quote.debt_token.clone());
        let mut acct = Self::load_account(&env, &quote.maker, &quote.debt_token);
        if acct.reserved < quote.cash_out || acct.cash < quote.cash_out {
            return Err(Error::QuoteNotFunded);
        }
        acct.reserved -= quote.cash_out;
        acct.cash -= quote.cash_out;
        quote.consumed = true;
        env.storage().persistent().set(&acct_key, &acct);
        env.storage()
            .persistent()
            .set(&DataKey::Quote(quote_id.clone()), &quote);

        let self_addr = env.current_contract_address();
        let debt = token::Client::new(&env, &quote.debt_token);

        // Transfer repayment from escrow first so the adapter does not need
        // nested authorization against this contract.
        debt.transfer(&self_addr, &market.adapter, &preview.debt_repay);
        let seized: i128 = env.invoke_contract(
            &market.adapter,
            &Symbol::new(&env, "liquidate"),
            vec![
                &env,
                quote.borrower.to_val(),
                preview.debt_repay.into_val(&env),
                quote.collateral_recipient.to_val(),
            ],
        );

        if seized < quote.collateral_amount {
            return Err(Error::PositionChanged);
        }

        if preview.keeper_compensation > 0 {
            debt.transfer(&self_addr, &quote.keeper_recipient, &preview.keeper_compensation);
        }
        if preview.protocol_fee > 0 {
            let fee_recipient: Address = env
                .storage()
                .instance()
                .get(&DataKey::FeeRecipient)
                .ok_or(Error::NotInit)?;
            debt.transfer(&self_addr, &fee_recipient, &preview.protocol_fee);
        }
        if preview.surplus > 0 {
            debt.transfer(&self_addr, &quote.surplus_recipient, &preview.surplus);
        }

        let receipt = Receipt {
            quote_id: quote_id.clone(),
            market_key: quote.market_key,
            borrower: quote.borrower,
            maker: quote.maker.clone(),
            debt_repay: preview.debt_repay,
            collateral_amount: seized,
            keeper_compensation: preview.keeper_compensation,
            protocol_fee: preview.protocol_fee,
            surplus: preview.surplus,
            writeoff: 0,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Receipt(quote_id.clone()), &receipt);
        env.events().publish(
            (
                Symbol::new(&env, "QuoteConsumed"),
                quote.maker.clone(),
                quote_id.clone(),
            ),
            quote.cash_out,
        );
        env.events().publish(
            (
                Symbol::new(&env, "LiquidationSettled"),
                receipt.borrower.clone(),
                quote_id,
            ),
            (receipt.debt_repay, receipt.collateral_amount, receipt.surplus),
        );
        Ok(receipt)
    }

    fn evaluate(env: &Env, quote_id: &BytesN<32>) -> Result<Preview, Error> {
        let quote: Quote = env
            .storage()
            .persistent()
            .get(&DataKey::Quote(quote_id.clone()))
            .ok_or(Error::QuoteNotFound)?;
        if quote.consumed {
            return Err(Error::QuoteConsumed);
        }
        if quote.released {
            return Err(Error::QuoteReleased);
        }
        if env.ledger().timestamp() >= quote.valid_until {
            return Err(Error::QuoteExpired);
        }
        if Self::is_paused(env) {
            return Err(Error::ScopePaused);
        }
        let market = Self::require_market(env, &quote.market_key)?;
        if market.debt_token != quote.debt_token || market.collateral_token != quote.collateral_token
        {
            return Err(Error::TokenMismatch);
        }
        let acct = Self::load_account(env, &quote.maker, &quote.debt_token);
        if acct.reserved < quote.cash_out {
            return Err(Error::QuoteNotFunded);
        }

        let liquidatable: bool = env.invoke_contract(
            &market.adapter,
            &Symbol::new(env, "is_liquidatable"),
            vec![&env, quote.borrower.to_val()],
        );
        if !liquidatable {
            return Err(Error::NotLiquidatable);
        }

        let position: mock_lending_view::PositionView = {
            // Read position fields via get_position on the adapter.
            let raw: PositionRaw = env.invoke_contract(
                &market.adapter,
                &Symbol::new(env, "get_position"),
                vec![&env, quote.borrower.to_val()],
            );
            mock_lending_view::PositionView {
                debt_amount: raw.debt_amount,
                collateral_amount: raw.collateral_amount,
                debt_token: raw.debt_token,
                collateral_token: raw.collateral_token,
            }
        };
        if position.debt_token != quote.debt_token
            || position.collateral_token != quote.collateral_token
        {
            return Err(Error::MarketMismatch);
        }
        if position.collateral_amount < quote.collateral_amount {
            return Err(Error::PositionChanged);
        }
        if position.debt_amount > quote.max_debt_repay {
            return Err(Error::InsufficientProceeds);
        }
        let debt_repay = position.debt_amount;
        let leftover = quote.cash_out - debt_repay;
        if leftover < quote.keeper_compensation + quote.protocol_fee + quote.min_net_surplus {
            return Err(Error::InsufficientProceeds);
        }
        let surplus = leftover - quote.keeper_compensation - quote.protocol_fee;
        Ok(Preview {
            ok: true,
            reason: Symbol::new(env, "ok"),
            debt_repay,
            collateral_amount: quote.collateral_amount,
            keeper_compensation: quote.keeper_compensation,
            protocol_fee: quote.protocol_fee,
            surplus,
        })
    }

    fn load_account(env: &Env, maker: &Address, token: &Address) -> MakerAccount {
        env.storage()
            .persistent()
            .get(&DataKey::Account(maker.clone(), token.clone()))
            .unwrap_or(MakerAccount {
                cash: 0,
                reserved: 0,
            })
    }

    fn require_market(env: &Env, market_key: &BytesN<32>) -> Result<Market, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Market(market_key.clone()))
            .ok_or(Error::MarketNotFound)
    }

    fn require_admin(env: &Env, admin: &Address) -> Result<(), Error> {
        let stored: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInit)?;
        if stored != *admin {
            return Err(Error::Unauthorized);
        }
        Ok(())
    }

    fn require_not_paused(env: &Env) -> Result<(), Error> {
        if Self::is_paused(env) {
            return Err(Error::ScopePaused);
        }
        Ok(())
    }

    fn is_paused(env: &Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }
}

/// Local mirror of mock-lending Position so nectar-core can decode get_position
/// without a runtime crate dependency in the wasm.
#[soroban_sdk::contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PositionRaw {
    pub borrower: Address,
    pub collateral_token: Address,
    pub collateral_amount: i128,
    pub debt_token: Address,
    pub debt_amount: i128,
    pub health_factor: i128,
    pub open: bool,
}

mod mock_lending_view {
    use soroban_sdk::Address;
    pub struct PositionView {
        pub debt_amount: i128,
        pub collateral_amount: i128,
        pub debt_token: Address,
        pub collateral_token: Address,
    }
}

fn hash_id(
    env: &Env,
    maker: &Address,
    nonce: u64,
    cash_out: i128,
    valid_until: u64,
    extra: &Address,
) -> BytesN<32> {
    let payload = (
        Symbol::new(env, "nectar_q"),
        maker.clone(),
        nonce,
        cash_out,
        valid_until,
        extra.clone(),
    );
        env.crypto().sha256(&payload.to_xdr(env)).into()
}

fn refusal(env: &Env, code: Error) -> Symbol {
    match code {
        Error::QuoteExpired => Symbol::new(env, "QUOTE_EXPIRED"),
        Error::QuoteConsumed => Symbol::new(env, "QUOTE_CONSUMED"),
        Error::QuoteReleased => Symbol::new(env, "QUOTE_RELEASED"),
        Error::QuoteNotFunded => Symbol::new(env, "QUOTE_NOT_FUNDED"),
        Error::ScopePaused => Symbol::new(env, "SCOPE_PAUSED"),
        Error::NotLiquidatable => Symbol::new(env, "POSITION_CHANGED"),
        Error::PositionChanged => Symbol::new(env, "POSITION_CHANGED"),
        Error::InsufficientProceeds => Symbol::new(env, "INSUFFICIENT_PROCEEDS"),
        Error::MarketNotFound => Symbol::new(env, "UNSUPPORTED_MARKET"),
        Error::TokenMismatch => Symbol::new(env, "TOKEN_RESTRICTED"),
        _ => Symbol::new(env, "REJECTED"),
    }
}

#[cfg(test)]
mod test;
