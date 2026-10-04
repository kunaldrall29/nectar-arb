#![cfg(test)]

use crate::{NectarCore, NectarCoreClient, QuoteSpec};
use mock_lending::{MockLending, MockLendingClient, HF_ONE};
use mock_token::{MockToken, MockTokenClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, BytesN, Env, String, Symbol,
};

const UNIT: i128 = 10_000_000;
const NOW: u64 = 1_700_000_000;

struct Ids {
    admin: Address,
    guardian: Address,
    fee: Address,
    maker: Address,
    keeper: Address,
    borrower: Address,
    usdc: Address,
    hood: Address,
    lab: Address,
    nectar: Address,
    market_key: BytesN<32>,
}

fn token<'a>(env: &'a Env, admin: &Address, symbol: &str) -> MockTokenClient<'a> {
    let client = MockTokenClient::new(env, &env.register(MockToken, ()));
    client.initialize(
        admin,
        &String::from_str(env, symbol),
        &String::from_str(env, symbol),
        &7,
    );
    client
}

fn setup(env: &Env) -> Ids {
    env.mock_all_auths();
    env.ledger().with_mut(|l| {
        l.timestamp = NOW;
    });
    let admin = Address::generate(env);
    let guardian = Address::generate(env);
    let fee = Address::generate(env);
    let maker = Address::generate(env);
    let keeper = Address::generate(env);
    let borrower = Address::generate(env);
    let usdc = token(env, &admin, "USDC");
    let hood = token(env, &admin, "HOOD");
    let lab = MockLendingClient::new(env, &env.register(MockLending, ()));
    lab.initialize(&admin);
    let nectar = NectarCoreClient::new(env, &env.register(NectarCore, ()));
    nectar.initialize(&admin, &guardian, &fee);
    let market_key = BytesN::from_array(env, &[7u8; 32]);
    nectar.admit_market(
        &admin,
        &market_key,
        &1000u32,
        &Symbol::new(env, "lab"),
        &Symbol::new(env, "HOOD_USDC"),
        &usdc.address,
        &hood.address,
        &lab.address,
        &1u32,
        &300u64,
    );
    hood.mint(&admin, &(12_000 * UNIT));
    lab.admin_seed_position(
        &admin,
        &borrower,
        &hood.address,
        &(12_000 * UNIT),
        &usdc.address,
        &(10_000 * UNIT),
        &(HF_ONE * 8 / 10),
    );
    usdc.mint(&maker, &(20_000 * UNIT));
    Ids {
        admin,
        guardian,
        fee,
        maker,
        keeper,
        borrower,
        usdc: usdc.address.clone(),
        hood: hood.address.clone(),
        lab: lab.address.clone(),
        nectar: nectar.address.clone(),
        market_key,
    }
}

fn nectar<'a>(env: &'a Env, ids: &Ids) -> NectarCoreClient<'a> {
    NectarCoreClient::new(env, &ids.nectar)
}
fn usdc<'a>(env: &'a Env, ids: &Ids) -> MockTokenClient<'a> {
    MockTokenClient::new(env, &ids.usdc)
}
fn hood<'a>(env: &'a Env, ids: &Ids) -> MockTokenClient<'a> {
    MockTokenClient::new(env, &ids.hood)
}

fn fixture_spec(ids: &Ids, ttl: u64) -> QuoteSpec {
    QuoteSpec {
        market_key: ids.market_key.clone(),
        borrower: ids.borrower.clone(),
        collateral_amount: 12_000 * UNIT,
        cash_out: 10_140 * UNIT,
        max_debt_repay: 10_000 * UNIT,
        collateral_recipient: ids.maker.clone(),
        keeper_compensation: 50 * UNIT,
        protocol_fee: 20 * UNIT,
        min_net_surplus: 70 * UNIT,
        keeper_recipient: ids.keeper.clone(),
        surplus_recipient: ids.maker.clone(),
        valid_until: NOW + ttl,
    }
}

fn register_fixture(env: &Env, ids: &Ids, ttl: u64) -> BytesN<32> {
    let n = nectar(env, ids);
    n.deposit(&ids.maker, &ids.usdc, &(10_140 * UNIT), &ids.maker);
    n.register_quote(&ids.maker, &fixture_spec(ids, ttl))
}

#[test]
fn t01_deposit_and_withdraw_unreserved() {
    let env = Env::default();
    let ids = setup(&env);
    let n = nectar(&env, &ids);
    n.deposit(&ids.maker, &ids.usdc, &(1_000 * UNIT), &ids.maker);
    let acct = n.get_account(&ids.maker, &ids.usdc);
    assert_eq!(acct.cash, 1_000 * UNIT);
    assert_eq!(acct.reserved, 0);
    n.withdraw(&ids.maker, &ids.usdc, &(400 * UNIT), &ids.maker);
    let acct = n.get_account(&ids.maker, &ids.usdc);
    assert_eq!(acct.cash, 600 * UNIT);
    assert_eq!(usdc(&env, &ids).balance(&ids.maker), 19_400 * UNIT);
}

#[test]
fn t02_reserve_quote_locks_cash() {
    let env = Env::default();
    let ids = setup(&env);
    register_fixture(&env, &ids, 120);
    let acct = nectar(&env, &ids).get_account(&ids.maker, &ids.usdc);
    assert_eq!(acct.cash, 10_140 * UNIT);
    assert_eq!(acct.reserved, 10_140 * UNIT);
}

