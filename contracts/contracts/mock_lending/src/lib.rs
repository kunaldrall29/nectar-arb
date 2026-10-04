#![no_std]
use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, token, Address, Env, String, Vec,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Position {
    pub borrower: Address,
    pub debt_token: Address,
    pub collateral_token: Address,
    pub debt_amount: i128,
    pub collateral_amount: i128,
    pub health_factor_bps: u32,
    pub open: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    NextPositionId,
    Position(u64),
    Executor,
    MarketKey,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PositionOpened {
    #[topic]
    pub position_id: u64,
    #[topic]
    pub borrower: Address,
    pub debt_amount: i128,
    pub collateral_amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PositionLiquidated {
    #[topic]
    pub position_id: u64,
    pub debt_repaid: i128,
    pub collateral_seized: i128,
    pub writeoff: i128,
}

#[contract]
pub struct MockLending;

#[contractimpl]
impl MockLending {
    pub fn initialize(env: Env, admin: Address, market_key: String) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextPositionId, &1_u64);
        env.storage().instance().set(&DataKey::MarketKey, &market_key);
        env.storage().instance().extend_ttl(100_000, 100_000);
    }

    pub fn set_executor(env: Env, executor: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::Executor, &executor);
    }

    pub fn open_position(
        env: Env,
        borrower: Address,
        debt_token: Address,
        collateral_token: Address,
        debt_amount: i128,
        collateral_amount: i128,
        health_factor_bps: u32,
    ) -> u64 {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        if debt_amount <= 0 || collateral_amount <= 0 {
            panic!("amounts must be positive");
        }

        // Pull collateral into the lending vault for later seizure.
        let coll_client = token::Client::new(&env, &collateral_token);
        coll_client.transfer(&borrower, &env.current_contract_address(), &collateral_amount);

        let id: u64 = env.storage().instance().get(&DataKey::NextPositionId).unwrap();
        let position = Position {
            borrower: borrower.clone(),
            debt_token,
            collateral_token,
            debt_amount,
            collateral_amount,
            health_factor_bps,
            open: true,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Position(id), &position);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Position(id), 100_000, 100_000);
        env.storage()
            .instance()
            .set(&DataKey::NextPositionId, &(id + 1));

        PositionOpened {
            position_id: id,
            borrower,
            debt_amount,
            collateral_amount,
        }
        .publish(&env);
        id
    }

    pub fn set_health_factor(env: Env, position_id: u64, health_factor_bps: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        let mut position: Position = env
            .storage()
            .persistent()
            .get(&DataKey::Position(position_id))
            .unwrap();
        position.health_factor_bps = health_factor_bps;
        env.storage()
            .persistent()
            .set(&DataKey::Position(position_id), &position);
    }

    pub fn get_position(env: Env, position_id: u64) -> Position {
        env.storage()
            .persistent()
            .get(&DataKey::Position(position_id))
            .unwrap()
    }

    pub fn is_liquidatable(env: Env, position_id: u64) -> bool {
        let position: Position = Self::get_position(env, position_id);
        position.open && position.health_factor_bps < 10_000
    }

    /// Complete liquidation after the executor has transferred `debt_amount` debt tokens
    /// to this contract. Caller must be the authorized executor.
    pub fn liquidate(
        env: Env,
        position_id: u64,
        collateral_recipient: Address,
        max_debt_repay: i128,
    ) -> (i128, i128, i128) {
        let executor: Address = env
            .storage()
            .instance()
            .get(&DataKey::Executor)
            .unwrap_or_else(|| panic!("executor unset"));
        executor.require_auth();

        let mut position: Position = Self::get_position(env.clone(), position_id);
        if !position.open {
            panic!("position closed");
        }
        if position.health_factor_bps >= 10_000 {
            panic!("position healthy");
        }
        if max_debt_repay < position.debt_amount {
            panic!("max debt too low");
        }

        let debt_repaid = position.debt_amount;
        let collateral_seized = position.collateral_amount;
        let writeoff = 0_i128;

        let debt_client = token::Client::new(&env, &position.debt_token);
        let paid = debt_client.balance(&env.current_contract_address());
        if paid < debt_repaid {
            panic!("debt not prepaid");
        }

        let coll_client = token::Client::new(&env, &position.collateral_token);
        coll_client.transfer(
            &env.current_contract_address(),
            &collateral_recipient,
            &collateral_seized,
        );

        position.open = false;
        position.debt_amount = 0;
        position.collateral_amount = 0;
        env.storage()
            .persistent()
            .set(&DataKey::Position(position_id), &position);

        PositionLiquidated {
            position_id,
            debt_repaid,
            collateral_seized,
            writeoff,
        }
        .publish(&env);

        (debt_repaid, collateral_seized, writeoff)
    }

    pub fn market_key(env: Env) -> String {
        env.storage().instance().get(&DataKey::MarketKey).unwrap()
    }

    pub fn list_open_positions(env: Env, limit: u32) -> Vec<u64> {
        let next: u64 = env.storage().instance().get(&DataKey::NextPositionId).unwrap();
        let mut out = Vec::new(&env);
        let mut id = 1_u64;
        while id < next && out.len() < limit {
            if let Some(position) = env
                .storage()
                .persistent()
                .get::<_, Position>(&DataKey::Position(id))
            {
                if position.open {
                    out.push_back(id);
                }
            }
            id += 1;
        }
        out
    }
}

#[cfg(test)]
mod test;
