#![no_std]
use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, token, Address, Env, String, Vec,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Market {
    pub market_key: String,
    pub lending_protocol: Address,
    pub debt_token: Address,
    pub collateral_token: Address,
    pub adapter_version: u32,
    pub policy_version: u32,
    pub admitted: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MakerAccount {
    pub cash: i128,
    pub reserved: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Quote {
    pub quote_id: u64,
    pub maker: Address,
    pub market_key: String,
    pub position_id: u64,
    pub collateral_token: Address,
    pub collateral_amount: i128,
    pub debt_token: Address,
    pub cash_out: i128,
    pub max_debt_repay: i128,
    pub collateral_recipient: Address,
    pub keeper_compensation: i128,
    pub protocol_fee: i128,
    pub min_net_surplus: i128,
    pub keeper_recipient: Address,
    pub surplus_recipient: Address,
    pub valid_until: u64,
    pub consumed: bool,
    pub released: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Guardian,
    Paused,
    Executor,
    Market(String),
    Account(Address, Address),
    Quote(u64),
    MakerQuotes(Address),
    NextQuoteId,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CashDeposited {
    #[topic]
    pub maker: Address,
    #[topic]
    pub token: Address,
    pub amount: i128,
    pub beneficiary: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CashWithdrawn {
    #[topic]
    pub maker: Address,
    #[topic]
    pub token: Address,
    pub amount: i128,
    pub recipient: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuoteReserved {
    #[topic]
    pub quote_id: u64,
    #[topic]
    pub maker: Address,
    pub cash_out: i128,
    pub valid_until: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuoteConsumed {
    #[topic]
    pub quote_id: u64,
    pub cash_out: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuoteReleased {
    #[topic]
    pub quote_id: u64,
    pub maker: Address,
    pub cash_out: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScopePaused {
    pub paused: bool,
}

#[contract]
pub struct QuoteEscrow;

#[contractimpl]
impl QuoteEscrow {
    pub fn initialize(env: Env, admin: Address, guardian: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Guardian, &guardian);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().set(&DataKey::NextQuoteId, &1_u64);
        env.storage().instance().extend_ttl(100_000, 100_000);
    }

    pub fn set_executor(env: Env, executor: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::Executor, &executor);
    }

    pub fn pause_scope(env: Env, paused: bool) {
        let guardian: Address = env.storage().instance().get(&DataKey::Guardian).unwrap();
        guardian.require_auth();
        env.storage().instance().set(&DataKey::Paused, &paused);
        ScopePaused { paused }.publish(&env);
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }

    pub fn admit_market(
        env: Env,
        market_key: String,
        lending_protocol: Address,
        debt_token: Address,
        collateral_token: Address,
        adapter_version: u32,
        policy_version: u32,
    ) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        let market = Market {
            market_key: market_key.clone(),
            lending_protocol,
            debt_token,
            collateral_token,
            adapter_version,
            policy_version,
            admitted: true,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Market(market_key.clone()), &market);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Market(market_key), 100_000, 100_000);
    }

    pub fn get_market(env: Env, market_key: String) -> Market {
        env.storage()
            .persistent()
            .get(&DataKey::Market(market_key))
            .unwrap()
    }

    pub fn deposit(env: Env, token: Address, amount: i128, beneficiary: Address) {
        beneficiary.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }
        let client = token::Client::new(&env, &token);
        client.transfer(&beneficiary, &env.current_contract_address(), &amount);

        let mut account = Self::get_account(env.clone(), beneficiary.clone(), token.clone());
        account.cash += amount;
        Self::set_account(&env, &beneficiary, &token, &account);

        CashDeposited {
            maker: beneficiary.clone(),
            token,
            amount,
            beneficiary,
        }
        .publish(&env);
    }

    pub fn withdraw(env: Env, token: Address, amount: i128, recipient: Address) {
        let maker = recipient.clone();
        maker.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }
        let mut account = Self::get_account(env.clone(), maker.clone(), token.clone());
        let available = account.cash - account.reserved;
        if available < amount {
            panic!("RESERVED_FUNDS");
        }
        account.cash -= amount;
        Self::set_account(&env, &maker, &token, &account);

        let client = token::Client::new(&env, &token);
        client.transfer(&env.current_contract_address(), &recipient, &amount);

        CashWithdrawn {
            maker,
            token,
            amount,
            recipient,
        }
        .publish(&env);
    }

    pub fn available_cash(env: Env, maker: Address, token: Address) -> i128 {
        let account = Self::get_account(env, maker, token);
        account.cash - account.reserved
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

    pub fn register_quote(
        env: Env,
        maker: Address,
        market_key: String,
        position_id: u64,
        collateral_amount: i128,
        cash_out: i128,
        max_debt_repay: i128,
        collateral_recipient: Address,
        keeper_compensation: i128,
        protocol_fee: i128,
        min_net_surplus: i128,
        keeper_recipient: Address,
        surplus_recipient: Address,
        ttl_seconds: u64,
    ) -> u64 {
        maker.require_auth();
        if Self::is_paused(env.clone()) {
            panic!("SCOPE_PAUSED");
        }
        if cash_out <= 0 || collateral_amount <= 0 || max_debt_repay <= 0 {
            panic!("invalid amounts");
        }
        if ttl_seconds == 0 || ttl_seconds > 120 {
            panic!("invalid ttl");
        }
        if cash_out < max_debt_repay + keeper_compensation + protocol_fee + min_net_surplus {
            panic!("cash_out too low for obligations");
        }

        let market = Self::get_market(env.clone(), market_key.clone());
        if !market.admitted {
            panic!("UNSUPPORTED_MARKET");
        }

        let mut account = Self::get_account(env.clone(), maker.clone(), market.debt_token.clone());
        let available = account.cash - account.reserved;
        if available < cash_out {
            panic!("QUOTE_NOT_FUNDED");
        }
        account.reserved += cash_out;
        Self::set_account(&env, &maker, &market.debt_token, &account);

        let quote_id: u64 = env.storage().instance().get(&DataKey::NextQuoteId).unwrap();
        env.storage()
            .instance()
            .set(&DataKey::NextQuoteId, &(quote_id + 1));

        let valid_until = env.ledger().timestamp() + ttl_seconds;
        let quote = Quote {
            quote_id,
            maker: maker.clone(),
            market_key,
            position_id,
            collateral_token: market.collateral_token,
            collateral_amount,
            debt_token: market.debt_token,
            cash_out,
            max_debt_repay,
            collateral_recipient,
            keeper_compensation,
            protocol_fee,
            min_net_surplus,
            keeper_recipient,
            surplus_recipient,
            valid_until,
            consumed: false,
            released: false,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Quote(quote_id), &quote);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Quote(quote_id), 100_000, 100_000);

        let mut maker_quotes: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::MakerQuotes(maker.clone()))
            .unwrap_or(Vec::new(&env));
        maker_quotes.push_back(quote_id);
        env.storage()
            .persistent()
            .set(&DataKey::MakerQuotes(maker.clone()), &maker_quotes);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::MakerQuotes(maker.clone()), 100_000, 100_000);

        QuoteReserved {
            quote_id,
            maker,
            cash_out,
            valid_until,
        }
        .publish(&env);

        quote_id
    }

    pub fn get_quote(env: Env, quote_id: u64) -> Quote {
        env.storage()
            .persistent()
            .get(&DataKey::Quote(quote_id))
            .unwrap()
    }

    pub fn release_expired(env: Env, quote_id: u64) {
        let mut quote = Self::get_quote(env.clone(), quote_id);
        if quote.consumed || quote.released {
            return;
        }
        if env.ledger().timestamp() < quote.valid_until {
            panic!("QUOTE_NOT_EXPIRED");
        }
        quote.released = true;
        env.storage()
            .persistent()
            .set(&DataKey::Quote(quote_id), &quote);

        let mut account =
            Self::get_account(env.clone(), quote.maker.clone(), quote.debt_token.clone());
        if account.reserved < quote.cash_out {
            panic!("accounting error");
        }
        account.reserved -= quote.cash_out;
        Self::set_account(&env, &quote.maker, &quote.debt_token, &account);

        QuoteReleased {
            quote_id,
            maker: quote.maker,
            cash_out: quote.cash_out,
        }
        .publish(&env);
    }

    pub fn consume_quote(env: Env, quote_id: u64, settlement_sink: Address) -> Quote {
        let executor: Address = env
            .storage()
            .instance()
            .get(&DataKey::Executor)
            .unwrap_or_else(|| panic!("executor unset"));
        executor.require_auth();

        if Self::is_paused(env.clone()) {
            panic!("SCOPE_PAUSED");
        }

        let mut quote = Self::get_quote(env.clone(), quote_id);
        if quote.consumed {
            panic!("quote already consumed");
        }
        if quote.released {
            panic!("quote released");
        }
        if env.ledger().timestamp() >= quote.valid_until {
            panic!("QUOTE_EXPIRED");
        }

        quote.consumed = true;
        env.storage()
            .persistent()
            .set(&DataKey::Quote(quote_id), &quote);

        let mut account =
            Self::get_account(env.clone(), quote.maker.clone(), quote.debt_token.clone());
        if account.reserved < quote.cash_out || account.cash < quote.cash_out {
            panic!("accounting error");
        }
        account.reserved -= quote.cash_out;
        account.cash -= quote.cash_out;
        Self::set_account(&env, &quote.maker, &quote.debt_token, &account);

        let client = token::Client::new(&env, &quote.debt_token);
        client.transfer(
            &env.current_contract_address(),
            &settlement_sink,
            &quote.cash_out,
        );

        QuoteConsumed {
            quote_id,
            cash_out: quote.cash_out,
        }
        .publish(&env);

        quote
    }

    pub fn maker_quotes(env: Env, maker: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::MakerQuotes(maker))
            .unwrap_or(Vec::new(&env))
    }

    fn set_account(env: &Env, maker: &Address, token: &Address, account: &MakerAccount) {
        let key = DataKey::Account(maker.clone(), token.clone());
        env.storage().persistent().set(&key, account);
        env.storage().persistent().extend_ttl(&key, 100_000, 100_000);
    }
}

#[cfg(test)]
mod test;