#[test]
fn t03_withdraw_committed_cash_reverts() {
    let env = Env::default();
    let ids = setup(&env);
    register_fixture(&env, &ids, 120);
    assert!(nectar(&env, &ids)
        .try_withdraw(&ids.maker, &ids.usdc, &1, &ids.maker)
        .is_err());
}

#[test]
fn t04_register_more_than_available_reverts() {
    let env = Env::default();
    let ids = setup(&env);
    let n = nectar(&env, &ids);
    n.deposit(&ids.maker, &ids.usdc, &(100 * UNIT), &ids.maker);
    assert!(n
        .try_register_quote(&ids.maker, &fixture_spec(&ids, 120))
        .is_err());
}

#[test]
fn t05_and_t24_fill_funded_liquidation_fixture() {
    let env = Env::default();
    let ids = setup(&env);
    let quote_id = register_fixture(&env, &ids, 120);
    let n = nectar(&env, &ids);
    let preview = n.preview_job(&quote_id);
    assert!(preview.ok);
    assert_eq!(preview.debt_repay, 10_000 * UNIT);
    assert_eq!(preview.keeper_compensation, 50 * UNIT);
    assert_eq!(preview.protocol_fee, 20 * UNIT);
    assert_eq!(preview.surplus, 70 * UNIT);
    assert_eq!(
        preview.debt_repay + preview.keeper_compensation + preview.protocol_fee + preview.surplus,
        10_140 * UNIT
    );

    let receipt = n.execute_job(&ids.keeper, &quote_id);
    assert_eq!(receipt.debt_repay, 10_000 * UNIT);
    assert_eq!(receipt.collateral_amount, 12_000 * UNIT);
    assert_eq!(receipt.keeper_compensation, 50 * UNIT);
    assert_eq!(receipt.protocol_fee, 20 * UNIT);
    assert_eq!(receipt.surplus, 70 * UNIT);
    assert_eq!(receipt.writeoff, 0);
    assert_eq!(hood(&env, &ids).balance(&ids.maker), 12_000 * UNIT);
    assert_eq!(usdc(&env, &ids).balance(&ids.keeper), 50 * UNIT);
    assert_eq!(usdc(&env, &ids).balance(&ids.fee), 20 * UNIT);
    assert_eq!(usdc(&env, &ids).balance(&ids.maker), 9_930 * UNIT);
    let acct = n.get_account(&ids.maker, &ids.usdc);
    assert_eq!(acct.cash, 0);
    assert_eq!(acct.reserved, 0);
}

#[test]
fn t06_reuse_consumed_quote_reverts() {
    let env = Env::default();
    let ids = setup(&env);
    let quote_id = register_fixture(&env, &ids, 120);
    let n = nectar(&env, &ids);
    n.execute_job(&ids.keeper, &quote_id);
    assert!(n.try_execute_job(&ids.keeper, &quote_id).is_err());
}

#[test]
fn t07_execute_after_expiry_reverts_then_release() {
    let env = Env::default();
    let ids = setup(&env);
    let quote_id = register_fixture(&env, &ids, 30);
    env.ledger().with_mut(|l| {
        l.timestamp = NOW + 31;
    });
    let n = nectar(&env, &ids);
    assert!(n.try_execute_job(&ids.keeper, &quote_id).is_err());
    n.release_expired(&quote_id);
    let acct = n.get_account(&ids.maker, &ids.usdc);
    assert_eq!(acct.reserved, 0);
    assert_eq!(acct.cash, 10_140 * UNIT);
    n.withdraw(&ids.maker, &ids.usdc, &(10_140 * UNIT), &ids.maker);
}

#[test]
fn t08_release_expired_twice_is_idempotent() {
    let env = Env::default();
    let ids = setup(&env);
    let quote_id = register_fixture(&env, &ids, 30);
    env.ledger().with_mut(|l| {
        l.timestamp = NOW + 40;
    });
    let n = nectar(&env, &ids);
    n.release_expired(&quote_id);
    n.release_expired(&quote_id);
    let acct = n.get_account(&ids.maker, &ids.usdc);
    assert_eq!(acct.reserved, 0);
    assert_eq!(acct.cash, 10_140 * UNIT);
}

#[test]
fn t16_short_cash_out_fails_preview() {
    let env = Env::default();
    let ids = setup(&env);
    let n = nectar(&env, &ids);
    n.deposit(&ids.maker, &ids.usdc, &(10_040 * UNIT), &ids.maker);
    let mut spec = fixture_spec(&ids, 120);
    spec.cash_out = 10_040 * UNIT;
    if let Ok(Ok(quote_id)) = n.try_register_quote(&ids.maker, &spec) {
        let preview = n.preview_job(&quote_id);
        assert!(!preview.ok);
    }
}

#[test]
fn t22_pause_blocks_new_risk_not_withdraw() {
    let env = Env::default();
    let ids = setup(&env);
    let n = nectar(&env, &ids);
    n.deposit(&ids.maker, &ids.usdc, &(500 * UNIT), &ids.maker);
    n.pause_scope(&ids.guardian);
    let mut spec = fixture_spec(&ids, 120);
    spec.cash_out = 100 * UNIT;
    spec.max_debt_repay = 100 * UNIT;
    spec.keeper_compensation = 0;
    spec.protocol_fee = 0;
    spec.min_net_surplus = 0;
    assert!(n.try_register_quote(&ids.maker, &spec).is_err());
    n.withdraw(&ids.maker, &ids.usdc, &(200 * UNIT), &ids.maker);
    let acct = n.get_account(&ids.maker, &ids.usdc);
    assert_eq!(acct.cash, 300 * UNIT);
}
