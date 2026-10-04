#![no_std]
use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, token, Address, Env, IntoVal, Symbol,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct JobResult {
    pub quote_id: u64,
    pub position_id: u64,
    pub debt_repaid: i128,
    pub collateral_seized: i128,
    pub keeper_compensation: i128,
    pub protocol_fee: i128,
    pub surplus: i128,
    pub writeoff: i128,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Escrow,
    ProtocolTreasury,
    NextReceiptId,
    Receipt(u64),
    Paused,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LiquidationSettled {
    #[topic]
    pub receipt_id: u64,
    #[topic]
    pub quote_id: u64,
    pub position_id: u64,
    pub debt_repaid: i128,
    pub collateral_seized: i128,
    pub keeper_compensation: i128,
    pub protocol_fee: i128,
    pub surplus: i128,
    pub writeoff: i128,
}

#[contract]
pub struct NectarExecutor;

#[contractimpl]
impl NectarExecutor {
    pub fn initialize(env: Env, admin: Address, escrow: Address, protocol_treasury: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Escrow, &escrow);
        env.storage()
            .instance()
            .set(&DataKey::ProtocolTreasury, &protocol_treasury);
        env.storage().instance().set(&DataKey::NextReceiptId, &1_u64);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().extend_ttl(100_000, 100_000);
    }

    pub fn pause(env: Env, paused: bool) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &paused);
    }

    pub fn preview_job(env: Env, quote_id: u64) -> JobResult {
        let escrow: Address = env.storage().instance().get(&DataKey::Escrow).unwrap();
        let quote = Self::invoke_get_quote(&env, &escrow, quote_id);
        JobResult {
            quote_id,
            position_id: quote.position_id,
            debt_repaid: quote.max_debt_repay.min(quote.cash_out),
            collateral_seized: quote.collateral_amount,
            keeper_compensation: quote.keeper_compensation,
            protocol_fee: quote.protocol_fee,
            surplus: quote.cash_out
                - quote.max_debt_repay.min(quote.cash_out)
                - quote.keeper_compensation
                - quote.protocol_fee,
            writeoff: 0,
        }
    }

    pub fn execute_job(env: Env, keeper: Address, quote_id: u64) -> JobResult {
        keeper.require_auth();
        let paused: bool = env.storage().instance().get(&DataKey::Paused).unwrap_or(false);
        if paused {
            panic!("SCOPE_PAUSED");
        }

        let escrow: Address = env.storage().instance().get(&DataKey::Escrow).unwrap();
        let treasury: Address = env
            .storage()
            .instance()
            .get(&DataKey::ProtocolTreasury)
            .unwrap();

        let quote = Self::invoke_consume_quote(&env, &escrow, quote_id);
        let market = Self::invoke_get_market(&env, &escrow, quote.market_key.clone());

        let position =
            Self::invoke_get_position(&env, &market.lending_protocol, quote.position_id);
        let debt_to_pay = position.debt_amount;
        if debt_to_pay > quote.max_debt_repay {
            panic!("debt exceeded bound");
        }
        let debt_client = token::Client::new(&env, &quote.debt_token);
        debt_client.transfer(
            &env.current_contract_address(),
            &market.lending_protocol,
            &debt_to_pay,
        );

        let (debt_repaid, collateral_seized, writeoff) = Self::invoke_liquidate(
            &env,
            &market.lending_protocol,
            quote.position_id,
            quote.collateral_recipient.clone(),
            quote.max_debt_repay,
        );

        if debt_repaid > quote.max_debt_repay {
            panic!("debt exceeded bound");
        }
        if collateral_seized < quote.collateral_amount {
            panic!("INSUFFICIENT_PROCEEDS");
        }

        let remaining = quote.cash_out - debt_repaid;
        if remaining < quote.keeper_compensation + quote.protocol_fee + quote.min_net_surplus {
            panic!("INSUFFICIENT_PROCEEDS");
        }

        if quote.keeper_compensation > 0 {
            debt_client.transfer(
                &env.current_contract_address(),
                &quote.keeper_recipient,
                &quote.keeper_compensation,
            );
        }
        if quote.protocol_fee > 0 {
            debt_client.transfer(
                &env.current_contract_address(),
                &treasury,
                &quote.protocol_fee,
            );
        }
        let surplus = remaining - quote.keeper_compensation - quote.protocol_fee;
        if surplus > 0 {
            debt_client.transfer(
                &env.current_contract_address(),
                &quote.surplus_recipient,
                &surplus,
            );
        }

        let receipt_id: u64 = env.storage().instance().get(&DataKey::NextReceiptId).unwrap();
        env.storage()
            .instance()
            .set(&DataKey::NextReceiptId, &(receipt_id + 1));

        let result = JobResult {
            quote_id,
            position_id: quote.position_id,
            debt_repaid,
            collateral_seized,
            keeper_compensation: quote.keeper_compensation,
            protocol_fee: quote.protocol_fee,
            surplus,
            writeoff,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Receipt(receipt_id), &result);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Receipt(receipt_id), 100_000, 100_000);

        LiquidationSettled {
            receipt_id,
            quote_id,
            position_id: result.position_id,
            debt_repaid,
            collateral_seized,
            keeper_compensation: quote.keeper_compensation,
            protocol_fee: quote.protocol_fee,
            surplus,
            writeoff,
        }
        .publish(&env);

        let _ = keeper;
        result
    }

    pub fn get_receipt(env: Env, receipt_id: u64) -> JobResult {
        env.storage()
            .persistent()
            .get(&DataKey::Receipt(receipt_id))
            .unwrap()
    }

    fn invoke_get_quote(env: &Env, escrow: &Address, quote_id: u64) -> QuoteView {
        let args = soroban_sdk::vec![env, quote_id.into_val(env)];
        env.invoke_contract(escrow, &Symbol::new(env, "get_quote"), args)
    }

    fn invoke_get_market(env: &Env, escrow: &Address, market_key: soroban_sdk::String) -> MarketView {
        let args = soroban_sdk::vec![env, market_key.into_val(env)];
        env.invoke_contract(escrow, &Symbol::new(env, "get_market"), args)
    }

    fn invoke_get_position(env: &Env, lending: &Address, position_id: u64) -> PositionView {
        let args = soroban_sdk::vec![env, position_id.into_val(env)];
        env.invoke_contract(lending, &Symbol::new(env, "get_position"), args)
    }

    fn invoke_consume_quote(env: &Env, escrow: &Address, quote_id: u64) -> QuoteView {
        let sink = env.current_contract_address();
        let args = soroban_sdk::vec![env, quote_id.into_val(env), sink.into_val(env)];
        env.invoke_contract(escrow, &Symbol::new(env, "consume_quote"), args)
    }

    fn invoke_liquidate(
        env: &Env,
        lending: &Address,
        position_id: u64,
        collateral_recipient: Address,
        max_debt_repay: i128,
    ) -> (i128, i128, i128) {
        let args = soroban_sdk::vec![
            env,
            position_id.into_val(env),
            collateral_recipient.into_val(env),
            max_debt_repay.into_val(env)
        ];
        env.invoke_contract(lending, &Symbol::new(env, "liquidate"), args)
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuoteView {
    pub quote_id: u64,
    pub maker: Address,
    pub market_key: soroban_sdk::String,
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
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketView {
    pub market_key: soroban_sdk::String,
    pub lending_protocol: Address,
    pub debt_token: Address,
    pub collateral_token: Address,
    pub adapter_version: u32,
    pub policy_version: u32,
    pub admitted: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PositionView {
    pub borrower: Address,
    pub debt_token: Address,
    pub collateral_token: Address,
    pub debt_amount: i128,
    pub collateral_amount: i128,
    pub health_factor_bps: u32,
    pub open: bool,
}

#[cfg(test)]
mod test;
