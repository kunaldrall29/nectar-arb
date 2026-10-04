#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Env, Symbol,
};

pub const HF_ONE: i128 = 10_000_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum LabError {
    AlreadyInit = 1,
    NotInit = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    PositionExists = 5,
    PositionNotFound = 6,
    NotLiquidatable = 7,
    TokenMismatch = 8,
    InsufficientCollateral = 9,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Position {
    pub borrower: Address,
    pub collateral_token: Address,
    pub collateral_amount: i128,
    pub debt_token: Address,
    pub debt_amount: i128,
    pub health_factor: i128,
    pub open: bool,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Position(Address),
}

#[contract]
pub struct MockLending;

#[contractimpl]
impl MockLending {
    pub fn initialize(env: Env, admin: Address) -> Result<(), LabError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(LabError::AlreadyInit);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().extend_ttl(535680, 535680);
        Ok(())
    }

    pub fn admin(env: Env) -> Result<Address, LabError> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(LabError::NotInit)
    }

    /// Admin seeds an underwater (or healthy) position and supplies the collateral.
    pub fn admin_seed_position(
        env: Env,
        admin: Address,
        borrower: Address,
        collateral_token: Address,
        collateral_amount: i128,
        debt_token: Address,
        debt_amount: i128,
        health_factor: i128,
    ) -> Result<(), LabError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        if collateral_amount <= 0 || debt_amount <= 0 {
            return Err(LabError::InvalidAmount);
        }
        let key = DataKey::Position(borrower.clone());
        if env.storage().persistent().has(&key) {
            return Err(LabError::PositionExists);
        }
        token::Client::new(&env, &collateral_token).transfer(
            &admin,
            &env.current_contract_address(),
            &collateral_amount,
        );
        let position = Position {
            borrower: borrower.clone(),
            collateral_token,
            collateral_amount,
            debt_token,
            debt_amount,
            health_factor,
            open: true,
        };
        env.storage().persistent().set(&key, &position);
        env.storage().persistent().extend_ttl(&key, 535680, 535680);
        env.events()
            .publish((Symbol::new(&env, "set_position"), borrower), health_factor);
        Ok(())
    }

    pub fn set_health_factor(
        env: Env,
        admin: Address,
        borrower: Address,
        health_factor: i128,
    ) -> Result<(), LabError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        let key = DataKey::Position(borrower.clone());
        let mut position: Position = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(LabError::PositionNotFound)?;
        position.health_factor = health_factor;
        env.storage().persistent().set(&key, &position);
        Ok(())
    }

    pub fn get_position(env: Env, borrower: Address) -> Result<Position, LabError> {
        env.storage()
            .persistent()
            .get(&DataKey::Position(borrower))
            .ok_or(LabError::PositionNotFound)
    }

    pub fn is_liquidatable(env: Env, borrower: Address) -> bool {
        match env
            .storage()
            .persistent()
            .get::<DataKey, Position>(&DataKey::Position(borrower))
        {
            Some(p) => p.open && p.health_factor < HF_ONE,
            None => false,
        }
    }

    /// Complete a prepaid liquidation. The caller must already have transferred
    /// `repay_amount` of the debt token to this contract (so nested auth is not
    /// required against the executor).
    pub fn liquidate(
        env: Env,
        borrower: Address,
        repay_amount: i128,
        collateral_recipient: Address,
    ) -> Result<i128, LabError> {
        if repay_amount <= 0 {
            return Err(LabError::InvalidAmount);
        }
        let key = DataKey::Position(borrower.clone());
        let mut position: Position = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(LabError::PositionNotFound)?;
        if !position.open || position.health_factor >= HF_ONE {
            return Err(LabError::NotLiquidatable);
        }
        if repay_amount > position.debt_amount {
            return Err(LabError::InvalidAmount);
        }

        // Proportional collateral seizure for partial repay; full repay takes all.
        let seized = if repay_amount == position.debt_amount {
            position.collateral_amount
        } else {
            position.collateral_amount * repay_amount / position.debt_amount
        };
        if seized <= 0 || seized > position.collateral_amount {
            return Err(LabError::InsufficientCollateral);
        }

        token::Client::new(&env, &position.collateral_token).transfer(
            &env.current_contract_address(),
            &collateral_recipient,
            &seized,
        );

        position.debt_amount -= repay_amount;
        position.collateral_amount -= seized;
        if position.debt_amount == 0 {
            position.open = false;
            position.health_factor = HF_ONE;
        }
        env.storage().persistent().set(&key, &position);
        env.storage().persistent().extend_ttl(&key, 535680, 535680);
        env.events().publish(
            (Symbol::new(&env, "liquidated"), borrower),
            (repay_amount, seized),
        );
        Ok(seized)
    }

    fn require_admin(env: &Env, admin: &Address) -> Result<(), LabError> {
        let stored: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(LabError::NotInit)?;
        if stored != *admin {
            return Err(LabError::Unauthorized);
        }
        Ok(())
    }
}

#[cfg(test)]
mod test;
